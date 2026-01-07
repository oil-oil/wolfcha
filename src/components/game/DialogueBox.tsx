"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CaretDown, ChatCircleDots, ClockCounterClockwise } from "@phosphor-icons/react";
import { WerewolfIcon } from "@/components/icons/FlatIcons";
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

interface DialogueBoxProps {
  gameState: GameState;
  humanPlayer: Player | null;
  currentDialogue: DialogueState | null;
  displayedText: string;
  isTyping: boolean;
  onAdvance: () => void;
  showHistoryPanel: boolean;
  onToggleHistory: () => void;
}

export function DialogueBox({
  gameState,
  humanPlayer,
  currentDialogue,
  displayedText,
  isTyping,
  onAdvance,
  showHistoryPanel,
  onToggleHistory,
}: DialogueBoxProps) {
  // Build message queue from game messages
  const messageQueue = useMemo(() => {
    return gameState.messages.filter(
      (m) => !(m.isSystem && isTurnPromptSystemMessage(m.content))
    );
  }, [gameState.messages]);

  // Track which message index we're viewing
  const [viewIndex, setViewIndex] = useState(messageQueue.length - 1);
  
  // Auto-advance to latest when new messages arrive
  useEffect(() => {
    if (messageQueue.length > 0) {
      setViewIndex(messageQueue.length - 1);
    }
  }, [messageQueue.length]);

  // Current message to display
  const currentMessage = useMemo(() => {
    // If AI is currently typing/streaming, show that
    if (currentDialogue) {
      const player = gameState.players.find(p => p.displayName === currentDialogue.speaker);
      return {
        id: 'streaming',
        playerName: currentDialogue.speaker,
        playerId: player?.playerId || 'system',
        content: currentDialogue.isStreaming ? displayedText : currentDialogue.text,
        isSystem: false,
        isStreaming: true,
        player,
      };
    }
    
    // Otherwise show the message at current viewIndex
    if (viewIndex >= 0 && viewIndex < messageQueue.length) {
      const msg = messageQueue[viewIndex];
      const player = gameState.players.find(p => p.playerId === msg.playerId);
      return {
        ...msg,
        player,
        isStreaming: false,
      };
    }
    
    return null;
  }, [currentDialogue, displayedText, viewIndex, messageQueue, gameState.players]);

  // Navigate messages
  const canGoPrev = viewIndex > 0 && !currentDialogue;
  const canGoNext = viewIndex < messageQueue.length - 1 && !currentDialogue;
  const isAtLatest = viewIndex === messageQueue.length - 1;

  const handleClick = useCallback(() => {
    if (currentDialogue) {
      // If streaming, call onAdvance to skip/continue
      onAdvance();
    } else if (canGoNext) {
      // Move to next message
      setViewIndex(v => v + 1);
    } else {
      // At the end, call onAdvance for game flow
      onAdvance();
    }
  }, [currentDialogue, canGoNext, onAdvance]);

  const handlePrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (canGoPrev) setViewIndex(v => v - 1);
  }, [canGoPrev]);

  const handleGoToLatest = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setViewIndex(messageQueue.length - 1);
  }, [messageQueue.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      } else if (e.key === "ArrowLeft" && canGoPrev) {
        setViewIndex(v => v - 1);
      } else if (e.key === "ArrowRight" && canGoNext) {
        setViewIndex(v => v + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClick, canGoPrev, canGoNext]);

  if (!currentMessage && messageQueue.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)] opacity-60">
        <WerewolfIcon size={32} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">等待游戏开始...</p>
      </div>
    );
  }

  const isSystemMessage = currentMessage?.isSystem;
  const speakerName = currentMessage?.playerName || "系统";
  const speakerPlayer = currentMessage?.player;
  const isHuman = currentMessage?.playerId === humanPlayer?.playerId;

  return (
    <div 
      className="relative select-none cursor-pointer"
      onClick={handleClick}
    >
      {/* 对话框主体 */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        {/* 顶部：发言者信息栏 */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            {/* 头像 */}
            {speakerPlayer ? (
              <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/50 shadow-sm">
                <img 
                  src={dicebearUrl(speakerPlayer.playerId)} 
                  alt={speakerPlayer.displayName}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-[var(--bg-hover)] flex items-center justify-center border-2 border-[var(--border-color)]">
                <ChatCircleDots size={20} className="text-[var(--text-muted)]" />
              </div>
            )}
            
            {/* 名字和座位号 */}
            <div>
              <div className="flex items-center gap-2">
                {speakerPlayer && (
                  <span className="text-[10px] font-bold bg-[var(--color-accent)] text-white px-1.5 py-0.5 rounded">
                    {speakerPlayer.seat + 1}号
                  </span>
                )}
                <span className="font-bold text-[var(--text-primary)]">{speakerName}</span>
                {isHuman && (
                  <span className="text-[10px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded uppercase">You</span>
                )}
              </div>
              {isSystemMessage && (
                <span className="text-[10px] text-[var(--text-muted)]">系统消息</span>
              )}
            </div>
          </div>

          {/* 右侧：消息计数器 & 历史按钮 */}
          <div className="flex items-center gap-2">
            {/* 消息进度 */}
            <div className="text-xs text-[var(--text-muted)] tabular-nums">
              {currentDialogue ? (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-[var(--color-accent)] rounded-full animate-pulse" />
                  正在发言
                </span>
              ) : (
                <span>{viewIndex + 1} / {messageQueue.length}</span>
              )}
            </div>
            
            {/* 历史记录按钮 */}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleHistory(); }}
              className={`p-1.5 rounded-lg transition-colors ${showHistoryPanel ? 'bg-[var(--color-accent)] text-white' : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}
              title="查看历史记录"
            >
              <ClockCounterClockwise size={18} />
            </button>
          </div>
        </div>

        {/* 对话内容区域 */}
        <div className="px-5 py-4 min-h-[100px] max-h-[200px] overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentMessage?.id || 'empty'}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-[var(--text-primary)] leading-relaxed"
            >
              {isSystemMessage ? (
                <div className="text-sm text-[var(--text-secondary)] text-center py-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {currentMessage?.content || ""}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="text-base">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {currentMessage?.content || ""}
                  </ReactMarkdown>
                  {isTyping && (
                    <span className="inline-block w-0.5 h-[1em] bg-[var(--color-accent)] animate-[blink_1s_step-end_infinite] ml-0.5 align-text-bottom" />
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 底部：操作提示 */}
        <div className="px-4 py-2 border-t border-[var(--border-color)]/50 bg-[var(--bg-secondary)]/50 flex items-center justify-between">
          {/* 左侧导航 */}
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrev}
              disabled={!canGoPrev}
              className="text-xs px-2 py-1 rounded hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed text-[var(--text-muted)]"
            >
              ◀ 上一条
            </button>
            {!isAtLatest && (
              <button
                onClick={handleGoToLatest}
                className="text-xs px-2 py-1 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20"
              >
                跳至最新
              </button>
            )}
          </div>
          
          {/* 右侧提示 */}
          <div className="text-xs text-[var(--text-muted)] flex items-center gap-1">
            {currentDialogue ? (
              <span>点击跳过</span>
            ) : canGoNext ? (
              <>
                <span>点击继续</span>
                <CaretDown size={12} className="animate-bounce" />
              </>
            ) : (
              <span className="opacity-50">已是最新</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
