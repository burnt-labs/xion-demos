"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";
import { ShieldCheck, Loader2, X } from "lucide-react";

const MOCK_RATING = 1847;
const MOCK_PLATFORM = "chess.com";
const MOCK_DELAY_MS = 2000;

type VerifyStatus = "idle" | "loading" | "success" | "error";

interface VerifyRatingProps {
  onVerified?: (rating: number, platform: string) => void;
  currentElo?: number;
  isVerified?: boolean;
  verifiedPlatform?: string;
}

export default function VerifyRating({
  onVerified,
  isVerified,
  verifiedPlatform,
}: VerifyRatingProps) {
  const [status, setStatus] = useState<VerifyStatus>("idle");
  const [verifiedRating, setVerifiedRating] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { isParty } = useTheme();

  const startVerification = useCallback(async () => {
    setStatus("loading");
    setDialogOpen(true);
    await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
    setVerifiedRating(MOCK_RATING);
    onVerified?.(MOCK_RATING, MOCK_PLATFORM);
    setStatus("success");
  }, [onVerified]);

  if (isVerified && verifiedPlatform) {
    return (
      <Badge variant="success" className="gap-1">
        <ShieldCheck className="h-3 w-3" />
        Verified via {verifiedPlatform}
      </Badge>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={startVerification}
        disabled={status === "loading"}
        className={cn(
          "gap-1.5",
          isParty && "border-purple-500/50 hover:border-purple-400"
        )}
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        Verify Rating
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          onClose={() => {
            setDialogOpen(false);
            if (status !== "success") setStatus("idle");
          }}
          className={cn(isParty && "party-glow")}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Verify Chess Rating
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {status === "loading" && (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Verifying rating via zkTLS...
                </p>
              </div>
            )}

            {status === "success" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <div
                  className={cn(
                    "flex h-16 w-16 items-center justify-center rounded-full",
                    "bg-success/20"
                  )}
                >
                  <ShieldCheck className="h-8 w-8 text-success" />
                </div>
                <p className="text-lg font-bold">Verification Successful</p>
                {verifiedRating && (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                      Verified rating
                    </p>
                    <p
                      className={cn(
                        "text-3xl font-bold tabular-nums",
                        isParty ? "party-text" : "text-primary"
                      )}
                    >
                      {verifiedRating}
                    </p>
                  </div>
                )}
                <Badge variant="success" className="gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Proven via zkTLS
                </Badge>
                <Button
                  onClick={() => setDialogOpen(false)}
                  className="mt-2"
                  size="sm"
                >
                  Done
                </Button>
              </div>
            )}

            {status === "error" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/20">
                  <X className="h-8 w-8 text-destructive" />
                </div>
                <p className="font-medium">Verification Failed</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStatus("idle");
                    startVerification();
                  }}
                  size="sm"
                >
                  Retry
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
