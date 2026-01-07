"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatCircleDots, PaperPlaneTilt, CheckCircle, MoonStars, Eye, Drop, Shield, Crosshair, Skull, X, ArrowClockwise, CaretRight } from "@phosphor-icons/react";
import { WerewolfIcon, VillagerIcon, VoteIcon } from "@/components/icons/FlatIcons";
import { VotingProgress } from "./VotingProgress";
import { WolfPlanningPanel } from "./WolfPlanningPanel";
import type { GameState, Player, ChatMessage, Phase } from "@/types/game";

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

// 将消息中的"X号"渲染为小标签
function renderPlayerMentions(text: string, players: Player[], isNight: boolean = false): React.ReactNode {
  // 匹配 1-10号 的模式
  const regex = /(\d{1,2})号/g;
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
          className={`inline-flex items-center gap-1 px-1.5 py-px mx-0.5 rounded text-[0.85em] font-medium ${
            isNight
              ? "bg-white/5 border border-white/10"
              : "bg-[var(--bg-secondary)] border border-[var(--border-color)]/50"
          }`}
        >
          <img
            src={dicebearUrl(player.playerId)}
            alt={player.displayName}
            className="w-3.5 h-3.5 rounded-full"
          />
          <span className={isNight ? "text-[#f0e6d2]" : "text-[var(--text-primary)]"}>{seatNum}号 {player.displayName}</span>
        </span>
      );
    } else {
      // 没找到对应玩家，保持原样
      parts.push(
        <span
          key={`${match.index}-${seatNum}`}
          className={`inline-flex items-center px-1.5 py-px mx-0.5 rounded text-[0.85em] font-medium ${
            isNight
              ? "bg-white/5 border border-white/10 text-[#f0e6d2]"
              : "bg-[var(--bg-secondary)] border border-[var(--border-color)]/50 text-[var(--text-primary)]"
          }`}
        >
          {seatNum}号
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
function NightActionStatus({ phase, humanRole }: { phase: string; humanRole?: string }) {
  const getStatusInfo = () => {
    switch (phase) {
      case "NIGHT_GUARD_ACTION":
        return { icon: Shield, text: "守卫请睁眼", color: "text-emerald-500" };
      case "NIGHT_WOLF_ACTION":
        return { icon: WerewolfIcon, text: "狼人请睁眼", color: "text-red-500" };
      case "NIGHT_WITCH_ACTION":
        return { icon: Drop, text: "女巫请睁眼", color: "text-purple-500" };
      case "NIGHT_SEER_ACTION":
        return { icon: Eye, text: "预言家请睁眼", color: "text-blue-500" };
      case "HUNTER_SHOOT":
        return { icon: Crosshair, text: "猎人发动技能", color: "text-orange-500" };
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
  onRestart,
}: DialogAreaProps) {
  const phase = gameState.phase;
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

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
  }, [currentDialogue, displayedText, visibleMessages, gameState.players]);

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

  return (
    <div className="h-full w-full flex flex-col overflow-hidden pb-16">
      {/* 上方区域：左侧发言者 + 右侧历史记录 */}
      <div className="flex-1 flex gap-4 p-4 min-h-0">
        {/* 左侧：当前发言者 - Visual Novel 风格大立绘 */}
        <div className="w-[260px] shrink-0 flex flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            {currentSpeaker?.player ? (
              <motion.div
                key={currentSpeaker.player.playerId}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.4, type: "spring" }}
                className="flex flex-col items-center text-center"
              >
                {/* 大头像 + 光晕效果 */}
                <div className="relative mb-5">
                  {/* 光晕背景 */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-[var(--color-accent)]/20 to-transparent rounded-full blur-2xl scale-150 animate-pulse" />
                  
                  <div className={`relative w-36 h-36 rounded-full overflow-hidden border-4 shadow-xl ${isNight ? "border-white/20" : "border-white/50"}`}>
                    <img
                      src={dicebearUrl(currentSpeaker.player.playerId)}
                      alt={currentSpeaker.player.displayName}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  
                  {/* 座位号标签 */}
                  <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 text-sm font-bold px-3 py-1 rounded shadow-lg ${isNight ? "bg-[#1a1512] text-[#f0e6d2] border border-[#3e2723]" : "bg-slate-800 text-white"}`}>
                    {currentSpeaker.player.seat + 1}号
                  </div>
                </div>
                
                {/* 名字 */}
                <h3 className="text-2xl font-black tracking-tight text-[var(--text-primary)] mb-1">
                  {currentSpeaker.player.displayName}
                </h3>
                
                {/* 发言状态 - 只有当 currentDialogue 为 null 时才显示"发言完毕" */}
                <p className="text-sm font-medium text-[var(--text-muted)]">
                  {isHumanTurn
                    ? "你的回合"
                    : currentDialogue
                      ? "发言中..."
                      : "说完了"}
                </p>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center text-center text-[var(--text-muted)]"
              >
                <div className={`w-36 h-36 rounded-full flex items-center justify-center border-4 ${
                  isNight
                    ? "bg-[#14100e] border-white/10"
                    : "bg-[var(--bg-secondary)] border-[var(--border-color)]"
                }`}>
                  {isNight ? (
                    <MoonStars size={48} className="opacity-35 text-[#f0e6d2]" />
                  ) : (
                    <ChatCircleDots size={48} className="opacity-30" />
                  )}
                </div>
                <p className={`mt-4 text-sm opacity-60 ${isNight ? "text-white/60" : ""}`}>等下一位...</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 右侧：聊天历史记录 */}
        <div 
          ref={historyRef}
          className="flex-1 overflow-y-auto min-w-0"
        >
          {visibleMessages.map((msg, index) => {
            const prevMsg = visibleMessages[index - 1];
            const showDivider = index > 0 && !msg.isSystem && !prevMsg?.isSystem && prevMsg?.playerId !== msg.playerId;
            return (
              <ChatMessageItem 
                key={msg.id} 
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

      {/* 下方：Glass Panel 对话框 */}
      <div className="shrink-0 p-4 pt-0 pb-6">
        {/* 投票进度 */}
        {gameState.phase === "DAY_VOTE" && (
          <div className="mb-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-3">
            <div className="text-sm font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-[var(--color-accent)] rounded-full animate-pulse" />
              投票进行中
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

        {/* Glass Panel - 统一的对话容器 */}
        <div 
          className="glass-panel rounded-2xl p-5 relative overflow-hidden"
          style={{
            background: isNight ? "rgba(20, 16, 14, 0.65)" : "rgba(255, 255, 255, 0.65)",
            backdropFilter: 'blur(12px)',
            border: isNight ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255, 255, 255, 0.5)",
          }}
        >
          {/* 装饰性引号 */}
          <div className="absolute top-3 left-4 text-6xl opacity-5 pointer-events-none select-none">"""</div>
          
          <div className="relative z-10">
            <AnimatePresence mode="wait">
              {/* 游戏结束 - 文字形式 */}
              {phase === "GAME_END" && (
                <motion.div
                  key="game-end"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className={`text-xl leading-relaxed ${isNight ? "text-[#f0e6d2]" : "text-[var(--text-primary)]"}`}>
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
                      className={`text-sm font-semibold transition-colors cursor-pointer hover:underline underline-offset-2 ${
                        isNight ? "text-[var(--color-accent-light)] hover:text-[var(--color-accent)]" : "text-[var(--color-accent)] hover:text-[var(--color-accent-dark)]"
                      }`}
                    >
                      再来一局 →
                    </button>
                  </div>
                </motion.div>
              )}

              {/* 选择确认面板 - 文字形式 */}
              {(() => {
                const isCorrectRoleForPhase = 
                  (phase === "DAY_VOTE" && humanPlayer?.alive) ||
                  (phase === "NIGHT_SEER_ACTION" && humanPlayer?.role === "Seer" && humanPlayer?.alive) ||
                  (phase === "NIGHT_WOLF_ACTION" && humanPlayer?.role === "Werewolf" && humanPlayer?.alive) ||
                  (phase === "NIGHT_GUARD_ACTION" && humanPlayer?.role === "Guard" && humanPlayer?.alive) ||
                  (phase === "HUNTER_SHOOT" && humanPlayer?.role === "Hunter");

                if (
                  isCorrectRoleForPhase &&
                  selectedSeat !== null &&
                  (phase === "DAY_VOTE" || !isWaitingForAI)
                ) {
                  const targetPlayer = gameState.players.find(p => p.seat === selectedSeat);
                  const targetName = targetPlayer ? `${selectedSeat + 1}号 ${targetPlayer.displayName}` : `${selectedSeat + 1}号`;
                  
                  const actionText = {
                    DAY_VOTE: "投票给",
                    NIGHT_SEER_ACTION: "查验",
                    NIGHT_WOLF_ACTION: "击杀",
                    NIGHT_GUARD_ACTION: "守护",
                    HUNTER_SHOOT: "射击",
                  }[phase] || "选择";

                  const actionColor = {
                    DAY_VOTE: isNight ? "text-[var(--color-accent-light)]" : "text-[var(--color-accent)]",
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
                      <div className={`text-xl leading-relaxed ${isNight ? "text-[#f0e6d2]" : "text-[var(--text-primary)]"}`}>
                        你选择{actionText} <span className={`font-semibold ${actionColor}`}>{targetName}</span>，确定吗？
                      </div>
                      <div className={`flex items-center justify-end gap-4 mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                        <button
                          onClick={onCancelSelection}
                          className={`text-sm font-medium transition-colors cursor-pointer hover:underline underline-offset-2 ${
                            isNight ? "text-white/60 hover:text-white/80" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          取消
                        </button>
                        <button
                          onClick={onConfirmAction}
                          className={`text-sm font-semibold transition-colors cursor-pointer hover:underline underline-offset-2 ${actionColor}`}
                        >
                          确认{actionText} →
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
                      const targetPlayer = gameState.players.find(p => p.seat === selectedSeat);
                      const targetName = targetPlayer ? `${selectedSeat + 1}号 ${targetPlayer.displayName}` : `${selectedSeat + 1}号`;
                      return (
                        <>
                          <div className={`text-xl leading-relaxed ${isNight ? "text-[#f0e6d2]" : "text-[var(--text-primary)]"}`}>
                            你选择对 <span className="text-[var(--color-danger)] font-semibold">{targetName}</span> 使用毒药，确定吗？
                          </div>
                          <div className={`flex items-center justify-end gap-4 mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                            <button
                              onClick={onCancelSelection}
                              className={`text-sm font-medium transition-colors cursor-pointer hover:underline underline-offset-2 ${
                                isNight ? "text-white/60 hover:text-white/80" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                              }`}
                            >
                              取消
                            </button>
                            <button
                              onClick={() => onNightAction?.(selectedSeat, "poison")}
                              disabled={gameState.roleAbilities.witchPoisonUsed}
                              className="text-sm font-semibold text-[var(--color-danger)] transition-colors cursor-pointer hover:underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                            >
                              确认毒杀 →
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
                          <div className={`text-xl leading-relaxed ${isNight ? "text-[#f0e6d2]" : "text-[var(--text-primary)]"}`}>
                            {targetName ? (
                              <>
                                今晚 <span className="text-[var(--color-danger)] font-semibold">{targetName}</span> 被狼人袭击。
                                {healUsed ? (
                                  <span className="text-[var(--text-muted)]">（解药已用尽）</span>
                                ) : (
                                  <>你可以选择 <button onClick={() => onNightAction?.(wolfTarget!, "save")} className="text-[var(--color-success)] font-semibold cursor-pointer hover:underline underline-offset-2 transition-colors">救他</button>。</>
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
                              className={`text-sm font-semibold transition-colors cursor-pointer hover:underline underline-offset-2 ${
                                isNight ? "text-white/70 hover:text-white/90" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                              }`}
                            >
                              什么都不做 →
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </motion.div>
                )
              )}

              {/* 模式1: 人类发言输入 */}
              {isHumanTurn && phase !== "GAME_END" && (
                <motion.div
                  key="human-input"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
                    <span>说点什么吧</span>
                  </div>
                  
                  <div className="flex items-stretch gap-3">
                    <div className="relative flex-1">
                      <textarea
                        value={inputText}
                        onChange={(e) => onInputChange?.(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            onSendMessage?.();
                          }
                        }}
                        placeholder={gameState.phase === "DAY_LAST_WORDS" ? "有什么想说的？" : "你怎么看？"}
                        className={`w-full min-h-[72px] max-h-[160px] px-4 py-3 pr-14 pb-10 text-base border rounded-xl focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 transition-all resize-none ${
                          isNight
                            ? "bg-white/5 text-[#f0e6d2] border-white/10 placeholder:text-white/35"
                            : "bg-white/50 text-[var(--text-primary)] border-[var(--border-color)]/30"
                        }`}
                        autoFocus
                      />

                      <button
                        onClick={onSendMessage}
                        disabled={!inputText?.trim()}
                        className="absolute right-3 bottom-3 w-10 h-10 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center cursor-pointer hover:bg-[#a07608] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-[var(--color-accent)]/20"
                        title="发送"
                      >
                        <PaperPlaneTilt size={18} weight="fill" />
                      </button>
                    </div>

                    <button
                      onClick={onFinishSpeaking}
                      className={`min-w-[108px] min-h-[72px] rounded-xl px-4 flex items-center justify-center gap-2 font-semibold transition-all cursor-pointer ${
                        isNight
                          ? "bg-white/10 text-white/80 hover:bg-white/15"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                      title="结束发言"
                    >
                      <CheckCircle size={18} weight="fill" />
                      <span className="text-sm">结束</span>
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>Enter 发送</span>
                    <span>说完了点 ✓</span>
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
                  {/* 对话内容 - 带玩家标签，增大字体 */}
                  <div className={`text-xl leading-relaxed ${isNight ? "text-[#f0e6d2]" : "text-[var(--text-primary)]"}`}>
                    {renderPlayerMentions(
                      displayedText || currentSpeaker?.text || (waitingForNextRound ? "点击继续下一位发言" : "..."),
                      gameState.players,
                      isNight
                    )}
                  </div>
                  
                  {/* 底部信息栏 */}
                  <div className={`flex items-center justify-between mt-4 pt-3 border-t ${isNight ? "border-white/10" : "border-black/5"}`}>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      {isTyping ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          <span>正在发言...</span>
                        </>
                      ) : (
                        <span>{visibleMessages.length} 条消息</span>
                      )}
                    </div>
                    {isSpeechPhase && (
                      <button
                        className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--color-accent)] uppercase tracking-wider transition-colors flex items-center gap-1 cursor-pointer active:translate-y-[1px]"
                        onClick={onAdvanceDialogue}
                        type="button"
                      >
                        {waitingForNextRound ? "下一位" : currentDialogue ? "继续" : "OK"} →
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
                  <NightActionStatus phase={gameState.phase} humanRole={humanPlayer?.role} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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
        <div className={`text-xs text-center py-2 px-4 rounded-lg border ${
          isNight
            ? "text-white/70 bg-white/5 border-white/10"
            : "text-[var(--text-muted)] bg-[var(--bg-secondary)] border-[var(--border-color)]/30"
        }`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <>
      {showDivider && <div className="w-full h-px bg-[var(--border-color)]/50 my-3" />}
      <div className={`flex items-start gap-2.5 py-2 ${isHuman ? 'flex-row-reverse' : ''}`}>
        <div className={`w-9 h-9 rounded-full overflow-hidden shrink-0 border shadow-sm ${isNight ? "border-white/20" : "border-white/50"}`}>
          <img src={dicebearUrl(msg.playerId)} alt={msg.playerName} className="w-full h-full" />
        </div>
        <div className={`flex-1 min-w-0 ${isHuman ? 'text-right' : ''}`}>
          <div className={`flex items-center gap-1.5 mb-1 text-xs ${isHuman ? 'justify-end' : ''}`}>
            {player && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${
                  isNight
                    ? "bg-white/5 border-white/10 text-white/60"
                    : "bg-[var(--bg-secondary)] border-[var(--border-color)]/50 text-[var(--text-muted)]"
                }`}
              >
                {player.seat + 1}号
              </span>
            )}
            <span className={`font-medium ${isNight ? "text-white/80" : "text-[var(--text-primary)]"}`}>{msg.playerName}</span>
            {isHuman && <span className="text-[9px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded">YOU</span>}
          </div>
          <div className={`inline-block max-w-full px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${isHuman ? 'bg-[var(--color-accent)] text-white rounded-tr-none' : isNight ? 'bg-[#1a1512] text-[#f0e6d2] border border-[#3e2723] rounded-tl-none' : 'bg-white text-[var(--text-primary)] border border-[var(--border-color)]/30 rounded-tl-none'}`}>
            {renderPlayerMentions(msg.content, players, isNight)}
          </div>
        </div>
      </div>
    </>
  );
}
