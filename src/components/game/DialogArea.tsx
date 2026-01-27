"use client";

import React, { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatCircleDots, PaperPlaneTilt, CheckCircle, MoonStars, Eye, Drop, Crosshair, Skull, X, ArrowClockwise, CaretRight, UserCircle, Prohibit } from "@phosphor-icons/react";
import { WerewolfIcon, VillagerIcon, VoteIcon } from "@/components/icons/FlatIcons";
import { VotingProgress } from "./VotingProgress";
import { WolfPlanningPanel } from "./WolfPlanningPanel";
import { MentionInput } from "./MentionInput";
import { TalkingAvatar } from "./TalkingAvatar";
import { VoiceRecorder, type VoiceRecorderHandle } from "./VoiceRecorder";
import { buildSimpleAvatarUrl, getModelLogoUrl } from "@/lib/avatar-config";
import { VoteResultCard } from "./VoteResultCard";
import LoadingMiniGame from "./MiniGame/LoadingMiniGame";
import type { GameState, Player, ChatMessage, Phase } from "@/types/game";
import { cn } from "@/lib/utils";
import { audioManager, makeAudioTaskId } from "@/lib/audio-manager";
import { resolveVoiceId, type AppLocale } from "@/lib/voice-constants";
import { getLocale } from "@/i18n/locale-store";
import { useTranslations } from "next-intl";

type WitchActionType = "save" | "poison" | "pass";
import type { DialogueState } from "@/store/game-machine";

// 职业立绘映射
const ROLE_PORTRAIT_MAP: Record<string, string> = {
  Werewolf: '/roles/werewolf.png',
  Seer: '/roles/seer.png',
  Witch: '/roles/witch.png',
  Hunter: '/roles/hunter.png',
  Guard: '/roles/guard.png',
  Villager: '/roles/villager.png',
};

// 预加载所有职业立绘
const ALL_ROLE_PORTRAITS = Object.values(ROLE_PORTRAIT_MAP);
let portraitsPreloaded = false;

function preloadRolePortraits() {
  if (portraitsPreloaded) return;
  portraitsPreloaded = true;
  
  ALL_ROLE_PORTRAITS.forEach((src) => {
    const img = new Image();
    img.src = encodeURI(src);
  });
}

// 获取当前阶段对应的角色
const getPhaseRole = (phase: Phase): string | null => {
  switch (phase) {
    case 'NIGHT_GUARD_ACTION': return 'Guard';
    case 'NIGHT_WOLF_ACTION': return 'Werewolf';
    case 'NIGHT_WITCH_ACTION': return 'Witch';
    case 'NIGHT_SEER_ACTION': return 'Seer';
    case 'HUNTER_SHOOT': return 'Hunter';
    default: return null;
  }
};

const getPlayerAvatarUrl = (player: Player, isGenshinMode: boolean) =>
  isGenshinMode && !player.isHuman
    ? getModelLogoUrl(player.agentProfile?.modelRef)
    : buildSimpleAvatarUrl(player.playerId, { gender: player.agentProfile?.persona?.gender });

function isTurnPromptSystemMessage(content: string, t: ReturnType<typeof useTranslations>) {
  return content.includes(t("dialog.turnToSpeak")) || content.includes(t("dialog.turnToLastWords"));
}

// 将消息中的"@X号 玩家名"或"X号"渲染为小标签
function renderPlayerMentions(
  text: string,
  players: Player[],
  isNight: boolean = false,
  isGenshinMode: boolean = false
): React.ReactNode {
  // Only match @X号 or X号 pattern, don't consume any text after it
  // This prevents truncating content that follows the mention
  const regex = /@?(\d{1,2})号/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const seatNum = parseInt(match[1], 10);
    const player = players.find(p => p.seat + 1 === seatNum);
    
    // 添加匹配前的文本
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    // 添加标签
    if (player) {
      const isPlayerReady = player.isHuman ? !!player.displayName?.trim() : !!player.agentProfile?.persona;
      parts.push(
        <span
          key={`${match.index}-${seatNum}`}
          className={`inline-flex items-center gap-1 mx-0.5 align-baseline text-[0.85em] font-semibold ${
            isNight
              ? "text-[var(--color-accent-light)]"
              : "text-[var(--color-accent)]"
          }`}
        >
          {isPlayerReady ? (
            <img
              src={getPlayerAvatarUrl(player, isGenshinMode)}
              alt={player.displayName}
              className="w-4 h-4 rounded-full"
            />
          ) : (
            <span className="w-4 h-4 rounded-full bg-black/10" aria-hidden="true" />
          )}
          <span className={isNight ? "text-[var(--color-accent-light)]" : "text-[var(--color-accent)]"}>{`@${seatNum}`}</span>
        </span>
      );
    } else {
      // 没找到对应玩家，保持原样但格式化
      parts.push(
        <span
          key={`${match.index}-${seatNum}`}
          className={`inline-flex items-center mx-0.5 align-baseline text-[0.85em] font-semibold ${
            isNight
              ? "text-[var(--color-accent-light)]"
              : "text-[var(--color-accent)]"
          }`}
        >
          {`@${seatNum}`}
        </span>
      );
    }
    
    lastIndex = regex.lastIndex;
  }
  
  // 添加剩余文本
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
}

function renderMentionsInMarkdownChildren(
  children: React.ReactNode,
  players: Player[],
  isNight: boolean,
  isGenshinMode: boolean
) {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      return renderPlayerMentions(child, players, isNight, isGenshinMode);
    }
    return child;
  });
}

