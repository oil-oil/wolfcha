"use client";

import { motion } from "framer-motion";
import type { Player, Role } from "@/types/game";
import {
  WerewolfIcon,
  SeerIcon,
  VillagerIcon,
  WitchIcon,
  HunterIcon,
  GuardIcon,
} from "@/components/icons/FlatIcons";

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
    case "Werewolf": return <WerewolfIcon size={14} />;
    case "Seer": return <SeerIcon size={14} />;
    case "Witch": return <WitchIcon size={14} />;
    case "Hunter": return <HunterIcon size={14} />;
    case "Guard": return <GuardIcon size={14} />;
    default: return <VillagerIcon size={14} />;
  }
};

const getRoleLabel = (role: Role) => {
  switch (role) {
    case "Werewolf": return "狼人";
    case "Seer": return "预言家";
    case "Witch": return "女巫";
    case "Hunter": return "猎人";
    case "Guard": return "守卫";
    default: return "村民";
  }
};

interface HumanPlayerCardProps {
  player: Player;
  canClick: boolean;
  isSelected: boolean;
  onClick: () => void;
}

export function HumanPlayerCard({
  player,
  canClick,
  isSelected,
  onClick,
}: HumanPlayerCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={`
        bg-[var(--bg-card)] border border-[var(--border-color)] rounded-md px-5 py-3
        flex items-center justify-between shadow-[var(--shadow-sm)] transition-all duration-200
        ${canClick ? "cursor-pointer border-[var(--color-accent)] hover:bg-[var(--bg-hover)]" : ""}
        ${isSelected ? "bg-[var(--bg-selected)] border-[var(--color-accent)] shadow-[0_0_0_2px_var(--color-accent-bg)]" : ""}
      `}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <img 
            src={dicebearUrl(player.playerId)} 
            alt={player.displayName} 
            className={`w-10 h-10 rounded-full border border-[var(--border-color)] ${!player.alive ? "grayscale opacity-50" : ""}`} 
          />
          {!player.alive && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full text-[10px] text-white font-bold">
              RIP
            </div>
          )}
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--text-primary)]">{player.displayName}</span>
            <span className="text-[10px] font-bold text-[var(--color-accent)] bg-[var(--color-accent-bg)] px-1.5 py-0.5 rounded-sm">YOU</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span>{player.seat + 1}号</span>
            <span className="w-px h-3 bg-[var(--border-color)]"></span>
            <span className={`flex items-center gap-1 ${!player.alive ? "text-[var(--text-muted)]" : ""}`}>
              {getRoleIcon(player.role)}
              {getRoleLabel(player.role)}
            </span>
          </div>
        </div>
      </div>
      
      {canClick && (
        <div className="ml-auto text-xs text-[var(--color-accent)] font-medium px-2 py-1 bg-[var(--color-accent-bg)] rounded">
          {isSelected ? "已选择" : "点击选择自己"}
        </div>
      )}
    </motion.div>
  );
}
