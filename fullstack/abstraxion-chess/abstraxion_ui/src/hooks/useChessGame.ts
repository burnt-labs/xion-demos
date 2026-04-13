import { useState, useCallback, useEffect } from "react";
import { ExecuteResult } from "@cosmjs/cosmwasm-stargate";
import type { EncodeObject } from "@cosmjs/proto-signing";
import {
  useAbstraxionAccount,
  useAbstraxionSigningClient,
  useAbstraxionClient,
} from "@burnt-labs/abstraxion";
import type { GranteeSignerClient } from "@burnt-labs/abstraxion";
import type { ChessGame, ChessMove, TimeStatus } from "../types/chess";
import { CHESS_CONTRACT_ADDRESS } from "@/config";

interface UseChessGameReturn {
  currentGame: ChessGame | null;
  userActiveGames: { id: string; game: ChessGame }[];
  loading: boolean;
  error: string | null;
  moveError: string | null;
  timeStatus: TimeStatus | null;
  createGame: (opponentAddress: string | null, options?: { wagerAmount?: string; allowSpectatorWagers?: boolean; inviteCode?: string; timeControl?: string }) => Promise<{ game: ChessGame; gameId: string } | null>;
  fetchGame: (gameId: string) => Promise<ChessGame | null>;
  makeMove: (gameId: string, move: ChessMove) => Promise<boolean>;
  claimVictory: (gameId: string) => Promise<ExecuteResult | null>;
  acceptDefeat: (gameId: string) => Promise<ExecuteResult | null>;
  disputeGame: (gameId: string) => Promise<ExecuteResult | null>;
  resignGame: (gameId: string) => Promise<ExecuteResult | null>;
  fetchAllGames: () => Promise<{ id: string; game: ChessGame }[]>;
  fetchActiveGames: () => Promise<{ id: string; game: ChessGame }[]>;
  fetchUserGames: () => Promise<{ id: string; game: ChessGame }[]>;
  fetchUserActiveGames: () => Promise<{ id: string; game: ChessGame }[]>;
  selectGame: (gameId: string) => void;
  refreshUserGames: () => Promise<void>;
  checkTimeStatus: (gameId: string) => Promise<TimeStatus | null>;
  proposeDraw: (gameId: string) => Promise<ExecuteResult | null>;
  respondToDraw: (gameId: string, accept: boolean) => Promise<ExecuteResult | null>;
  clearMoveError: () => void;
}

