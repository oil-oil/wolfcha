"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatCircleDots, PaperPlaneTilt, CheckCircle, MoonStars, Eye, Drop, Shield, Crosshair, Skull, X, ArrowClockwise, CaretRight, UserCircle } from "@phosphor-icons/react";
import { WerewolfIcon, VillagerIcon, VoteIcon } from "@/components/icons/FlatIcons";
import { VotingProgress } from "./VotingProgress";
import { WolfPlanningPanel } from "./WolfPlanningPanel";
import { MentionInput } from "./MentionInput";
import { TalkingAvatar } from "./TalkingAvatar";
import type { GameState, Player, ChatMessage, Phase } from "@/types/game";
import { cn } from "@/lib/utils";

type WitchActionType = "save" | "poison" | "pass";
import type { DialogueState } from "@/store/game-machine";

// Avatar colors
const avatarBgColors = [
  'e8d5c4', 'd4e5d7', 'd5dce8', 'e8d4d9', 'ddd4e8',
  'd4e8e5', 'e8e4d4', 'd4d8e8', 'e5d4d4', 'dae8d4',
];

const getPlayerBgColor = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarBgColors[Math.abs(hash) % avatarBgColors.length];
};

const dicebearUrl = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${getPlayerBgColor(seed)}`;

function isTurnPromptSystemMessage(content: string) {
  return content.includes("轮到你发言") || content.includes("轮到你发表遗言");
}

// 将消息中的"@X号 玩家名"或"X号"渲染为小标签
function renderPlayerMentions(text: string, players: Player[], isNight: boolean = false): React.ReactNode {
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
      parts.push(
        <span
          key={`${match.index}-${seatNum}`}
          className={`inline-flex items-center gap-1 mx-0.5 align-baseline text-[0.85em] font-semibold ${
            isNight
              ? "text-[var(--color-accent-light)]"
              : "text-[var(--color-accent)]"
          }`}
        >
          <img
            src={dicebearUrl(player.playerId)}
            alt={player.displayName}
            className="w-4 h-4 rounded-full"
          />
          <span className={isNight ? "text-[var(--color-accent-light)]" : "text-[var(--color-accent)]"}>@{seatNum}号</span>
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
          @{seatNum}号
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

interface DialogAreaProps {
  gameState: GameState;
  humanPlayer: Player | null;
  isNight?: boolean;
  currentDialogue: DialogueState | null;
  displayedText: string;
  isTyping: boolean;
  showFullHistory?: boolean;
  onAdvanceDialogue?: () => void;
  isHumanTurn?: boolean; // 是否轮到人类发言
  waitingForNextRound?: boolean; // 是否等待下一轮
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

// 等待状态动画组件 - 波浪点动画
function WaitingDots() {
  return (
    <span className="inline-flex items-center gap-1 ml-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-current"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

// 夜晚行动状态组件 - 带有神秘氛围
function NightActionStatus({ phase, humanRole, isHumanTurn }: { phase: string; humanRole?: string; isHumanTurn?: boolean }) {
  const getStatusInfo = () => {
    // 如果是人类玩家的回合，显示"请睁眼"；否则显示"正在行动"
    const isMyPhase = 
      (phase === "NIGHT_GUARD_ACTION" && humanRole === "Guard") ||
      (phase === "NIGHT_WOLF_ACTION" && humanRole === "Werewolf") ||
      (phase === "NIGHT_WITCH_ACTION" && humanRole === "Witch") ||
      (phase === "NIGHT_SEER_ACTION" && humanRole === "Seer") ||
      (phase === "HUNTER_SHOOT" && humanRole === "Hunter");
    
    switch (phase) {
      case "NIGHT_GUARD_ACTION":
        return { icon: Shield, text: isMyPhase ? "守卫请睁眼" : "守卫正在守护", color: "text-emerald-500" };
      case "NIGHT_WOLF_ACTION":
        return { icon: WerewolfIcon, text: isMyPhase ? "狼人请睁眼" : "狼人正在选择目标", color: "text-red-500" };
      case "NIGHT_WITCH_ACTION":
        return { icon: Drop, text: isMyPhase ? "女巫请睁眼" : "女巫正在行动", color: "text-purple-500" };
      case "NIGHT_SEER_ACTION":
        return { icon: Eye, text: isMyPhase ? "预言家请睁眼" : "预言家正在查验", color: "text-blue-500" };
      case "HUNTER_SHOOT":
        return { icon: Crosshair, text: isMyPhase ? "猎人发动技能" : "猎人正在开枪", color: "text-orange-500" };
      default:
        return { icon: MoonStars, text: "夜深了...", color: "text-indigo-400" };
    }
  };

  const { icon: Icon, text, color } = getStatusInfo();

  return (
    <div className="flex flex-col items-center justify-center py-6">
      {/* 神秘光球效果 */}
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
      
      {/* 状态文字 */}
      <div className={`flex items-center text-base font-medium ${color}`}>
        <span>{text}</span>
        <WaitingDots />
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
  currentDialogue,
  displayedText,
  isTyping,
  onAdvanceDialogue,
  isHumanTurn = false,
  waitingForNextRound = false,
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
  const phase = gameState.phase;
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const lastPortraitPlayerRef = useRef<Player | null>(null);

  const isSpeechPhase = gameState.phase === "DAY_SPEECH" || gameState.phase === "DAY_LAST_WORDS";

  const visibleMessages = useMemo(() => {
    return gameState.messages.filter(
      (m) => !(m.isSystem && isTurnPromptSystemMessage(m.content))
    );
  }, [gameState.messages]);

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

  // 自动滚动到底部
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [visibleMessages, displayedText]);

  // 空状态
  if (gameState.messages.length === 0 && !currentDialogue) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-[var(--text-muted)]">
        <WerewolfIcon size={48} className="mb-4 opacity-20" />
        <p className="text-sm opacity-60 font-serif">玩家们正在入场...</p>
      </div>
    );
  }

  // 获取角色中文名
  const getRoleName = (role?: string) => {
    switch (role) {
      case "Werewolf": return "狼人";
      case "Seer": return "预言家";
      case "Witch": return "女巫";
      case "Hunter": return "猎人";
      case "Guard": return "守卫";
      default: return "村民";
    }
  };

  return (
    <div className="h-full w-full flex flex-col min-h-0 justify-start">
      {/* 上方区域：左侧立绘 + 右侧历史记录 */}
      <div className="flex-1 min-h-0 w-full -mb-1">
        <div className="flex gap-4 lg:gap-6 px-4 lg:px-6 pt-2 lg:pt-3 pb-0 min-h-0 h-full items-stretch">
          {/* 左侧立绘区域 */}
          <div className="w-[220px] lg:w-[260px] xl:w-[300px] shrink-0 flex flex-col items-center justify-end">
          <AnimatePresence mode="sync">
            {stablePortraitPlayer ? (
              <motion.div
                key={stablePortraitPlayer.playerId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="relative flex flex-col items-center"
              >
                {/* 光晕效果 */}
                <div className="absolute bottom-[20%] left-1/2 -translate-x-1/2 w-40 h-40 bg-gradient-radial from-[var(--color-accent)]/20 via-transparent to-transparent rounded-full blur-2xl" />
                
                {/* 立绘图片 - 只在字幕播放中时有嘴型动画 */}
                <TalkingAvatar
                  seed={stablePortraitPlayer.playerId}
                  isTalking={isTyping}
                  alt={stablePortraitPlayer.displayName}
                  className="relative z-10 w-[220px] lg:w-[260px] xl:w-[300px] h-auto object-contain"
                  scale={120}
                  translateY={-5}
                />
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                className="flex items-center justify-center h-32"
              >
                {isNight ? (
                  <MoonStars size={64} className="opacity-20 text-[var(--text-primary)]" />
                ) : (
                  <ChatCircleDots size={64} className="opacity-15" />
                )}
              </motion.div>
            )}
          </AnimatePresence>
          </div>

          {/* 右侧：聊天历史记录 */}
          <div 
            ref={historyRef}
            className="flex-1 overflow-y-auto min-w-0 min-h-0 pb-4"
          >
          {visibleMessages.map((msg, index) => {
            const prevMsg = visibleMessages[index - 1];
            const showDivider = index > 0 && !msg.isSystem && !prevMsg?.isSystem && prevMsg?.playerId !== msg.playerId;
            return (
              <ChatMessageItem 
                key={msg.id || `${msg.playerId}:${msg.timestamp}:${index}`} 
                msg={msg} 
                players={gameState.players}
                humanPlayerId={humanPlayer?.playerId}
                showDivider={showDivider}
                isNight={isNight}
              />
            );
          })}
          </div>
        </div>
      </div>

      {/* 下方：对话框 - 向上移动 */}
      <div className="mt-auto shrink-0 px-4 lg:px-6 pb-0 pt-0 mb-[150px]">
        {/* 投票进度 */}
        {(gameState.phase === "DAY_VOTE" || gameState.phase === "DAY_BADGE_ELECTION") && (
          <div className="mb-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-3">
            <div className="text-sm font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-[var(--color-accent)] rounded-full animate-pulse" />
              {gameState.phase === "DAY_BADGE_ELECTION" ? "警徽评选进行中" : "投票进行中"}
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
        <div className="wc-panel wc-panel--strong rounded-xl p-5 relative">
          <AnimatePresence mode="wait">
              {/* 游戏结束 - 文字形式 */}
              {phase === "GAME_END" && (
                <motion.div
                  key="game-end"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="text-xl leading-relaxed text-[var(--text-primary)]">
                    {gameState.winner === "village" ? (
                      <>GG！<span className="text-[var(--color-success)] font-semibold">好人阵营</span>胜利！</>
                    ) : (
                      <>GG！<span className="text-[var(--color-wolf)] font-semibold">狼人阵营</span>胜利！</>
                    )}
                  </div>
                  <div className={`flex items-center justify-between mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                    <span className="text-xs text-[var(--text-muted)]">下次还来玩啊</span>
                    <button
                      onClick={onRestart}
                      className="wc-action-btn wc-action-btn--primary text-sm h-9 px-4"
                      type="button"
                    >
                      <ArrowClockwise size={14} weight="bold" />
                      再来一局
                    </button>
                  </div>
                </motion.div>
              )}

              {/* 警徽竞选报名 */}
              {phase === "DAY_BADGE_SIGNUP" && humanPlayer?.alive && typeof gameState.badge.signup?.[humanPlayer.playerId] !== "boolean" && (
                <motion.div
                  key="badge-signup"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="text-lg leading-relaxed text-[var(--text-primary)]">
                    你要竞选警长吗？
                  </div>
                  <div className={`flex items-center justify-end gap-3 mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                    <button
                      onClick={() => onBadgeSignup?.(false)}
                      className="wc-action-btn text-sm h-9 px-4"
                      type="button"
                    >
                      不竞选
                    </button>
                    <button
                      onClick={() => onBadgeSignup?.(true)}
                      className="wc-action-btn wc-action-btn--primary text-sm h-9 px-4"
                      type="button"
                    >
                      我要竞选
                      <CaretRight size={14} weight="bold" />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* 选择确认面板 - 文字形式 */}
              {(() => {
                const isCorrectRoleForPhase = 
                  (phase === "DAY_VOTE" && humanPlayer?.alive) ||
                  (phase === "DAY_BADGE_ELECTION" && humanPlayer?.alive) ||
                  (phase === "NIGHT_SEER_ACTION" && humanPlayer?.role === "Seer" && humanPlayer?.alive) ||
                  (phase === "NIGHT_WOLF_ACTION" && humanPlayer?.role === "Werewolf" && humanPlayer?.alive) ||
                  (phase === "NIGHT_GUARD_ACTION" && humanPlayer?.role === "Guard" && humanPlayer?.alive) ||
                  (phase === "HUNTER_SHOOT" && humanPlayer?.role === "Hunter");

                if (
                  isCorrectRoleForPhase &&
                  selectedSeat !== null &&
                  (phase === "DAY_VOTE" || phase === "DAY_BADGE_ELECTION" || !isWaitingForAI)
                ) {
                  const targetPlayer = gameState.players.find(p => p.seat === selectedSeat);
                  const targetName = targetPlayer ? `${selectedSeat + 1}号 ${targetPlayer.displayName}` : `${selectedSeat + 1}号`;
                  
                  const actionText = {
                    DAY_VOTE: "投票给",
                    DAY_BADGE_ELECTION: "把警徽投给",
                    NIGHT_SEER_ACTION: "查验",
                    NIGHT_WOLF_ACTION: "击杀",
                    NIGHT_GUARD_ACTION: "守护",
                    HUNTER_SHOOT: "射击",
                  }[phase] || "选择";

                  const actionColor = {
                    DAY_VOTE: isNight ? "text-[var(--color-accent-light)]" : "text-[var(--color-accent)]",
                    DAY_BADGE_ELECTION: isNight ? "text-[var(--color-accent-light)]" : "text-[var(--color-accent)]",
                    NIGHT_SEER_ACTION: "text-[var(--color-seer)]",
                    NIGHT_WOLF_ACTION: "text-[var(--color-danger)]",
                    NIGHT_GUARD_ACTION: "text-[var(--color-success)]",
                    HUNTER_SHOOT: "text-[var(--color-warning)]",
                  }[phase] || "text-[var(--color-accent)]";

                  return (
                    <motion.div
                      key="action-confirm"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <div className="text-lg leading-relaxed text-[var(--text-primary)]">
                        你选择{actionText} <span className={`font-semibold ${actionColor}`}>{targetName}</span>，确定吗？
                      </div>
                      <div className={`flex items-center justify-end gap-3 mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                        <button
                          onClick={onCancelSelection}
                          className="wc-action-btn text-sm h-9 px-4"
                          type="button"
                        >
                          <X size={14} weight="bold" />
                          取消
                        </button>
                        <button
                          onClick={onConfirmAction}
                          className={`wc-action-btn text-sm h-9 px-4 ${phase.includes("WOLF") || phase === "HUNTER_SHOOT" ? "wc-action-btn--danger" : "wc-action-btn--primary"}`}
                          type="button"
                        >
                          确认{actionText}
                          <CaretRight size={14} weight="bold" />
                        </button>
                      </div>
                    </motion.div>
                  );
                }
                return null;
              })()}

              {/* 女巫行动面板 - 文字形式 */}
              {phase === "NIGHT_WITCH_ACTION" && humanPlayer?.role === "Witch" && !isWaitingForAI && (
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
                              毒药已用尽。
                            </div>
                            <div className={`flex items-center justify-end gap-3 mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                              <button
                                onClick={onCancelSelection}
                                className="wc-action-btn text-sm h-9 px-4"
                                type="button"
                              >
                                返回
                              </button>
                            </div>
                          </>
                        );
                      }
                      const targetPlayer = gameState.players.find(p => p.seat === selectedSeat);
                      const targetName = targetPlayer ? `${selectedSeat + 1}号 ${targetPlayer.displayName}` : `${selectedSeat + 1}号`;
                      return (
                        <>
                          <div className="text-lg leading-relaxed text-[var(--text-primary)]">
                            你选择对 <span className="text-[var(--color-danger)] font-semibold">{targetName}</span> 使用毒药，确定吗？
                          </div>
                          <div className={`flex items-center justify-end gap-3 mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                            <button
                              onClick={onCancelSelection}
                              className="wc-action-btn text-sm h-9 px-4"
                              type="button"
                            >
                              <X size={14} weight="bold" />
                              取消
                            </button>
                            <button
                              onClick={() => onNightAction?.(selectedSeat, "poison")}
                              className="wc-action-btn wc-action-btn--danger text-sm h-9 px-4"
                              type="button"
                            >
                              确认毒杀
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
                      const targetName = targetPlayer ? `${wolfTarget! + 1}号 ${targetPlayer.displayName}` : wolfTarget !== undefined ? `${wolfTarget + 1}号` : null;
                      const healUsed = gameState.roleAbilities.witchHealUsed;
                      const poisonUsed = gameState.roleAbilities.witchPoisonUsed;

                      return (
                        <>
                          <div className="text-lg leading-relaxed text-[var(--text-primary)]">
                            {targetName ? (
                              <>
                                今晚 <span className="text-[var(--color-danger)] font-semibold">{targetName}</span> 被狼人袭击。
                                {healUsed ? (
                                  <span className="text-[var(--text-muted)]">（解药已用尽）</span>
                                ) : (
                                  <>
                                    <span className="mr-2">你可以</span>
                                    <button
                                      onClick={() => onNightAction?.(wolfTarget!, "save")}
                                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-[var(--color-success)] bg-[var(--color-success)]/10 text-[var(--color-success)] font-semibold cursor-pointer hover:bg-[var(--color-success)]/20 active:scale-[0.98] transition-all text-sm"
                                      type="button"
                                    >
                                      救他
                                    </button>
                                    <span className="ml-2">。</span>
                                  </>
                                )}
                              </>
                            ) : (
                              <>今晚无人被袭击。</>
                            )}
                            {!poisonUsed && <> 或者点击玩家头像使用<span className="text-[var(--color-danger)] font-semibold">毒药</span>。</>}
                            {poisonUsed && <span className="text-[var(--text-muted)]">（毒药已用尽）</span>}
                          </div>
                          <div className={`flex items-center justify-end mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                            <button
                              onClick={() => onNightAction?.(0, "pass")}
                              className="wc-action-btn text-sm h-9 px-4"
                              type="button"
                            >
                              什么都不做
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
              {isHumanTurn && phase !== "GAME_END" && phase !== "DAY_BADGE_SIGNUP" && (
                <motion.div
                  key="human-input"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-3"
                >
                  <div className="wc-input-box relative" style={{ minHeight: '112px', alignItems: 'flex-start', padding: '14px 16px' }}>
                    <MentionInput
                      key={`mention-input-${gameState.phase}-${gameState.currentSpeakerSeat}`}
                      value={inputText}
                      onChange={(t) => onInputChange?.(t)}
                      onSend={() => onSendMessage?.()}
                      onFinishSpeaking={onFinishSpeaking}
                      placeholder={gameState.phase === "DAY_LAST_WORDS" ? "有什么想说的？" : "你怎么看？"}
                      isNight={isNight}
                      players={gameState.players.filter((p) => p.alive)}
                    />
                    
                    {/* 底部按钮栏 - 在输入框内部右下角 */}
                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                      <button
                        onClick={onSendMessage}
                        disabled={!inputText?.trim()}
                        className="h-8 px-3 rounded text-xs font-medium border border-[var(--color-gold)]/50 text-[var(--color-gold)] bg-transparent hover:bg-[var(--color-gold)]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                        title="发送"
                      >
                        <PaperPlaneTilt size={14} weight="fill" />
                        Send
                      </button>

                      <button
                        onClick={onFinishSpeaking}
                        className="h-8 px-3 rounded text-xs font-medium bg-[var(--color-gold)] text-[#1a1614] hover:bg-[#d4b06a] transition-all flex items-center gap-1.5"
                        title="结束发言"
                      >
                        <CheckCircle size={14} weight="fill" />
                        Done
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* 模式2: AI/系统对话显示 */}
              {!isHumanTurn && (currentSpeaker || waitingForNextRound) && phase !== "GAME_END" && selectedSeat === null && !(phase === "NIGHT_WITCH_ACTION" && humanPlayer?.role === "Witch" && !isWaitingForAI) && (
                <motion.div
                  key="dialogue-display"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="cursor-pointer"
                  onClick={onAdvanceDialogue}
                >
                    {currentSpeaker?.player && (
                      <div className="text-base font-bold text-[var(--color-gold)] mb-2 font-serif tracking-wide">
                        {currentSpeaker.player.displayName}
                      </div>
                    )}
                    
                    {/* 对话内容 - 带玩家标签，逐字输入效果，文字调大 */}
                    <div className="text-xl leading-relaxed text-[var(--text-primary)]">
                      {renderPlayerMentions(
                        displayedText || currentSpeaker?.text || (waitingForNextRound ? "轻触继续，轮到下一位" : "..."),
                        gameState.players,
                        isNight
                      )}
                      {isTyping && <span className="wc-typing-cursor"></span>}
                    </div>
                  
                  {/* 底部信息栏 */}
                  <div className={`flex items-center justify-between mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      {isTyping ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          <span>正在陈述…</span>
                        </>
                      ) : (
                        <span>{visibleMessages.length} 条消息</span>
                      )}
                    </div>
                    {isSpeechPhase && (
                      <button
                        className="wc-action-btn text-xs h-7 px-3"
                        onClick={onAdvanceDialogue}
                        type="button"
                      >
                        {waitingForNextRound ? "下一位" : currentDialogue ? "继续" : "OK"}
                        <CaretRight size={12} weight="bold" />
                      </button>
                    )}
                  </div>
                </motion.div>
              )}

              {/* 模式3: 夜晚等待状态 - 有趣动画 */}
              {!isHumanTurn && !currentSpeaker && !waitingForNextRound && gameState.phase.includes("NIGHT") && phase !== "GAME_END" && selectedSeat === null && !(phase === "NIGHT_WITCH_ACTION" && humanPlayer?.role === "Witch" && !isWaitingForAI) && (
                <motion.div
                  key="night-waiting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <NightActionStatus phase={gameState.phase} humanRole={humanPlayer?.role} isHumanTurn={false} />
                </motion.div>
              )}
            </AnimatePresence>
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
}: { 
  msg: ChatMessage; 
  players: Player[];
  humanPlayerId?: string;
  showDivider?: boolean;
  isNight?: boolean;
}) {
  const player = players.find(p => p.playerId === msg.playerId);
  const isHuman = msg.playerId === humanPlayerId;
  const isSystem = msg.isSystem;

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <div className="text-xs text-center py-2 px-4 rounded-lg border text-[var(--text-secondary)] bg-[var(--glass-bg-weak)] border-[var(--glass-border)]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
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
        isHuman && "wc-history-item--highlight flex-row-reverse",
        showDivider ? "mt-3" : "mt-2"
      )}>
        <div className={cn(
          "w-8 h-8 rounded-full overflow-hidden shrink-0 border shadow-sm",
          isNight ? "border-white/20" : "border-[var(--border-color)]"
        )}>
          <img src={dicebearUrl(msg.playerId)} alt={msg.playerName} className="w-full h-full object-cover" />
        </div>
        
        <div className={cn("flex-1 min-w-0", isHuman && "text-right")}>
          <div className={cn("flex items-center gap-2 mb-1 text-xs opacity-70", isHuman && "justify-end")}>
            {player && (
              <span className="wc-seat-badge">
                {player.seat + 1}号
              </span>
            )}
            <span className="font-serif font-bold text-[var(--text-primary)]">{msg.playerName}</span>
          </div>
          
          <div className="text-base leading-relaxed text-[var(--text-primary)] break-words">
            {renderPlayerMentions(msg.content, players, isNight)}
          </div>
        </div>
      </div>
    </>
  );
}
