"use client";
import React, { useState, useEffect, useCallback } from "react";
import {
  useAbstraxionAccount,
  useAbstraxionSigningClient,
  useAbstraxionClient,
} from "@burnt-labs/abstraxion";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ThemeToggle, useTheme } from "@/components/ThemeProvider";
import ChessBoard from "@/components/ChessBoard";
import VerifyRating from "@/components/VerifyRating";
import WagerPanel from "@/components/WagerPanel";
import { useUserProfileUnified } from "@/hooks/useUserProfileUnified";
import { useChessGame } from "@/hooks/useChessGame";
import { useGlobalStats } from "@/hooks/useGlobalStats";
import { useWager, formatXion } from "@/hooks/useWager";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Swords,
  User,
  Copy,
  Check,
  Plus,
  RotateCcw,
  Flag,
  Handshake,
  LogOut,
  Loader2,
  Coins,
} from "lucide-react";
import type { ChessMove } from "@/types/chess";

export default function Page(): JSX.Element {
  const { data: account, isConnected, login, logout } = useAbstraxionAccount();
  const { client } = useAbstraxionSigningClient();
  const { client: requireAuthClient } = useAbstraxionSigningClient({ requireAuth: true });
  const { client: queryClient } = useAbstraxionClient();
  const { isParty } = useTheme();

  const {
    userProfile,
    allUsers,
    loading: userLoading,
    initializeUser,
    refreshAllUsers,
  } = useUserProfileUnified();

  const {
    currentGame,
    userActiveGames,
    loading: gameLoading,
    moveError,
    timeStatus,
    createGame,
    makeMove,
    fetchGame,
    resignGame,
    selectGame,
    proposeDraw,
    respondToDraw,
    clearMoveError,
  } = useChessGame();

  const { stats } = useGlobalStats();
  const {
    claimWinnings,
    loading: wagerLoading,
    error: wagerError,
  } = useWager();

  const [balance, setBalance] = useState<string | null>(null);
  const [opponentAddress, setOpponentAddress] = useState("");
  const [newGameWager, setNewGameWager] = useState("");
  const [moveInput, setMoveInput] = useState("");
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState("games");

  // Fetch XION balance
  const fetchBalance = useCallback(async () => {
    if (!queryClient || !account?.bech32Address) return;
    try {
      const bal = await queryClient.getBalance(account.bech32Address, "uxion");
      setBalance(bal.amount);
    } catch (err) {
      console.error("Error fetching balance:", err);
    }
  }, [queryClient, account?.bech32Address]);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  const handleCreateGame = async () => {
    if (opponentAddress && opponentAddress !== account?.bech32Address) {
      const xionAmount = parseFloat(newGameWager);
      const wagerAmount = xionAmount > 0 ? String(Math.round(xionAmount * 1_000_000)) : undefined;
      const result = await createGame(opponentAddress, {
        wagerAmount,
        allowSpectatorWagers: false,
      });
      if (result) {
        setOpponentAddress("");
        setNewGameWager("");
      }
    }
  };

  const handleMove = async (move: ChessMove): Promise<boolean> => {
    if (currentGame) {
      return await makeMove(currentGame.id, move);
    }
    return false;
  };

  const handleMoveInput = async () => {
    if (moveInput.length >= 4 && currentGame) {
      const from = moveInput.substring(0, 2);
      const to = moveInput.substring(2, 4);
      const promotion =
        moveInput.length > 4 ? moveInput.substring(4) : undefined;
      const success = await makeMove(currentGame.id, { from, to, promotion });
      if (success) setMoveInput("");
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAddress(text);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  React.useEffect(() => {
    if (queryClient) refreshAllUsers();
  }, [queryClient, refreshAllUsers]);

  const isMyTurn =
    currentGame?.status === "active" &&
    ((currentGame.current_turn === "white" &&
      currentGame.white === account?.bech32Address) ||
      (currentGame.current_turn === "black" &&
        currentGame.black === account?.bech32Address));

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <h1
            className={cn(
              "text-2xl font-bold tracking-tight",
              isParty && "party-text"
            )}
          >
            Xion Chess
          </h1>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
              <span>{stats.totalGames || 0} games</span>
              <span>{stats.activePlayers || 0} players</span>
            </div>
            <ThemeToggle />
            {isConnected && (
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOut className="mr-1.5 h-3.5 w-3.5" />
                Logout
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:flex-row">
        {/* Sidebar */}
        <aside className="w-full shrink-0 space-y-3 lg:w-72">
          {/* Connect / Profile */}
          {!isConnected ? (
            <Button
              onClick={() => login()}
              className={cn(
                "w-full",
                isParty &&
                  "bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 text-white hover:from-orange-600 hover:via-pink-600 hover:to-purple-600"
              )}
            >
              Connect Wallet
            </Button>
          ) : !userProfile ? (
            <Button
              onClick={() => initializeUser()}
              className="w-full"
              disabled={userLoading}
            >
              {userLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Initialize Profile
            </Button>
          ) : (
            <Card className={cn(isParty && "party-glow")}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4" />
                    {userProfile.username}
                  </CardTitle>
                  <button
                    onClick={() => copyToClipboard(account.bech32Address)}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {copiedAddress === account.bech32Address ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "text-2xl font-bold tabular-nums",
                      isParty ? "party-text" : "text-primary"
                    )}
                  >
                    {userProfile.elo}
                  </span>
                  <span className="text-xs text-muted-foreground">ELO</span>
                  <VerifyRating
                    currentElo={userProfile.elo}
                    isVerified={userProfile.verified}
                    verifiedPlatform={userProfile.verified_platform ?? undefined}
                    onVerified={(rating, platform) => {
                      // TODO: Submit verified rating to contract
                      console.log(`Verified ${platform} rating: ${rating}`);
                    }}
                  />
                </div>
                <div className="mt-2 flex gap-2 text-xs">
                  <Badge variant="success">{userProfile.wins}W</Badge>
                  <Badge variant="secondary">{userProfile.draws}D</Badge>
                  <Badge variant="destructive">{userProfile.losses}L</Badge>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{userProfile.games_played} games played</span>
                  {balance && (
                    <span className="font-mono">
                      {formatXion(balance)}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sidebar Tabs */}
          {userProfile && (
            <Tabs value={sidebarTab} onValueChange={setSidebarTab}>
              <TabsList className="w-full">
                <TabsTrigger value="games" className="flex-1">
                  <Swords className="mr-1.5 h-3.5 w-3.5" />
                  Games
                </TabsTrigger>
                <TabsTrigger value="leaderboard" className="flex-1">
                  <Trophy className="mr-1.5 h-3.5 w-3.5" />
                  Top 10
                </TabsTrigger>
              </TabsList>

              <TabsContent value="games" className="space-y-3">
                {/* New Game */}
                <Card>
                  <CardContent className="space-y-2 p-3">
                    <Input
                      value={opponentAddress}
                      onChange={(e) => setOpponentAddress(e.target.value)}
                      placeholder="Opponent address..."
                      className="text-xs"
                    />
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Coins className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          value={newGameWager}
                          onChange={(e) => setNewGameWager(e.target.value)}
                          placeholder="Wager in XION (optional)"
                          className="pl-7 text-xs font-mono"
                        />
                      </div>
                      <Button
                        onClick={handleCreateGame}
                        disabled={!opponentAddress || gameLoading}
                        size="sm"
                        className="shrink-0"
                      >
                        {gameLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Create
                          </>
                        )}
                      </Button>
                    </div>
                    {newGameWager && parseFloat(newGameWager) > 0 ? (
                      <p className="text-[10px] text-muted-foreground">
                        Wager: {newGameWager} XION per player
                        {balance && ` (you have ${formatXion(balance)})`}
                      </p>
                    ) : balance ? (
                      <p className="text-[10px] text-muted-foreground">
                        Balance: {formatXion(balance)}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                {/* Games List */}
                {userActiveGames.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="px-1 text-xs font-medium text-muted-foreground">
                      Games ({userActiveGames.length})
                    </div>
                    {userActiveGames.map(({ id, game }) => {
                      const isSelected = currentGame?.id === id;
                      const opponent =
                        game.white === account?.bech32Address
                          ? game.black
                          : game.white;
                      const myColor =
                        game.white === account?.bech32Address
                          ? "white"
                          : "black";
                      const isWaiting = game.status === "waiting";
                      const isMyTurnHere = !isWaiting && game.current_turn === myColor;
                      const hasGameWager = game.wager_amount && parseInt(game.wager_amount, 10) > 0;

                      return (
                        <button
                          key={id}
                          onClick={() => selectGame(id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                            isSelected
                              ? "border-primary bg-primary/10"
                              : "border-transparent hover:bg-accent",
                            isWaiting && "border-warning/30"
                          )}
                        >
                          <div
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              isWaiting
                                ? "animate-pulse bg-warning"
                                : isMyTurnHere
                                ? "bg-success"
                                : "bg-muted-foreground"
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs">
                              vs {(opponent ?? "Open lobby").slice(0, 12)}
                              {opponent ? "..." : ""}
                            </div>
                            {hasGameWager && (
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Coins className="h-2.5 w-2.5" />
                                {formatXion(game.wager_amount)} wager
                              </div>
                            )}
                          </div>
                          <Badge
                            variant={
                              isWaiting
                                ? "warning"
                                : isMyTurnHere
                                ? "success"
                                : "secondary"
                            }
                            className="shrink-0 text-[10px]"
                          >
                            {isWaiting
                              ? "Pending"
                              : isMyTurnHere
                              ? "Your turn"
                              : "Waiting"}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                )}

                {userActiveGames.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No active games. Create one above!
                  </p>
                )}
              </TabsContent>

              <TabsContent value="leaderboard">
                <Card>
                  <CardContent className="p-3">
                    <div className="space-y-1">
                      {allUsers.slice(0, 10).map((user, index) => (
                        <div
                          key={user.username}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                        >
                          <span
                            className={cn(
                              "w-5 text-center text-xs font-bold",
                              index === 0 && "text-primary",
                              index === 1 && "text-muted-foreground",
                              index === 2 && "text-orange-400"
                            )}
                          >
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs">
                            {user.username}
                          </span>
                          <span
                            className={cn(
                              "font-mono text-xs font-bold",
                              isParty ? "party-text" : "text-primary"
                            )}
                          >
                            {user.elo}
                          </span>
                          <button
                            onClick={() => copyToClipboard(user.address)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {copiedAddress === user.address ? (
                              <Check className="h-3 w-3 text-success" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </aside>

        {/* Main Game Area */}
        <div className="min-w-0 flex-1 space-y-3">
          {currentGame ? (
            <>
              {/* Game Header */}
              <Card>
                <CardContent className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2">
                    <h2 className="font-mono text-sm font-medium">
                      {currentGame.id.slice(0, 12)}...
                    </h2>
                    <Badge
                      variant={
                        currentGame.status === "active"
                          ? "success"
                          : "secondary"
                      }
                    >
                      {currentGame.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchGame(currentGame.id)}
                    disabled={gameLoading}
                  >
                    <RotateCcw
                      className={cn(
                        "h-3.5 w-3.5",
                        gameLoading && "animate-spin"
                      )}
                    />
                  </Button>
                </CardContent>
              </Card>

              {currentGame.status === "active" || currentGame.status === "waiting" ? (
                <div className="flex flex-col gap-3 xl:flex-row">
                  {/* Board + Controls Column */}
                  <div className="min-w-0 flex-1 space-y-3">
                    {/* Time Display */}
                    <div className="flex items-center justify-between gap-4">
                      <TimeChip
                        label="Black"
                        timeBlocks={timeStatus?.black_time_remaining ?? currentGame.black_time_remaining}
                        active={currentGame.current_turn === "black"}
                      />
                      <div className="text-xs text-muted-foreground">
                        Move {currentGame.moves.split(",").filter(Boolean).length}
                      </div>
                      <TimeChip
                        label="White"
                        timeBlocks={timeStatus?.white_time_remaining ?? currentGame.white_time_remaining}
                        active={currentGame.current_turn === "white"}
                      />
                    </div>

                    {/* Chess Board */}
                    <ChessBoard
                      game={currentGame}
                      currentPlayer={account?.bech32Address || ""}
                      onMove={handleMove}
                      disabled={gameLoading}
                      moveError={moveError}
                      onClearError={clearMoveError}
                    />

                    {/* Controls */}
                    <Card>
                      <CardContent className="space-y-3 p-3">
                        {/* Move Input */}
                        <div className="flex gap-2">
                          <Input
                            value={moveInput}
                            onChange={(e) => setMoveInput(e.target.value)}
                            placeholder="Enter move (e.g., e2e4)"
                            className="font-mono"
                            onKeyDown={(e) =>
                              e.key === "Enter" && handleMoveInput()
                            }
                          />
                          <Button
                            onClick={handleMoveInput}
                            disabled={!moveInput || gameLoading}
                            size="sm"
                          >
                            Send
                          </Button>
                        </div>

                        {/* Draw/Resign */}
                        {currentGame.draw_proposed_by &&
                        currentGame.draw_proposed_by !==
                          account?.bech32Address ? (
                          <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
                            <p className="mb-2 text-center text-sm text-warning">
                              Opponent proposed a draw
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() =>
                                  respondToDraw(currentGame.id, true)
                                }
                              >
                                <Handshake className="mr-1.5 h-3.5 w-3.5" />
                                Accept
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() =>
                                  respondToDraw(currentGame.id, false)
                                }
                              >
                                Decline
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => proposeDraw(currentGame.id)}
                              disabled={
                                gameLoading ||
                                currentGame.draw_proposed_by ===
                                  account?.bech32Address
                              }
                            >
                              <Handshake className="mr-1.5 h-3.5 w-3.5" />
                              {currentGame.draw_proposed_by ===
                              account?.bech32Address
                                ? "Draw Pending"
                                : "Propose Draw"}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="flex-1"
                              onClick={() => resignGame(currentGame.id)}
                              disabled={gameLoading}
                            >
                              <Flag className="mr-1.5 h-3.5 w-3.5" />
                              Resign
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Wager Panel — right side (only if game has a wager) */}
                  {currentGame.wager_amount && parseInt(currentGame.wager_amount, 10) > 0 && (
                    <div className="w-full shrink-0 xl:w-64">
                      <WagerPanel
                        game={currentGame}
                        myColor={
                          currentGame.white === account?.bech32Address
                            ? "white"
                            : currentGame.black === account?.bech32Address
                            ? "black"
                            : null
                        }
                        onClaimWinnings={() => claimWinnings(currentGame.id)}
                        loading={wagerLoading}
                        claimError={wagerError}
                      />
                    </div>
                  )}
                </div>
              ) : (
                /* Game Over */
                <div className="flex flex-col gap-3 xl:flex-row">
                  <Card className={cn("flex-1", isParty && "party-glow")}>
                    <CardContent className="py-12 text-center">
                      <h3 className="text-2xl font-bold">Game Over</h3>
                      <Badge
                        variant={
                          currentGame.status === "draw"
                            ? "warning"
                            : (currentGame.status === "white_won" &&
                                currentGame.white ===
                                  account?.bech32Address) ||
                              (currentGame.status === "black_won" &&
                                currentGame.black === account?.bech32Address)
                            ? "success"
                            : "destructive"
                        }
                        className="mt-3 text-sm"
                      >
                        {currentGame.status.replace("_", " ").toUpperCase()}
                      </Badge>
                    </CardContent>
                  </Card>
                  {/* Show wager payout info on game over */}
                  {currentGame.wager_amount && parseInt(currentGame.wager_amount, 10) > 0 && (
                    <div className="w-full shrink-0 xl:w-64">
                      <WagerPanel
                        game={currentGame}
                        myColor={
                          currentGame.white === account?.bech32Address
                            ? "white"
                            : currentGame.black === account?.bech32Address
                            ? "black"
                            : null
                        }
                        onClaimWinnings={() => claimWinnings(currentGame.id)}
                        loading={wagerLoading}
                        claimError={wagerError}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <Card className="flex h-80 items-center justify-center lg:h-96">
              <CardContent className="text-center">
                <Swords className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {account?.bech32Address
                    ? userProfile
                      ? "Select or create a game to start playing"
                      : "Initialize your profile first"
                    : "Connect your wallet to start playing"}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

    </main>
  );
}

function TimeChip({
  label,
  timeBlocks,
  active,
}: {
  label: string;
  timeBlocks?: number;
  active: boolean;
}) {
  // Convert blocks to approximate real time (1 block ≈ 5s on Xion)
  const seconds = timeBlocks != null ? timeBlocks * 5 : null;
  const formatted = seconds != null ? formatSeconds(seconds) : "--:--";
  const isLow = seconds != null && seconds < 3600; // < 1 hour
  const isCritical = seconds != null && seconds < 300; // < 5 min

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-sm transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground",
        isCritical && "animate-pulse-glow border-destructive text-destructive",
        isLow && !isCritical && "border-warning text-warning"
      )}
    >
      <span className="text-xs font-normal">{label}</span>
      <span className="font-bold tabular-nums">{formatted}</span>
    </div>
  );
}

function formatSeconds(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0:00";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${String(Math.floor(totalSeconds % 60)).padStart(2, "0")}`;
  }
  return `${minutes}:${String(Math.floor(totalSeconds % 60)).padStart(2, "0")}`;
}
