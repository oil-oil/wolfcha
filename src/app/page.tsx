"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Users,
  NotePencil,
  X,
  Eye,
  Skull,
  Shield,
  Drop,
  Crosshair,
  GearSix,
} from "@phosphor-icons/react";
import {
  WerewolfIcon,
  NightIcon,
  DayIcon,
  SpeechIcon,
  TimerIcon,
  SeerIcon,
  WitchIcon,
  HunterIcon,
  GuardIcon,
  VillagerIcon,
} from "@/components/icons/FlatIcons";
import { useTypewriter } from "@/hooks/useTypewriter";
import { useGameLogic } from "@/hooks/useGameLogic";
import type { Player, Role } from "@/types/game";
import { PHASE_CONFIGS } from "@/store/game-machine";

// Components
import { WelcomeScreen } from "@/components/game/WelcomeScreen";
import { PlayerCardCompact } from "@/components/game/PlayerCardCompact";
import { DialogArea } from "@/components/game/DialogArea";
import { BottomActionPanel } from "@/components/game/BottomActionPanel";
import { Notebook } from "@/components/game/Notebook";
import { GameBackground } from "@/components/game/GameBackground";
import { PlayerDetailModal } from "@/components/game/PlayerDetailModal";
import { RoleRevealOverlay } from "@/components/game/RoleRevealOverlay";
import { NightActionOverlay, type NightActionOverlayType } from "@/components/game/NightActionOverlay";
import { TutorialOverlay, type TutorialPayload } from "@/components/game/TutorialOverlay";
import { DevConsole, DevModeButton } from "@/components/DevTools";
import { SettingsModal } from "@/components/game/SettingsModal";

import { buildSimpleAvatarUrl } from "@/lib/avatar-config";
import { audioManager, makeAudioTaskId } from "@/lib/audio-manager";
import { resolveVoiceId } from "@/lib/voice-constants";
import { useSettings } from "@/hooks/useSettings";
import { useTutorial } from "@/hooks/useTutorial";

const RITUAL_CUE_DURATION_SECONDS = 2.2;
const NIGHTFALL_CUE_REGEX = /^第\s*\d+\s*夜，天黑请闭眼$/;
const DAY_NIGHT_BLINK = {
  closeMs: 360,
  holdMs: 120,
  openMs: 620,
};
const dayBgm = "/bgm/day.mp3";
const nightBgm = "/bgm/night.mp3";
const REFERRAL_STORAGE_KEY = "wolfcha_referral";

const dicebearUrl = (seed: string) => buildSimpleAvatarUrl(seed);

const getRoleLabel = (role?: Role | null) => {
  switch (role) {
    case "Werewolf": return "狼人";
    case "Seer": return "预言家";
    case "Witch": return "女巫";
    case "Hunter": return "猎人";
    case "Guard": return "守卫";
    case "Villager": return "村民";
    default: return "?";
  }
};

function getRitualCueFromSystemMessage(content: string): { title: string; subtitle?: string } | null {
  const text = content.trim();
  if (text === "人到齐了，开始吧。") return { title: "开局" };
  if (NIGHTFALL_CUE_REGEX.test(text)) return { title: text };
  if (text === "守卫请睁眼") return { title: text };
  if (text === "狼人请睁眼") return { title: text };
  if (text === "女巫请睁眼") return { title: text };
  if (text === "预言家请睁眼") return { title: text };
  if (text === "昨晚平安无事") return { title: "昨晚平安无事" };
  if (/^\d+号\s+.+\s+昨晚出局$/.test(text)) return { title: text };
  if (/^\d+号\s+.+\s+昨晚中毒出局$/.test(text)) return { title: text };
  if (text === "天亮了，请睁眼") return { title: "天亮了，请睁眼" };
  if (text === "进入警徽竞选报名环节") return { title: "警徽竞选报名" };
  if (text === "警徽竞选开始，请候选人依次发言") return { title: "警徽竞选开始", subtitle: "请候选人依次发言" };
  if (text === "开始警徽评选") return { title: text };
  if (text === "警徽平票，重新投票") return { title: text };
  if (/^\s*警徽授予\s*\d+号\s+.+（\d+票）\s*$/.test(text)) return { title: text };
  if (text === "开始自由发言") return { title: "开始自由发言" };
  if (text === "发言结束，开始投票。") return { title: text };
  if (/^\d+号\s+.+\s+以\s+\d+\s+票出局$/.test(text)) return { title: text };
  if (text === "票数相同，今天无人出局") return { title: text };
  return null;
}

// ============ 工具函数 ============

// ============ 主组件 ============

