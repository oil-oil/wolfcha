"use client";

import { type FormEvent, useRef, useState } from "react";
import { AuthModal } from "@/components/game/AuthModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MultiplayerConnectionStatus } from "@/hooks/useMultiplayerRoom";
import type { CreateMultiplayerRoomInput } from "@/types/multiplayer";
import type { DifficultyLevel } from "@/types/game";
import styles from "./multiplayer.module.css";

interface RoomEntryProps {
  authenticated: boolean;
  /** authStatus 为 loading 时避免把未完成的登录误显示成未登录。 */
  authLoading?: boolean;
  loading?: boolean;
  connectionStatus: MultiplayerConnectionStatus;
  error?: string | null;
  onRetryConnection?: () => void;
  onCreate: (input: CreateMultiplayerRoomInput) => void | Promise<void>;
  onJoin: (input: { code: string; displayName: string }) => void | Promise<void>;
}

export function RoomEntry({ authenticated, authLoading = false, loading = false, connectionStatus, error, onRetryConnection, onCreate, onJoin }: RoomEntryProps) {
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [playerCount, setPlayerCount] = useState(8);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("normal");
  const [showAuth, setShowAuth] = useState(false);
  const [activeTab, setActiveTab] = useState<"create" | "join">("create");
  const submitInFlightRef = useRef(false);

  if (authLoading) {
    return (
      <section className={`${styles.entryCard} ${styles.loadingCard}`} aria-busy="true" aria-live="polite">
        <span className={styles.cardKicker}>WOLFCHA · MULTIPLAYER</span>
        <span className={styles.loadingMark} aria-hidden="true">✦</span>
        <h2>正在确认你的身份</h2>
        <p>片刻后即可创建或加入房间。</p>
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className={styles.authCard}>
        <span className={styles.cardKicker}>仅限受邀玩家</span>
        <div className={styles.authSigil} aria-hidden="true">♜</div>
        <h2>先登录，再进入夜局</h2>
        <p>登录用于保存房间身份并在断线后恢复席位，不会改变你的游戏昵称。</p>
        <Button size="lg" onClick={() => setShowAuth(true)}>登录 / 注册</Button>
        <AuthModal open={showAuth} onOpenChange={setShowAuth} />
      </section>
    );
  }

  const trimmedName = displayName.trim();
  const connectionReady = connectionStatus === "connected";
  const canSubmit = trimmedName.length > 0 && trimmedName.length <= 24 && !loading && connectionReady;
  const canSubmitActiveForm = canSubmit && (activeTab === "create" || code.length >= 4);
  const connectionMessage = connectionStatus === "error"
    ? "多人服务连接失败，可以在当前页面重新连接。"
    : connectionStatus === "reconnecting"
      ? "连接已中断，正在重新连接…"
      : connectionStatus !== "connected"
      ? "正在连接多人服务…"
      : null;

  const submitRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmitActiveForm || submitInFlightRef.current) return;

    submitInFlightRef.current = true;
    try {
      if (activeTab === "create") {
        await onCreate({ displayName: trimmedName, playerCount, difficulty, locale: "zh" });
      } else {
        await onJoin({ code, displayName: trimmedName });
      }
    } finally {
      submitInFlightRef.current = false;
    }
  };

  return (
    <section className={styles.entryCard}>
      <div className={styles.entryIntro}>
        <span className={styles.cardKicker}>召集一场夜局</span>
        <h2>选择你的入口</h2>
        <p>创建房间成为房主，或输入朋友分享的房间码。</p>
      </div>

      <div className={styles.tabs} role="group" aria-label="房间操作">
        <button type="button" className={activeTab === "create" ? styles.activeTab : ""} onClick={() => setActiveTab("create")} aria-pressed={activeTab === "create"}>创建房间</button>
        <button type="button" className={activeTab === "join" ? styles.activeTab : ""} onClick={() => setActiveTab("join")} aria-pressed={activeTab === "join"}>加入房间</button>
      </div>

      <form className={styles.form} onSubmit={submitRoom}>
        <div className={styles.field}>
          <Label htmlFor="room-display-name">你的昵称</Label>
          <Input id="room-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={24} placeholder="1–24 个字符" autoComplete="nickname" />
        </div>

        {activeTab === "create" ? (
          <>
            <div className={styles.inlineFields}>
              <div className={styles.field}>
                <Label htmlFor="room-player-count">玩家席位</Label>
                <select id="room-player-count" className={styles.select} value={playerCount} onChange={(event) => setPlayerCount(Number(event.target.value))}>
                  {[8, 9, 10, 11, 12].map((count) => <option key={count} value={count}>{count} 人</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <Label htmlFor="room-difficulty">牌局难度</Label>
                <select id="room-difficulty" className={styles.select} value={difficulty} onChange={(event) => setDifficulty(event.target.value as DifficultyLevel)}>
                  <option value="easy">简单</option>
                  <option value="normal">普通</option>
                  <option value="hard">困难</option>
                </select>
              </div>
            </div>
            <Button type="submit" size="lg" disabled={!canSubmitActiveForm}>{loading ? "正在建立房间…" : "创建房间"}</Button>
          </>
        ) : (
          <>
            <div className={styles.field}>
              <Label htmlFor="room-code">房间码</Label>
              <Input id="room-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={12} placeholder="例如 WOLF7K" autoComplete="off" spellCheck={false} />
            </div>
            <Button type="submit" size="lg" disabled={!canSubmitActiveForm}>{loading ? "正在进入房间…" : "加入房间"}</Button>
          </>
        )}

        {connectionMessage ? <div className={styles.error} role={connectionStatus === "error" ? "alert" : "status"}>
          <span>{connectionMessage}</span>
          {connectionStatus === "error" && onRetryConnection ? <Button type="button" size="sm" variant="outline" onClick={onRetryConnection}>重新连接</Button> : null}
        </div> : error ? <p className={styles.error} role="alert">{error}</p> : null}
      </form>
    </section>
  );
}
