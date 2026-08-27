"use client";

import { useState } from "react";
import { StaticAvatar } from "@/components/game/Avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MultiplayerConnectionStatus } from "@/hooks/useMultiplayerRoom";
import { getRoleName } from "@/lib/game-constants";
import { copyToClipboard } from "@/lib/share-utils";
import type { Phase } from "@/types/game";
import type { MultiplayerRoomMember, MultiplayerRoomView } from "@/types/multiplayer";
import styles from "./multiplayer.module.css";

interface RoomLobbyProps {
  view: MultiplayerRoomView;
  status: MultiplayerConnectionStatus;
  actionLoading?: boolean;
  error?: string | null;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  onClose: () => void;
}

const ROOM_STATUS_LABEL: Record<MultiplayerRoomView["room"]["status"], string> = {
  lobby: "等待集结",
  in_game: "游戏进行中",
  finished: "牌局已结束",
  closed: "房间已关闭",
};

function connectionLabel(status: MultiplayerConnectionStatus) {
  if (status === "connected") return "已连接";
  if (status === "reconnecting") return "正在重连";
  if (status === "error") return "连接异常";
  return "正在连接";
}

const DIFFICULTY_LABEL = { easy: "简单", normal: "普通", hard: "困难" } as const;

function phaseLabel(phase: Phase) {
  if (phase === "LOBBY") return "等待开局";
  if (phase === "SETUP") return "正在分配身份";
  if (phase === "GAME_END") return "游戏结束";
  if (phase.startsWith("NIGHT_")) return "夜间行动";
  if (phase.startsWith("DAY_")) return "白天议事";
  if (phase === "HUNTER_SHOOT") return "猎人发动技能";
  if (phase === "WHITE_WOLF_KING_BOOM") return "白狼王自爆";
  if (phase === "BADGE_TRANSFER") return "移交警徽";
  return "特殊事件";
}

function MemberStatus({ member }: { member: MultiplayerRoomMember }) {
  if (!member.isConnected) return <span className={styles.memberStatusOffline}>离线</span>;
  return <span className={member.isReady ? styles.memberStatusReady : styles.memberStatusWaiting}>{member.isReady ? "在线 · 已准备" : "在线 · 未准备"}</span>;
}

