"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import { StaticAvatar } from "@/components/game/Avatar";
import { RoleRevealOverlay } from "@/components/game/RoleRevealOverlay";
import { SoundSettingsSection } from "@/components/game/SettingsModal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getRoleName } from "@/lib/game-constants";
import { audioManager } from "@/lib/audio-manager";
import { VOICE_PRESETS } from "@/lib/voice-constants";
import { generateUUID } from "@/lib/utils";
import { audioSettingsAtom } from "@/store/settings";
import type { MultiplayerGameCommand, MultiplayerRoomView } from "@/types/multiplayer";
import type { Phase, Player } from "@/types/game";
import type { MultiplayerConnectionStatus } from "@/hooks/useMultiplayerRoom";
import styles from "./multiplayer.module.css";

type SubmitCommand = (command: MultiplayerGameCommand) => Promise<{ ok: boolean; error?: { message: string } }>;
type CommandPayload = { type: MultiplayerGameCommand["type" ]; [key: string]: unknown };
const TARGET_ACTIONS = ["guard", "wolf", "seer", "badge_vote", "day_vote", "hunter_shot", "badge_transfer", "white_wolf_boom"] as const satisfies readonly MultiplayerGameCommand["type"][];
type TargetAction = (typeof TARGET_ACTIONS)[number];

const TARGET_BUTTON_LABEL: Record<TargetAction, string> = {
  guard: "确认守护",
  wolf: "确认出刀",
  seer: "确认查验",
  badge_vote: "投票竞选警长",
  day_vote: "确认放逐",
  hunter_shot: "确认开枪",
  badge_transfer: "移交警徽",
  white_wolf_boom: "确认自爆",
};

const DAY_BGM_SRC = "/bgm/day.mp3";
const NIGHT_BGM_SRC = "/bgm/night.mp3";
const LOOP_FADE_DURATION_MS = 1_200;