export default function Home() {
  const {
    humanName,
    setHumanName,
    gameStarted,
    gameState,
    isLoading,
    isWaitingForAI,
    currentDialogue,
    inputText,
    setInputText,
    showTable,
    humanPlayer,
    isNight,
    startGame,
    continueAfterRoleReveal,
    restartGame,
    handleHumanSpeech,
    handleFinishSpeaking,
    handleBadgeSignup,
    handleHumanVote,
    handleNightAction,
    handleHumanBadgeTransfer,
    handleNextRound,
    waitingForNextRound,
    scrollToBottom,
    advanceSpeech,
  } = useGameLogic();
  const { settings, setBgmVolume, setSoundEnabled, setAiVoiceEnabled, setGenshinMode } = useSettings();
  const { bgmVolume, isSoundEnabled, isAiVoiceEnabled, isGenshinMode } = settings;
  const shouldUseAiVoice = isSoundEnabled && isAiVoiceEnabled && bgmVolume > 0;
  const {
    state: tutorialState,
    isLoaded: isTutorialLoaded,
    canAutoPrompt,
    setAutoPromptEnabled,
    markSeenNightIntro,
    markSeenDayIntro,
    markSeenRole,
  } = useTutorial();

  const [visualIsNight, setVisualIsNight] = useState(isNight);
  const visualIsNightRef = useRef(isNight);
  const [isMobile, setIsMobile] = useState(false);
  const [dayNightBlinkPhase, setDayNightBlinkPhase] = useState<null | "closing" | "opening">(null);
  const dayNightBlinkTokenRef = useRef(0);
  const dayNightBlinkTimeoutsRef = useRef<number[]>([]);
  const pendingNightBlinkRef = useRef(false);
  const lastNightCueIdRef = useRef<string | null>(null);

  useEffect(() => {
    visualIsNightRef.current = visualIsNight;
  }, [visualIsNight]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const referral = params.get("ref")?.trim();
    if (referral) {
      localStorage.setItem(REFERRAL_STORAGE_KEY, referral);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", visualIsNight ? "dark" : "light");
  }, [visualIsNight]);

  const clearDayNightBlinkTimers = useCallback(() => {
    dayNightBlinkTimeoutsRef.current.forEach((t) => window.clearTimeout(t));
    dayNightBlinkTimeoutsRef.current = [];
  }, []);

  const scheduleDayNightBlink = useCallback((targetIsNight: boolean, delayMs = 0) => {
    if (visualIsNightRef.current === targetIsNight) return;

    clearDayNightBlinkTimers();
    const token = ++dayNightBlinkTokenRef.current;

    const beginBlink = () => {
      if (dayNightBlinkTokenRef.current !== token) return;
      setDayNightBlinkPhase("closing");

      const { closeMs, holdMs, openMs } = DAY_NIGHT_BLINK;
      const t1 = window.setTimeout(() => {
        if (dayNightBlinkTokenRef.current !== token) return;
        setVisualIsNight(targetIsNight);
        const tHold = window.setTimeout(() => {
          if (dayNightBlinkTokenRef.current !== token) return;
          setDayNightBlinkPhase("opening");
          const t2 = window.setTimeout(() => {
            if (dayNightBlinkTokenRef.current !== token) return;
            setDayNightBlinkPhase(null);
          }, openMs);
          dayNightBlinkTimeoutsRef.current.push(t2);
        }, holdMs);
        dayNightBlinkTimeoutsRef.current.push(tHold);
      }, closeMs);
      dayNightBlinkTimeoutsRef.current.push(t1);
    };

    if (delayMs > 0) {
      const tStart = window.setTimeout(beginBlink, delayMs);
      dayNightBlinkTimeoutsRef.current.push(tStart);
    } else {
      beginBlink();
    }
  }, [clearDayNightBlinkTimers]);

  useEffect(() => {
    if (isNight === visualIsNightRef.current) return;

    if (isNight) {
      // Mark that we need to blink to night
      pendingNightBlinkRef.current = true;
      return;
    }

    // Transition to day immediately
    pendingNightBlinkRef.current = false;
    lastNightCueIdRef.current = null;
    scheduleDayNightBlink(false, 0);
  }, [isNight, scheduleDayNightBlink]);

  useEffect(() => {
    return () => {
      clearDayNightBlinkTimers();
    };
  }, [clearDayNightBlinkTimers]);

  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const bgmUnlockedRef = useRef(false);
  const bgmFadeAnimationRef = useRef<number | null>(null);
  const bgmLoopFadeRef = useRef(false);
  const bgmManualFadeRef = useRef(false);
  const showTableRef = useRef(showTable);
  const isNightRef = useRef(isNight);
  const bgmVolumeRef = useRef(bgmVolume);
  const isSoundEnabledRef = useRef(isSoundEnabled);
  const LOOP_FADE_DURATION_MS = 1200;
  const resolveAudioSrc = useCallback((src: string) => {
    if (typeof window === "undefined") return src;
    try {
      return new URL(src, window.location.href).href;
    } catch {
      return src;
    }
  }, []);
  useEffect(() => {
    showTableRef.current = showTable;
  }, [showTable]);
  useEffect(() => {
    isNightRef.current = isNight;
  }, [isNight]);
  useEffect(() => {
    bgmVolumeRef.current = bgmVolume;
  }, [bgmVolume]);
  useEffect(() => {
    isSoundEnabledRef.current = isSoundEnabled;
  }, [isSoundEnabled]);

  // Fade in/out helper function
  const fadeAudio = useCallback((
    audio: HTMLAudioElement,
    targetVolume: number,
    duration: number = 1000,
    onComplete?: () => void
  ) => {
    // Cancel any existing fade animation
    if (bgmFadeAnimationRef.current !== null) {
      cancelAnimationFrame(bgmFadeAnimationRef.current);
    }

    const startVolume = audio.volume;
    const startTime = performance.now();
    const volumeDiff = targetVolume - startVolume;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Use ease-in-out curve for smoother transition
      const easedProgress = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      audio.volume = startVolume + volumeDiff * easedProgress;

      if (progress < 1) {
        bgmFadeAnimationRef.current = requestAnimationFrame(animate);
      } else {
        bgmFadeAnimationRef.current = null;
        onComplete?.();
      }
    };

    bgmFadeAnimationRef.current = requestAnimationFrame(animate);
  }, []);

  const attachLoopFade = useCallback((audio: HTMLAudioElement) => {
    const handleTimeUpdate = () => {
      if (bgmManualFadeRef.current) return;
      if (!showTableRef.current || !isSoundEnabledRef.current) return;
      if (bgmLoopFadeRef.current) return;
      const duration = audio.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      const remaining = duration - audio.currentTime;
      if (remaining > LOOP_FADE_DURATION_MS / 1000) return;

      bgmLoopFadeRef.current = true;
      fadeAudio(audio, 0, LOOP_FADE_DURATION_MS, () => {
        if (!bgmAudioRef.current) return;
        if (!showTableRef.current || !isSoundEnabledRef.current) {
          bgmLoopFadeRef.current = false;
          return;
        }
        const targetVolume = bgmVolumeRef.current;
        audio.currentTime = 0;
        audio.volume = 0;
        void audio.play().catch(() => {});
        fadeAudio(audio, targetVolume, LOOP_FADE_DURATION_MS, () => {
          bgmLoopFadeRef.current = false;
        });
      });
    };
    audio.addEventListener("timeupdate", handleTimeUpdate);
    return () => audio.removeEventListener("timeupdate", handleTimeUpdate);
  }, [fadeAudio, LOOP_FADE_DURATION_MS]);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = false;
    audio.volume = isSoundEnabledRef.current ? bgmVolumeRef.current : 0;
    bgmAudioRef.current = audio;
    const cleanupLoopFade = attachLoopFade(audio);
    return () => {
      if (bgmFadeAnimationRef.current !== null) {
        cancelAnimationFrame(bgmFadeAnimationRef.current);
      }
      cleanupLoopFade();
      audio.pause();
      bgmAudioRef.current = null;
    };
  }, [attachLoopFade]);

  useEffect(() => {
    const unlock = () => {
      if (bgmUnlockedRef.current) return;
      if (!isSoundEnabledRef.current) return;
      bgmUnlockedRef.current = true;
      const audio = bgmAudioRef.current;
      if (!audio) return;

      const desiredSrc = isNightRef.current ? nightBgm : dayBgm;
      const desiredResolved = resolveAudioSrc(desiredSrc);
      const currentResolved = audio.currentSrc || resolveAudioSrc(audio.src);
      if (currentResolved !== desiredResolved) {
        audio.src = desiredSrc;
        audio.load();
      }

      audio.volume = bgmVolumeRef.current;
      // 必须在用户手势内触发一次 play 才能解锁后续自动播放
      void audio.play().catch(() => {});

      // 如果还没进入游戏界面，立刻暂停，避免欢迎页响起
      if (!showTableRef.current) {
        audio.pause();
      }
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [resolveAudioSrc]);

  useEffect(() => {
    const audio = bgmAudioRef.current;
    if (!audio) return;

    const desiredVolume = isSoundEnabled ? bgmVolume : 0;

    if (!showTable || !isSoundEnabled) {
      // Fade out when hiding table or muting
      bgmManualFadeRef.current = true;
      fadeAudio(audio, 0, 800, () => {
        audio.pause();
        bgmManualFadeRef.current = false;
      });
      return;
    }

    const desiredSrc = isNight ? nightBgm : dayBgm;
    const desiredResolved = resolveAudioSrc(desiredSrc);
    const currentResolved = audio.currentSrc || resolveAudioSrc(audio.src);
    const isSwitching = currentResolved && currentResolved !== desiredResolved;
    
    if (isSwitching) {
      // Fade out current music, then switch and fade in new music
      bgmManualFadeRef.current = true;
      fadeAudio(audio, 0, 1000, () => {
        if (!bgmAudioRef.current) return;
        const currentAudio = bgmAudioRef.current;
        currentAudio.src = desiredSrc;
        currentAudio.load();
        bgmLoopFadeRef.current = false;
        
        if (bgmUnlockedRef.current) {
          void currentAudio.play().catch(() => {});
          // Fade in new music
          currentAudio.volume = 0;
          fadeAudio(currentAudio, desiredVolume, 1200, () => {
            bgmManualFadeRef.current = false;
          });
        } else {
          bgmManualFadeRef.current = false;
        }
      });
    } else {
      // Just ensure it's playing with correct volume
      if (currentResolved !== desiredResolved) {
        audio.src = desiredSrc;
        audio.load();
        bgmLoopFadeRef.current = false;
      }
      if (bgmUnlockedRef.current) {
        if (audio.paused) {
          audio.volume = 0;
          void audio.play().catch(() => {});
          bgmManualFadeRef.current = true;
          fadeAudio(audio, desiredVolume, 1200, () => {
            bgmManualFadeRef.current = false;
          });
        } else if (audio.volume !== desiredVolume) {
          bgmManualFadeRef.current = true;
          fadeAudio(audio, desiredVolume, 800, () => {
            bgmManualFadeRef.current = false;
          });
        }
      }
    }
  }, [isNight, showTable, fadeAudio, bgmVolume, isSoundEnabled, resolveAudioSrc]);

  useEffect(() => {
    audioManager.setEnabled(shouldUseAiVoice);
  }, [shouldUseAiVoice]);

  // UI 状态
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [isNotebookOpen, setIsNotebookOpen] = useState(false);
  const [isDevConsoleOpen, setIsDevConsoleOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<Player | null>(null);
  const [isRoleRevealOpen, setIsRoleRevealOpen] = useState(false);
  const [hasShownRoleReveal, setHasShownRoleReveal] = useState(false);
  const [activeTutorial, setActiveTutorial] = useState<TutorialPayload | null>(null);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [nightActionOverlay, setNightActionOverlay] = useState<{
    type: NightActionOverlayType;
    id: number;
    target?: { seat: number; name: string; avatarUrl?: string };
  } | null>(null);
  const nightActionOverlayTimerRef = useRef<number | null>(null);
  const showDevTools =
    process.env.NODE_ENV !== "production" && (process.env.NEXT_PUBLIC_SHOW_DEVTOOLS ?? "true") === "true";
  const lastNightActionRef = useRef<{
    wolfTarget?: number;
    witchSave?: boolean;
    witchPoison?: number;
    seerTarget?: number;
    hunterShotKey?: string | null;
  }>({});
  
  // 检查玩家是否准备就绪（用于召集阶段显示加载状态）
  const isReady = useMemo(() => {
    return gameState.players.every((p) => p.displayName?.trim());
  }, [gameState.players]);

  // 阶段切换时清理选择状态
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSelectedSeat(null);
    }, 0);
    return () => window.clearTimeout(t);
  }, [gameState.phase]);

  const [ritualCue, setRitualCue] = useState<{ id: string; title: string; subtitle?: string } | null>(null);
  const [lastRitualMessageId, setLastRitualMessageId] = useState<string | null>(null);
  const ritualCueQueueRef = useRef<Array<{ id: string; title: string; subtitle?: string }>>([]);
  const lastAdvanceTimeRef = useRef(0);
  const canShowRole = hasShownRoleReveal;
  const selectionTone = useMemo(() => {
    if (!humanPlayer) return undefined;
    switch (gameState.phase) {
      case "NIGHT_WOLF_ACTION":
        return humanPlayer.role === "Werewolf" ? "wolf" : undefined;
      case "NIGHT_SEER_ACTION":
        return humanPlayer.role === "Seer" ? "seer" : undefined;
      case "NIGHT_GUARD_ACTION":
        return humanPlayer.role === "Guard" ? "guard" : undefined;
      case "NIGHT_WITCH_ACTION":
        return humanPlayer.role === "Witch" ? "witch" : undefined;
      case "HUNTER_SHOOT":
        return humanPlayer.role === "Hunter" ? "hunter" : undefined;
      case "DAY_BADGE_ELECTION":
      case "BADGE_TRANSFER":
        return "badge";
      case "DAY_VOTE":
        return "vote";
      default:
        return undefined;
    }
  }, [gameState.phase, humanPlayer]);

  useEffect(() => {
    const lastSystem = [...gameState.messages].reverse().find((m) => m.isSystem);
    if (!lastSystem) return;
    if (lastSystem.id && lastSystem.id === lastRitualMessageId) return;
    const cue = getRitualCueFromSystemMessage(lastSystem.content);
    if (!cue) return;

    queueMicrotask(() => {
      setLastRitualMessageId(lastSystem.id || null);
      const next = { id: lastSystem.id || String(Date.now()), title: cue.title, subtitle: cue.subtitle };
      if (ritualCue) {
        ritualCueQueueRef.current.push(next);
        return;
      }
      setRitualCue(next);
    });
  }, [gameState.messages, lastRitualMessageId, ritualCue]);

  // Trigger night blink when we see the nightfall ritual cue
  useEffect(() => {
    if (!ritualCue || !isNight) return;
    if (!pendingNightBlinkRef.current) return;
    if (!showTable || isRoleRevealOpen) return;
    
    const text = ritualCue.title.trim();
    if (!NIGHTFALL_CUE_REGEX.test(text)) return;
    if (lastNightCueIdRef.current === ritualCue.id) return;

    lastNightCueIdRef.current = ritualCue.id;
    pendingNightBlinkRef.current = false;
    scheduleDayNightBlink(true, Math.round(RITUAL_CUE_DURATION_SECONDS * 1000));
  }, [ritualCue, isNight, scheduleDayNightBlink, showTable, isRoleRevealOpen]);

  // Fallback: directly monitor messages for nightfall cue
  useEffect(() => {
    if (!isNight || !pendingNightBlinkRef.current) return;
    if (!ritualCue || !showTable || isRoleRevealOpen) return;
    
    const lastSystemMsg = [...gameState.messages].reverse().find(m => m.isSystem);
    if (!lastSystemMsg) return;
    
    const text = lastSystemMsg.content.trim();
    if (!NIGHTFALL_CUE_REGEX.test(text)) return;
    
    const cueId = ritualCue.id;
    if (lastNightCueIdRef.current === cueId) return;
    
    // Found nightfall message and haven't processed it yet
    lastNightCueIdRef.current = cueId;
    pendingNightBlinkRef.current = false;
    
    // Schedule the blink after a short delay to ensure ritual cue is shown
    const timer = window.setTimeout(() => {
      scheduleDayNightBlink(true, Math.round(RITUAL_CUE_DURATION_SECONDS * 1000));
    }, 100);
    
    return () => window.clearTimeout(timer);
  }, [gameState.messages, isNight, scheduleDayNightBlink, ritualCue, showTable, isRoleRevealOpen]);

  // Typewriter effect
  const typewriterSpeed = useMemo(() => {
    const text = currentDialogue?.text || "";
    if (!currentDialogue?.isStreaming) return 25;
    if (!text.trim()) return 25;
    if (text.includes("正在组织语言") || text.includes("生成语音")) return 25;

    const player = gameState.players.find((p) => p.displayName === currentDialogue.speaker);
    const voiceId = resolveVoiceId(
      player?.agentProfile?.persona?.voiceId,
      player?.agentProfile?.persona?.gender,
      player?.agentProfile?.persona?.age
    );
    const taskId = makeAudioTaskId(voiceId, text);
    const durationMs = audioManager.getCachedDurationMs(taskId);
    if (!durationMs || durationMs <= 0) return 25;

    const raw = durationMs / Math.max(1, text.length);
    return Math.min(60, Math.max(10, Math.round(raw)));
  }, [currentDialogue, gameState.players]);

  const { displayedText, isTyping } = useTypewriter({
    text: currentDialogue?.text || "",
    speed: typewriterSpeed,
    enabled: !!currentDialogue?.isStreaming,
  });

  // Enter/Right key to advance AI speech or move to next round
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isRoleRevealOpen) return;

      // 检查焦点是否在输入元素内（input, textarea, contenteditable）
      const activeEl = document.activeElement;
      const isInInput = activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl?.getAttribute("contenteditable") === "true" ||
        activeEl?.closest("[contenteditable='true']") !== null;

      // 如果笔记本打开，不拦截 Enter 键（让笔记本正常换行）
      if (isNotebookOpen && e.key === "Enter") return;

      // 如果焦点在输入元素内，不拦截左右方向键（让光标正常移动）
      if (isInInput && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;

      // 如果焦点在输入元素内，不拦截 Enter 键（让输入框正常处理）
      if (isInInput && e.key === "Enter") return;

      // Enter or Right arrow to advance
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "ArrowRight") {
        // 当AI在发言时（有currentDialogue），按键推进下一句
        if (currentDialogue) {
          e.preventDefault();
          audioManager.stopCurrent();
          Promise.resolve(advanceSpeech()).then((r) => {
            if (r?.shouldAdvanceToNextSpeaker) {
              handleNextRound();
            }
          });
          return;
        }
        
        // 等待下一轮时，按键进入下一轮
        if (waitingForNextRound) {
          e.preventDefault();
          handleNextRound();
        }
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentDialogue, waitingForNextRound, advanceSpeech, handleNextRound, isRoleRevealOpen, isNotebookOpen]);

  const handleAdvanceDialogue = useCallback(async () => {
    if (isRoleRevealOpen) return;
    const now = Date.now();
    if (now - lastAdvanceTimeRef.current < 300) return;
    lastAdvanceTimeRef.current = now;

    if (currentDialogue) {
      const r = await advanceSpeech();
      if (r?.shouldAdvanceToNextSpeaker) {
        await handleNextRound();
      }
      return;
    }

    if (waitingForNextRound) {
      await handleNextRound();
    }
  }, [advanceSpeech, currentDialogue, handleNextRound, isRoleRevealOpen, waitingForNextRound]);

  useEffect(() => {
    if (!showTable) return;
    if (!humanPlayer) return;
    if (hasShownRoleReveal) return;
    if (gameState.phase !== "NIGHT_START") return;
    if (!visualIsNight) return;
    if (dayNightBlinkPhase) return;
    const t = window.setTimeout(() => {
      setIsRoleRevealOpen(true);
      setHasShownRoleReveal(true);
    }, 380);
    return () => window.clearTimeout(t);
  }, [showTable, humanPlayer, hasShownRoleReveal, gameState.phase, visualIsNight, dayNightBlinkPhase]);

  const openTutorial = useCallback(
    (payload: TutorialPayload, options?: { force?: boolean }) => {
      if (!options?.force && !canAutoPrompt) return;
      setActiveTutorial(payload);
      setIsTutorialOpen(true);
    },
    [canAutoPrompt]
  );

  const handleTutorialOpenChange = useCallback(
    (open: boolean) => {
      setIsTutorialOpen(open);
      if (!open && activeTutorial) {
        if (activeTutorial.kind === "night_intro") {
          markSeenNightIntro();
        } else if (activeTutorial.kind === "day_intro") {
          markSeenDayIntro();
        } else if (activeTutorial.kind === "role" && activeTutorial.role) {
          markSeenRole(activeTutorial.role);
        }
        setActiveTutorial(null);
      }
    },
    [activeTutorial, markSeenDayIntro, markSeenNightIntro, markSeenRole]
  );

  const activeRoleForPhase = useMemo<Role | null>(() => {
    switch (gameState.phase) {
      case "NIGHT_WOLF_ACTION":
        return "Werewolf";
      case "NIGHT_SEER_ACTION":
        return "Seer";
      case "NIGHT_WITCH_ACTION":
        return "Witch";
      case "NIGHT_GUARD_ACTION":
        return "Guard";
      case "HUNTER_SHOOT":
        return "Hunter";
      default:
        return null;
    }
  }, [gameState.phase]);

  const isRoleActionForHuman = useMemo(() => {
    if (!humanPlayer || !activeRoleForPhase) return false;
    if (!humanPlayer.alive) return false;
    if (humanPlayer.role !== activeRoleForPhase) return false;
    return PHASE_CONFIGS[gameState.phase].requiresHumanInput(humanPlayer, gameState);
  }, [activeRoleForPhase, gameState, humanPlayer]);

  useEffect(() => {
    if (!showTable) return;
    if (!isTutorialLoaded) return;
    if (!tutorialState.enabled) return;
    if (isRoleRevealOpen) return;
    if (isTutorialOpen) return;
    if (!humanPlayer) return;
    if (!hasShownRoleReveal && gameState.phase === "NIGHT_START") return;

    if (!tutorialState.seenNightIntro && gameState.phase.includes("NIGHT") && visualIsNight) {
      openTutorial({ kind: "night_intro", phase: gameState.phase });
      return;
    }

    if (!tutorialState.seenDayIntro && gameState.phase.startsWith("DAY") && !visualIsNight) {
      openTutorial({ kind: "day_intro", phase: gameState.phase });
      return;
    }

    if (isRoleActionForHuman && !tutorialState.seenRoles[humanPlayer.role]) {
      openTutorial({ kind: "role", role: humanPlayer.role, phase: gameState.phase });
    }
  }, [
    gameState.phase,
    humanPlayer,
    isRoleActionForHuman,
    isRoleRevealOpen,
    isTutorialLoaded,
    isTutorialOpen,
    openTutorial,
    showTable,
    tutorialState.enabled,
    tutorialState.seenDayIntro,
    tutorialState.seenNightIntro,
    tutorialState.seenRoles,
    visualIsNight,
  ]);

  const tutorialHelpLabel = useMemo(() => {
    if (isRoleActionForHuman && humanPlayer) {
      return `${getRoleLabel(humanPlayer.role)}是什么？`;
    }
    if (gameState.phase === "DAY_VOTE" || gameState.phase === "DAY_BADGE_ELECTION") {
      return "怎么投票？";
    }
    return "玩法说明";
  }, [gameState.phase, humanPlayer, isRoleActionForHuman]);

  const showTutorialHelp = useMemo(() => {
    return (
      isRoleActionForHuman ||
      gameState.phase === "DAY_VOTE" ||
      gameState.phase === "DAY_BADGE_ELECTION"
    );
  }, [gameState.phase, isRoleActionForHuman]);

  const handleTutorialHelpOpen = useCallback(() => {
    if (isRoleActionForHuman && humanPlayer) {
      openTutorial({ kind: "role", role: humanPlayer.role, phase: gameState.phase }, { force: true });
      return;
    }
    openTutorial({ kind: "day_intro", phase: gameState.phase }, { force: true });
  }, [gameState.phase, humanPlayer, isRoleActionForHuman, openTutorial]);

  // API Key 检查（现在由服务端管理，此检查已不再需要）


  useEffect(() => {
    scrollToBottom();
  }, [gameState.messages, scrollToBottom]);

  useEffect(() => {
    if (showTable) return;
    queueMicrotask(() => {
      setIsRoleRevealOpen(false);
      setHasShownRoleReveal(false);
    });
  }, [showTable]);

  useEffect(() => {
    if (showTable) return;
    setActiveTutorial(null);
    setIsTutorialOpen(false);
  }, [showTable]);

  const triggerNightOverlay = useCallback((type: NightActionOverlayType, targetSeat?: number) => {
    if (!showTable) return;
    if (isRoleRevealOpen) return;
    const target =
      typeof targetSeat === "number"
        ? gameState.players.find((p) => p.seat === targetSeat)
        : null;
    const targetPayload = target
      ? {
          seat: target.seat,
          name: target.displayName,
          avatarUrl: dicebearUrl(target.displayName),
        }
      : undefined;
    setNightActionOverlay({ type, id: Date.now(), target: targetPayload });
    if (nightActionOverlayTimerRef.current !== null) {
      window.clearTimeout(nightActionOverlayTimerRef.current);
    }
    nightActionOverlayTimerRef.current = window.setTimeout(() => {
      setNightActionOverlay(null);
    }, 1500);
  }, [gameState.players, isRoleRevealOpen, showTable]);

  useEffect(() => {
    if (!showTable) {
      lastNightActionRef.current = {};
      setNightActionOverlay(null);
      return;
    }

    const { wolfTarget, witchSave, witchPoison, seerTarget } = gameState.nightActions;
    const last = lastNightActionRef.current;
    const role = humanPlayer?.role;
    const isHumanAlive = humanPlayer?.alive;
    const canSeeWolf = role === "Werewolf" && isHumanAlive;
    const canSeeWitch = role === "Witch" && isHumanAlive;
    const canSeeSeer = role === "Seer" && isHumanAlive;
    const canSeeHunter = role === "Hunter";

    if (canSeeWolf && typeof wolfTarget === "number" && wolfTarget !== last.wolfTarget) {
      triggerNightOverlay("wolf", wolfTarget);
    }

    if (canSeeWitch && witchSave && witchSave !== last.witchSave) {
      triggerNightOverlay("witch-save", wolfTarget);
    }

    if (canSeeWitch && typeof witchPoison === "number" && witchPoison !== last.witchPoison) {
      triggerNightOverlay("witch-poison", witchPoison);
    }

    if (canSeeSeer && typeof seerTarget === "number" && seerTarget !== last.seerTarget) {
      triggerNightOverlay("seer", seerTarget);
    }

    const hunterShot =
      gameState.nightHistory?.[gameState.day]?.hunterShot ||
      gameState.dayHistory?.[gameState.day]?.hunterShot;
    const hunterShotKey = hunterShot
      ? `${gameState.day}-${hunterShot.hunterSeat}-${hunterShot.targetSeat}`
      : null;
    if (canSeeHunter && hunterShot && hunterShotKey && hunterShotKey !== last.hunterShotKey) {
      triggerNightOverlay("hunter", hunterShot.targetSeat);
    }

    lastNightActionRef.current = {
      wolfTarget,
      witchSave,
      witchPoison,
      seerTarget,
      hunterShotKey,
    };
  }, [
    gameState.day,
    gameState.dayHistory,
    gameState.nightActions,
    gameState.nightHistory,
    humanPlayer,
    showTable,
    triggerNightOverlay,
  ]);

  // ============ 交互逻辑 ============

  // 判断是否可以点击座位（使用状态机配置）
  const canClickSeat = useCallback((player: Player): boolean => {
    if (isRoleRevealOpen) return false;
    if (!humanPlayer) return false;
    if (
      gameState.phase === "NIGHT_WITCH_ACTION" &&
      humanPlayer.role === "Witch" &&
      gameState.roleAbilities.witchPoisonUsed
    ) {
      return false;
    }
    const config = PHASE_CONFIGS[gameState.phase];
    return config.canSelectPlayer(humanPlayer, player, gameState);
  }, [humanPlayer, gameState, isRoleRevealOpen]);

  const handleSeatClick = useCallback((player: Player) => {
    if (isRoleRevealOpen) return;
    if (
      humanPlayer &&
      gameState.phase === "NIGHT_WITCH_ACTION" &&
      humanPlayer.role === "Witch" &&
      gameState.roleAbilities.witchPoisonUsed
    ) {
      toast("毒药已用过了", {
        description: "今晚只能选择救人，或直接跳过。",
      });
      return;
    }
    if (!canClickSeat(player)) return;
    setSelectedSeat(prev => prev === player.seat ? null : player.seat);
  }, [canClickSeat, isRoleRevealOpen, humanPlayer, gameState.phase, gameState.roleAbilities.witchPoisonUsed]);

  const confirmSelectedSeat = useCallback(async () => {
    if (isRoleRevealOpen) return;
    
    const phase = gameState.phase;
    
    // 特殊处理：撕毁警徽（当在警徽移交阶段且没有选择目标时）
    if (phase === "BADGE_TRANSFER" && selectedSeat === null && humanPlayer && gameState.badge.holderSeat === humanPlayer.seat) {
      await handleHumanBadgeTransfer(0); // 0表示撕毁警徽
      return;
    }
    
    if (selectedSeat === null) return;
    
    // 保存选中的座位号，然后立即清除选择状态，避免确认对话框重新渲染
    const targetSeat = selectedSeat;
    setSelectedSeat(null);
    
    if (phase === "DAY_VOTE" || phase === "DAY_BADGE_ELECTION") {
      await handleHumanVote(targetSeat);
    } else if (phase === "BADGE_TRANSFER") {
      await handleHumanBadgeTransfer(targetSeat);
    } else if (
      phase === "NIGHT_SEER_ACTION" ||
      phase === "NIGHT_WOLF_ACTION" ||
      phase === "NIGHT_GUARD_ACTION" ||
      phase === "HUNTER_SHOOT"
    ) {
      await handleNightAction(targetSeat);
    }
  }, [selectedSeat, gameState.phase, handleHumanVote, handleHumanBadgeTransfer, handleNightAction, isRoleRevealOpen, humanPlayer, gameState.badge.holderSeat]);

  const handleNightActionConfirm = useCallback(async (targetSeat: number, actionType?: "save" | "poison" | "pass") => {
    if (isRoleRevealOpen) return;
    await handleNightAction(targetSeat, actionType);
    setSelectedSeat(null);
  }, [handleNightAction, isRoleRevealOpen]);

  // 玩家列表（包含人类玩家）
  const allPlayers = useMemo(() => {
    return gameState.players;
  }, [gameState.players]);

  const leftPlayers = useMemo(() => allPlayers.slice(0, Math.ceil(allPlayers.length / 2)), [allPlayers]);
  const rightPlayers = useMemo(() => allPlayers.slice(Math.ceil(allPlayers.length / 2)), [allPlayers]);

  // 获取阶段描述
  const getPhaseDescription = useCallback(() => {
    const config = PHASE_CONFIGS[gameState.phase];
    if (config.humanDescription) {
      return config.humanDescription(humanPlayer, gameState);
    }
    return config.description;
  }, [gameState, humanPlayer]);

  const needsHumanAction = useMemo(() => {
    return PHASE_CONFIGS[gameState.phase].requiresHumanInput(humanPlayer, gameState);
  }, [gameState.phase, humanPlayer, gameState]);

  const showWaitingIndicator = isWaitingForAI && !needsHumanAction;

  const hasSelectableTargets = useMemo(() => {
    return allPlayers.some((player) => canClickSeat(player));
  }, [allPlayers, canClickSeat]);

  const isSelectionPhase = useMemo(() => {
    const actionType = PHASE_CONFIGS[gameState.phase].actionType;
    if (actionType === "vote" || actionType === "night_action") return needsHumanAction;
    if (actionType === "special") return needsHumanAction && hasSelectableTargets;
    return false;
  }, [gameState.phase, needsHumanAction, hasSelectableTargets]);

  const renderPhaseIcon = () => {
    switch (gameState.phase) {
      case "NIGHT_SEER_ACTION":
        return <Eye size={14} />;
      case "NIGHT_WOLF_ACTION":
        return <Skull size={14} />;
      case "NIGHT_GUARD_ACTION":
        return <Shield size={14} />;
      case "NIGHT_WITCH_ACTION":
        return <Drop size={14} />;
      case "HUNTER_SHOOT":
        return <Crosshair size={14} />;
      case "DAY_SPEECH":
        return <SpeechIcon size={14} />;
      case "DAY_BADGE_SIGNUP":
        return <Users size={14} />;
      case "DAY_BADGE_ELECTION":
        return <Users size={14} />;
      case "DAY_VOTE":
        return <Users size={14} />;
      default:
        return visualIsNight ? <NightIcon size={14} /> : <DayIcon size={14} />;
    }
  };

  // ============ 渲染 ==========

  // 欢迎阶段：未开始游戏时显示欢迎屏
  const isWelcomeStage = !gameStarted;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-transparent">
      <GameBackground isNight={visualIsNight} isBlinking={!!dayNightBlinkPhase} />

      <motion.div
        className="wc-blink-underlay"
        initial={false}
        animate={{
          opacity: dayNightBlinkPhase === "closing" ? 0.9 : dayNightBlinkPhase === "opening" ? 0.45 : 0,
        }}
        transition={
          dayNightBlinkPhase === "closing"
            ? { duration: DAY_NIGHT_BLINK.closeMs / 1000, ease: [0.22, 0.72, 0.24, 1] }
            : dayNightBlinkPhase === "opening"
              ? { duration: DAY_NIGHT_BLINK.openMs / 1000, ease: [0.16, 0.84, 0.44, 1] }
              : { duration: 0.2 }
        }
      />

      <motion.div
        className="wc-eyelid-overlay"
        style={{
          ["--wc-eye-feather" as any]: 16,
        }}
        initial={false}
        animate={{
          opacity: dayNightBlinkPhase ? 1 : 0,
          ["--wc-lid" as any]: dayNightBlinkPhase === "closing" ? 1 : 0,
        }}
        transition={
          dayNightBlinkPhase === "closing"
            ? { duration: DAY_NIGHT_BLINK.closeMs / 1000, ease: [0.22, 0.72, 0.24, 1] }
            : dayNightBlinkPhase === "opening"
              ? { duration: DAY_NIGHT_BLINK.openMs / 1000, ease: [0.16, 0.84, 0.44, 1] }
              : { duration: 0.2 }
        }
      />

      <AnimatePresence mode="wait" initial={false}>
        {isWelcomeStage ? (
          <motion.div
            key="welcome-stage"
            initial={{ opacity: 0, y: 10, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="h-full w-full"
          >
            <WelcomeScreen
              humanName={humanName}
              setHumanName={setHumanName}
              onStart={(options) => startGame({ ...(options ?? {}), isGenshinMode })}
              onAbort={restartGame}
              isLoading={isLoading}
              isGenshinMode={isGenshinMode}
              onGenshinModeChange={setGenshinMode}
            />
          </motion.div>
        ) : (
          <motion.div
            key="game-stage"
            initial={{ opacity: 0, y: 10, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="h-full w-full flex flex-col overflow-hidden"
          >
            <AnimatePresence>
              {ritualCue && !isRoleRevealOpen && showTable && (
                <motion.div
                  key={`ritual-${ritualCue.id}`}
                  className="fixed inset-0 z-[55] pointer-events-none flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 12, scale: 0.995, filter: "blur(10px)" }}
                    animate={{
                      opacity: [0, 1, 1, 0],
                      y: [12, 0, 0, -10],
                      scale: [0.995, 1, 1, 0.995],
                      filter: ["blur(10px)", "blur(0px)", "blur(0px)", "blur(12px)"],
                    }}
                    transition={{ duration: RITUAL_CUE_DURATION_SECONDS, times: [0, 0.15, 0.82, 1], ease: "easeInOut" }}
                    onAnimationComplete={() => {
                      const finishedId = ritualCue.id;
                      setRitualCue(null);
                      window.setTimeout(() => {
                        const queued = ritualCueQueueRef.current;
                        const next = queued.shift();
                        if (next) {
                          setRitualCue((current) => (current ? current : next));
                          return;
                        }
                        setLastRitualMessageId((current) => (current ?? finishedId));
                      }, 0);
                    }}
                    className="relative px-10 py-6 text-center"
                  >
                    <div
                      className="absolute inset-0 -z-10"
                      style={{
                        background:
                          "radial-gradient(circle at 50% 50%, rgba(184,134,11,0.18) 0%, rgba(184,134,11,0.10) 35%, rgba(0,0,0,0) 70%)",
                        filter: "blur(0.5px)",
                      }}
                    />

                    <motion.div
                      className="mx-auto h-px w-40"
                      initial={{ opacity: 0, scaleX: 0.75 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      style={{ background: "linear-gradient(90deg, transparent, rgba(184,134,11,0.55), transparent)" }}
                    />

                    <div
                      className="mt-4 text-2xl md:text-3xl font-black tracking-tight font-serif text-[var(--text-primary)]"
                      style={{
                        textShadow:
                          "0 2px 14px rgba(0,0,0,0.35), 0 0 22px rgba(184,134,11,0.22)",
                      }}
                    >
                      {ritualCue.title}
                    </div>

                    {ritualCue.subtitle && (
                      <div
                        className="mt-2 text-sm text-[var(--text-secondary)]"
                        style={{ textShadow: "0 2px 10px rgba(0,0,0,0.30)" }}
                      >
                        {ritualCue.subtitle}
                      </div>
                    )}

                    <motion.div
                      className="mx-auto mt-4 h-px w-40"
                      initial={{ opacity: 0, scaleX: 0.75 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      style={{ background: "linear-gradient(90deg, transparent, rgba(184,134,11,0.35), transparent)" }}
                    />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {humanPlayer && (
              <RoleRevealOverlay
                open={isRoleRevealOpen}
                player={humanPlayer}
                phase={gameState.phase}
                onContinue={async () => {
                  setIsRoleRevealOpen(false);
                  await continueAfterRoleReveal();
                }}
              />
            )}

            <NightActionOverlay overlay={nightActionOverlay} />

            <TutorialOverlay
              open={isTutorialOpen}
              tutorial={activeTutorial}
              onOpenChange={handleTutorialOpenChange}
              autoPromptEnabled={tutorialState.enabled}
              onAutoPromptChange={setAutoPromptEnabled}
            />

            {showTable && (
              <div className="wc-topbar wc-topbar--responsive shrink-0 transition-all duration-300">
                <div className="wc-topbar__title">
                  <WerewolfIcon size={22} className="text-[var(--color-blood)]" />
                  <span>WOLFCHA</span>
                </div>

                <div className="wc-topbar__info">
                  <div className="wc-topbar__item">
                    <span className="text-xs uppercase tracking-wider opacity-60">Day</span>
                    <span className="font-serif text-lg font-bold">{String(gameState.day).padStart(2, '0')}</span>
                  </div>
                  <div className="wc-topbar__item">
                    <span className="text-xs uppercase tracking-wider opacity-60">Alive</span>
                    <span className="font-serif text-lg font-bold">{gameState.players.filter((p) => p.alive).length}/{gameState.players.length}</span>
                  </div>
                  {gameState.badge.holderSeat !== null && (
                    <div className="wc-topbar__item">
                      <span className="text-xs uppercase tracking-wider opacity-60">警徽</span>
                      <span className="font-serif text-lg font-bold text-[var(--color-gold)]">{gameState.badge.holderSeat + 1}号</span>
                    </div>
                  )}
                  <div className="wc-phase-badge">
                    <span className="opacity-90">{renderPhaseIcon()}</span>
                    <span>{getPhaseDescription()}</span>
                    {showWaitingIndicator && (
                      <span className="flex items-center gap-1 ml-1">
                        <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ repeat: Infinity, duration: 0.7, delay: 0 }} className="w-1.5 h-1.5 rounded-full bg-current" />
                        <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ repeat: Infinity, duration: 0.7, delay: 0.15 }} className="w-1.5 h-1.5 rounded-full bg-current" />
                        <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ repeat: Infinity, duration: 0.7, delay: 0.3 }} className="w-1.5 h-1.5 rounded-full bg-current" />
                      </span>
                    )}
                    {needsHumanAction && (
                      <span className="flex items-center gap-1.5 font-semibold text-xs px-2 py-0.5 rounded-full ml-1 bg-[var(--color-gold)]/20 text-[var(--color-gold)]">
                        <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse" />
                        轮到你
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="wc-topbar__item wc-topbar__item--role">
                    <span className="text-xs uppercase tracking-wider opacity-60">身份</span>
                    <span className="font-bold text-[var(--color-gold)]">
                      {canShowRole ? getRoleLabel(humanPlayer?.role) : "待揭晓"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(true)}
                    title="声音设置"
                    aria-label="声音设置"
                    className="inline-flex items-center gap-2 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1 text-xs text-[var(--text-primary)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-bg)]"
                  >
                    <GearSix size={16} />
                    设置
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 flex flex-col bg-transparent min-h-0 overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  {(
                    <motion.div
                      key="table-screen"
                      initial={{ opacity: 0, y: 10, filter: "blur(10px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
                      transition={{ duration: 0.45, ease: "easeOut" }}
                      className="flex-1 flex flex-col min-h-0 overflow-hidden"
                    >
                {/* 主布局 - 严格对齐 style-unification-preview.html */}
                <div className="flex-1 flex gap-4 lg:gap-6 lg:px-6 lg:py-6 overflow-hidden w-full justify-center min-h-0">
                  {/* 左侧玩家卡片 */}
                  <div className="hidden md:flex w-[220px] lg:w-[240px] xl:w-[260px] 2xl:w-[300px] flex-col gap-3 shrink-0 overflow-y-auto overflow-x-visible scrollbar-hide pt-2 pb-2 px-1 -mx-1">
                    <AnimatePresence>
                      {leftPlayers.map((player, index) => {
                        const checkResult =
                          humanPlayer?.role === "Seer"
                            ? gameState.nightActions.seerHistory?.find((h) => h.targetSeat === player.seat)
                            : undefined;
                        const seerResult = checkResult ? (checkResult.isWolf ? "wolf" : "good") : null;
                        const isBadgeCandidate = (gameState.phase === "DAY_BADGE_ELECTION" || gameState.phase === "DAY_BADGE_SPEECH") && 
                          (gameState.badge.candidates || []).includes(player.seat);

                        return (
                          <PlayerCardCompact
                            key={player.playerId}
                            player={player}
                            isSpeaking={gameState.currentSpeakerSeat === player.seat}
                            canClick={canClickSeat(player)}
                            isSelected={selectedSeat === player.seat}
                            onClick={() => handleSeatClick(player)}
                            onDetailClick={isSelectionPhase ? undefined : () => setDetailPlayer(player)}
                            animationDelay={index * 0.05}
                            isNight={visualIsNight}
                            isGenshinMode={gameState?.isGenshinMode ?? isGenshinMode}
                            humanPlayer={humanPlayer}
                            seerCheckResult={seerResult}
                            isBadgeHolder={gameState.badge.holderSeat === player.seat}
                            isBadgeCandidate={isBadgeCandidate}
                            showRoleBadge={canShowRole}
                            showModel={gameState.phase === "GAME_END"}
                            selectionTone={selectionTone}
                          />
                        );
                      })}
                    </AnimatePresence>
                  </div>

                  {/* 中间区域：对话区 */}
                  <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full max-w-[980px] lg:max-w-[1100px] xl:max-w-[1200px] 2xl:max-w-[1280px] overflow-hidden">
                    <DialogArea
                      gameState={gameState}
                      humanPlayer={humanPlayer}
                      isNight={visualIsNight}
                      isSoundEnabled={isSoundEnabled}
                      isAiVoiceEnabled={shouldUseAiVoice}
                      currentDialogue={currentDialogue}
                      displayedText={displayedText}
                      isTyping={isTyping}
                      onAdvanceDialogue={handleAdvanceDialogue}
                      isHumanTurn={(gameState.phase === "DAY_SPEECH" || gameState.phase === "DAY_LAST_WORDS" || gameState.phase === "DAY_BADGE_SPEECH") && gameState.currentSpeakerSeat === humanPlayer?.seat && !waitingForNextRound}
                      waitingForNextRound={waitingForNextRound}
                      tutorialHelpLabel={tutorialHelpLabel}
                      showTutorialHelp={showTutorialHelp}
                      onTutorialOpen={handleTutorialHelpOpen}
                      inputText={inputText}
                      onInputChange={setInputText}
                      onSendMessage={handleHumanSpeech}
                      onFinishSpeaking={handleFinishSpeaking}
                      selectedSeat={selectedSeat}
                      isWaitingForAI={isWaitingForAI}
                      onConfirmAction={confirmSelectedSeat}
                      onCancelSelection={() => setSelectedSeat(null)}
                      onNightAction={handleNightActionConfirm}
                      onBadgeSignup={handleBadgeSignup}
                      onRestart={restartGame}
                    />

                    {/* 移动端玩家条 */}
                    <div className="wc-mobile-player-bar md:hidden">
                      <div className="wc-mobile-player-bar__track">
                        {allPlayers.map((player, index) => {
                          const checkResult =
                            humanPlayer?.role === "Seer"
                              ? gameState.nightActions.seerHistory?.find((h) => h.targetSeat === player.seat)
                              : undefined;
                          const seerResult = checkResult ? (checkResult.isWolf ? "wolf" : "good") : null;
                          const isBadgeCandidate = (gameState.phase === "DAY_BADGE_ELECTION" || gameState.phase === "DAY_BADGE_SPEECH") &&
                            (gameState.badge.candidates || []).includes(player.seat);

                          return (
                            <PlayerCardCompact
                              key={player.playerId}
                              player={player}
                              isSpeaking={gameState.currentSpeakerSeat === player.seat}
                              canClick={canClickSeat(player)}
                              isSelected={selectedSeat === player.seat}
                              onClick={() => handleSeatClick(player)}
                              onDetailClick={isSelectionPhase ? undefined : () => setDetailPlayer(player)}
                              animationDelay={index * 0.02}
                              isNight={visualIsNight}
                              isGenshinMode={gameState?.isGenshinMode ?? isGenshinMode}
                              humanPlayer={humanPlayer}
                              seerCheckResult={seerResult}
                              isBadgeHolder={gameState.badge.holderSeat === player.seat}
                              isBadgeCandidate={isBadgeCandidate}
                              variant="mobile"
                              showRoleBadge={canShowRole}
                              selectionTone={selectionTone}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 右侧玩家卡片 */}
                  <div className="hidden md:flex w-[220px] lg:w-[240px] xl:w-[260px] 2xl:w-[300px] flex-col gap-3 shrink-0 overflow-y-auto overflow-x-visible scrollbar-hide pt-2 pb-2 px-1 -mx-1">
                    <AnimatePresence>
                      {rightPlayers.map((player, index) => {
                        const checkResult =
                          humanPlayer?.role === "Seer"
                            ? gameState.nightActions.seerHistory?.find((h) => h.targetSeat === player.seat)
                            : undefined;
                        const seerResult = checkResult ? (checkResult.isWolf ? "wolf" : "good") : null;
                        const isBadgeCandidate = (gameState.phase === "DAY_BADGE_ELECTION" || gameState.phase === "DAY_BADGE_SPEECH") && 
                          (gameState.badge.candidates || []).includes(player.seat);

                        return (
                          <PlayerCardCompact
                            key={player.playerId}
                            player={player}
                            isSpeaking={gameState.currentSpeakerSeat === player.seat}
                            canClick={canClickSeat(player)}
                            isSelected={selectedSeat === player.seat}
                            onClick={() => handleSeatClick(player)}
                            onDetailClick={isSelectionPhase ? undefined : () => setDetailPlayer(player)}
                            animationDelay={index * 0.05}
                            isNight={visualIsNight}
                            isGenshinMode={gameState?.isGenshinMode ?? isGenshinMode}
                            humanPlayer={humanPlayer}
                            seerCheckResult={seerResult}
                            isBadgeHolder={gameState.badge.holderSeat === player.seat}
                            isBadgeCandidate={isBadgeCandidate}
                            showRoleBadge={canShowRole}
                            showModel={gameState.phase === "GAME_END"}
                            selectionTone={selectionTone}
                          />
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )}
</AnimatePresence>

      {/* 笔记本悬浮按钮 - 参考 style-unification-preview.html */}
      <button
        onClick={() => setIsNotebookOpen((v) => !v)}
        className="wc-notebook-fab"
        title={isNotebookOpen ? "关闭笔记" : "打开笔记"}
        type="button"
      >
        {isNotebookOpen ? <X size={24} /> : <NotePencil size={24} />}
      </button>

      <AnimatePresence>
        {isNotebookOpen && (
          <motion.div
            key="notebook-panel"
            initial={isMobile ? { opacity: 0, y: 24 } : { opacity: 0, x: 24, y: 12, scale: 0.98 }}
            animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={isMobile ? { opacity: 0, y: 24 } : { opacity: 0, x: 24, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="wc-notebook-panel fixed bottom-20 right-5 z-50 w-[360px] h-[480px] max-h-[70vh]"
          >
            <div className="h-full rounded-t-2xl md:rounded-lg overflow-hidden border shadow-2xl glass-panel glass-panel--strong">
              <Notebook />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 玩家详情弹窗 */}
      <PlayerDetailModal
        player={detailPlayer}
        isOpen={detailPlayer !== null}
        onClose={() => setDetailPlayer(null)}
        humanPlayer={humanPlayer}
        isGenshinMode={gameState?.isGenshinMode ?? isGenshinMode}
      />

      <SettingsModal
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        bgmVolume={bgmVolume}
        isSoundEnabled={isSoundEnabled}
        isAiVoiceEnabled={isAiVoiceEnabled}
        gameState={gameState}
        onBgmVolumeChange={setBgmVolume}
        onSoundEnabledChange={setSoundEnabled}
        onAiVoiceEnabledChange={setAiVoiceEnabled}
      />

      {/* 开发者模式 - 只在游戏开始后显示 */}
      {showTable && showDevTools && (
        <>
          <DevModeButton onClick={() => setIsDevConsoleOpen(true)} />
          <DevConsole isOpen={isDevConsoleOpen} onClose={() => setIsDevConsoleOpen(false)} />
        </>
      )}
    </div>
  );
}
