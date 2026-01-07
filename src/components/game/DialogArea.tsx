"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { WerewolfIcon } from "@/components/icons/FlatIcons";
import { VotingProgress } from "./VotingProgress";
import { WolfPlanningPanel } from "./WolfPlanningPanel";
import type { GameState, Player, ChatMessage } from "@/types/game";
import type { DialogueState } from "@/store/game-machine";

// 柔和但可区分的背景色
const avatarBgColors = [
  'e8d5c4', // 暖杉色
  'd4e5d7', // 薄荷绿
  'd5dce8', // 雾蓝
  'e8d4d9', // 蔑瑰粉
  'ddd4e8', // 淡紫
  'd4e8e5', // 浅青
  'e8e4d4', // 米黄
  'd4d8e8', // 驼灰蓝
  'e5d4d4', // 藕荷
  'dae8d4', // 柚绿
];

const getPlayerBgColor = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }

  return avatarBgColors[Math.abs(hash) % avatarBgColors.length];
};

function isTurnPromptSystemMessage(content: string) {
  return (
    content.includes("轮到你发言") ||
    content.includes("轮到你发表遗言")
  );
}

function getAnnouncementLines(content: string) {
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function HostAnnouncement({ content }: { content: string }) {
  const lines = getAnnouncementLines(content);
  const isAnnouncement = lines.length >= 3 && lines.every((l) => l.length <= 30);
  const [expanded, setExpanded] = useState(false);

  if (!isAnnouncement) {
    return (
      <div className="inline-block max-w-full px-5 py-2 rounded-md text-sm leading-relaxed break-words bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-center">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    );
  }

  const maxLines = 4;
  const showToggle = lines.length > maxLines;
  const displayLines = expanded ? lines : lines.slice(0, maxLines);

  return (
    <div className="w-full max-w-[560px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-secondary)]">
        <div className="text-xs font-bold text-[var(--text-muted)] tracking-wide">主持人播报</div>
        {showToggle && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-semibold text-[var(--color-accent)] hover:opacity-80 cursor-pointer"
          >
            {expanded ? "收起" : `展开(${lines.length})`}
          </button>
        )}
      </div>
      <div className="px-4 py-3">
        <div className="space-y-1.5">
          {displayLines.map((line, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shrink-0" />
              <div className="text-sm text-[var(--text-primary)] leading-relaxed break-words">{line}</div>
            </div>
          ))}
          {!expanded && showToggle && (
            <div className="text-xs text-[var(--text-muted)] pt-1">还有 {lines.length - maxLines} 条…</div>
          )}
        </div>
      </div>
    </div>
  );
}

