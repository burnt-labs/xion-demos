"use client";
import React, { useState, useEffect } from "react";
import { Chess } from "chess.js";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import type { ChessGame, ChessMove } from "@/types/chess";

interface ChessBoardProps {
  game: ChessGame | null;
  currentPlayer: string;
  onMove: (move: ChessMove) => Promise<boolean>;
  disabled?: boolean;
  moveError?: string | null;
  onClearError?: () => void;
}

export default function ChessBoard({
  game,
  currentPlayer,
  onMove,
  disabled,
  moveError,
  onClearError,
}: ChessBoardProps) {
  const [chess] = useState(new Chess());
  const [board, setBoard] = useState<string[][]>([]);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
  const [turn, setTurn] = useState<"w" | "b">("w");
  const [pendingMove, setPendingMove] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [previousFen, setPreviousFen] = useState<string | null>(null);
  const { isParty } = useTheme();

  useEffect(() => {
    if (game?.current_fen) {
      try {
        chess.load(game.current_fen);
        setPreviousFen(game.current_fen);
      } catch (e) {
        console.error("Invalid FEN:", game.current_fen);
        if (game?.moves) {
          chess.reset();
          const moves = game.moves.split(",").filter(Boolean);
          moves.forEach((move) => {
            try {
              chess.move(move);
            } catch (e) {
              console.error("Invalid move:", move);
            }
          });
          setPreviousFen(chess.fen());
        }
      }
    } else if (game?.moves) {
      chess.reset();
      const moves = game.moves.split(",").filter(Boolean);
      moves.forEach((move) => {
        try {
          chess.move(move);
        } catch (e) {
          console.error("Invalid move:", move);
        }
      });
      setPreviousFen(chess.fen());
    }
    updateBoard();
    setTurn(chess.turn());
    setPendingMove(null);
  }, [game?.current_fen, game?.moves]);

  useEffect(() => {
    if (moveError && pendingMove && previousFen) {
      try {
        chess.load(previousFen);
        updateBoard();
        setTurn(chess.turn());
        setPendingMove(null);
        setSelectedSquare(null);
        setPossibleMoves([]);
      } catch (e) {
        console.error("Failed to rollback move:", e);
      }
    }
  }, [moveError, pendingMove, previousFen]);

  const updateBoard = () => {
    const newBoard: string[][] = [];
    for (let row = 7; row >= 0; row--) {
      const boardRow: string[] = [];
      for (let col = 0; col < 8; col++) {
        const square = String.fromCharCode(97 + col) + (row + 1);
        const piece = chess.get(square as any);
        boardRow.push(piece ? `${piece.color}${piece.type}` : "");
      }
      newBoard.push(boardRow);
    }
    setBoard(newBoard);
  };

  const isPlayerTurn = () => {
    if (!game) return false;
    const isWhite = game.white === currentPlayer;
    return (isWhite && turn === "w") || (!isWhite && turn === "b");
  };

  const handleSquareClick = async (row: number, col: number) => {
    if (disabled || !isPlayerTurn() || pendingMove) return;

    const file = String.fromCharCode(97 + col);
    const rank = 8 - row;
    const square = `${file}${rank}`;

    if (selectedSquare) {
      const move = { from: selectedSquare, to: square };
      try {
        const currentFen = chess.fen();
        setPreviousFen(currentFen);

        const result = chess.move(move);
        if (result) {
          const resulting_fen = chess.fen();
          setPendingMove(move);
          setSelectedSquare(null);
          setPossibleMoves([]);
          updateBoard();
          setTurn(chess.turn());

          const success = await onMove({ ...move, resulting_fen });
          if (success) setPendingMove(null);
        }
      } catch (e) {
        setSelectedSquare(square);
        updatePossibleMoves(square);
      }
    } else {
      setSelectedSquare(square);
      updatePossibleMoves(square);
    }
  };

  const updatePossibleMoves = (square: string) => {
    const moves = chess.moves({ square: square as any, verbose: true });
    setPossibleMoves(moves.map((m) => m.to));
  };

  const getPieceSymbol = (piece: string) => {
    const symbols: { [key: string]: string } = {
      wp: "\u2659",
      wn: "\u2658",
      wb: "\u2657",
      wr: "\u2656",
      wq: "\u2655",
      wk: "\u2654",
      bp: "\u265F",
      bn: "\u265E",
      bb: "\u265D",
      br: "\u265C",
      bq: "\u265B",
      bk: "\u265A",
    };
    return symbols[piece] || "";
  };

  const getSquareClasses = (row: number, col: number) => {
    const file = String.fromCharCode(97 + col);
    const rank = 8 - row;
    const square = `${file}${rank}`;
    const isLight = (row + col) % 2 === 0;

    if (selectedSquare === square) {
      return "bg-yellow-400 dark:bg-yellow-500";
    }
    if (possibleMoves.includes(square)) {
      return isLight
        ? "bg-emerald-300 dark:bg-emerald-400"
        : "bg-emerald-500 dark:bg-emerald-600";
    }
    if (isLight) {
      return "bg-amber-100 dark:bg-indigo-300";
    }
    return "bg-amber-700 dark:bg-indigo-700";
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Turn indicator */}
      <div className="text-center text-sm">
        {pendingMove ? (
          <span className="text-warning">Processing move...</span>
        ) : (
          <span className="text-muted-foreground">
            {isPlayerTurn() ? "Your turn" : "Opponent's turn"} (
            {turn === "w" ? "White" : "Black"} to move)
          </span>
        )}
      </div>

      {/* Error */}
      {moveError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-center text-sm text-destructive">
          Move failed: {moveError}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearError}
            className="ml-2 h-6 text-xs"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Board */}
      <div
        className={cn(
          "mx-auto overflow-hidden rounded-md border-2 border-border",
          isParty && "party-glow"
        )}
      >
        <div className="grid grid-cols-8">
          {board.map((row, rowIndex) =>
            row.map((piece, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={cn(
                  "flex h-12 w-12 cursor-pointer items-center justify-center text-4xl transition-colors sm:h-14 sm:w-14 sm:text-5xl md:h-16 md:w-16",
                  getSquareClasses(rowIndex, colIndex)
                )}
                onClick={() => handleSquareClick(rowIndex, colIndex)}
              >
                {getPieceSymbol(piece)}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
