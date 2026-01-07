"use client";

import { motion } from "framer-motion";
import type { Player, GameState, Role } from "@/types/game";
import { 
  WerewolfIcon,
  SeerIcon,
  VillagerIcon,
  WitchIcon,
  HunterIcon,
  GuardIcon
} from "@/components/icons/FlatIcons";

interface PlayerCardCompactProps {
  player: Player;
  isSpeaking: boolean;
  canClick: boolean;
  isSelected: boolean;
  onClick: () => void;
  animationDelay?: number;
  showWolfBadge?: boolean; // 显示狼人标记（狼人队友可见）
  seerCheckResult?: "wolf" | "good" | null; // 预言家查验结果
  humanPlayer?: Player | null;
}

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

const dicebearUrl = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${getPlayerBgColor(seed)}`;

const getRoleIcon = (role: Role) => {
  switch (role) {
    case "Werewolf": return <WerewolfIcon size={12} />;
    case "Seer": return <SeerIcon size={12} />;
    case "Witch": return <WitchIcon size={12} />;
    case "Hunter": return <HunterIcon size={12} />;
    case "Guard": return <GuardIcon size={12} />;
    default: return <VillagerIcon size={12} />;
  }
};

export function PlayerCardCompact({
  player,
  isSpeaking,
  canClick,
  isSelected,
  onClick,
  animationDelay = 0,
  showWolfBadge = false,
  seerCheckResult = null,
  humanPlayer,
}: PlayerCardCompactProps) {
  const isDead = !player.alive;
  const isMe = player.isHuman;
  
  // 狼人玩家可以看到其他狼人
  const isWolfTeammate = humanPlayer?.role === "Werewolf" && 
    player.role === "Werewolf" && 
    !player.isHuman;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: animationDelay }}
      whileHover={canClick ? { scale: 1.02 } : {}}
      whileTap={canClick ? { scale: 0.98 } : {}}
      onClick={onClick}
      className={`
        bg-[var(--bg-card)] border border-transparent rounded-md px-2.5 py-2
        flex items-center gap-2.5 transition-all duration-200 cursor-default
        shadow-[0_1px_3px_rgba(0,0,0,0.05)]
        hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:-translate-y-px
        ${isDead ? "opacity-50 grayscale" : ""}
        ${isSpeaking ? "border-[var(--color-accent)] bg-[var(--color-accent-bg)] animate-[speaker-pulse_2s_ease-in-out_infinite]" : ""}
        ${canClick ? "cursor-pointer border-[var(--color-accent)] hover:bg-[var(--color-accent-bg)]" : ""}
        ${isSelected ? "bg-[var(--color-accent-bg)] border-[var(--color-accent)] shadow-[0_0_0_2px_var(--color-accent-bg)]" : ""}
        ${isWolfTeammate ? "border-[var(--color-wolf)] bg-[var(--color-wolf-bg)]" : ""}
        ${isMe ? "border-l-4 border-l-[var(--color-accent)]" : ""}
      `}
    >
      <div className="w-12 h-12 rounded-full shrink-0 relative">
        <img src={dicebearUrl(player.playerId)} alt={player.displayName} className="w-full h-full object-cover" />
        {isDead && (
          <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">RIP</span>
          </div>
        )}
      </div>
      {/* 狼人队友标记 - 移到头像外面 */}
      {isWolfTeammate && !isDead && (
        <div className="absolute top-1 left-1 w-4 h-4 bg-[var(--color-wolf)] rounded-full flex items-center justify-center border border-white z-10">
          <WerewolfIcon size={10} className="text-white" />
        </div>
      )}
      {/* 预言家查验结果 */}
      {seerCheckResult && !isDead && (
        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full flex items-center justify-center border border-white z-10 ${seerCheckResult === 'wolf' ? 'bg-[var(--color-wolf)]' : 'bg-[var(--color-success)]'}`}>
          {seerCheckResult === 'wolf' ? (
            <WerewolfIcon size={10} className="text-white" />
          ) : (
            <div className="w-2 h-2 bg-white rounded-full" />
          )}
        </div>
      )}
      {/* 自己的身份图标 */}
      {isMe && !isDead && (
        <div className="absolute top-1 left-1 w-5 h-5 bg-white rounded-full flex items-center justify-center border shadow-sm text-[var(--color-accent)] z-10">
          {getRoleIcon(player.role)}
        </div>
      )}
      
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] text-[var(--text-muted)] font-semibold shrink-0">{player.seat + 1}号</span>
          {isMe && (
            <span className="text-[10px] bg-[var(--color-accent)] text-white px-1 rounded-sm font-bold leading-none py-0.5">YOU</span>
          )}
        </div>
        <div className="flex-1 w-full text-xs leading-tight font-medium break-words whitespace-normal line-clamp-2" title={player.displayName}>
          {player.displayName}
        </div>
      </div>
      
      {isSpeaking && (
        <div className="w-2 h-2 bg-[var(--color-accent)] rounded-full animate-pulse shrink-0 ml-1" />
      )}
    </motion.div>
  );
}