const dicebearUrl = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${getPlayerBgColor(seed)}`;

// 玩家提及标签组件
function PlayerMentionTag({ player }: { player: Player }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-full py-0.5 pl-0.5 pr-2.5 text-xs align-middle mx-1.5">
      <img 
        src={dicebearUrl(player.playerId)} 
        alt={player.displayName} 
        className="w-4 h-4 rounded-full object-cover shrink-0"
      />
      <span className="font-semibold text-[var(--color-accent)] text-[11px]">{player.seat + 1}号</span>
      <span className="text-[var(--text-primary)] font-medium">{player.displayName}</span>
    </span>
  );
}

interface DialogAreaProps {
  gameState: GameState;
  humanPlayer: Player | null;
  currentDialogue: DialogueState | null;
  displayedText: string;
  isTyping: boolean;
  showFullHistory?: boolean;
}

export function DialogArea({
  gameState,
  humanPlayer,
  currentDialogue,
  displayedText,
  isTyping,
  showFullHistory = false,
}: DialogAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // 监听滚动事件，判断是否在底部
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      // 容差 50px
      isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
    }
  };

  useEffect(() => {
    // 只有当用户原本就在底部时，才自动滚动
    if (scrollRef.current && isAtBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [gameState.messages, displayedText]);

  // 解析消息内容，将玩家提及转换为标签
  const parsePlayerMentions = useCallback((content: string): React.ReactNode[] => {
    const players = gameState.players;
    const result: React.ReactNode[] = [];
    let remaining = content;
    let keyIndex = 0;

    // 匹配 X号 模式
    const seatPattern = /(\d+)号/g;
    // 收集所有玩家名称用于匹配
    const playerNames = players.map(p => p.displayName).filter(n => n.length >= 2);

    while (remaining.length > 0) {
      let matchIndex = -1;
      let matchLength = 0;
      let matchedPlayer: Player | undefined = undefined;

      // 检查座位号匹配
      seatPattern.lastIndex = 0;
      const seatMatch = seatPattern.exec(remaining);
      if (seatMatch) {
        const seatNum = parseInt(seatMatch[1], 10);
        const foundPlayer = players.find(p => p.seat + 1 === seatNum);
        if (foundPlayer && (matchIndex === -1 || seatMatch.index < matchIndex)) {
          matchIndex = seatMatch.index;
          matchLength = seatMatch[0].length;
          matchedPlayer = foundPlayer;
        }
      }

      // 检查玩家名称匹配
      for (const name of playerNames) {
        const nameIndex = remaining.indexOf(name);
        if (nameIndex !== -1 && (matchIndex === -1 || nameIndex < matchIndex)) {
          const foundPlayer = players.find(p => p.displayName === name);
          if (foundPlayer) {
            matchIndex = nameIndex;
            matchLength = name.length;
            matchedPlayer = foundPlayer;
          }
        }
      }

      if (matchIndex !== -1 && matchedPlayer) {
        // 添加匹配前的文本
        if (matchIndex > 0) {
          result.push(<span key={keyIndex++}>{remaining.slice(0, matchIndex)}</span>);
        }
        // 添加玩家标签
        result.push(<PlayerMentionTag key={keyIndex++} player={matchedPlayer} />);
        remaining = remaining.slice(matchIndex + matchLength);
      } else {
        // 没有更多匹配，添加剩余文本
        result.push(<span key={keyIndex++}>{remaining}</span>);
        break;
      }
    }

    return result;
  }, [gameState.players]);

  // 渲染单条消息
  const renderMessage = (msg: ChatMessage, isHuman: boolean, showDivider: boolean) => {
    const player = gameState.players.find(p => p.displayName === msg.playerName);
    
    if (msg.isSystem) {
      return (
        <div key={msg.id} className="flex justify-center my-3">
          <HostAnnouncement content={msg.content} />
        </div>
      );
    }

    return (
      <div key={msg.id}>
        {showDivider && (
          <div className="w-full h-px bg-gray-200 my-4" />
        )}
        <div className={`flex items-start gap-2.5 pb-3 mb-3 border-b border-black/[0.03] last:border-b-0 ${isHuman ? "flex-row-reverse" : ""}`}>
          <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
            <img src={dicebearUrl(msg.playerId)} alt={msg.playerName} className="w-full h-full object-cover" />
          </div>
          <div className={`flex flex-col gap-1 max-w-[calc(100%-50px)] ${isHuman ? "items-end" : ""}`}>
            <div className="text-xs font-medium text-[var(--text-muted)] flex items-center gap-1.5">
              {player && <span className="text-[10px] bg-[var(--bg-secondary)] px-1 py-0.5 rounded">{player.seat + 1}号</span>}
              <span>{msg.playerName}</span>
              {isHuman && <span className="bg-[var(--color-accent)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wide">YOU</span>}
            </div>
            <div className={`inline-block max-w-full px-3.5 py-2.5 rounded-lg text-sm leading-relaxed break-words ${isHuman ? "bg-[var(--color-accent)] text-white ml-auto" : "bg-[var(--bg-secondary)] text-[var(--text-primary)]"}`}>
              <div className="leading-[1.8]">
                {parsePlayerMentions(msg.content)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 完整历史记录模式
  if (showFullHistory) {
    const visibleMessages = gameState.messages.filter(
      (m) => !(m.isSystem && isTurnPromptSystemMessage(m.content))
    );

    return (
      <div className="h-full w-full overflow-hidden flex flex-col min-h-0">
        <div 
          className="flex-1 overflow-y-auto p-4" 
          ref={scrollRef}
          onScroll={handleScroll}
        >
          {visibleMessages.map((msg, index) => {
            const prevMsg = visibleMessages[index - 1];
            const showDivider = index > 0 && !msg.isSystem && !prevMsg?.isSystem && prevMsg?.playerName !== msg.playerName;
            return renderMessage(msg, msg.playerId === humanPlayer?.playerId, showDivider);
          })}
          
          {/* 正在打字的消息 */}
          {currentDialogue && (() => {
            const player = gameState.players.find(p => p.displayName === currentDialogue.speaker);
            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2.5 pb-3 mb-3"
              >
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
                  {player ? (
                    <img src={dicebearUrl(player.playerId)} alt={player.displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[var(--bg-secondary)] rounded-full">
                      <WerewolfIcon size={14} />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 max-w-[calc(100%-50px)]">
                  <div className="text-xs font-medium text-[var(--text-muted)] flex items-center gap-1.5">
                    {player && <span className="text-[10px] bg-[var(--bg-secondary)] px-1 py-px rounded">{player.seat + 1}号</span>}
                    <span>{currentDialogue.speaker}</span>
                  </div>
                  <div className="inline-block max-w-full px-3.5 py-2.5 rounded-lg text-sm leading-relaxed break-words bg-[var(--bg-secondary)] text-[var(--text-primary)]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {currentDialogue.isStreaming ? displayedText : currentDialogue.text}
                    </ReactMarkdown>
                    {isTyping && <span className="inline-block w-0.5 h-[1.2em] bg-current animate-[blink_1s_step-end_infinite] align-text-bottom ml-0.5" />}
                  </div>
                </div>
              </motion.div>
            );
          })()}

          {/* 空状态 */}
          {gameState.messages.length === 0 && !currentDialogue && (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
              <WerewolfIcon size={48} className="mb-4 opacity-30" />
              <p>等待游戏开始...</p>
            </div>
          )}

          {/* 投票进度 - 在投票阶段显示 */}
          {gameState.phase === "DAY_VOTE" && (
            <div className="sticky bottom-0 mt-4 p-4 bg-gradient-to-t from-[var(--bg-card)] via-[var(--bg-card)] to-transparent">
              <div className="bg-white border border-[var(--border-color)] rounded-lg p-4 shadow-lg">
                <div className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-[var(--color-accent)] rounded-full animate-pulse" />
                  投票进行中
                </div>
                <VotingProgress gameState={gameState} humanPlayer={humanPlayer} />
              </div>
            </div>
          )}

          {/* 狼人协作面板 - 狼人行动阶段显示 */}
          {gameState.phase === "NIGHT_WOLF_ACTION" && humanPlayer?.role === "Werewolf" && (
            <div className="sticky bottom-0 mt-4 p-4">
              <WolfPlanningPanel gameState={gameState} humanPlayer={humanPlayer} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // 焦点对话模式 - 显示当前对话
  return (
    <motion.div 
      className="flex-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg flex flex-col overflow-hidden shadow-[var(--shadow-sm)] min-h-[400px]"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="flex-1 overflow-y-auto p-10 flex flex-col" ref={scrollRef}>
        {(currentDialogue || gameState.messages.length > 0) ? (
          <div className="flex-1 flex flex-col justify-center max-w-[800px] mx-auto w-full">
            {/* 当前焦点消息 */}
            <div className="animate-[fade-up_0.4s_ease]">
              <div className="text-sm font-semibold text-[var(--color-accent)] mb-3 flex items-center gap-2 before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current">
                {currentDialogue?.speaker || [...gameState.messages].reverse().find(m => !m.isSystem)?.playerName || "系统"}
              </div>
              <div className="text-2xl leading-relaxed text-[var(--text-primary)] font-medium font-serif">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {currentDialogue?.isStreaming 
                    ? displayedText 
                    : (currentDialogue?.text || [...gameState.messages].reverse().find(m => !m.isSystem)?.content || "等待游戏开始...")}
                </ReactMarkdown>
                {isTyping && <span className="inline-block w-0.5 h-[1.2em] bg-current animate-[blink_1s_step-end_infinite] align-text-bottom ml-0.5" />}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)]">
            <WerewolfIcon size={48} className="text-[var(--border-color)] mb-4" />
            <p>游戏即将开始</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