function MentionsMarkdown({
  content,
  players,
  isNight,
  isGenshinMode,
  className,
}: {
  content: string;
  players: Player[];
  isNight: boolean;
  isGenshinMode: boolean;
  className?: string;
}) {
  return (
    <div className={cn("whitespace-pre-wrap break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="m-0">
              {renderMentionsInMarkdownChildren(children, players, isNight, isGenshinMode)}
            </p>
          ),
          em: ({ children }) => (
            <em>
              {renderMentionsInMarkdownChildren(children, players, isNight, isGenshinMode)}
            </em>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold">
              {renderMentionsInMarkdownChildren(children, players, isNight, isGenshinMode)}
            </strong>
          ),
          li: ({ children }) => (
            <li>
              {renderMentionsInMarkdownChildren(children, players, isNight, isGenshinMode)}
            </li>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "underline underline-offset-2",
                isNight ? "text-[var(--color-accent-light)]" : "text-[var(--color-accent)]"
              )}
            >
              {renderMentionsInMarkdownChildren(children, players, isNight, isGenshinMode)}
            </a>
          ),
          // Do not inject mentions into code blocks.
          code: ({ children }) => <code className="font-mono">{children}</code>,
          pre: ({ children }) => <pre className="overflow-x-auto">{children}</pre>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

interface DialogAreaProps {
  gameState: GameState;
  humanPlayer: Player | null;
  isNight?: boolean;
  isSoundEnabled?: boolean;
  isAiVoiceEnabled?: boolean;
  currentDialogue: DialogueState | null;
  displayedText: string;
  isTyping: boolean;
  showFullHistory?: boolean;
  onAdvanceDialogue?: () => void;
  onAtBottomChange?: (isAtBottom: boolean) => void;
  isHumanTurn?: boolean; // 是否轮到人类发言
  waitingForNextRound?: boolean; // 是否等待下一轮
  tutorialHelpLabel?: string;
  showTutorialHelp?: boolean;
  onTutorialOpen?: () => void;
  // 输入相关
  inputText?: string;
  onInputChange?: (text: string) => void;
  onSendMessage?: () => void;
  onFinishSpeaking?: () => void;
  // 操作相关 (从 BottomActionPanel 合并)
  selectedSeat?: number | null;
  isWaitingForAI?: boolean;
  onConfirmAction?: () => void;
  onCancelSelection?: () => void;
  onNightAction?: (seat: number, actionType?: WitchActionType) => void;
  onBadgeSignup?: (wants: boolean) => void;
  onRestart?: () => void;
}

// 等待状态动画组件已移除，与当前简洁风格不符

// 夜晚行动状态组件 - 带有神秘氛围
// Note: Guard phase does not use this component - it uses the regular dialogue block instead
function NightActionStatus({ phase, humanRole }: { phase: string; humanRole?: string }) {
  const t = useTranslations();
  
  // Guard phase: don't show any status animation, let dialogue block handle it
  if (phase === "NIGHT_GUARD_ACTION") {
    return null;
  }

  const getStatusInfo = () => {
    // 如果是人类玩家的回合，显示“请睁眼”；否则显示“正在行动”
    const isMyPhase = 
      (phase === "NIGHT_WOLF_ACTION" && humanRole === "Werewolf") ||
      (phase === "NIGHT_WITCH_ACTION" && humanRole === "Witch") ||
      (phase === "NIGHT_SEER_ACTION" && humanRole === "Seer") ||
      (phase === "HUNTER_SHOOT" && humanRole === "Hunter");
    
    switch (phase) {
      case "NIGHT_WOLF_ACTION":
        return { icon: WerewolfIcon, text: isMyPhase ? t("dialog.nightAction.wolfAwake") : t("dialog.nightAction.wolfActing"), color: "text-red-500" };
      case "NIGHT_WITCH_ACTION":
        return { icon: Drop, text: isMyPhase ? t("dialog.nightAction.witchAwake") : t("dialog.nightAction.witchActing"), color: "text-purple-500" };
      case "NIGHT_SEER_ACTION":
        return { icon: Eye, text: isMyPhase ? t("dialog.nightAction.seerAwake") : t("dialog.nightAction.seerChecking"), color: "text-blue-500" };
      case "HUNTER_SHOOT":
        return { icon: Crosshair, text: isMyPhase ? t("dialog.nightAction.hunterAwake") : t("dialog.nightAction.hunterActing"), color: "text-orange-500" };
      default:
        return { icon: null, text: "", color: "" };
    }
  };

  const { icon: Icon, text, color } = getStatusInfo();

  if (!text) {
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center py-6">
      {/* 神秘光球效果 */}
      {Icon && (
        <div className="relative mb-4">
          <motion.div
            className={`absolute inset-0 rounded-full blur-xl opacity-30 ${color.replace('text-', 'bg-')}`}
            animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className={`relative w-16 h-16 rounded-full flex items-center justify-center ${color.replace('text-', 'bg-')}/10 border-2 ${color.replace('text-', 'border-')}/30`}
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Icon size={28} className={color} weight="fill" />
          </motion.div>
        </div>
      )}
      
      {/* 状态文字 */}
      <div className={`flex items-center text-base font-medium ${color}`}>
        <span>{text}</span>
      </div>
      
      {/* 装饰性星星 */}
      <div className="flex gap-3 mt-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="w-1 h-1 rounded-full bg-current opacity-30"
            animate={{ opacity: [0.1, 0.5, 0.1], scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
          />
        ))}
      </div>
    </div>
  );
}