function useGameBgm({ active, isNight, volume, enabled }: { active: boolean; isNight: boolean; volume: number; enabled: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeFrameRef = useRef<number | null>(null);
  const unlockedRef = useRef(false);
  const transitionRef = useRef(0);
  const loopFadeRef = useRef(false);
  const manualFadeRef = useRef(false);
  const playbackRef = useRef({ active, enabled, volume });
  const [unlocked, setUnlocked] = useState(false);
  const desiredSrc = isNight ? NIGHT_BGM_SRC : DAY_BGM_SRC;

  useEffect(() => {
    playbackRef.current = { active, enabled, volume };
  }, [active, enabled, volume]);

  const cancelFade = useCallback(() => {
    if (fadeFrameRef.current === null) return;
    cancelAnimationFrame(fadeFrameRef.current);
    fadeFrameRef.current = null;
  }, []);

  const fadeTo = useCallback((audio: HTMLAudioElement, targetVolume: number, duration: number, onComplete?: () => void) => {
    cancelFade();
    const startVolume = audio.volume;
    const startedAt = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      audio.volume = startVolume + (targetVolume - startVolume) * eased;
      if (progress < 1) {
        fadeFrameRef.current = requestAnimationFrame(animate);
      } else {
        fadeFrameRef.current = null;
        onComplete?.();
      }
    };
    fadeFrameRef.current = requestAnimationFrame(animate);
  }, [cancelFade]);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = false;
    audio.preload = "auto";
    audio.volume = 0;
    audioRef.current = audio;
    const handleTimeUpdate = () => {
      if (manualFadeRef.current || loopFadeRef.current) return;
      const playback = playbackRef.current;
      if (!playback.active || !playback.enabled) return;
      const remaining = audio.duration - audio.currentTime;
      if (!Number.isFinite(remaining) || remaining > LOOP_FADE_DURATION_MS / 1_000) return;

      loopFadeRef.current = true;
      fadeTo(audio, 0, LOOP_FADE_DURATION_MS, () => {
        const latestPlayback = playbackRef.current;
        if (!audioRef.current || !latestPlayback.active || !latestPlayback.enabled) {
          loopFadeRef.current = false;
          return;
        }
        audio.currentTime = 0;
        audio.volume = 0;
        void audio.play()
          .then(() => fadeTo(audio, latestPlayback.volume, LOOP_FADE_DURATION_MS, () => {
            loopFadeRef.current = false;
          }))
          .catch(() => {
            unlockedRef.current = false;
            setUnlocked(false);
            loopFadeRef.current = false;
          });
      });
    };
    audio.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      transitionRef.current += 1;
      cancelFade();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
      unlockedRef.current = false;
    };
  }, [cancelFade, fadeTo]);

  const unlock = useCallback(() => {
    if (unlockedRef.current || !active) return;
    transitionRef.current += 1;
    cancelFade();
    manualFadeRef.current = false;
    loopFadeRef.current = false;
    unlockedRef.current = true;
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.getAttribute("src") !== desiredSrc) {
      audio.src = desiredSrc;
      audio.load();
    }
    audio.volume = 0;
    void audio.play().then(() => {
      setUnlocked(true);
      fadeTo(audio, volume, 800);
    }).catch(() => {
      unlockedRef.current = false;
      setUnlocked(false);
    });
  }, [active, cancelFade, desiredSrc, fadeTo, volume]);

  useEffect(() => {
    const unlockEnabledBgm = () => {
      if (enabled) unlock();
    };
    window.addEventListener("pointerdown", unlockEnabledBgm, { passive: true });
    return () => window.removeEventListener("pointerdown", unlockEnabledBgm);
  }, [enabled, unlock]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const transition = ++transitionRef.current;

    if (!active || !enabled) {
      manualFadeRef.current = true;
      loopFadeRef.current = false;
      fadeTo(audio, 0, 500, () => {
        if (transition !== transitionRef.current) return;
        audio.pause();
        manualFadeRef.current = false;
      });
      return;
    }

    const sourceChanged = audio.getAttribute("src") !== desiredSrc;
    if (sourceChanged) {
      manualFadeRef.current = true;
      loopFadeRef.current = false;
      cancelFade();
      audio.pause();
      audio.src = desiredSrc;
      audio.load();
      audio.volume = 0;
    }
    if (!unlockedRef.current) return;

    const resume = sourceChanged || audio.paused ? audio.play() : Promise.resolve();
    void resume
      .then(() => {
        if (transition !== transitionRef.current) return;
        manualFadeRef.current = true;
        fadeTo(audio, volume, sourceChanged ? 1_200 : 500, () => {
          if (transition === transitionRef.current) manualFadeRef.current = false;
        });
      })
      .catch(() => {
        unlockedRef.current = false;
        setUnlocked(false);
        manualFadeRef.current = false;
      });
  }, [active, cancelFade, desiredSrc, enabled, fadeTo, volume]);

  return { unlock, unlocked };
}

function isTargetAction(action: MultiplayerGameCommand["type"]): action is TargetAction {
  return (TARGET_ACTIONS as readonly MultiplayerGameCommand["type"][]).includes(action);
}

interface MultiplayerGameShellProps {
  view: MultiplayerRoomView;
  status: MultiplayerConnectionStatus;
  actionLoading?: boolean;
  error?: string | null;
  onSubmit: SubmitCommand;
  onLeave: () => void;
  onBack: () => void;
}

const PHASE_LABEL: Record<string, string> = {
  NIGHT_GUARD_ACTION: "守卫行动", NIGHT_WOLF_ACTION: "狼人行动", NIGHT_WITCH_ACTION: "女巫行动", NIGHT_SEER_ACTION: "预言家查验",
  DAY_BADGE_SIGNUP: "警徽竞选报名", DAY_BADGE_SPEECH: "竞选发言", DAY_BADGE_ELECTION: "警徽投票", DAY_SPEECH: "白天发言",
  DAY_PK_SPEECH: "PK 发言", DAY_LAST_WORDS: "遗言", DAY_VOTE: "放逐投票", HUNTER_SHOOT: "猎人开枪",
  BADGE_TRANSFER: "警徽移交", WHITE_WOLF_KING_BOOM: "白狼王自爆", GAME_END: "游戏结束",
};

