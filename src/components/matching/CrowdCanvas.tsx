"use client";

import { useEffect, useRef, useState } from "react";
import { createCrowdScene, type CrowdSnapshot } from "./crowd-scene";
import type { MatchingPlayer, MatchedPlayer } from "./matching-characters";
import styles from "./matching.module.css";

const NO_PLAYERS: readonly MatchingPlayer[] = [];

export interface CrowdCanvasProps {
  src?: string;
  /** Kept compatible with the reference: horizontal sprite cells. */
  rows?: number;
  /** Kept compatible with the reference: vertical sprite cells. */
  cols?: number;
  variant?: CrowdSnapshot["variant"];
  /** Leave room for the original game loading information above the crowd. */
  compact?: boolean;
  players?: readonly MatchingPlayer[];
  /** Let this many walkers mingle and settle into spaced positions. */
  matchedCount?: number;
  /** Select these exact participants, retaining the seat supplied in players. */
  matchedPlayerIds?: readonly string[];
  totalSeats?: number;
  status?: CrowdSnapshot["status"];
  className?: string;
  onMatchedCountChange?: (count: number) => void;
  onPlayersMatched?: (players: readonly MatchedPlayer[]) => void;
  onReady?: () => void;
  onError?: () => void;
  avatarForSeat?: (seat: number) => HTMLDivElement | undefined;
  onSeatArrived?: (seat: number) => void;
  onTransitionComplete?: () => void;
}

export function CrowdCanvas({
  src = "/images/peeps/all-peeps.png",
  rows = 15,
  cols = 7,
  variant = "original",
  compact = false,
  players = NO_PLAYERS,
  matchedCount = 0,
  matchedPlayerIds,
  totalSeats = 10,
  status = "searching",
  className = "",
  onMatchedCountChange,
  onPlayersMatched,
  onReady,
  onError,
  avatarForSeat,
  onSeatArrived,
  onTransitionComplete,
}: CrowdCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef<ReturnType<typeof createCrowdScene> | null>(null);
  const playersRef = useRef(players);
  const matchedCallback = useRef(onMatchedCountChange);
  const arrivalOptions = useRef({ avatarForSeat, onSeatArrived, onTransitionComplete, onPlayersMatched, onReady, onError });
  const [assetState, setAssetState] = useState<"loading" | "ready" | "error">("loading");
  const safeTotal = Math.min(12, Math.max(6, Math.round(totalSeats) || 6));
  const safeCount = Math.min(safeTotal, Math.max(0, Math.round(matchedCount) || 0));
  const safeRows = Math.max(1, Math.round(rows) || 15);
  const safeCols = Math.max(1, Math.round(cols) || 7);

  useEffect(() => { matchedCallback.current = onMatchedCountChange; }, [onMatchedCountChange]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => {
    arrivalOptions.current = { avatarForSeat, onSeatArrived, onTransitionComplete, onPlayersMatched, onReady, onError };
  }, [avatarForSeat, onSeatArrived, onTransitionComplete, onPlayersMatched, onReady, onError]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const instance = createCrowdScene(canvasRef.current, {
      src, rows: safeRows, cols: safeCols, players: playersRef.current, compact,
      initial: { variant, matchedCount: 0, totalSeats: safeTotal, status: "searching" },
      onReady: () => { setAssetState("ready"); arrivalOptions.current.onReady?.(); },
      onError: () => { setAssetState("error"); arrivalOptions.current.onError?.(); },
      onMatchedCountChange: (count) => matchedCallback.current?.(count),
      onPlayersMatched: (selected) => arrivalOptions.current.onPlayersMatched?.(selected),
      transferEnabled: !!avatarForSeat,
      avatarForSeat: (seat) => arrivalOptions.current.avatarForSeat?.(seat),
      onSeatArrived: (seat) => arrivalOptions.current.onSeatArrived?.(seat),
      onTransitionComplete: () => arrivalOptions.current.onTransitionComplete?.(),
    });
    scene.current = instance;
    return () => {
      instance.destroy();
      scene.current = null;
    };
  }, [src, safeRows, safeCols, variant, compact, avatarForSeat, safeTotal]);

  useEffect(() => {
    scene.current?.updatePlayers(players);
  }, [src, safeRows, safeCols, variant, players, compact, avatarForSeat, safeTotal]);

  useEffect(() => {
    scene.current?.update({ variant, matchedCount: safeCount, matchedPlayerIds, totalSeats: safeTotal, status });
  }, [src, safeRows, safeCols, variant, players, compact, avatarForSeat, safeCount, matchedPlayerIds, safeTotal, status]);

  return (
    <div className={`${styles.scene} ${className}`} data-asset-state={assetState}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      {assetState === "error" && (
        <p className={styles.assetError} role="alert">人物素材未能加载，请刷新页面重试。</p>
      )}
    </div>
  );
}