export function DialogArea({
  gameState,
  humanPlayer,
  isNight = false,
  isSoundEnabled = true,
  isAiVoiceEnabled = false,
  currentDialogue,
  displayedText,
  isTyping,
  onAdvanceDialogue,
  onAtBottomChange,
  isHumanTurn = false,
  waitingForNextRound = false,
  tutorialHelpLabel,
  showTutorialHelp = false,
  onTutorialOpen,
  inputText = "",
  onInputChange,
  onSendMessage,
  onFinishSpeaking,
  // 操作相关
  selectedSeat = null,
  isWaitingForAI = false,
  onConfirmAction,
  onCancelSelection,
  onNightAction,
  onBadgeSignup,
  onRestart,
}: DialogAreaProps) {
  const t = useTranslations();
  const isGenshinMode = !!gameState.isGenshinMode;
  const phase = gameState.phase;
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const lastPortraitPlayerRef = useRef<Player | null>(null);
  const voiceRecorderRef = useRef<VoiceRecorderHandle | null>(null);

  const [talkingPlayerId, setTalkingPlayerId] = useState<string | null>(null);

  // 初始化音频管理器
  useEffect(() => {
    audioManager.setCallbacks(
      (playerId) => setTalkingPlayerId(playerId),
      () => setTalkingPlayerId(null)
    );
    return () => audioManager.clearQueue();
  }, []);

  // 语音播放跟随消息框（currentDialogue），而不是消息记录（messages）
  useEffect(() => {
    if (!currentDialogue) return;
    if (!currentDialogue.isStreaming) return;
    if (!isSoundEnabled || !isAiVoiceEnabled) return;

    const player = gameState.players.find((p) => p.displayName === currentDialogue.speaker);
    if (!player) return;
    if (player.playerId === humanPlayer?.playerId) return;

    const text = currentDialogue.text;
    if (!text || !text.trim()) return;
    // “思考中”阶段不播
    if (text.includes(t("dayPhase.organizing")) || text.includes(t("ui.generatingVoice"))) return;

    const locale = getLocale() as AppLocale;
    const voiceId = resolveVoiceId(
      player.agentProfile?.persona?.voiceId,
      player.agentProfile?.persona?.gender,
      player.agentProfile?.persona?.age,
      locale
    );

    audioManager.addToQueue({
      id: makeAudioTaskId(voiceId, text),
      text,
      playerId: player.playerId,
      voiceId,
    });
  }, [currentDialogue, gameState.players, humanPlayer?.playerId, isSoundEnabled, isAiVoiceEnabled]);

  // 处理跳过/继续：截断语音并进入下一句
  const handleAdvance = useCallback(() => {
    audioManager.stopCurrent();
    onAdvanceDialogue?.();
  }, [onAdvanceDialogue]);

  const handleFinishSpeaking = useCallback(() => {
    if (inputText?.trim()) {
      onSendMessage?.();
    }
    onFinishSpeaking?.();
  }, [inputText, onSendMessage, onFinishSpeaking]);

  // 跳过/继续逻辑由 page.tsx 的全局按键处理负责（同时截断语音）

  // 预加载所有职业立绘
  useEffect(() => {
    preloadRolePortraits();
  }, []);
  
  // 判断是否需要用户手动点击/按键继续（而非自动过场）
  const needsManualContinue = useMemo(() => {
    // 正在组织语言时不需要手动继续
    const dialogueText = currentDialogue?.text || "";
    if (dialogueText.includes(t("dayPhase.organizing")) || dialogueText.includes(t("ui.generatingVoice"))) {
      return false;
    }
    // 发言阶段需要手动继续
    if (["DAY_SPEECH", "DAY_LAST_WORDS", "DAY_BADGE_SPEECH", "DAY_PK_SPEECH"].includes(phase)) {
      return true;
    }
    // 等待下一轮时需要手动继续
    if (waitingForNextRound) {
      return true;
    }
    // 预言家查验完成后需要手动确认（人类是预言家）
    if (phase === "NIGHT_SEER_ACTION" && humanPlayer?.role === "Seer" && gameState.nightActions.seerTarget !== undefined) {
      return true;
    }
    return false;
  }, [phase, waitingForNextRound, humanPlayer?.role, gameState.nightActions.seerTarget, currentDialogue?.text]);

  const visibleMessages = useMemo(() => {
    return gameState.messages.filter(
      (m) => !(m.isSystem && isTurnPromptSystemMessage(m.content, t))
    );
  }, [gameState.messages, t]);

  // 获取当前发言者信息
  const currentSpeaker = useMemo(() => {
    if (isHumanTurn && humanPlayer) {
      return {
        player: humanPlayer,
        text: "",
        isStreaming: false,
      };
    }
    if (currentDialogue) {
      const player = gameState.players.find(p => p.displayName === currentDialogue.speaker);
      return {
        player,
        text: currentDialogue.isStreaming ? displayedText : currentDialogue.text,
        isStreaming: true,
      };
    }
    // 找最后一条非系统消息
    const lastMsg = [...visibleMessages].reverse().find(m => !m.isSystem);
    if (lastMsg) {
      const player = gameState.players.find(p => p.playerId === lastMsg.playerId);
      return {
        player,
        text: lastMsg.content,
        isStreaming: false,
      };
    }
    return null;
  }, [isHumanTurn, humanPlayer, currentDialogue, displayedText, visibleMessages, gameState.players]);

  const portraitPlayer = useMemo(() => {
    if (isHumanTurn && humanPlayer) return humanPlayer;
    if (typeof gameState.currentSpeakerSeat === "number") {
      return gameState.players.find((p) => p.seat === gameState.currentSpeakerSeat) || null;
    }
    return currentSpeaker?.player || null;
  }, [isHumanTurn, humanPlayer, gameState.currentSpeakerSeat, gameState.players, currentSpeaker?.player?.playerId]);

  useEffect(() => {
    if (portraitPlayer) lastPortraitPlayerRef.current = portraitPlayer;
  }, [portraitPlayer?.playerId]);

  const stablePortraitPlayer = portraitPlayer || lastPortraitPlayerRef.current;

  const portraitNode = (
    <AnimatePresence mode="wait" initial={false}>
      {(() => {
        // 夜晚行动阶段：显示对应职业立绘
        const phaseRole = getPhaseRole(phase);
        const rolePortrait = phaseRole ? encodeURI(ROLE_PORTRAIT_MAP[phaseRole]) : null;

        if (rolePortrait) {
          return (
            <motion.div
              key={`role-portrait-${phaseRole}`}
              initial={{ opacity: 0, filter: "blur(8px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(8px)" }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="relative flex flex-col items-center"
            >
              {/* 光晕效果 - 根据角色调整颜色 */}
              <motion.div 
                className={cn(
                  "absolute bottom-[20%] left-1/2 -translate-x-1/2 w-40 h-40 rounded-full blur-2xl",
                  phaseRole === 'Werewolf' && "bg-gradient-radial from-red-500/30 via-transparent to-transparent",
                  phaseRole === 'Seer' && "bg-gradient-radial from-blue-500/30 via-transparent to-transparent",
                  phaseRole === 'Witch' && "bg-gradient-radial from-purple-500/30 via-transparent to-transparent",
                  phaseRole === 'Guard' && "bg-gradient-radial from-emerald-500/30 via-transparent to-transparent",
                  phaseRole === 'Hunter' && "bg-gradient-radial from-orange-500/30 via-transparent to-transparent",
                )}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.1 }}
              />
              
              {/* 职业立绘 */}
              <img
                src={rolePortrait}
                alt={phaseRole || 'Role'}
                className="relative z-10 w-[220px] lg:w-[260px] xl:w-[300px] h-auto object-contain"
                style={{ willChange: "opacity, transform, filter" }}
              />
            </motion.div>
          );
        }
        
        // 非夜晚行动阶段或白天：显示玩家头像
        if (stablePortraitPlayer) {
          return (
            <motion.div
              key={stablePortraitPlayer.playerId}
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(4px)" }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative flex flex-col items-center"
            >
              {/* 光晕效果 */}
              <div className="absolute bottom-[20%] left-1/2 -translate-x-1/2 w-40 h-40 bg-gradient-radial from-[var(--color-accent)]/20 via-transparent to-transparent rounded-full blur-2xl" />
              
              {/* 立绘图片 - 只在字幕播放中时有嘴型动画 */}
              <TalkingAvatar
                seed={stablePortraitPlayer.playerId}
                gender={stablePortraitPlayer.agentProfile?.persona?.gender}
                modelRef={stablePortraitPlayer.agentProfile?.modelRef}
                useModelLogo={isGenshinMode && !stablePortraitPlayer.isHuman}
                isTalking={talkingPlayerId === stablePortraitPlayer.playerId || (isTyping && !talkingPlayerId)}
                alt={stablePortraitPlayer.displayName}
                className="relative z-10 w-[220px] lg:w-[260px] xl:w-[300px] h-auto object-contain"
                scale={120}
                translateY={-5}
              />
            </motion.div>
          );
        }
        
        return (
          <motion.div
            key="empty-portrait"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            className="flex items-end justify-center h-full pb-6"
          >
            {isNight ? (
              <MoonStars size={64} className="opacity-20 text-[var(--text-primary)]" />
            ) : (
              <ChatCircleDots size={64} className="opacity-15" />
            )}
          </motion.div>
        );
      })()}
    </AnimatePresence>
  );

  // 智能滚动逻辑
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isManualScrollLocked, setIsManualScrollLocked] = useState(false);
  const manualScrollLockRef = useRef(false);
  const userScrollIntentRef = useRef(false);
  const userScrollIntentTimeoutRef = useRef<number | null>(null);
  const userInteractionSuppressRef = useRef(false);
  const userInteractionSuppressTimeoutRef = useRef<number | null>(null);
  const wasAwayFromBottomRef = useRef(false);
  const unlockBlockedUntilRef = useRef(0);
  const lockedScrollTopRef = useRef(0);
  const userScrolledDuringTypingRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const prevMessageCountRef = useRef(visibleMessages.length);
  const isAutoScrollingRef = useRef(false);

  useEffect(() => {
    if (isTyping) {
      userScrolledDuringTypingRef.current = false;
    }
  }, [isTyping]);

  useEffect(() => {
    onAtBottomChange?.(!isManualScrollLocked);
  }, [isManualScrollLocked, onAtBottomChange]);

  // 滚动到底部（用户主动点击时调用，解除锁定）
  const scrollToBottom = useCallback(() => {
    if (historyRef.current) {
      const container = historyRef.current;
      
      isAutoScrollingRef.current = true;
      manualScrollLockRef.current = false;
      wasAwayFromBottomRef.current = false;
      userScrolledDuringTypingRef.current = false;
      setIsManualScrollLocked(false);
      setUnreadCount(0);
      setIsAtBottom(true);
      
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
      
      setTimeout(() => {
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
        isAutoScrollingRef.current = false;
      }, 300);
    }
  }, []);

  // 监听滚动事件
  useEffect(() => {
    const container = historyRef.current;
    if (!container) return;

    lastScrollTopRef.current = container.scrollTop;

    const lockManualScroll = () => {
      manualScrollLockRef.current = true;
      setIsManualScrollLocked(true);

      if (historyRef.current) {
        lockedScrollTopRef.current = historyRef.current.scrollTop;
      }

      unlockBlockedUntilRef.current = Date.now() + 700;

      if (isAutoScrollingRef.current) {
        isAutoScrollingRef.current = false;
      }
    };

    const markUserIntent = (event: Event) => {
      userScrollIntentRef.current = true;
      if (userScrollIntentTimeoutRef.current) {
        window.clearTimeout(userScrollIntentTimeoutRef.current);
      }
      userScrollIntentTimeoutRef.current = window.setTimeout(() => {
        userScrollIntentRef.current = false;
      }, 600);

      if (!(event instanceof WheelEvent)) {
        userInteractionSuppressRef.current = true;
        if (userInteractionSuppressTimeoutRef.current) {
          window.clearTimeout(userInteractionSuppressTimeoutRef.current);
        }
        userInteractionSuppressTimeoutRef.current = window.setTimeout(() => {
          userInteractionSuppressRef.current = false;
        }, 900);

        lockManualScroll();
        wasAwayFromBottomRef.current = true;
        if (isTyping) {
          userScrolledDuringTypingRef.current = true;
        }
        return;
      }

      if (isAutoScrollingRef.current) {
        lockManualScroll();
        return;
      }

      if (event instanceof WheelEvent) {
        if (event.deltaY < 0) {
          lockManualScroll();
          if (isTyping) {
            userScrolledDuringTypingRef.current = true;
          }
        }
        return;
      }
    };

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;

      if (manualScrollLockRef.current) {
        const isUserActive = userScrollIntentRef.current || userInteractionSuppressRef.current;
        if (isUserActive) {
          lockedScrollTopRef.current = scrollTop;
        } else if (Math.abs(scrollTop - lockedScrollTopRef.current) > 1) {
          const distanceToBottom = scrollHeight - scrollTop - clientHeight;
          const isTrulyAtBottom = distanceToBottom <= 0.5;
          if (isTrulyAtBottom) {
            manualScrollLockRef.current = false;
            wasAwayFromBottomRef.current = false;
            userScrolledDuringTypingRef.current = false;
            setIsManualScrollLocked(false);
            setUnreadCount(0);
            return;
          }

          isAutoScrollingRef.current = true;
          container.scrollTop = lockedScrollTopRef.current;
          window.setTimeout(() => {
            isAutoScrollingRef.current = false;
          }, 0);
          return;
        }
      }

      const prevTop = lastScrollTopRef.current;
      const scrolledUp = scrollTop < prevTop - 0.5;
      lastScrollTopRef.current = scrollTop;

      if (isAutoScrollingRef.current && !userScrollIntentRef.current) {
        if (!scrolledUp) {
          return;
        }

        lockManualScroll();
      }

      const distanceToBottom = scrollHeight - scrollTop - clientHeight;
      const isTrulyAtBottom = distanceToBottom <= 0.5;
      
      setIsAtBottom(distanceToBottom < 24);

      if (isTrulyAtBottom) {
        userScrolledDuringTypingRef.current = false;
        if (manualScrollLockRef.current) {
          manualScrollLockRef.current = false;
          setIsManualScrollLocked(false);
        }
        wasAwayFromBottomRef.current = false;
        setUnreadCount(0);
      }

      if (!isTrulyAtBottom) {
        wasAwayFromBottomRef.current = true;
      }

      if (scrolledUp) {
        lockManualScroll();
        wasAwayFromBottomRef.current = true;
        if (isTyping) {
          userScrolledDuringTypingRef.current = true;
        }
        return;
      }

      if (manualScrollLockRef.current) {
        if (isTrulyAtBottom) {
          manualScrollLockRef.current = false;
          wasAwayFromBottomRef.current = false;
          userScrolledDuringTypingRef.current = false;
          setIsManualScrollLocked(false);
          setUnreadCount(0);
        }
        return;
      }

      if (!isTrulyAtBottom) {
        manualScrollLockRef.current = true;
        setIsManualScrollLocked(true);
      }
    };

    container.addEventListener("wheel", markUserIntent, { passive: true });
    container.addEventListener("touchstart", markUserIntent, { passive: true });
    container.addEventListener("pointerdown", markUserIntent, { passive: true });
    container.addEventListener("mousedown", markUserIntent, { passive: true });
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("wheel", markUserIntent);
      container.removeEventListener("touchstart", markUserIntent);
      container.removeEventListener("pointerdown", markUserIntent);
      container.removeEventListener("mousedown", markUserIntent);
      container.removeEventListener("scroll", handleScroll);
      if (userScrollIntentTimeoutRef.current) {
        window.clearTimeout(userScrollIntentTimeoutRef.current);
      }
      if (userInteractionSuppressTimeoutRef.current) {
        window.clearTimeout(userInteractionSuppressTimeoutRef.current);
      }
    };
  }, [isTyping]);

  // 处理新消息到来
  useEffect(() => {
    const newCount = visibleMessages.length;
    const prevCount = prevMessageCountRef.current;
    
    if (newCount > prevCount) {
      const addedCount = newCount - prevCount;

      const shouldAutoFollow =
        isAtBottom &&
        !userInteractionSuppressRef.current &&
        !userScrolledDuringTypingRef.current;

      if (shouldAutoFollow) {
        manualScrollLockRef.current = false;
        setIsManualScrollLocked(false);
        setUnreadCount(0);
        // 未锁定，自动滚动到底部
        requestAnimationFrame(() => {
          if (historyRef.current && !userInteractionSuppressRef.current && !userScrolledDuringTypingRef.current) {
            isAutoScrollingRef.current = true;
            historyRef.current.scrollTop = historyRef.current.scrollHeight;
            window.setTimeout(() => {
              isAutoScrollingRef.current = false;
            }, 100);
          }
        });
      } else {
        // 已锁定，累加未读数
        setUnreadCount((prev) => prev + addedCount);
      }
    }
    
    prevMessageCountRef.current = newCount;
  }, [visibleMessages.length, isAtBottom, isManualScrollLocked]);

  // 对话内容更新时也检查是否需要滚动
  useEffect(() => {
    if (isTyping) return;
    if (!isAtBottom) return;
    if (userScrolledDuringTypingRef.current) return;
    if (manualScrollLockRef.current) return;
    if (userInteractionSuppressRef.current) return;
    if (!historyRef.current) return;

    isAutoScrollingRef.current = true;
    historyRef.current.scrollTop = historyRef.current.scrollHeight;
    window.setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 100);
  }, [isTyping, isAtBottom]);

  // 空状态
  if (gameState.messages.length === 0 && !currentDialogue) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-[var(--text-muted)]">
        <div className="relative flex flex-col items-center">
          <div className="relative mb-6">
            <motion.div
              className="absolute inset-0 rounded-full border border-[var(--color-gold)]/20"
              style={{ width: 180, height: 180 }}
              animate={{ rotate: 360 }}
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="absolute inset-5 rounded-full border border-dashed border-[var(--color-blood)]/30"
              animate={{ rotate: -360, opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="absolute inset-10 rounded-full border border-[var(--color-gold)]/20"
              animate={{ scale: [0.96, 1.04, 0.96], opacity: [0.35, 0.7, 0.35] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="relative flex items-center justify-center rounded-full"
              style={{ width: 180, height: 180 }}
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(197,160,89,0.12),rgba(0,0,0,0)_70%)]" />
              <WerewolfIcon size={56} className="text-[var(--color-gold)]/60 drop-shadow-[0_0_18px_rgba(197,160,89,0.3)]" />
            </motion.div>
          </div>
          <motion.div
            className="flex flex-col items-center gap-2"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className="text-sm font-serif tracking-[0.2em] text-[var(--color-gold)]/80 uppercase">
              {t("dialog.emptyState.summoning")}
            </div>
            <div className="text-base font-semibold text-[var(--text-primary)]/85">
              {t("dialog.emptyState.playersEntering")}
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <motion.span
                className="inline-block w-2 h-2 rounded-full bg-[var(--color-gold)]/60"
                animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.9, 0.4] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              />
              <span>{t("dialog.emptyState.recruiting")}</span>
            </div>
            <div className="mt-4">
              <LoadingMiniGame />
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // 获取角色中文名
  const getRoleName = (role?: string) => {
    switch (role) {
      case "Werewolf": return t("roles.werewolf");
      case "Seer": return t("roles.seer");
      case "Witch": return t("roles.witch");
      case "Hunter": return t("roles.hunter");
      case "Guard": return t("roles.guard");
      default: return t("roles.villager");
    }
  };

  const baseDialogueText = (displayedText || currentSpeaker?.text || "").trim();
  // When human has voted in badge election, show "你已经投票给 x 号" instead of "点击头像投票选警徽"
  const humanBadgeVote = humanPlayer ? gameState.badge.votes[humanPlayer.playerId] : undefined;
  const dialogueText =
    phase === "DAY_BADGE_ELECTION" &&
    humanPlayer &&
    typeof humanBadgeVote === "number" &&
    humanBadgeVote >= 0
      ? (() => {
          const vp = gameState.players.find((p) => p.seat === humanBadgeVote);
          return t("dialog.alreadyVotedFor", { seat: humanBadgeVote + 1, name: vp?.displayName || "" });
        })()
      : baseDialogueText;
  const shouldShowDialogue = waitingForNextRound || dialogueText.length > 0;
  const isNightActionPhase = [
    "NIGHT_GUARD_ACTION",
    "NIGHT_WOLF_ACTION",
    "NIGHT_WITCH_ACTION",
    "NIGHT_SEER_ACTION",
  ].includes(phase);

  const showGameEnd = phase === "GAME_END";
  const showBadgeSignup = phase === "DAY_BADGE_SIGNUP"
    && humanPlayer?.alive
    && typeof gameState.badge.signup?.[humanPlayer.playerId] !== "boolean";
  const showBadgeSignupWaiting = phase === "DAY_BADGE_SIGNUP"
    && isWaitingForAI
    && humanPlayer?.alive
    && typeof gameState.badge.signup?.[humanPlayer.playerId] === "boolean";
  const showBadgeTransferOption = phase === "BADGE_TRANSFER"
    && humanPlayer
    && gameState.badge.holderSeat === humanPlayer.seat
    && selectedSeat === null;
  const showActionConfirm = (() => {
    const badgeCandidates = gameState.badge.candidates || [];
    const humanIsCandidate = humanPlayer && badgeCandidates.includes(humanPlayer.seat);

    const isCorrectRoleForPhase =
      (phase === "DAY_VOTE" && humanPlayer?.alive) ||
      (phase === "DAY_BADGE_ELECTION" && humanPlayer?.alive && !humanIsCandidate) ||
      (phase === "NIGHT_SEER_ACTION" && humanPlayer?.role === "Seer" && humanPlayer?.alive && gameState.nightActions.seerTarget === undefined) ||
      (phase === "NIGHT_WOLF_ACTION" && humanPlayer?.role === "Werewolf" && humanPlayer?.alive) ||
      (phase === "NIGHT_GUARD_ACTION" && humanPlayer?.role === "Guard" && humanPlayer?.alive) ||
      (phase === "HUNTER_SHOOT" && humanPlayer?.role === "Hunter") ||
      (phase === "BADGE_TRANSFER" && humanPlayer && gameState.badge.holderSeat === humanPlayer.seat);

    return Boolean(
      isCorrectRoleForPhase
        && selectedSeat !== null
        && (phase === "DAY_VOTE" || phase === "DAY_BADGE_ELECTION" || phase === "BADGE_TRANSFER" || !isWaitingForAI)
    );
  })();
  const showWitchPanel = phase === "NIGHT_WITCH_ACTION" && humanPlayer?.role === "Witch" && !isWaitingForAI;
  const showHumanInput = isHumanTurn && phase !== "GAME_END" && phase !== "DAY_BADGE_SIGNUP";
  const showDialogueBlock = !isHumanTurn
    && (currentSpeaker || waitingForNextRound)
    && shouldShowDialogue
    && phase !== "GAME_END"
    && selectedSeat === null
    && !(phase === "NIGHT_WITCH_ACTION" && humanPlayer?.role === "Witch" && !isWaitingForAI);
  const showNightWaiting = !isHumanTurn
    && !currentSpeaker
    && !waitingForNextRound
    && isNightActionPhase
    && phase !== "GAME_END"
    && selectedSeat === null
    && !(phase === "NIGHT_WITCH_ACTION" && humanPlayer?.role === "Witch" && !isWaitingForAI);

  const shouldShowDialogPanel = showGameEnd
    || showBadgeSignup
    || showBadgeSignupWaiting
    || showBadgeTransferOption
    || showActionConfirm
    || showWitchPanel
    || showHumanInput
    || showDialogueBlock
    || showNightWaiting;

  return (
    <div className="wc-dialog-area h-full w-full flex flex-col min-h-0 justify-start">
      {/* 上方区域：左侧立绘 + 右侧历史记录 */}
      <div className="flex-1 min-h-0 w-full -mb-1">
        <div className="wc-dialog-main flex gap-4 lg:gap-6 px-4 lg:px-6 pt-0 pb-0 min-h-0 h-full items-stretch">
          {/* 左侧立绘区域 */}
          <div className="wc-dialog-portrait hidden md:flex w-[220px] lg:w-[260px] xl:w-[300px] shrink-0 flex-col items-center justify-end">
            {portraitNode}
          </div>

          {/* 右侧：聊天历史记录 */}
          <div className="wc-dialog-history flex-1 min-w-0 min-h-0 relative">
            <motion.div 
              ref={historyRef}
              className="absolute inset-0 overflow-y-scroll pb-4"
              style={{
                scrollbarGutter: "stable",
                overflowAnchor: "none",
              }}
              layoutScroll
            >
              <LayoutGroup>
                <AnimatePresence initial={false}>
                  {visibleMessages.map((msg, index) => {
                    const prevMsg = visibleMessages[index - 1];
                    const showDivider = index > 0 && !msg.isSystem && !prevMsg?.isSystem && prevMsg?.playerId !== msg.playerId;
                    const key = msg.id || `${msg.playerId}:${msg.timestamp}:${index}`;
                    return (
                      <motion.div
                        key={key}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      >
                        <ChatMessageItem 
                          msg={msg} 
                          players={gameState.players}
                          humanPlayerId={humanPlayer?.playerId}
                          showDivider={showDivider}
                          isNight={isNight}
                          isGenshinMode={isGenshinMode}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </LayoutGroup>
            </motion.div>
            
            {/* 新消息提示：底部分割线 + 文案 */}
            <AnimatePresence>
              {unreadCount > 0 && !isAtBottom && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="absolute bottom-3 left-0 right-0 z-10 px-4"
                >
                  <button
                    onClick={scrollToBottom}
                    className="w-full flex items-center gap-3 text-xs font-medium transition-colors"
                    type="button"
                  >
                    <span className={cn(
                      "h-px flex-1",
                      isNight ? "bg-white/15" : "bg-black/10"
                    )} />
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full border backdrop-blur-sm",
                        isNight
                          ? "text-white/80 border-white/15 bg-black/30"
                          : "text-[var(--text-secondary)] border-[var(--border-color)] bg-white/70"
                      )}
                    >
                      {t("dialog.newMessages", { count: unreadCount })}
                    </span>
                    <span className={cn(
                      "h-px flex-1",
                      isNight ? "bg-white/15" : "bg-black/10"
                    )} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 下方：对话框 - 固定在底部 */}
      <div className="wc-dialog-bottom mt-auto shrink-0 px-4 lg:px-6 pb-4 lg:pb-6 pt-0">
        {/* 投票进度 */}
        {(gameState.phase === "DAY_VOTE" || gameState.phase === "DAY_BADGE_ELECTION") && (
          <div className="mb-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-3">
            <div className="text-sm font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-[var(--color-accent)] rounded-full animate-pulse" />
              {gameState.phase === "DAY_BADGE_ELECTION" ? t("dialog.badgeElectionInProgress") : t("dialog.voteInProgress")}
            </div>
            <VotingProgress gameState={gameState} humanPlayer={humanPlayer} />
          </div>
        )}

        {/* 狼人协作面板 */}
        {gameState.phase === "NIGHT_WOLF_ACTION" && humanPlayer?.role === "Werewolf" && (
          <div className="mb-3">
            <WolfPlanningPanel gameState={gameState} humanPlayer={humanPlayer} />
          </div>
        )}

        {/* 对话气泡 - 简化结构，移除嵌套 */}
        <div
          className={cn(
            "wc-panel wc-panel--strong rounded-xl p-5 relative transition-opacity min-h-[160px]",
            shouldShowDialogPanel
              ? "opacity-100"
              : "opacity-0 pointer-events-none bg-transparent border-transparent shadow-none"
          )}
        >
          {showTutorialHelp && tutorialHelpLabel && (
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTutorialOpen?.();
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 p-1 px-2 rounded-full text-xs font-semibold border transition-all",
                  isNight
                    ? "bg-white/10 border-white/15 text-white/80 hover:bg-white/20"
                    : "bg-white border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                )}
              >
                {tutorialHelpLabel}
              </button>
            </div>
          )}
          {shouldShowDialogPanel && (
          <AnimatePresence mode="wait">
              {/* 游戏结束 - 文字形式 */}
              {showGameEnd && (
                <motion.div
                  key="game-end"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="text-xl leading-relaxed text-[var(--text-primary)]">
                    {gameState.winner === "village" ? (
                      <>GG! <span className="text-[var(--color-success)] font-semibold">{t("alignment.village")}</span> {t("gameEnd.wins")}!</>
                    ) : (
                      <>GG! <span className="text-[var(--color-wolf)] font-semibold">{t("alignment.wolf")}</span> {t("gameEnd.wins")}!</>
                    )}
                  </div>
                  <div className={`flex items-center justify-between mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                    <span className="text-xs text-[var(--text-muted)]">{t("dialog.playAgainHint")}</span>
                    <button
                      onClick={onRestart}
                      className="wc-action-btn wc-action-btn--primary text-sm h-9 px-4"
                      type="button"
                    >
                      <ArrowClockwise size={14} weight="bold" />
                      {t("ui.restart")}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* 警徽竞选报名 */}
              {showBadgeSignup && (
                <motion.div
                  key="badge-signup"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="text-lg leading-relaxed text-[var(--text-primary)]">
                    {t("dialog.badgeSignup.question")}
                  </div>
                  <div className={`flex items-center justify-end gap-3 mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                    <button
                      onClick={() => onBadgeSignup?.(false)}
                      className="wc-action-btn text-sm h-9 px-4"
                      type="button"
                    >
                      {t("dialog.badgeSignup.skip")}
                    </button>
                    <button
                      onClick={() => onBadgeSignup?.(true)}
                      className="wc-action-btn wc-action-btn--primary text-sm h-9 px-4"
                      type="button"
                    >
                      {t("dialog.badgeSignup.join")}
                      <CaretRight size={14} weight="bold" />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Badge signup waiting hint */}
              {showBadgeSignupWaiting && (
                <motion.div
                  key="badge-signup-waiting"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="text-lg leading-relaxed text-[var(--text-primary)]">
                    {t("dialog.badgeSignupWaiting")}
                  </div>
                </motion.div>
              )}
              
              {/* 警长移交警徽 - 撕毁选项 */}
              {showBadgeTransferOption && (
                <motion.div
                  key="badge-tear-option"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <div className={`text-center p-4 rounded-lg ${isNight ? "bg-yellow-500/10 border border-yellow-500/20" : "bg-yellow-50 border border-yellow-200"}`}>
                    <div className={`text-lg font-medium mb-2 ${isNight ? "text-yellow-300" : "text-yellow-700"}`}>
                      {t("dialog.badgeTransfer.title")}
                    </div>
                    <div className={`text-sm ${isNight ? "text-yellow-200/80" : "text-yellow-600"}`}>
                      {t("dialog.badgeTransfer.description")}
                    </div>
                  </div>
                  
                  <div className={`text-center text-sm ${isNight ? "text-white/60" : "text-gray-500"}`}>
                    {t("dialog.badgeTransfer.hint")}
                  </div>
                  
                  <div className={`flex items-center justify-center pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                    <button
                      onClick={() => onConfirmAction?.()}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isNight 
                          ? "bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30" 
                          : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                      }`}
                      type="button"
                    >
                      <Prohibit size={18} weight="bold" />
                      {t("dialog.badgeTransfer.tear")}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* 行动提示 */}
              {(() => {
                // 警长投票阶段，候选人不参与投票
                const badgeCandidates = gameState.badge.candidates || [];
                const humanIsCandidate = humanPlayer && badgeCandidates.includes(humanPlayer.seat);

                const isCorrectRoleForPhase =
                  (phase === "DAY_VOTE" && humanPlayer?.alive) ||
                  (phase === "DAY_BADGE_ELECTION" && humanPlayer?.alive && !humanIsCandidate) ||
                  (phase === "NIGHT_SEER_ACTION" && humanPlayer?.role === "Seer" && humanPlayer?.alive) ||
                  (phase === "NIGHT_WOLF_ACTION" && humanPlayer?.role === "Werewolf" && humanPlayer?.alive) ||
                  (phase === "NIGHT_GUARD_ACTION" && humanPlayer?.role === "Guard" && humanPlayer?.alive) ||
                  (phase === "HUNTER_SHOOT" && humanPlayer?.role === "Hunter") ||
                  (phase === "BADGE_TRANSFER" && humanPlayer && gameState.badge.holderSeat === humanPlayer.seat);

                const shouldShowHint =
                  isCorrectRoleForPhase &&
                  selectedSeat === null &&
                  phase !== "BADGE_TRANSFER" &&
                  (phase === "DAY_VOTE" || phase === "DAY_BADGE_ELECTION" || !isWaitingForAI);

                if (!shouldShowHint) return null;

                return null;
              })()}

              {/* 选择确认面板 - 文字形式 */}
              {(() => {
                if (!showActionConfirm || selectedSeat === null) return null;

                const targetPlayer = gameState.players.find(p => p.seat === selectedSeat);
                const targetName = targetPlayer ? t("ui.seatWithName", { seat: selectedSeat + 1, name: targetPlayer.displayName }) : t("ui.seatOnly", { seat: selectedSeat + 1 });

                const actionTextMap: Record<string, string> = {
                  DAY_VOTE: t("dialog.action.vote"),
                  DAY_BADGE_ELECTION: t("dialog.action.badgeVote"),
                  NIGHT_SEER_ACTION: t("dialog.action.seerCheck"),
                  NIGHT_WOLF_ACTION: t("dialog.action.wolfKill"),
                  NIGHT_GUARD_ACTION: t("dialog.action.guardProtect"),
                  HUNTER_SHOOT: t("dialog.action.hunterShoot"),
                  BADGE_TRANSFER: t("dialog.action.badgeTransfer"),
                };

                const actionColorMap: Record<string, string> = {
                  DAY_VOTE: isNight ? "text-[var(--color-accent-light)]" : "text-[var(--color-accent)]",
                  DAY_BADGE_ELECTION: isNight ? "text-[var(--color-accent-light)]" : "text-[var(--color-accent)]",
                  NIGHT_SEER_ACTION: "text-[var(--color-seer)]",
                  NIGHT_WOLF_ACTION: "text-[var(--color-danger)]",
                  NIGHT_GUARD_ACTION: "text-[var(--color-success)]",
                  HUNTER_SHOOT: "text-[var(--color-warning)]",
                  BADGE_TRANSFER: "text-[var(--color-warning)]",
                };

                const actionText = actionTextMap[phase] || t("dialog.action.select");
                const actionColor = actionColorMap[phase] || "text-[var(--color-accent)]";

                return (
                  <motion.div
                    key="action-confirm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <div className="text-lg leading-relaxed text-[var(--text-primary)]">
                      {t("dialog.actionConfirmQuestion", { action: actionText })} <span className={`font-semibold ${actionColor}`}>{targetName}</span>
                    </div>
                    <div className={`flex items-center justify-end gap-3 mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                      <button
                        onClick={onCancelSelection}
                        className="wc-action-btn text-sm h-9 px-4"
                        type="button"
                      >
                        <X size={14} weight="bold" />
                        {t("dialog.cancel")}
                      </button>
                      <button
                        onClick={onConfirmAction}
                        className={`wc-action-btn text-sm h-9 px-4 ${phase.includes("WOLF") || phase === "HUNTER_SHOOT" ? "wc-action-btn--danger" : "wc-action-btn--primary"}`}
                        type="button"
                      >
                        {t("dialog.actionConfirm", { action: actionText })}
                        <CaretRight size={14} weight="bold" />
                      </button>
                    </div>
                  </motion.div>
                );
              })()}

              {/* 女巫行动面板 - 文字形式 */}
              {showWitchPanel && (
                selectedSeat !== null ? (
                  <motion.div
                    key="witch-poison-confirm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    {(() => {
                      if (gameState.roleAbilities.witchPoisonUsed) {
                        return (
                          <>
                            <div className="text-lg leading-relaxed text-[var(--text-primary)]">
                              {t("dialog.witch.poisonUsed")}
                            </div>
                            <div className={`flex items-center justify-end gap-3 mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                              <button
                                onClick={onCancelSelection}
                                className="wc-action-btn text-sm h-9 px-4"
                                type="button"
                              >
                                {t("dialog.back")}
                              </button>
                            </div>
                          </>
                        );
                      }
                      const targetPlayer = gameState.players.find(p => p.seat === selectedSeat);
                      const targetName = targetPlayer ? t("ui.seatWithName", { seat: selectedSeat + 1, name: targetPlayer.displayName }) : t("ui.seatOnly", { seat: selectedSeat + 1 });
                      return (
                        <>
                          <div className="text-lg leading-relaxed text-[var(--text-primary)]">
                            {t.rich("dialog.witch.confirmPoisonPrompt", {
                              target: targetName,
                              highlight: (chunks) => (
                                <span className="text-[var(--color-danger)] font-semibold">{chunks}</span>
                              ),
                            })}
                          </div>
                          <div className={`flex items-center justify-end gap-3 mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                            <button
                              onClick={() => onCancelSelection?.()}
                              className="wc-action-btn text-sm h-9 px-4"
                              type="button"
                            >
                              <X size={14} weight="bold" />
                              {t("dialog.cancel")}
                            </button>
                            <button
                              onClick={() => onNightAction?.(selectedSeat, "poison")}
                              className="wc-action-btn wc-action-btn--danger text-sm h-9 px-4"
                              type="button"
                            >
                              {t("dialog.confirmPoison")}
                              <CaretRight size={14} weight="bold" />
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </motion.div>
                ) : (
                  <motion.div
                    key="witch-actions"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    {(() => {
                      const wolfTarget = gameState.nightActions.wolfTarget;
                      const targetPlayer = wolfTarget !== undefined ? gameState.players.find(p => p.seat === wolfTarget) : null;
                      const targetName = targetPlayer ? t("ui.seatWithName", { seat: wolfTarget! + 1, name: targetPlayer.displayName }) : wolfTarget !== undefined ? t("ui.seatOnly", { seat: wolfTarget + 1 }) : null;
                      const healUsed = gameState.roleAbilities.witchHealUsed;
                      const poisonUsed = gameState.roleAbilities.witchPoisonUsed;

                      return (
                        <>
                          <div className="text-lg leading-relaxed text-[var(--text-primary)]">
                            {targetName ? (
                              <>
                                {t.rich("dialog.witch.attackedTonight", {
                                  target: targetName,
                                  highlight: (chunks) => (
                                    <span className="text-[var(--color-danger)] font-semibold">{chunks}</span>
                                  ),
                                })}
                                {healUsed ? (
                                  <span className="text-[var(--text-muted)]">{t("dialog.witch.healUsedNote")}</span>
                                ) : (
                                  <>
                                    <span className="mr-2">{t("dialog.witch.youCan")}</span>
                                    <button
                                      onClick={() => onNightAction?.(wolfTarget!, "save")}
                                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-[var(--color-success)] bg-[var(--color-success)]/10 text-[var(--color-success)] font-semibold cursor-pointer hover:bg-[var(--color-success)]/20 active:scale-[0.98] transition-all text-sm"
                                      type="button"
                                    >
                                      {t("dialog.witch.saveAction")}
                                    </button>
                                    <span className="ml-2">{t("dialog.witch.saveSuffix")}</span>
                                  </>
                                )}
                              </>
                            ) : (
                              <>{t("dialog.witch.noAttackTonight")}</>
                            )}
                            {!poisonUsed && <>{t("dialog.witch.poisonHintPrefix")}<span className="text-[var(--color-danger)] font-semibold">{t("dialog.witch.poisonLabel")}</span>{t("dialog.witch.poisonHintSuffix")}</>}
                            {poisonUsed && <span className="text-[var(--text-muted)]">{t("dialog.witch.poisonUsedNote")}</span>}
                          </div>
                          <div className={`flex items-center justify-end mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                            <button
                              onClick={() => onNightAction?.(0, "pass")}
                              className="wc-action-btn text-sm h-9 px-4"
                              type="button"
                            >
                              {t("dialog.witch.doNothing")}
                              <CaretRight size={14} weight="bold" />
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </motion.div>
                )
              )}

              {/* 模式1: 人类发言输入 */}
              {showHumanInput && (
                <motion.div
                  key="human-input"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-3"
                >
                  <div className="wc-input-box relative" style={{ minHeight: "112px", alignItems: "flex-start", padding: "14px 16px 56px" }}>
                    <MentionInput
                      key={`mention-input-${gameState.phase}-${gameState.currentSpeakerSeat}`}
                      value={inputText}
                      onChange={(t) => onInputChange?.(t)}
                      onSend={() => onSendMessage?.()}
                      onFinishSpeaking={onFinishSpeaking}
                      onVoiceHoldPrepare={() => {
                        voiceRecorderRef.current?.prepare();
                      }}
                      onVoiceHoldStart={() => {
                        voiceRecorderRef.current?.start();
                      }}
                      onVoiceHoldEnd={() => {
                        voiceRecorderRef.current?.stop();
                      }}
                      placeholder={gameState.phase === "DAY_LAST_WORDS" ? t("dialog.input.lastWordsPlaceholder") : t("dialog.input.defaultPlaceholder")}
                      isNight={isNight}
                      isGenshinMode={isGenshinMode}
                      players={gameState.players.filter((p) => p.alive)}
                    />
                    
                    {/* 底部按钮栏 - 在输入框内部右下角 */}
                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                      <VoiceRecorder
                        ref={voiceRecorderRef}
                        disabled={!isHumanTurn}
                        isNight={isNight}
                        onTranscript={(text) => {
                          const prev = String(inputText || "");
                          const next = prev.trim().length > 0 ? `${prev.trim()} ${text}` : text;
                          onInputChange?.(next);
                        }}
                      />

                      <button
                        onClick={onSendMessage}
                        disabled={!inputText?.trim()}
                        className="h-8 px-3 rounded text-xs font-medium bg-[var(--color-gold)] text-[#1a1614] hover:bg-[#d4b06a] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer"
                        title={t("dialog.input.send")}
                      >
                        <PaperPlaneTilt size={14} weight="fill" />
                        {t("dialog.input.send")}
                      </button>

                      <button
                        onClick={handleFinishSpeaking}
                        className="h-8 px-3 rounded text-xs font-medium border border-[var(--color-gold)]/50 text-[var(--color-gold)] bg-transparent hover:bg-[var(--color-gold)]/10 transition-all flex items-center gap-1.5 cursor-pointer"
                        title={t("dialog.input.finishSpeech")}
                      >
                        <CheckCircle size={14} weight="fill" />
                        {t("dialog.input.finishSpeech")}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* 模式2: AI/系统对话显示 */}
              {showDialogueBlock && (
                <motion.div
                  key={`dialogue-${currentSpeaker?.player?.playerId || 'waiting'}-${gameState.currentSpeakerSeat ?? 'none'}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="cursor-pointer flex flex-col min-h-0 h-full"
                  onClick={handleAdvance}
                >
                    {currentSpeaker?.player && (
                      <>
                        <div className="md:hidden flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-black/10">
                            <img
                              src={getPlayerAvatarUrl(currentSpeaker.player, isGenshinMode)}
                              alt={currentSpeaker.player.displayName}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="text-sm font-semibold text-[var(--color-gold)]">
                            {currentSpeaker.player.displayName}
                          </div>
                        </div>
                        <div className="hidden md:block text-base font-bold text-[var(--color-gold)] mb-2 font-serif tracking-wide">
                          {currentSpeaker.player.displayName}
                        </div>
                      </>
                    )}
                    
                    {/* 对话内容 - 带玩家标签，逐字输入效果，文字调大 */}
                    <div className="text-xl leading-relaxed text-[var(--text-primary)] flex-1 pr-1 whitespace-pre-wrap break-words">
                      {isTyping ? (
                        renderPlayerMentions(
                          waitingForNextRound ? t("dialog.nextRoundHint") : dialogueText,
                          gameState.players,
                          isNight,
                          isGenshinMode
                        )
                      ) : (
                        <MentionsMarkdown
                          content={waitingForNextRound ? t("dialog.nextRoundHint") : dialogueText}
                          players={gameState.players}
                          isNight={isNight}
                          isGenshinMode={isGenshinMode}
                        />
                      )}
                      {isTyping && <span className="wc-typing-cursor"></span>}
                    </div>
                  
                  {/* 底部信息栏 */}
                  <div className={`flex items-center justify-between mt-4 pt-3 border-t min-h-7 ${isNight ? "border-white/10" : "border-black/5"}`}> 
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      {isTyping ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          <span>{t("dialog.speaking")}</span>
                        </>
                      ) : null}
                    </div>
                    <div className="h-7 flex items-center justify-end">
                      <AnimatePresence initial={false}>
                        {!isTyping && needsManualContinue ? (
                          <motion.div
                            key="enter-hint"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            className={`flex items-center gap-1.5 text-xs ${isNight ? "text-white/70" : "text-[var(--text-secondary)]"}`}
                          >
                            <span>{t("dialog.advanceHintPrefix")}</span>
                            <kbd className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[11px] ${
                              isNight
                                ? "bg-white/10 border-white/20 text-white/80"
                                : "bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)]"
                            }`}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 10 4 15 9 20" />
                                <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                              </svg>
                              Enter
                            </kbd>
                            <span>{t("dialog.advanceHintSuffix")}</span>
                          </motion.div>
                        ) : (
                          <div key="placeholder" className="h-7" />
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* 模式3: 夜晚等待状态 - 有趣动画 */}
              {showNightWaiting && (
                <motion.div
                  key="night-waiting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <NightActionStatus phase={gameState.phase} humanRole={humanPlayer?.role} />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}

// 聊天消息组件
function ChatMessageItem({ 
  msg, 
  players, 
  humanPlayerId,
  showDivider = false,
  isNight = false,
  isGenshinMode = false,
}: { 
  msg: ChatMessage; 
  players: Player[];
  humanPlayerId?: string;
  showDivider?: boolean;
  isNight?: boolean;
  isGenshinMode?: boolean;
}) {
  const t = useTranslations();
  const player = players.find(p => p.playerId === msg.playerId);
  const isHuman = msg.playerId === humanPlayerId;
  const isPlayerReady = player ? (player.isHuman ? !!player.displayName?.trim() : !!player.agentProfile?.persona) : false;
  const isSystem = msg.isSystem;

  if (isSystem) {
    // 检查是否是投票结果消息
    if (msg.content.startsWith('[VOTE_RESULT]')) {
      try {
        const jsonData = msg.content.substring('[VOTE_RESULT]'.length);
        const voteData = JSON.parse(jsonData);
        return (
          <VoteResultCard
            title={voteData.title}
            results={voteData.results}
            players={players}
            isNight={isNight}
            isGenshinMode={isGenshinMode}
          />
        );
      } catch (e) {
        console.error('Failed to parse vote result:', e);
      }
    }
    
    return (
      <div className="flex justify-center my-3">
        <div className="text-xs text-center py-2 px-4 rounded-lg border text-[var(--text-secondary)] bg-[var(--glass-bg-weak)] border-[var(--glass-border)]">
          <MentionsMarkdown
            content={msg.content}
            players={players}
            isNight={isNight}
            isGenshinMode={isGenshinMode}
            className="text-center"
          />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 不同用户之间的分割线 */}
      {showDivider && (
        <div className={cn(
          "my-4 border-t",
          isNight ? "border-white/10" : "border-black/8"
        )} />
      )}
      <div className={cn(
        "wc-history-item flex items-start gap-3",
        isHuman ? "wc-history-item--highlight flex-row-reverse" : "",
        showDivider ? "mt-3" : "mt-2"
      )}>
        <div className={cn(
          "w-8 h-8 rounded-full overflow-hidden shrink-0 border shadow-sm",
          isNight ? "border-white/20" : "border-[var(--border-color)]"
        )}>
          {player && isPlayerReady ? (
            <img
              src={getPlayerAvatarUrl(player, isGenshinMode)}
              alt={msg.playerName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-black/10" aria-hidden="true" />
          )}
        </div>
        
        <div className={cn(
          "min-w-0 max-w-[80%] w-fit text-left",
          isHuman ? "mr-0" : "ml-0"
        )}>
          <div className={cn("flex items-center gap-2 mb-1 text-xs opacity-70")}>
            {player && (
              <span className="wc-seat-badge">
                {t("ui.seatOnly", { seat: player.seat + 1 })}
              </span>
            )}
            <span className="font-serif font-bold text-[var(--text-primary)]">{msg.playerName}</span>
          </div>
          
          <div className="text-base leading-relaxed text-[var(--text-primary)] text-left">
            <MentionsMarkdown
              content={msg.content}
              players={players}
              isNight={isNight}
              isGenshinMode={isGenshinMode}
            />
          </div>
        </div>
      </div>
    </>
  );
}