function phaseLabel(phase: Phase) { return PHASE_LABEL[phase] ?? (phase.startsWith("NIGHT") ? "夜间阶段" : "白天阶段"); }

function targetPayload(type: TargetAction, targetSeat: number | null): CommandPayload | null {
  switch (type) {
    case "guard": return { type: "guard", targetSeat };
    case "wolf": return { type: "wolf", targetSeat };
    case "seer": return targetSeat == null ? null : { type: "seer", targetSeat };
    case "badge_vote": return targetSeat == null ? null : { type: "badge_vote", targetSeat };
    case "day_vote": return { type: "day_vote", targetSeat };
    case "hunter_shot": return { type: "hunter_shot", targetSeat };
    case "badge_transfer": return { type: "badge_transfer", targetSeat };
    case "white_wolf_boom": return { type: "white_wolf_boom", targetSeat };
    default: return null;
  }
}

export function MultiplayerGameShell({ view, status, actionLoading = false, error, onSubmit, onLeave, onBack }: MultiplayerGameShellProps) {
  const { room, publicState, privateState } = view;
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [speech, setSpeech] = useState("");
  const [poisonMode, setPoisonMode] = useState(false);
  const [savePotion, setSavePotion] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [roleRevealOpen, setRoleRevealOpen] = useState(false);
  const [feedUnread, setFeedUnread] = useState(0);
  const [feedAtBottom, setFeedAtBottom] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const activeMessages = publicState.messages;
  const gameShellRef = useRef<HTMLElement | null>(null);
  const eventFeedRef = useRef<HTMLDivElement | null>(null);
  const feedAtBottomRef = useRef(true);
  const feedInitializedRef = useRef(false);
  const spokenMessageIds = useRef<Set<string> | null>(null);
  const spokenRoomId = useRef<string | null>(null);
  const previousMessageCount = useRef(activeMessages.length);
  const commandInFlightRef = useRef(false);
  const currentAudioEnabled = useRef(audioManager.isEnabled());
  const [audioSettings, setAudioSettings] = useAtom(audioSettingsAtom);
  const allowed = privateState.allowedActions;
  const pending = actionLoading || status !== "connected";
  const targetActions = allowed.filter(isTargetAction);
  const targetSeats = privateState.eligibleTargets;
  const actionContextKey = `${publicState.day}:${publicState.phase}:${publicState.currentSpeakerSeat ?? "all"}:${allowed.join(",")}:${targetSeats.join(",")}`;
  const previousActionContextKey = useRef(actionContextKey);
  const selectedPlayer = publicState.players.find((p) => p.seat === selectedSeat);
  const ownPublicPlayer = privateState.seat == null
    ? null
    : publicState.players.find((player) => player.seat === privateState.seat) ?? null;
  const roleRevealPlayer: Player | null = ownPublicPlayer && privateState.role && privateState.alignment
    ? {
        playerId: `seat:${ownPublicPlayer.seat}`,
        seat: ownPublicPlayer.seat,
        displayName: ownPublicPlayer.displayName,
        avatarSeed: ownPublicPlayer.avatarSeed ?? undefined,
        alive: ownPublicPlayer.alive,
        role: privateState.role,
        alignment: privateState.alignment,
        isHuman: true,
      }
    : null;

  useEffect(() => {
    if (!privateState.role) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && window.sessionStorage.getItem(`wolfcha.multiplayer.role-revealed:${room.id}`) !== "done") {
        setRoleRevealOpen(true);
      }
    });
    return () => { cancelled = true; };
  }, [privateState.role, room.id]);

  useEffect(() => {
    if (previousActionContextKey.current === actionContextKey) return;
    previousActionContextKey.current = actionContextKey;
    queueMicrotask(() => {
      setSelectedSeat(null);
      setSpeech("");
      setPoisonMode(false);
      setSavePotion(false);
    });
  }, [actionContextKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const feed = eventFeedRef.current;
    const addedMessages = Math.max(0, activeMessages.length - previousMessageCount.current);
    previousMessageCount.current = activeMessages.length;
    if (!feed) return;
    if (!feedInitializedRef.current) {
      feedInitializedRef.current = true;
      feed.scrollTo({ top: feed.scrollHeight, behavior: "auto" });
      return;
    }
    if (addedMessages === 0) return;
    if (feedAtBottomRef.current) {
      feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
    } else {
      setFeedUnread((count) => count + addedMessages);
    }
  }, [activeMessages.length]);

  const handleFeedScroll = () => {
    const feed = eventFeedRef.current;
    if (!feed) return;
    const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight <= 24;
    feedAtBottomRef.current = atBottom;
    setFeedAtBottom(atBottom);
    if (atBottom) setFeedUnread(0);
  };

  useEffect(() => {
    const shell = gameShellRef.current;
    const actionBar = shell?.querySelector<HTMLElement>("[data-multiplayer-action-bar]");
    if (!shell || !actionBar) return;
    const updateActionBarHeight = () => shell.style.setProperty("--multiplayer-action-bar-height", `${actionBar.getBoundingClientRect().height}px`);
    updateActionBarHeight();
    if (typeof ResizeObserver === "undefined") return () => shell.style.removeProperty("--multiplayer-action-bar-height");
    const observer = new ResizeObserver(updateActionBarHeight);
    observer.observe(actionBar);
    const viewport = window.visualViewport;
    const updateKeyboardInset = () => {
      if (!viewport) return;
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      shell.style.setProperty("--multiplayer-keyboard-inset", `${inset}px`);
    };
    viewport?.addEventListener("resize", updateKeyboardInset);
    viewport?.addEventListener("scroll", updateKeyboardInset);
    updateKeyboardInset();
    return () => {
      observer.disconnect();
      viewport?.removeEventListener("resize", updateKeyboardInset);
      viewport?.removeEventListener("scroll", updateKeyboardInset);
      shell.style.removeProperty("--multiplayer-action-bar-height");
      shell.style.removeProperty("--multiplayer-keyboard-inset");
    };
  }, []);

  useEffect(() => {
    const enabled = audioSettings.isSoundEnabled && audioSettings.isAiVoiceEnabled;
    currentAudioEnabled.current = enabled;
    if (spokenRoomId.current !== room.id) {
      spokenRoomId.current = room.id;
      spokenMessageIds.current = new Set(activeMessages.map((message) => message.id));
    }
    if (!spokenMessageIds.current) {
      spokenMessageIds.current = new Set(activeMessages.map((message) => message.id));
    }
    if (!enabled) {
      audioManager.setEnabled(false);
      audioManager.clearTasks((task) => task.id.startsWith(`multiplayer:${room.id}:`), { notify: false });
      for (const message of activeMessages) spokenMessageIds.current.add(message.id);
      return;
    }
    audioManager.setEnabled(true);
    for (const message of activeMessages) {
      if (message.isSystem || spokenMessageIds.current.has(message.id)) continue;
      spokenMessageIds.current.add(message.id);
      const player = message.playerId
        ? publicState.players.find((item) => `seat:${item.seat}` === message.playerId)
        : undefined;
      if (!player || player.kind !== "ai") continue;
      const voiceId = VOICE_PRESETS[player.seat % VOICE_PRESETS.length].id;
      audioManager.addToQueue({
        id: `multiplayer:${room.id}:${message.id}`,
        text: message.content,
        voiceId,
        playerId: `seat:${player.seat}`,
      });
    }
  }, [activeMessages, audioSettings.isAiVoiceEnabled, audioSettings.isSoundEnabled, publicState.players, room.id]);

  useEffect(() => {
    return () => {
      audioManager.clearTasks((task) => task.id.startsWith(`multiplayer:${room.id}:`), { notify: false });
      audioManager.setEnabled(currentAudioEnabled.current);
    };
  }, [room.id]);

  const send = async (command: CommandPayload) => {
    if (pending || commandInFlightRef.current) return;
    commandInFlightRef.current = true;
    setLocalError(null);
    try {
      const result = await onSubmit({ ...command, commandId: generateUUID(), roomId: room.id, expectedVersion: room.version } as MultiplayerGameCommand);
      if (!result.ok) setLocalError(result.error?.message ?? "操作未被接受，请重试");
      else { setSelectedSeat(null); setSpeech(""); setPoisonMode(false); }
    } finally {
      commandInFlightRef.current = false;
    }
  };

  const targetCommand = targetActions[0];
  const canTarget = Boolean(targetCommand && selectedSeat !== null && targetSeats.includes(selectedSeat));
  const currentSpeaker = publicState.currentSpeakerSeat == null ? null : publicState.players.find((p) => p.seat === publicState.currentSpeakerSeat);
  const voteProgress = publicState.voteProgress;
  const badgeVoteProgress = publicState.badge.voteProgress;
  const secondsLeft = publicState.deadlineAt
    ? Math.max(0, Math.ceil((Date.parse(publicState.deadlineAt) - now) / 1_000))
    : null;

  const { unlock: unlockBgm, unlocked: bgmUnlocked } = useGameBgm({
    active: room.status === "in_game",
    isNight: publicState.phase.includes("NIGHT"),
    volume: audioSettings.bgmVolume,
    enabled: audioSettings.isSoundEnabled,
  });

  if (room.status === "finished") return <FinishedWorkspace view={view} onBack={onBack} />;

  return (
      <main ref={gameShellRef} className={styles.gameShell}>
      <header className={styles.gameTopbar}>
        <div><span className={styles.cardKicker}>WOLFCHA · {room.code}</span><h1>第 {room.day} 天 · {phaseLabel(publicState.phase)}</h1></div>
        <div className={styles.headerControls}>
          {secondsLeft !== null ? <span className={styles.turnTimer} data-urgent={secondsLeft <= 15}>本轮 {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</span> : null}
          <div className={styles.connection} data-status={status}><span aria-hidden="true">●</span>{status === "connected" ? "已连接" : status === "reconnecting" ? "正在重连" : "同步中"}</div>
          {audioSettings.isSoundEnabled && !bgmUnlocked ? <button type="button" className={styles.textAction} onClick={unlockBgm}>开启声音</button> : null}
          <button type="button" className={styles.textAction} onClick={() => setSettingsOpen(true)}>声音设置</button>
          <button type="button" className={styles.textAction} disabled={actionLoading} onClick={() => setConfirmLeave(true)}>退出并托管</button>
        </div>
      </header>
      <Dialog open={confirmLeave} onOpenChange={(open) => { if (!actionLoading) setConfirmLeave(open); }}>
        <DialogContent className="w-[92vw] max-w-md" aria-busy={actionLoading}>
          <DialogHeader>
            <DialogTitle className="font-serif text-[var(--text-primary)]">退出并交给 AI 托管？</DialogTitle>
            <DialogDescription className="text-[var(--text-muted)]">退出后你的角色和座位将由同一套 AI 决策服务接管，本局不能重新入座。</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={actionLoading} onClick={() => setConfirmLeave(false)}>取消</Button>
            <Button variant="destructive" disabled={actionLoading} onClick={onLeave}>{actionLoading ? "处理中…" : "确认退出"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      {error || localError ? <p className={styles.error} role="alert">{localError ?? error}</p> : null}
      <div className={styles.gameWorkspace}>
        <section className={`${styles.panel} ${styles.gamePlayersPanel}`}>
          <div className={styles.panelHeading}><div><span className={styles.sectionKicker}>公开牌桌</span><h2>玩家</h2></div><span className={styles.occupancy}>{publicState.players.filter((p) => p.alive).length}/{publicState.players.length} 存活</span></div>
          <div className={styles.gamePlayerGrid}>
            {publicState.players.map((player) => {
              const selectable = targetSeats.includes(player.seat) && player.alive && !pending && (targetActions.length > 0 || (allowed.includes("witch") && poisonMode));
              const selected = selectedSeat === player.seat;
              const speaker = currentSpeaker?.seat === player.seat;
              return <button type="button" key={player.seat} className={`${styles.gamePlayerCard} ${selected ? styles.gamePlayerSelected : ""} ${speaker ? styles.gamePlayerSpeaking : ""} ${!player.alive ? styles.gamePlayerCardDead : ""}`} disabled={!selectable} onClick={() => setSelectedSeat(player.seat)} aria-pressed={selected}>
                <span className={styles.gameSeat}>#{player.seat + 1}</span><StaticAvatar seed={player.avatarSeed ?? `${player.kind}-${player.seat}`} size="sm" className={styles.memberAvatar} alt="" backgroundColor="transparent" loading="lazy" />
                <span className={styles.gamePlayerText}><strong>{player.displayName}</strong><span className={styles.gamePlayerMeta}>{player.alive ? "存活" : "出局"}{speaker ? " · 发言中" : ""}{player.seat === privateState.seat ? " · 你" : ""}</span></span>
              </button>;
            })}
          </div>
          {targetActions.length > 0 || (allowed.includes("witch") && poisonMode) ? <p className={styles.selectionHint}>{selectedSeat !== null && selectedPlayer ? `已选择 ${selectedPlayer.displayName}` : "请选择可操作的玩家"}</p> : null}
        </section>

        <section className={`${styles.panel} ${styles.gameFeedPanel}`}>
          <div className={styles.panelHeading}><div><span className={styles.sectionKicker}>牌局记录</span><h2>{currentSpeaker ? `${currentSpeaker.displayName} 正在发言` : "消息流"}</h2></div><span className={styles.phasePill}>{phaseLabel(publicState.phase)}</span></div>
          {publicState.lastResult ? <div className={styles.lastResult} role="status">{publicState.lastResult}</div> : null}
          {!feedAtBottom && feedUnread > 0 ? <button type="button" className={styles.feedUnread} onClick={() => { const feed = eventFeedRef.current; if (!feed) return; feedAtBottomRef.current = true; setFeedAtBottom(true); setFeedUnread(0); feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" }); }}>{feedUnread} 条新消息 · 回到底部</button> : null}
          <div ref={eventFeedRef} className={styles.eventFeed} onScroll={handleFeedScroll} aria-live="polite">{activeMessages.length ? activeMessages.slice(-40).map((message) => <article key={message.id} className={message.isSystem ? styles.systemMessage : styles.chatMessage}><span>{message.isSystem ? "系统" : message.playerName}</span><p>{message.content}</p></article>) : <p className={styles.emptyFeed}>等待牌局事件…</p>}</div>
        </section>

        <aside className={`${styles.panel} ${styles.gameIdentityPanel}`}>
          <span className={styles.sectionKicker}>仅你可见</span><h2>你的身份</h2>
          <div className={styles.privateRole}><span className={styles.roleMark}>◆</span><strong>{privateState.role ? getRoleName(privateState.role) : "身份待揭晓"}</strong><span>{privateState.alignment === "wolf" ? "狼人阵营" : privateState.alignment === "village" ? "好人阵营" : "阵营待揭晓"}</span></div>
          {privateState.wolfTeammates.length ? <div className={styles.teammates}><span className={styles.sectionKicker}>狼队友</span>{privateState.wolfTeammates.map((mate) => <span key={mate.seat}>#{mate.seat + 1} {mate.displayName}</span>)}</div> : null}
          {privateState.seerHistory.length ? <div className={styles.teammates}><span className={styles.sectionKicker}>查验记录</span>{privateState.seerHistory.map((item) => <span key={`${item.day}-${item.targetSeat}`}>第{item.day}天 #{item.targetSeat + 1} · {item.isWolf ? "狼人" : "好人"}</span>)}</div> : null}
          {voteProgress.total > 0 || badgeVoteProgress.total > 0 ? <div className={styles.voteProgress}><span className={styles.sectionKicker}>投票进度</span>{voteProgress.total > 0 ? <div><span>放逐票</span><i><b style={{ width: `${Math.min(100, (voteProgress.submitted / voteProgress.total) * 100)}%` }} /></i><em>{voteProgress.submitted}/{voteProgress.total}</em></div> : null}{badgeVoteProgress.total > 0 ? <div><span>警徽票</span><i><b style={{ width: `${Math.min(100, (badgeVoteProgress.submitted / badgeVoteProgress.total) * 100)}%` }} /></i><em>{badgeVoteProgress.submitted}/{badgeVoteProgress.total}</em></div> : null}</div> : null}
          {privateState.actionSubmitted ? <p className={styles.waitingHint}>你的行动已提交，等待其他玩家…</p> : null}
        </aside>
      </div>
      <ActionBar allowed={allowed} privateState={privateState} selectedSeat={selectedSeat} speech={speech} setSpeech={setSpeech} poisonMode={poisonMode} setPoisonMode={setPoisonMode} savePotion={savePotion} setSavePotion={setSavePotion} pending={pending} canTarget={canTarget} targetAction={targetCommand} onSend={send} />
      {roleRevealPlayer ? <RoleRevealOverlay
        open={roleRevealOpen}
        player={roleRevealPlayer}
        phase={publicState.phase}
        onContinue={() => {
          window.sessionStorage.setItem(`wolfcha.multiplayer.role-revealed:${room.id}`, "done");
          setRoleRevealOpen(false);
        }}
      /> : null}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="w-[92vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-[var(--text-primary)]">声音设置</DialogTitle>
            <DialogDescription className="text-[var(--text-muted)]">与单人模式共用声音偏好；AI 发言开关在本局立即生效。</DialogDescription>
          </DialogHeader>
          <SoundSettingsSection
            bgmVolume={audioSettings.bgmVolume}
            isSoundEnabled={audioSettings.isSoundEnabled}
            isAiVoiceEnabled={audioSettings.isAiVoiceEnabled}
            onBgmVolumeChange={(bgmVolume) => setAudioSettings((value) => ({ ...value, bgmVolume }))}
            onSoundEnabledChange={(isSoundEnabled) => {
              if (isSoundEnabled) unlockBgm();
              setAudioSettings((value) => ({ ...value, isSoundEnabled }));
            }}
            onAiVoiceEnabledChange={(isAiVoiceEnabled) => setAudioSettings((value) => ({ ...value, isAiVoiceEnabled }))}
          />
        </DialogContent>
      </Dialog>
    </main>
  );
}

interface ActionBarProps {
  allowed: string[];
  privateState: MultiplayerRoomView["privateState"];
  selectedSeat: number | null;
  speech: string;
  setSpeech: (value: string) => void;
  poisonMode: boolean;
  setPoisonMode: (value: boolean) => void;
  savePotion: boolean;
  setSavePotion: (value: boolean) => void;
  pending: boolean;
  canTarget: boolean;
  targetAction?: TargetAction;
  onSend: (command: CommandPayload) => Promise<void>;
}

function ActionBar({ allowed, privateState, selectedSeat, speech, setSpeech, poisonMode, setPoisonMode, savePotion, setSavePotion, pending, canTarget, targetAction, onSend }: ActionBarProps) {
  if (privateState.actionSubmitted) return <section data-multiplayer-action-bar className={styles.actionBar}><div className={styles.waitingAction}>行动已提交，等待阶段结算…</div></section>;
  const has = (type: string) => allowed.includes(type);
  const submitSpeech = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = speech.trim();
    if (pending || !content) return;
    void onSend({ type: "speech", content });
  };
  return <section data-multiplayer-action-bar className={styles.actionBar} aria-label="游戏操作"><div className={styles.actionDockContent}>
    {has("speech") ? <form className={styles.speechAction} onSubmit={submitSpeech}><Input value={speech} onChange={(e) => setSpeech(e.target.value)} maxLength={500} placeholder="输入你的发言…" disabled={pending} /><Button type="submit" disabled={pending || !speech.trim()}>{pending ? "提交中…" : "发送发言"}</Button></form> : null}
    {has("badge_signup") ? <div className={styles.actionRow}><span>是否参加警徽竞选？</span><Button disabled={pending} onClick={() => onSend({ type: "badge_signup", signup: true })}>报名</Button><Button variant="outline" disabled={pending} onClick={() => onSend({ type: "badge_signup", signup: false })}>不报名</Button></div> : null}
    {has("witch") ? <div className={styles.actionRow}><span>女巫行动</span>{privateState.witchHealAvailable && privateState.witchNightKill != null ? <Button variant={savePotion ? "default" : "outline"} disabled={pending} onClick={() => { setSavePotion(!savePotion); setPoisonMode(false); }}>使用解药（#{privateState.witchNightKill + 1}）</Button> : null}<Button variant={poisonMode ? "destructive" : "outline"} disabled={pending || !privateState.witchPoisonAvailable} onClick={() => { setPoisonMode(!poisonMode); setSavePotion(false); }}>使用毒药</Button><Button disabled={pending || (poisonMode && selectedSeat === null)} onClick={() => onSend({ type: "witch", save: savePotion, poisonTargetSeat: poisonMode ? selectedSeat : null })}>确认</Button></div> : null}
    {targetAction ? <div className={styles.actionRow}><span>{selectedSeat == null ? "选择目标后确认" : `目标：第 ${selectedSeat + 1} 号`}</span><Button disabled={pending || !canTarget} onClick={() => { const payload = targetPayload(targetAction, selectedSeat); if (payload) onSend(payload); }}>{pending ? "提交中…" : TARGET_BUTTON_LABEL[targetAction]}</Button>{has("guard") ? <Button variant="outline" disabled={pending} onClick={() => onSend({ type: "guard", targetSeat: null })}>跳过守护</Button> : null}{has("day_vote") ? <Button variant="outline" disabled={pending} onClick={() => onSend({ type: "day_vote", targetSeat: null })}>弃票</Button> : null}{has("hunter_shot") ? <Button variant="outline" disabled={pending} onClick={() => onSend({ type: "hunter_shot", targetSeat: null })}>不开枪</Button> : null}{has("badge_transfer") ? <Button variant="outline" disabled={pending} onClick={() => onSend({ type: "badge_transfer", targetSeat: null, destroy: true })}>销毁警徽</Button> : null}</div> : null}
    {!allowed.length || privateState.actionSubmitted ? <div className={styles.waitingAction}>{privateState.actionSubmitted ? "行动已提交，等待阶段结算…" : "当前没有需要你操作的动作"}</div> : null}
  </div></section>;
}

function FinishedWorkspace({ view, onBack }: { view: MultiplayerRoomView; onBack: () => void }) {
  const { room, publicState } = view;
  return <main className={styles.finishedWorkspace}><span className={styles.cardKicker}>牌局结算</span><h1>{room.winner === "wolf" ? "狼人阵营获胜" : room.winner === "village" ? "好人阵营获胜" : "牌局结束"}</h1><p>第 {room.day} 天 · 房间 {room.code}</p><div className={styles.resultPlayers}>{publicState.players.map((player) => <div key={player.seat}><span>#{player.seat + 1} {player.displayName}</span><strong>{player.role ? getRoleName(player.role) : "身份未知"}</strong><small>{player.alive ? "存活" : "出局"}</small></div>)}</div><Button size="lg" onClick={onBack}>返回多人入口</Button></main>;
}
