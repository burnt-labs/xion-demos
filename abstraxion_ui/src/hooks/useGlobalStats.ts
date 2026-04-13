import { useState, useEffect, useCallback } from "react";
import { useAbstraxionClient } from "@burnt-labs/abstraxion";

import { CHESS_CONTRACT_ADDRESS } from "@/config";

interface GlobalStats {
  totalGames: number;
  activePlayers: number;
  totalMoves: number;
}

interface UseGlobalStatsReturn {
  stats: GlobalStats;
  loading: boolean;
  error: string | null;
  refreshStats: () => Promise<void>;
}

export function useGlobalStats(): UseGlobalStatsReturn {
  const { client: queryClient } = useAbstraxionClient();
  
  const [stats, setStats] = useState<GlobalStats>({
    totalGames: 0,
    activePlayers: 0,
    totalMoves: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTotalGames = useCallback(async (): Promise<number> => {
    if (!queryClient) return 0;
    if (!CHESS_CONTRACT_ADDRESS) {
      console.warn("Chess contract address is empty");
      return 0;
    }

    try {
      console.log("Fetching total games from:", CHESS_CONTRACT_ADDRESS);
      const response = await queryClient.queryContractSmart(CHESS_CONTRACT_ADDRESS, {
        get_all_game_ids: {}
      });
      
      // Count all game IDs
      const gameCount = (response.game_ids as string[]).length;
      return gameCount;
    } catch (err) {
      console.error("Error fetching total games:", err);
      return 0;
    }
  }, [queryClient]);

  const fetchActivePlayers = useCallback(async (): Promise<number> => {
    if (!queryClient) return 0;
    if (!CHESS_CONTRACT_ADDRESS) {
      console.warn("Chess contract address is empty");
      return 0;
    }

    try {
      console.log("Fetching active players from:", CHESS_CONTRACT_ADDRESS);
      
      // Get all users from the chess contract
      const usersResponse = await queryClient.queryContractSmart(CHESS_CONTRACT_ADDRESS, {
        get_all_users: {}
      });
      
      let activeCount = 0;

      // Check each user's profile
      for (const userAddress of usersResponse.users) {
        try {
          const profileResponse = await queryClient.queryContractSmart(CHESS_CONTRACT_ADDRESS, {
            get_user_profile: { address: userAddress }
          });
          
          if (profileResponse.profile && profileResponse.profile.games_played > 0) {
            activeCount++;
          }
        } catch (err) {
          // Skip users without profiles
          continue;
        }
      }

      return activeCount;
    } catch (err) {
      console.error("Error fetching active players:", err);
      return 0;
    }
  }, [queryClient]);

  const fetchTotalMoves = useCallback(async (): Promise<number> => {
    if (!queryClient) return 0;
    if (!CHESS_CONTRACT_ADDRESS) {
      console.warn("Chess contract address is empty for moves");
      return 0;
    }

    try {
      console.log("Fetching total moves from:", CHESS_CONTRACT_ADDRESS);
      // First get all game IDs
      const response = await queryClient.queryContractSmart(CHESS_CONTRACT_ADDRESS, {
        get_all_game_ids: {}
      });
      
      const gameIds = response.game_ids as string[];
      let totalMoves = 0;

      for (const gameId of gameIds) {
        try {
          const gameResponse = await queryClient.queryContractSmart(CHESS_CONTRACT_ADDRESS, {
            get_game: { game_id: gameId }
          });
          
          if (gameResponse.game) {
            const game = gameResponse.game;
            if (game.moves) {
              // Count moves by splitting on comma
              const moveCount = game.moves.split(',').filter((m: string) => m.trim()).length;
              totalMoves += moveCount;
            }
          }
        } catch (err) {
          // Skip games that can't be fetched
          continue;
        }
      }

      return totalMoves;
    } catch (err) {
      console.error("Error fetching total moves:", err);
      return 0;
    }
  }, [queryClient]);

  const refreshStats = useCallback(async () => {
    if (!queryClient) {
      setError("Query client not available");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [totalGames, activePlayers, totalMoves] = await Promise.all([
        fetchTotalGames(),
        fetchActivePlayers(),
        fetchTotalMoves(),
      ]);

      setStats({
        totalGames,
        activePlayers,
        totalMoves,
      });
    } catch (err) {
      console.error("Error refreshing stats:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch stats");
    } finally {
      setLoading(false);
    }
  }, [queryClient, fetchTotalGames, fetchActivePlayers, fetchTotalMoves]);

  // Auto-refresh stats when client is available
  useEffect(() => {
    if (queryClient) {
      refreshStats();
      
      // Refresh stats every 5 minutes (300 seconds) - stats can be stale
      const interval = setInterval(refreshStats, 300000);
      return () => clearInterval(interval);
    }
  }, [queryClient, refreshStats]);

  return {
    stats,
    loading,
    error,
    refreshStats,
  };
}