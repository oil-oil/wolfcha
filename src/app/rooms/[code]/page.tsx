"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RoomEntry } from "@/components/multiplayer/RoomEntry";
import { RoomLobby } from "@/components/multiplayer/RoomLobby";
import { MultiplayerGameShell } from "@/components/multiplayer/MultiplayerGameShell";
import { Button } from "@/components/ui/button";
import { useMultiplayerRoom } from "@/hooks/useMultiplayerRoom";
import { useCredits } from "@/hooks/useCredits";
import { getGeneratorModel } from "@/lib/api-keys";
import styles from "@/components/multiplayer/multiplayer.module.css";

export default function MultiplayerRoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = typeof params?.code === "string" ? params.code : "";
  const { view, status, authStatus, authRequired, actionLoading, error, resumeRoom, setReady, startRoom, leaveRoom, closeRoom, submitGameCommand } = useMultiplayerRoom({ roomCode: code });
  const { consumeCredit, user } = useCredits();
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);
  const pendingGameSessionId = useRef<string | null>(null);

  useEffect(() => {
    pendingGameSessionId.current = readPendingMultiplayerSession();
  }, []);

  useEffect(() => {
    if (view?.room.status === "in_game" || view?.room.status === "finished") {
      pendingGameSessionId.current = null;
      clearPendingMultiplayerSession();
    }
  }, [view?.room.status]);

  const handleStart = async () => {
    if (!view || creditLoading) return;
    setCreditLoading(true);
    setCreditError(null);
    try {
      const localTest = process.env.NEXT_PUBLIC_GAME_SERVER_TEST_MODE === "true";
      if (!localTest && !pendingGameSessionId.current) {
        const result = await consumeCredit({
          createSession: true,
          playerCount: view.room.settings.playerCount,
          difficulty: view.room.settings.difficulty,
          usedCustomKey: false,
          modelUsed: getGeneratorModel(),
          userEmail: user?.email ?? null,
          region: typeof navigator === "undefined"
            ? null
            : `${navigator.language}|${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
        });
        if (!result.success || !result.sessionId) {
          setCreditError("游戏额度不足或授权失败，请检查后重试");
          return;
        }
        pendingGameSessionId.current = result.sessionId;
        writePendingMultiplayerSession(result.sessionId);
      }
      const result = await startRoom(pendingGameSessionId.current);
      if (result.ok) {
        pendingGameSessionId.current = null;
        clearPendingMultiplayerSession();
      } else if (result.error?.code === "FORBIDDEN") {
        pendingGameSessionId.current = null;
        clearPendingMultiplayerSession();
        setCreditError("本局额度授权已失效，请重新开始");
      }
    } finally {
      setCreditLoading(false);
    }
  };
  if (authStatus === "loading") return <div className={styles.page}><div className={styles.container}><RoomEntry authenticated={false} authLoading connectionStatus={status} onCreate={() => undefined} onJoin={() => undefined} /></div></div>;
  if (authRequired) return <div className={styles.page}><div className={styles.container}><RoomEntry authenticated={false} connectionStatus={status} onCreate={() => undefined} onJoin={() => undefined} /></div></div>;
  const failed = status === "error" || Boolean(error);
  if (!view) return <div className={styles.page}><div className={styles.container}><section className={styles.authCard} role={failed ? "alert" : undefined}><span className={styles.cardKicker}>房间 · {code || "未知"}</span><div className={styles.authSigil} aria-hidden="true">{failed ? "!" : "✦"}</div><h2>{failed ? "暂时无法进入房间" : status === "reconnecting" ? "正在恢复房间连接" : "正在进入房间"}</h2><p>{failed ? (error?.message ?? "请检查房间码是否正确") : "正在同步你的席位和牌局状态，请稍候。"}</p>{failed ? <><p className={styles.error}>连接仍可恢复，你可以重新尝试进入。</p><ButtonRetry loading={actionLoading} onRetry={() => { void resumeRoom(code); }} /></> : null}</section></div></div>;
  const leaveAndReturn = async () => { const result = await leaveRoom(); if (result.ok) router.replace("/rooms"); };
  const closeAndReturn = async () => { const result = await closeRoom(); if (result.ok) router.replace("/rooms"); };
  return <div className={styles.page}>{view.room.status === "in_game" || view.room.status === "finished" ? <MultiplayerGameShell view={view} status={status} actionLoading={actionLoading} error={error?.message} onSubmit={submitGameCommand} onLeave={() => { void leaveAndReturn(); }} onBack={() => router.replace("/rooms")} /> : <RoomLobby view={view} status={status} actionLoading={actionLoading || creditLoading} error={creditError ?? error?.message} onReady={(ready) => { void setReady(ready); }} onStart={() => { void handleStart(); }} onLeave={() => { void leaveAndReturn(); }} onClose={() => { void closeAndReturn(); }} />}</div>;
}

function ButtonRetry({ loading, onRetry }: { loading: boolean; onRetry: () => void }) {
  return <Button size="lg" disabled={loading} onClick={onRetry}>{loading ? "重新连接中…" : "重新连接"}</Button>;
}

const PENDING_MULTIPLAYER_SESSION_KEY = "wolfcha_pending_multiplayer_session";
const PENDING_MULTIPLAYER_SESSION_TTL_MS = 4 * 60 * 60 * 1_000;

function readPendingMultiplayerSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(PENDING_MULTIPLAYER_SESSION_KEY) ?? "null") as {
      sessionId?: string;
      createdAt?: number;
    } | null;
    if (
      !value?.sessionId ||
      typeof value.createdAt !== "number" ||
      Date.now() - value.createdAt >= PENDING_MULTIPLAYER_SESSION_TTL_MS
    ) {
      clearPendingMultiplayerSession();
      return null;
    }
    return value.sessionId;
  } catch {
    clearPendingMultiplayerSession();
    return null;
  }
}

function writePendingMultiplayerSession(sessionId: string): void {
  window.sessionStorage.setItem(
    PENDING_MULTIPLAYER_SESSION_KEY,
    JSON.stringify({ sessionId, createdAt: Date.now() }),
  );
}

function clearPendingMultiplayerSession(): void {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(PENDING_MULTIPLAYER_SESSION_KEY);
}
