"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";
import { formatXion } from "@/hooks/useWager";
import type { ChessGame } from "@/types/chess";
import {
  Coins,
  Loader2,
  CheckCircle2,
  CircleDot,
  Trophy,
} from "lucide-react";

interface WagerPanelProps {
  game: ChessGame;
  myColor: "white" | "black" | null;
  onClaimWinnings: () => Promise<boolean>;
  loading: boolean;
  claimError?: string | null;
}

export default function WagerPanel({
  game,
  myColor,
  onClaimWinnings,
  loading,
  claimError,
}: WagerPanelProps) {
  const { isParty } = useTheme();
  const [claimed, setClaimed] = useState(false);

  const hasWager = game.wager_amount && parseInt(game.wager_amount, 10) > 0;
  const isFullyFunded = game.wager_funded_white && game.wager_funded_black;
  const isGameOver = ["white_won", "black_won", "draw", "stalemate"].includes(game.status);
  const myFunded = myColor === "white" ? game.wager_funded_white : game.wager_funded_black;

  // Total pot = wager × 2 if both funded, otherwise just the one side
  const playerPot = hasWager
    ? String(
        parseInt(game.wager_amount!, 10) *
          (game.wager_funded_white && game.wager_funded_black ? 2 : 1)
      )
    : "0";

  if (!hasWager) return null;

  return (
    <Card className={cn(isParty && "party-glow")}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5">
            <Coins className="h-4 w-4" />
            Wager
          </span>
          <Badge
            variant={isFullyFunded ? "success" : "warning"}
            className="text-[10px]"
          >
            {isFullyFunded ? "Locked In" : "Awaiting Match"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Prize Pool */}
        <div
          className={cn(
            "flex items-center justify-between rounded-lg border px-3 py-2",
            isParty
              ? "border-purple-500/30 bg-purple-500/10"
              : "border-primary/30 bg-primary/5"
          )}
        >
          <span className="text-xs text-muted-foreground">Prize Pool</span>
          <span
            className={cn(
              "font-mono text-lg font-bold",
              isParty ? "party-text" : "text-primary"
            )}
          >
            {formatXion(playerPot)}
          </span>
        </div>

        {/* Funding Status */}
        <div className="flex gap-2">
          <FundingStatus
            label="White"
            funded={game.wager_funded_white}
            isMe={myColor === "white"}
          />
          <FundingStatus
            label="Black"
            funded={game.wager_funded_black}
            isMe={myColor === "black"}
          />
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          {formatXion(game.wager_amount)} per player
        </p>

        {/* Waiting: show status to opponent who needs to fund */}
        {game.status === "waiting" && !isFullyFunded && (
          <div className="rounded-md border border-warning/20 bg-warning/5 p-2 text-center">
            {myFunded ? (
              <p className="text-xs text-muted-foreground">
                Waiting for opponent to accept and fund the wager.
              </p>
            ) : (
              <p className="text-xs text-warning">
                Your opponent set a {formatXion(game.wager_amount)} wager.
                Join the game to accept and match it.
              </p>
            )}
          </div>
        )}

        {/* Active + fully funded */}
        {game.status === "active" && isFullyFunded && (
          <p className="text-center text-xs text-success">
            Wager locked — winner takes {formatXion(playerPot)}
          </p>
        )}

        {/* Game Over — claim winnings */}
        {isGameOver && (
          <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-center">
            <Trophy className="mx-auto mb-1 h-5 w-5 text-success" />
            <p className="text-xs text-muted-foreground">Final pot</p>
            <p
              className={cn(
                "text-xl font-bold",
                isParty ? "party-text" : "text-success"
              )}
            >
              {formatXion(playerPot)}
            </p>
            {claimed ? (
              <p className="mt-2 text-xs font-medium text-success">
                Winnings claimed!
              </p>
            ) : (
              <Button
                onClick={async () => {
                  const ok = await onClaimWinnings();
                  if (ok) setClaimed(true);
                }}
                disabled={loading}
                size="sm"
                className="mt-2"
              >
                {loading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Coins className="mr-1.5 h-3.5 w-3.5" />
                )}
                Claim Winnings
              </Button>
            )}
            {claimError && (
              <p className="mt-1 text-[10px] text-destructive">{claimError}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FundingStatus({
  label,
  funded,
  isMe,
}: {
  label: string;
  funded: boolean;
  isMe: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs",
        funded ? "border-success/30 bg-success/10" : "border-border"
      )}
    >
      {funded ? (
        <CheckCircle2 className="h-3 w-3 text-success" />
      ) : (
        <CircleDot className="h-3 w-3 text-muted-foreground" />
      )}
      <span>{label}</span>
      {isMe && (
        <Badge variant="secondary" className="ml-auto text-[9px]">
          You
        </Badge>
      )}
    </div>
  );
}
