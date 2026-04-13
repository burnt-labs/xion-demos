"use client";

import { useState, useCallback } from "react";
import {
  useAbstraxionAccount,
  useAbstraxionSigningClient,
  useAbstraxionClient,
  type GranteeSignerClient,
} from "@burnt-labs/abstraxion";

import { CHESS_CONTRACT_ADDRESS } from "@/config";
const DEFAULT_DENOM = "uxion";

export interface SpectatorWager {
  address: string;
  amount: string;
  prediction: string;
  claimed: boolean;
}

export interface WagerInfo {
  amount: string | null;
  denom: string;
  fundedWhite: boolean;
  fundedBlack: boolean;
  spectatorWagersEnabled: boolean;
  spectatorWagers: SpectatorWager[];
  totalWhite: string;
  totalBlack: string;
  totalDraw: string;
}

interface UseWagerReturn {
  placeSpectatorWager: (
    gameId: string,
    amount: string,
    prediction: "white" | "black" | "draw"
  ) => Promise<boolean>;
  claimWinnings: (gameId: string) => Promise<boolean>;
  fetchSpectatorWagers: (gameId: string) => Promise<SpectatorWager[]>;
  loading: boolean;
  error: string | null;
}

// Format uxion to XION (1 XION = 1_000_000 uxion)
export function formatXion(uxion: string | null | undefined): string {
  if (!uxion) return "0";
  const num = parseInt(uxion, 10);
  if (isNaN(num) || num === 0) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)} XION`;
  return `${(num / 1_000_000).toFixed(4)} XION`;
}

export function useWager(): UseWagerReturn {
  const { data: account } = useAbstraxionAccount();
  const { client: _client } = useAbstraxionSigningClient();
  const client = _client as GranteeSignerClient | undefined;
  const { client: requireAuthClient } = useAbstraxionSigningClient({ requireAuth: true });
  const { client: queryClient } = useAbstraxionClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeSpectatorWager = useCallback(
    async (
      gameId: string,
      amount: string,
      prediction: "white" | "black" | "draw"
    ): Promise<boolean> => {
      if (!client || !account) {
        setError("Client not available");
        return false;
      }

      setLoading(true);
      setError(null);

      try {
        const msg = {
          place_spectator_wager: {
            game_id: gameId,
            prediction,
          },
        };

        const funds = [{ denom: DEFAULT_DENOM, amount }];

        await client.execute(
          account.bech32Address,
          CHESS_CONTRACT_ADDRESS,
          msg,
          "auto",
          undefined,
          funds
        );

        return true;
      } catch (err) {
        console.error("Error placing spectator wager:", err);
        setError(
          err instanceof Error ? err.message : "Failed to place wager"
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [client, account]
  );

  const claimWinnings = useCallback(
    async (gameId: string): Promise<boolean> => {
      if (!client || !account) {
        setError("Client not available");
        return false;
      }

      setLoading(true);
      setError(null);

      try {
        const msg = {
          claim_winnings: {
            game_id: gameId,
          },
        };

        await client.execute(
          account.bech32Address,
          CHESS_CONTRACT_ADDRESS,
          msg,
          "auto"
        );

        return true;
      } catch (err) {
        console.error("Error claiming winnings:", err);
        setError(
          err instanceof Error ? err.message : "Failed to claim winnings"
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [client, account]
  );

  const fetchSpectatorWagers = useCallback(
    async (gameId: string): Promise<SpectatorWager[]> => {
      if (!queryClient) return [];

      try {
        const response = await queryClient.queryContractSmart(
          CHESS_CONTRACT_ADDRESS,
          { get_spectator_wagers: { game_id: gameId } }
        );
        return response.wagers ?? [];
      } catch (err) {
        console.error("Error fetching spectator wagers:", err);
        return [];
      }
    },
    [queryClient]
  );

  return {
    placeSpectatorWager,
    claimWinnings,
    fetchSpectatorWagers,
    loading,
    error,
  };
}
