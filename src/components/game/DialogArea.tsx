"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatCircleDots, PaperPlaneTilt, CheckCircle, MoonStars, Eye, Drop, Shield, Crosshair } from "@phosphor-icons/react";
import { WerewolfIcon } from "@/components/icons/FlatIcons";
import { VotingProgress } from "./VotingProgress";
import { WolfPlanningPanel } from "./WolfPlanningPanel";
import type { GameState, Player, ChatMessage } from "@/types/game";
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
function renderPlayerMentions(text: string, players: Player[]): React.ReactNode {
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
          className="inline-flex items-center gap-1 px-1.5 py-px mx-0.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)]/50 text-[0.85em] font-medium"
        >
          <img
            src={dicebearUrl(player.playerId)}
            alt={player.displayName}
            className="w-3.5 h-3.5 rounded-full"
          />
          <span className="text-[var(--text-primary)]">{seatNum}号 {player.displayName}</span>
        </span>
      );
    } else {
      // 没找到对应玩家，保持原样
      parts.push(
        <span
          key={`${match.index}-${seatNum}`}
          className="inline-flex items-center px-1.5 py-px mx-0.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)]/50 text-[0.85em] font-medium text-[var(--text-primary)]"
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
        return { icon: Shield, text: "守卫正在决定保护谁", color: "text-emerald-500" };
      case "NIGHT_WOLF_ACTION":
        return { icon: WerewolfIcon, text: "狼人正在商议击杀目标", color: "text-red-500" };
      case "NIGHT_WITCH_ACTION":
        return { icon: Drop, text: "女巫正在决定是否用药", color: "text-purple-500" };
      case "NIGHT_SEER_ACTION":
        return { icon: Eye, text: "预言家正在查验身份", color: "text-blue-500" };
      case "HUNTER_SHOOT":
        return { icon: Crosshair, text: "猎人正在决定开枪目标", color: "text-orange-500" };
      default:
        return { icon: MoonStars, text: "夜晚行动中", color: "text-indigo-400" };
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
}: DialogAreaProps) {
  const historyRef = useRef<HTMLDivElement>(null);

  // 过滤掉轮次提示消息
  const visibleMessages = useMemo(() => {
    return gameState.messages.filter(
      (m) => !(m.isSystem && isTurnPromptSystemMessage(m.content))
    );
  }, [gameState.messages]);

  // 获取当前发言者信息
  const currentSpeaker = useMemo(() => {
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
        <p className="text-sm opacity-60 font-serif">等待游戏开始...</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
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
                  
                  <div className="relative w-36 h-36 rounded-full overflow-hidden border-4 border-white/50 shadow-xl">
                    <img
                      src={dicebearUrl(currentSpeaker.player.playerId)}
                      alt={currentSpeaker.player.displayName}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  
                  {/* 座位号标签 */}
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-sm font-bold px-3 py-1 rounded shadow-lg">
                    {currentSpeaker.player.seat + 1}号
                  </div>
                </div>
                
                {/* 名字 */}
                <h3 className="text-2xl font-black tracking-tight text-[var(--text-primary)] mb-1">
                  {currentSpeaker.player.displayName}
                </h3>
                
                {/* 发言状态 - 只有当 currentDialogue 为 null 时才显示"发言完毕" */}
                <p className="text-sm font-medium text-[var(--text-muted)]">
                  {currentDialogue ? "正在发言..." : "发言完毕"}
                </p>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center text-center text-[var(--text-muted)]"
              >
                <div className="w-36 h-36 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center border-4 border-[var(--border-color)]">
                  <ChatCircleDots size={48} className="opacity-30" />
                </div>
                <p className="mt-4 text-sm opacity-60">等待发言...</p>
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
              />
            );
          })}
        </div>
      </div>

      {/* 下方：Glass Panel 对话框 */}
      <div className="shrink-0 p-4 pt-0">
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
            background: 'rgba(255, 255, 255, 0.65)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.5)',
          }}
        >
          {/* 装饰性引号 */}
          <div className="absolute top-3 left-4 text-6xl opacity-5 pointer-events-none select-none">"“"</div>
          
          <div className="relative z-10">
            <AnimatePresence mode="wait">
              {/* 模式1: 人类发言输入 */}
              {isHumanTurn && (
                <motion.div
                  key="human-input"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
                    <span>轮到你发言了</span>
                  </div>
                  
                  <div className="flex items-end gap-3">
                    <textarea
                      value={inputText}
                      onChange={(e) => onInputChange?.(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          onSendMessage?.();
                        }
                      }}
                      placeholder={gameState.phase === "DAY_LAST_WORDS" ? "留下你的遗言..." : "输入你的发言..."}
                      className="flex-1 min-h-[60px] max-h-[120px] px-4 py-3 text-base bg-white/50 border border-[var(--border-color)]/30 rounded-xl focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 transition-all resize-none"
                      autoFocus
                    />
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={onSendMessage}
                        disabled={!inputText?.trim()}
                        className="w-10 h-10 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center hover:bg-[#a07608] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-[var(--color-accent)]/20"
                        title="发送"
                      >
                        <PaperPlaneTilt size={18} weight="fill" />
                      </button>
                      <button 
                        onClick={onFinishSpeaking}
                        className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition-all"
                        title="结束发言"
                      >
                        <CheckCircle size={18} weight="fill" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>Enter 发送，Shift+Enter 换行</span>
                    <span>点击 ✓ 结束发言</span>
                  </div>
                </motion.div>
              )}

              {/* 模式2: AI/系统对话显示 */}
              {!isHumanTurn && (currentSpeaker || waitingForNextRound) && (
                <motion.div
                  key="dialogue-display"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="cursor-pointer"
                  onClick={onAdvanceDialogue}
                >
                  {/* 对话内容 - 带玩家标签 */}
                  <div className="text-lg leading-relaxed text-[var(--text-primary)]">
                    {renderPlayerMentions(
                      displayedText || currentSpeaker?.text || (waitingForNextRound ? "点击继续下一位发言" : "..."),
                      gameState.players
                    )}
                  </div>
                  
                  {/* 底部信息栏 */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-black/5">
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
                    <button className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--color-accent)] uppercase tracking-wider transition-colors flex items-center gap-1">
                      {waitingForNextRound ? "下一位发言" : currentDialogue ? "下一句" : "继续"} →
                    </button>
                  </div>
                </motion.div>
              )}

              {/* 模式3: 夜晚等待状态 - 有趣动画 */}
              {!isHumanTurn && !currentSpeaker && !waitingForNextRound && gameState.phase.includes("NIGHT") && (
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
}: { 
  msg: ChatMessage; 
  players: Player[];
  humanPlayerId?: string;
  showDivider?: boolean;
}) {
  const player = players.find(p => p.playerId === msg.playerId);
  const isHuman = msg.playerId === humanPlayerId;

  if (msg.isSystem) {
    return (
      <div className="flex justify-center my-3">
        <div className="text-xs text-[var(--text-muted)] text-center py-2 px-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]/30">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <>
      {showDivider && <div className="w-full h-px bg-[var(--border-color)]/50 my-3" />}
      <div className={`flex items-start gap-2.5 py-2 ${isHuman ? 'flex-row-reverse' : ''}`}>
        <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-white/50 shadow-sm">
          <img src={dicebearUrl(msg.playerId)} alt={msg.playerName} className="w-full h-full" />
        </div>
        <div className={`flex-1 min-w-0 ${isHuman ? 'text-right' : ''}`}>
          <div className={`flex items-center gap-1.5 mb-1 text-xs ${isHuman ? 'justify-end' : ''}`}>
            {player && <span className="text-[10px] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded border border-[var(--border-color)]/50 font-bold text-[var(--text-muted)]">{player.seat + 1}号</span>}
            <span className="font-medium text-[var(--text-primary)]">{msg.playerName}</span>
            {isHuman && <span className="text-[9px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded">YOU</span>}
          </div>
          <div className={`inline-block max-w-full px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${isHuman ? 'bg-[var(--color-accent)] text-white rounded-tr-none' : 'bg-white text-[var(--text-primary)] border border-[var(--border-color)]/30 rounded-tl-none'}`}>
            {renderPlayerMentions(msg.content, players)}
          </div>
        </div>
      </div>
    </>
  );
}