export function useChessGame(): UseChessGameReturn {
  const { data: account } = useAbstraxionAccount();
  const { client: signingClient } = useAbstraxionSigningClient();
  // GranteeSignerClient extends SigningCosmWasmClient and provides .execute()
  const client = signingClient as GranteeSignerClient | undefined;
  // requireAuth: true → PopupSigningClient; used for game creation (user pays / authorizes directly)
  const { client: requireAuthClient } = useAbstraxionSigningClient({ requireAuth: true });
  const { client: queryClient } = useAbstraxionClient();

  // Helper: build a CosmWasm execute EncodeObject for use with signAndBroadcast.
  // msg is passed as a plain JS object — the dashboard's normalizeMessage converts it
  // to UTF-8 bytes before signing. Pre-encoding as Uint8Array breaks JSON serialization
  // through the popup postMessage channel.
  const buildExecuteMsg = useCallback((
    contractMsg: object,
    funds: { denom: string; amount: string }[] = [],
  ): EncodeObject => ({
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: {
      sender: account?.bech32Address ?? "",
      contract: CHESS_CONTRACT_ADDRESS,
      msg: contractMsg,
      funds,
    },
  }), [account?.bech32Address]);
  
  const [currentGame, setCurrentGame] = useState<ChessGame | null>(null);
  const [userActiveGames, setUserActiveGames] = useState<{ id: string; game: ChessGame }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [timeStatus, setTimeStatus] = useState<TimeStatus | null>(null);

  // Generate deterministic game ID from players and block height
  const generateGameId = useCallback(async (white: string, black: string, blockHeight: number): Promise<string> => {
    const input = `${white}_${black}_${blockHeight}`;
    
    // Use Web Crypto API for browser compatibility
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return `game_${hashHex.substring(0, 16)}`;
  }, []);

  const fetchGame = useCallback(async (gameId: string): Promise<ChessGame | null> => {
    if (!queryClient) {
      setError("Query client not available");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await queryClient.queryContractSmart(CHESS_CONTRACT_ADDRESS, {
        get_game: { game_id: gameId }
      });

      if (response.game) {
        const game = response.game as ChessGame;
        setCurrentGame(game);
        return game;
      }
      return null;
    } catch (err) {
      console.error("Error fetching game:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch game");
      return null;
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  const createGame = useCallback(async (opponentAddress: string | null, options?: { wagerAmount?: string; allowSpectatorWagers?: boolean; inviteCode?: string; timeControl?: string }): Promise<{ game: ChessGame; gameId: string } | null> => {
    if (!requireAuthClient || !account) {
      setError("Auth client or account not available");
      return null;
    }

    if (opponentAddress && opponentAddress === account.bech32Address) {
      setError("Cannot play against yourself");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const currentHeight = await queryClient?.getHeight();
      const blockHeight = currentHeight || Date.now();

      const white = account.bech32Address;
      const timeControl = options?.timeControl ?? "1d";
      const gameId = await generateGameId(white, opponentAddress ?? "open", blockHeight);

      const newGame: ChessGame = {
        id: gameId,
        white,
        black: opponentAddress,
        moves: "",
        current_fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        status: opponentAddress ? 'active' : 'waiting',
        current_turn: 'white',
        last_move_block: blockHeight,
        white_time_remaining: 172800,
        black_time_remaining: 172800,
        created_block: blockHeight,
        claim_block: null,
        time_control: timeControl,
        move_count: 0,
        draw_proposed_by: null,
        wager_amount: options?.wagerAmount ?? null,
        wager_denom: "uxion",
        wager_funded_white: false,
        wager_funded_black: false,
        spectator_wagers_enabled: options?.allowSpectatorWagers ?? false,
        invite_code: options?.inviteCode ?? null,
      };

      const contractMsg = {
        create_game: {
          game_id: gameId,
          opponent: opponentAddress ?? null,
          time_control: timeControl,
          wager_amount: options?.wagerAmount ?? null,
          allow_spectator_wagers: options?.allowSpectatorWagers ?? null,
          invite_code: options?.inviteCode ?? null,
        }
      };

      const funds = options?.wagerAmount
        ? [{ denom: "uxion", amount: options.wagerAmount }]
        : [];

      const result = await requireAuthClient.signAndBroadcast(
        account.bech32Address,
        [buildExecuteMsg(contractMsg, funds)],
        "auto"
      );

      if (result.transactionHash) {
        setCurrentGame(newGame);
        // Refresh user's active games after creating a game
        const updatedGames = await fetchUserActiveGames();
        setUserActiveGames(updatedGames);
        // Wait for transaction confirmation
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { game: newGame, gameId };
      }

      return null;
    } catch (err) {
      console.error("Error creating game:", err);
      setError(err instanceof Error ? err.message : "Failed to create game");
      return null;
    } finally {
      setLoading(false);
    }
  }, [requireAuthClient, account, queryClient, generateGameId, buildExecuteMsg]); // eslint-disable-line react-hooks/exhaustive-deps

  const makeMove = useCallback(async (gameId: string, move: ChessMove): Promise<boolean> => {
    if (!client || !account) {
      setMoveError("Client or account not available");
      return false;
    }

    setLoading(true);
    setMoveError(null);

    try {
      // Fetch current game state
      const gameResponse = await queryClient?.queryContractSmart(CHESS_CONTRACT_ADDRESS, {
        get_game: { game_id: gameId }
      });

      if (!gameResponse || !gameResponse.game) {
        throw new Error("Game not found");
      }

      const game = gameResponse.game as ChessGame;

      // Validate it's player's turn
      const isWhite = game.white === account.bech32Address;
      const isBlack = game.black === account.bech32Address;
      
      if (!isWhite && !isBlack) {
        throw new Error("You are not a player in this game");
      }

      if ((isWhite && game.current_turn !== 'white') || 
          (isBlack && game.current_turn !== 'black')) {
        throw new Error("Not your turn");
      }

      if (game.status !== 'active') {
        throw new Error(`Game is not active: ${game.status}`);
      }

      // Validate the FEN if provided
      if (move.resulting_fen) {
        // TODO: Add FEN validation against current position + move
        // For now, trust the client-generated FEN
      }

      // Use the chess contract's make_move message
      const msg = {
        make_move: {
          game_id: gameId,
          from: move.from,
          to: move.to,
          promotion: move.promotion || null
        }
      };
      const result = await client.execute(
        account.bech32Address,
        CHESS_CONTRACT_ADDRESS,
        msg,
        "auto"
      );

      if (result.transactionHash) {
        // Refresh the game state from the contract
        const refreshedGame = await fetchGame(gameId);
        if (refreshedGame) {
          setCurrentGame(refreshedGame);
        }
        // Wait for confirmation
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
      }

      return false;
    } catch (err) {
      console.error("Error making move:", err);
      setMoveError(err instanceof Error ? err.message : "Failed to make move");
      return false;
    } finally {
      setLoading(false);
    }
  }, [client, account, queryClient, fetchGame]);

  const claimVictory = useCallback(async (gameId: string): Promise<ExecuteResult | null> => {
    if (!client || !account || !queryClient) {
      setError("Client not available");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const gameResponse = await queryClient.queryContractSmart(CHESS_CONTRACT_ADDRESS, {
        get_game: { game_id: gameId }
      });

      if (!gameResponse || !gameResponse.game) {
        throw new Error("Game not found");
      }

      const msg = { update_game_status: { game_id: gameId, status: "checkmate_claimed" } };
      const result = await client.execute(
        account.bech32Address,
        CHESS_CONTRACT_ADDRESS,
        msg,
        "auto"
      );

      if (result.transactionHash) {
        const refreshedGame = await fetchGame(gameId);
        if (refreshedGame) setCurrentGame(refreshedGame);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      return result;
    } catch (err) {
      console.error("Error claiming victory:", err);
      setError(err instanceof Error ? err.message : "Failed to claim victory");
      return null;
    } finally {
      setLoading(false);
    }
  }, [client, account, queryClient, fetchGame]);

  const acceptDefeat = useCallback(async (gameId: string): Promise<ExecuteResult | null> => {
    if (!client || !account) {
      setError("Client not available");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const msg = { resign_game: { game_id: gameId } };
      const result = await client.execute(
        account.bech32Address,
        CHESS_CONTRACT_ADDRESS,
        msg,
        "auto"
      );

      if (result.transactionHash) {
        const refreshedGame = await fetchGame(gameId);
        if (refreshedGame) setCurrentGame(refreshedGame);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      return result;
    } catch (err) {
      console.error("Error accepting defeat:", err);
      setError(err instanceof Error ? err.message : "Failed to accept defeat");
      return null;
    } finally {
      setLoading(false);
    }
  }, [client, account, fetchGame]);

  const disputeGame = useCallback(async (gameId: string): Promise<ExecuteResult | null> => {
    if (!client || !account || !queryClient) {
      setError("Client not available");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const gameResponse = await queryClient.queryContractSmart(CHESS_CONTRACT_ADDRESS, {
        get_game: { game_id: gameId }
      });

      if (!gameResponse || !gameResponse.game) {
        throw new Error("Game not found");
      }

      const game = gameResponse.game as ChessGame;

      if (game.status !== 'checkmate_claimed') {
        throw new Error("Can only dispute checkmate claims");
      }

      const msg = { update_game_status: { game_id: gameId, status: "disputed" } };
      const result = await client.execute(
        account.bech32Address,
        CHESS_CONTRACT_ADDRESS,
        msg,
        "auto"
      );

      if (result.transactionHash) {
        const refreshedGame = await fetchGame(gameId);
        if (refreshedGame) setCurrentGame(refreshedGame);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      return result;
    } catch (err) {
      console.error("Error disputing game:", err);
      setError(err instanceof Error ? err.message : "Failed to dispute game");
      return null;
    } finally {
      setLoading(false);
    }
  }, [client, account, queryClient, fetchGame]);

  const resignGame = useCallback(async (gameId: string): Promise<ExecuteResult | null> => {
    if (!client || !account) {
      setError("Client not available");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const msg = {
        resign_game: {
          game_id: gameId
        }
      };

      const result = await client.execute(
        account.bech32Address,
        CHESS_CONTRACT_ADDRESS,
        msg,
        "auto"
      );

      if (result.transactionHash) {
        // Refresh the game state
        const refreshedGame = await fetchGame(gameId);
        if (refreshedGame) {
          setCurrentGame(refreshedGame);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      return result;
    } catch (err) {
      console.error("Error resigning game:", err);
      setError(err instanceof Error ? err.message : "Failed to resign");
      return null;
    } finally {
      setLoading(false);
    }
  }, [client, account, fetchGame]);

  const fetchAllGames = useCallback(async (): Promise<{ id: string; game: ChessGame }[]> => {
    if (!queryClient) {
      setError("Query client not available");
      return [];
    }

    try {
      const response = await queryClient.queryContractSmart(CHESS_CONTRACT_ADDRESS, {
        get_all_game_ids: {}
      });

      const games: { id: string; game: ChessGame }[] = [];
      const gameIds = response.game_ids;
      
      for (const gameId of gameIds) {
        try {
          const gameData = await queryClient.queryContractSmart(CHESS_CONTRACT_ADDRESS, {
            get_game: { game_id: gameId }
          });
          if (gameData.game) {
            const game = gameData.game as ChessGame;
            games.push({ id: gameId, game });
          }
        } catch (err) {
          console.error(`Error fetching game ${gameId}:`, err);
        }
      }

      return games;
    } catch (err) {
      console.error("Error fetching all games:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch games");
      return [];
    }
  }, [queryClient]);

  const fetchActiveGames = useCallback(async (): Promise<{ id: string; game: ChessGame }[]> => {
    const allGames = await fetchAllGames();
    return allGames.filter(({ game }) => game.status === 'active');
  }, [fetchAllGames]);

  const fetchUserGames = useCallback(async (): Promise<{ id: string; game: ChessGame }[]> => {
    if (!account?.bech32Address) return [];
    
    const allGames = await fetchAllGames();
    return allGames.filter(({ game }) => 
      game.white === account.bech32Address || game.black === account.bech32Address
    );
  }, [fetchAllGames, account?.bech32Address]);

  const fetchUserActiveGames = useCallback(async (): Promise<{ id: string; game: ChessGame }[]> => {
    if (!account?.bech32Address) return [];
    
    const allGames = await fetchAllGames();
    return allGames.filter(({ game }) =>
      (game.status === 'active' || game.status === 'waiting') &&
      (game.white === account.bech32Address || game.black === account.bech32Address)
    );
  }, [fetchAllGames, account?.bech32Address]);

  const selectGame = useCallback((gameId: string) => {
    const selectedGame = userActiveGames.find(({ id }) => id === gameId);
    if (selectedGame) {
      setCurrentGame(selectedGame.game);
    }
  }, [userActiveGames]);

  const refreshUserGames = useCallback(async () => {
    if (account?.bech32Address && queryClient) {
      try {
        setLoading(true);
        const activeGames = await fetchUserActiveGames();
        setUserActiveGames(activeGames);
        console.log("Refreshed user games:", activeGames.length);
      } catch (err) {
        console.error("Error refreshing user games:", err);
      } finally {
        setLoading(false);
      }
    }
  }, [account?.bech32Address, queryClient, fetchUserActiveGames]);

  const checkTimeStatus = useCallback(async (gameId: string): Promise<TimeStatus | null> => {
    if (!queryClient) {
      setError("Query client not available");
      return null;
    }

    try {
      const response = await queryClient.queryContractSmart(CHESS_CONTRACT_ADDRESS, {
        check_time_status: { game_id: gameId }
      });

      const status = response as TimeStatus;
      setTimeStatus(status);
      return status;
    } catch (err) {
      console.error("Error checking time status:", err);
      setError(err instanceof Error ? err.message : "Failed to check time status");
      return null;
    }
  }, [queryClient]);

  // Auto-discover user's active games when account changes
  useEffect(() => {
    const discoverUserGames = async () => {
      if (account?.bech32Address && queryClient) {
        try {
          const activeGames = await fetchUserActiveGames();
          setUserActiveGames(activeGames);
          
          // If no current game is selected, auto-select the first active game
          if (!currentGame && activeGames.length > 0) {
            setCurrentGame(activeGames[0].game);
          }
        } catch (err) {
          console.error("Error discovering user games:", err);
        }
      }
    };

    discoverUserGames();
  }, [account?.bech32Address, queryClient, fetchUserActiveGames, currentGame]);

  const proposeDraw = useCallback(async (gameId: string): Promise<ExecuteResult | null> => {
    if (!client || !account) {
      setError("Client not available");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const msg = {
        propose_draw_request: {
          game_id: gameId
        }
      };

      const result = await client.execute(
        account.bech32Address,
        CHESS_CONTRACT_ADDRESS,
        msg,
        "auto"
      );

      if (result.transactionHash) {
        // Refresh the game state to show draw proposal
        const refreshedGame = await fetchGame(gameId);
        if (refreshedGame) {
          setCurrentGame(refreshedGame);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      return result;
    } catch (err) {
      console.error("Error proposing draw:", err);
      setError(err instanceof Error ? err.message : "Failed to propose draw");
      return null;
    } finally {
      setLoading(false);
    }
  }, [client, account, fetchGame]);

  const respondToDraw = useCallback(async (gameId: string, accept: boolean): Promise<ExecuteResult | null> => {
    if (!client || !account) {
      setError("Client not available");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const msg = {
        respond_to_draw_request: {
          game_id: gameId,
          accept
        }
      };

      const result = await client.execute(
        account.bech32Address,
        CHESS_CONTRACT_ADDRESS,
        msg,
        "auto"
      );

      if (result.transactionHash) {
        // Refresh the game state
        const refreshedGame = await fetchGame(gameId);
        if (refreshedGame) {
          setCurrentGame(refreshedGame);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      return result;
    } catch (err) {
      console.error(`Error ${accept ? 'accepting' : 'declining'} draw:`, err);
      setError(err instanceof Error ? err.message : `Failed to ${accept ? 'accept' : 'decline'} draw`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [client, account, fetchGame]);

  // Add periodic time status updates and game state refresh with page visibility detection
  useEffect(() => {
    if (!currentGame || currentGame.status !== 'active' || !queryClient) return;

    let timeInterval: NodeJS.Timeout;
    let gameInterval: NodeJS.Timeout;

    const startIntervals = () => {
      // Update time status every 10 seconds
      timeInterval = setInterval(async () => {
        if (!document.hidden) {
          await checkTimeStatus(currentGame.id);
        }
      }, 10000);

      // Refresh game state every 10 seconds to check for opponent moves
      gameInterval = setInterval(async () => {
        if (!document.hidden) {
          const refreshedGame = await fetchGame(currentGame.id);
          if (refreshedGame && refreshedGame.moves !== currentGame.moves) {
            // Game state changed (opponent made a move)
            setCurrentGame(refreshedGame);
          }
        }
      }, 10000);
    };

    const stopIntervals = () => {
      if (timeInterval) clearInterval(timeInterval);
      if (gameInterval) clearInterval(gameInterval);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopIntervals();
      } else {
        // Page became visible - immediately refresh and restart intervals
        checkTimeStatus(currentGame.id);
        fetchGame(currentGame.id).then(refreshedGame => {
          if (refreshedGame) {
            setCurrentGame(refreshedGame);
          }
        });
        startIntervals();
      }
    };

    // Start intervals immediately
    startIntervals();

    // Listen for page visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopIntervals();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentGame, queryClient, checkTimeStatus, fetchGame]);

  const clearMoveError = useCallback(() => {
    setMoveError(null);
  }, []);

  return {
    currentGame,
    userActiveGames,
    loading,
    error,
    moveError,
    timeStatus,
    createGame,
    fetchGame,
    makeMove,
    claimVictory,
    acceptDefeat,
    disputeGame,
    resignGame,
    fetchAllGames,
    fetchActiveGames,
    fetchUserGames,
    fetchUserActiveGames,
    selectGame,
    refreshUserGames,
    checkTimeStatus,
    proposeDraw,
    respondToDraw,
    clearMoveError,
  };
}