export function RoomLobby({ view, status, actionLoading = false, error, onReady, onStart, onLeave, onClose }: RoomLobbyProps) {
  const { room, members, publicState, privateState, currentUserId } = view;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [confirmAction, setConfirmAction] = useState<"leave" | "close" | null>(null);
  const isHost = room.hostUserId === currentUserId;
  const me = members.find((member) => member.userId === currentUserId);
  const activeMembers = members.filter((member) => member.role !== "spectator");
  const allReady = activeMembers.length > 0 && activeMembers.every((member) => member.isReady);
  const canStart = isHost && allReady && status === "connected" && !actionLoading;
  const aiSeatCount = Math.max(0, room.settings.playerCount - activeMembers.length);

  const copyRoomCode = async () => {
    const copied = await copyToClipboard(`${window.location.origin}/rooms/${room.code}`);
    setCopyState(copied ? "copied" : "error");
    if (copied) window.setTimeout(() => setCopyState("idle"), 1800);
  };

  return (
    <main className={styles.lobby}>
      <header className={styles.roomHeader}>
        <div className={styles.roomTitleBlock}>
          <span className={styles.cardKicker}>WOLFCHA · ROOM</span>
          <div className={styles.codeLine}>
            <h1>{room.code}</h1>
            <button type="button" className={styles.copyButton} onClick={() => void copyRoomCode()} aria-label="复制邀请链接">{copyState === "copied" ? "已复制" : "复制邀请链接"}</button>
          </div>
          <div className={styles.roomMeta}>
            <span className={styles.roomStatus} data-room-status={room.status}>{ROOM_STATUS_LABEL[room.status]}</span>
            <span>{room.settings.playerCount} 人局</span>
            <span>{room.status === "lobby" ? `${DIFFICULTY_LABEL[room.settings.difficulty]}难度` : `第 ${room.day} 天`}</span>
          </div>
          {copyState === "error" ? <span className={styles.copyError} role="status">复制失败，请手动选择房间码。</span> : null}
        </div>
        <div className={styles.headerControls}>
          <div className={styles.connection} data-status={status} aria-live="polite"><span aria-hidden="true">●</span> {connectionLabel(status)}</div>
          <div className={styles.roomActions}>
            <button type="button" className={styles.textAction} disabled={actionLoading} onClick={() => setConfirmAction("leave")}>{isHost ? "退出并移交房主" : "退出房间"}</button>
            {isHost ? <button type="button" className={styles.textAction} disabled={actionLoading} onClick={() => setConfirmAction("close")}>关闭房间</button> : null}
          </div>
        </div>
      </header>

      <Dialog open={confirmAction !== null} onOpenChange={(open) => { if (!open && !actionLoading) setConfirmAction(null); }}>
        <DialogContent className="w-[92vw] max-w-md" aria-busy={actionLoading}>
          <DialogHeader>
            <DialogTitle className="font-serif text-[var(--text-primary)]">{confirmAction === "close" ? "关闭房间？" : "退出房间？"}</DialogTitle>
            <DialogDescription className="text-[var(--text-muted)]">{confirmAction === "close" ? "关闭后所有玩家将无法继续加入。" : isHost ? "退出后会把房主身份移交给下一位玩家，你的席位将由 AI 接管。" : "退出后席位会释放给 AI。"}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={actionLoading} onClick={() => setConfirmAction(null)}>取消</Button>
            <Button variant="destructive" disabled={actionLoading} onClick={confirmAction === "close" ? onClose : onLeave}>{actionLoading ? "处理中…" : "确认"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <div className={styles.lobbyGrid}>
        <section className={`${styles.panel} ${styles.seatPanel}`}>
          <div className={styles.panelHeading}>
            <div><span className={styles.sectionKicker}>{room.status === "lobby" ? "座次" : "公开牌桌"}</span><h2>{room.status === "lobby" ? "玩家席位" : "场上玩家"}</h2></div>
            <span className={styles.occupancy}>{room.status === "lobby" ? `${activeMembers.length} 真人 · ${aiSeatCount} AI` : `${publicState.players.length}/${room.settings.playerCount}`}</span>
          </div>

          {room.status === "lobby" ? (
            <div className={styles.memberList}>
              {Array.from({ length: room.settings.playerCount }, (_, seat) => {
                const member = members.find((item) => item.seat === seat && item.role !== "spectator");
                const isMe = member?.userId === currentUserId;
                const isSeatHost = member?.userId === room.hostUserId;
                return (
                  <div className={`${styles.memberRow} ${isMe ? styles.memberRowMe : ""}`} key={seat}>
                    <span className={styles.seat} aria-label={`第 ${seat + 1} 号席位`}>{String(seat + 1).padStart(2, "0")}</span>
                    {member ? <>
                      <StaticAvatar seed={member.userId} size="sm" className={styles.memberAvatar} alt="" backgroundColor="transparent" loading="lazy" />
                      <span className={styles.memberName}>{member.displayName}{isMe ? <small className={styles.youTag}>你</small> : null}{isSeatHost ? <small className={styles.hostTag}>房主</small> : null}</span>
                      <MemberStatus member={member} />
                    </> : <span className={styles.emptySeat}>空席 · 开局时由 AI 补位</span>}
                  </div>
                );
              })}
              {members.filter((member) => member.role === "spectator" || member.seat === null).length > 0 ? <p className={styles.spectatorNote}>另有 {members.filter((member) => member.role === "spectator" || member.seat === null).length} 位观战 / 待分配成员</p> : null}
            </div>
          ) : (
            <div className={styles.gamePlayerGrid}>
              {Array.from({ length: room.settings.playerCount }, (_, seat) => {
                const player = publicState.players.find((item) => item.seat === seat);
                const member = members.find((item) => item.seat === seat);
                const isMe = privateState.seat === seat;
                const isSeatHost = member?.userId === room.hostUserId;
                return (
                  <div className={`${styles.gamePlayerCard} ${!player ? styles.gamePlayerCardEmpty : ""} ${!player?.alive ? styles.gamePlayerCardDead : ""}`} key={seat}>
                    <span className={styles.gameSeat}>#{seat + 1}</span>
                    {player ? <>
                      <StaticAvatar seed={player.avatarSeed ?? `${player.kind}-${player.seat}`} size="sm" className={styles.memberAvatar} alt="" backgroundColor="transparent" loading="lazy" />
                      <span className={styles.gamePlayerText}>
                        <strong>{player.displayName}</strong>
                        <span className={styles.gamePlayerMeta}>{player.alive ? "存活" : "出局"}{player.kind === "ai" ? " · AI" : ""}{isMe ? " · 你" : isSeatHost ? " · 房主" : ""}</span>
                      </span>
                    </> : <span className={styles.gamePlayerMeta}>未分配</span>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className={`${styles.panel} ${styles.identityPanel}`}>
          <div className={styles.panelHeading}><div><span className={styles.sectionKicker}>仅你可见</span><h2>你的身份</h2></div></div>
          <div className={styles.privateRole}>
            {privateState.role ? <><span className={styles.roleMark} aria-hidden="true">◆</span><strong>{getRoleName(privateState.role)}</strong><span>{privateState.alignment === "wolf" ? "狼人阵营" : privateState.alignment === "village" ? "好人阵营" : "阵营待揭晓"}</span></> : <><span className={styles.roleMark} aria-hidden="true">?</span><strong>开局后揭晓</strong><span>身份信息将只发给你</span></>}
          </div>
          {privateState.wolfTeammates.length > 0 ? <div className={styles.teammates}><span className={styles.sectionKicker}>狼队友</span>{privateState.wolfTeammates.map((teammate) => <span key={teammate.seat}>#{teammate.seat + 1} {teammate.displayName}</span>)}</div> : null}

          {room.status === "lobby" ? <div className={styles.actions}>
            {me && me.role !== "spectator" ? <Button size="lg" variant={me.isReady ? "secondary" : "default"} disabled={actionLoading || status !== "connected"} onClick={() => onReady(!me.isReady)}>{actionLoading ? "提交中…" : me.isReady ? "取消准备" : "准备"}</Button> : null}
            {isHost ? <Button size="lg" variant={canStart ? "default" : "outline"} disabled={!canStart} onClick={onStart}>{actionLoading ? "正在开始…" : "开始游戏"}</Button> : <p className={styles.waitingHint}>等待房主开始，空席将由 AI 补位</p>}
          </div> : <div className={styles.phaseSummary}><span className={styles.sectionKicker}>当前阶段</span><strong>{phaseLabel(publicState.phase)}</strong>{room.status === "finished" ? <span>胜负已揭晓</span> : room.status === "closed" ? <span>房主已关闭房间</span> : null}</div>}
        </section>
      </div>
    </main>
  );
}
