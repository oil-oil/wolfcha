"use client";

import { useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X, ChatCircleDots } from "@phosphor-icons/react";
import type { GameState, Player, ChatMessage } from "@/types/game";

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

interface HistoryPanelProps {
  gameState: GameState;
  humanPlayer: Player | null;
  isOpen: boolean;
  onClose: () => void;
  onJumpToMessage: (index: number) => void;
}

export function HistoryPanel({
  gameState,
  humanPlayer,
  isOpen,
  onClose,
  onJumpToMessage,
}: HistoryPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when opened
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOpen]);

  const visibleMessages = gameState.messages.filter(
    (m) => !(m.isSystem && isTurnPromptSystemMessage(m.content))
  );

  const renderMessage = useCallback((msg: ChatMessage, index: number) => {
    const player = gameState.players.find(p => p.playerId === msg.playerId);
    const isHuman = msg.playerId === humanPlayer?.playerId;

    if (msg.isSystem) {
      return (
        <div 
          key={msg.id} 
          className="py-2 px-3 my-1 bg-[var(--bg-secondary)]/50 rounded text-xs text-[var(--text-muted)] text-center cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
          onClick={() => { onJumpToMessage(index); onClose(); }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
        </div>
      );
    }

    return (
      <div 
        key={msg.id}
        className="flex items-start gap-2 py-2 px-2 rounded-lg cursor-pointer hover:bg-[var(--bg-hover)] transition-colors group"
        onClick={() => { onJumpToMessage(index); onClose(); }}
      >
        {/* 头像 */}
        <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 border border-white/30">
          {player ? (
            <img src={dicebearUrl(player.playerId)} alt={player.displayName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[var(--bg-secondary)] flex items-center justify-center">
              <ChatCircleDots size={12} />
            </div>
          )}
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {player && (
              <span className="text-[9px] font-bold bg-[var(--bg-secondary)] text-[var(--text-muted)] px-1 py-0.5 rounded">
                {player.seat + 1}号
              </span>
            )}
            <span className="text-xs font-medium text-[var(--text-primary)]">{msg.playerName}</span>
            {isHuman && (
              <span className="text-[8px] font-bold bg-emerald-500 text-white px-1 py-0.5 rounded">YOU</span>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
            {msg.content}
          </p>
        </div>

        {/* 跳转提示 */}
        <div className="text-[10px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity self-center">
          查看 →
        </div>
      </div>
    );
  }, [gameState.players, humanPlayer?.playerId, onJumpToMessage, onClose]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="absolute right-0 top-0 bottom-0 w-[320px] bg-[var(--bg-card)] border-l border-[var(--border-color)] shadow-lg z-20 flex flex-col"
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <h3 className="font-bold text-sm text-[var(--text-primary)]">历史记录</h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
        >
          <X size={18} />
        </button>
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2">
        {visibleMessages.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-muted)] text-sm">
            暂无消息
          </div>
        ) : (
          visibleMessages.map((msg, idx) => renderMessage(msg, idx))
        )}
      </div>

      {/* 底部统计 */}
      <div className="px-4 py-2 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/50 text-xs text-[var(--text-muted)]">
        共 {visibleMessages.length} 条消息
      </div>
    </motion.div>
  );
}
