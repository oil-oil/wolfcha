"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RoomEntry } from "@/components/multiplayer/RoomEntry";
import { RoomLobby } from "@/components/multiplayer/RoomLobby";
import { MultiplayerGameShell } from "@/components/multiplayer/MultiplayerGameShell";
import { Button } from "@/components/ui/button";
import { useMultiplayerRoom } from "@/hooks/useMultiplayerRoom";
import { useCredits } from "@/hooks/useCredits";
import {
  clearPendingMultiplayerSession,
  readPendingMultiplayerSession,
  writePendingMultiplayerSession,
  type PendingMultiplayerSession,
} from "@/lib/multiplayer/pending-credit-session";
import styles from "@/components/multiplayer/multiplayer.module.css";

export default function MultiplayerRoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = typeof params?.code === "string" ? params.code : "";
  const { view, status, authStatus, authRequired, actionLoading, error, resumeRoom, setReady, startRoom, leaveRoom, closeRoom, retryAi, submitGameCommand } = useMultiplayerRoom({ roomCode: code });
  const { consumeCredit, user } = useCredits();
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);
  const pendingGameSession = useRef<PendingMultiplayerSession | null>(null);

  useEffect(() => {
    pendingGameSession.current = view?.room.id && user?.id
      ? readPendingMultiplayerSession(window.sessionStorage, view.room.id, user.id)
      : null;
  }, [view?.room.id, user?.id]);

  useEffect(() => {
    if (view?.room.status === "in_game" || view?.room.status === "finished") {
      pendingGameSession.current = null;
      if (view.room.id && user?.id) clearPendingMultiplayerSession(window.sessionStorage, view.room.id, user.id);
    }
  }, [view?.room.id, view?.room.status, user?.id]);

  const handleStart = async () => {
    if (!view || creditLoading) return;
    setCreditLoading(true);
    setCreditError(null);
    try {
      const localTest = process.env.NEXT_PUBLIC_GAME_SERVER_TEST_MODE === "true";
      const userId = user?.id ?? null;
      const cachedSession = pendingGameSession.current;
      const cachedSessionMatches = Boolean(
        cachedSession && cachedSession.roomId === view.room.id && cachedSession.userId === userId,
      );
      if (!localTest && !cachedSessionMatches) {
        const result = await consumeCredit({
          createSession: true,
          deferredMultiplayerRoomId: view.room.id,
          playerCount: view.room.settings.playerCount,
          difficulty: view.room.settings.difficulty,
          usedCustomKey: false,
          userEmail: user?.email ?? null,
          region: typeof navigator === "undefined"
            ? null
            : `${navigator.language}|${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
        });
        if (!result.success || !result.sessionId) {
          setCreditError("游戏额度不足或授权失败，请检查后重试");
          return;
        }
        if (!userId) {
          setCreditError("登录状态已变化，请刷新后重试");
          return;
        }
        const reservation = { sessionId: result.sessionId, roomId: view.room.id, userId, createdAt: Date.now() };
        pendingGameSession.current = reservation;
        writePendingMultiplayerSession(window.sessionStorage, reservation);
      }
      const sessionId = cachedSessionMatches ? cachedSession?.sessionId : pendingGameSession.current?.sessionId;
      const result = await startRoom(localTest ? null : sessionId ?? null);
      if (result.ok) {
        pendingGameSession.current = null;
        if (userId) clearPendingMultiplayerSession(window.sessionStorage, view.room.id, userId);
      } else if (result.error?.code === "FORBIDDEN") {
        pendingGameSession.current = null;
        if (userId) clearPendingMultiplayerSession(window.sessionStorage, view.room.id, userId);
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
  return <div className={styles.page}>{view.room.status === "in_game" || view.room.status === "finished" ? <MultiplayerGameShell view={view} status={status} actionLoading={actionLoading} error={error?.message} onSubmit={submitGameCommand} onRetryAi={() => { void retryAi(); }} onLeave={() => { void leaveAndReturn(); }} onBack={() => router.replace("/rooms")} /> : <RoomLobby view={view} status={status} actionLoading={actionLoading || creditLoading} error={creditError ?? error?.message} onReady={(ready) => { void setReady(ready); }} onStart={() => { void handleStart(); }} onLeave={() => { void leaveAndReturn(); }} onClose={() => { void closeAndReturn(); }} />}</div>;
}

function ButtonRetry({ loading, onRetry }: { loading: boolean; onRetry: () => void }) {
  return <Button size="lg" disabled={loading} onClick={onRetry}>{loading ? "重新连接中…" : "重新连接"}</Button>;
}
