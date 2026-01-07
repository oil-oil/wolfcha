"use client";

import { motion } from "framer-motion";
import type { Player } from "@/types/game";

interface PlayerCardFlatProps {
  player: Player;
  isSpeaking: boolean;
  canClick: boolean;
  isSelected: boolean;
  onClick: () => void;
  animationDirection?: "left" | "right";
  animationDelay?: number;
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

export function PlayerCardFlat({
  player,
  isSpeaking,
  canClick,
  isSelected,
  onClick,
  animationDirection = "left",
  animationDelay = 0,
}: PlayerCardFlatProps) {
  const isDead = !player.alive;
  const initialX = animationDirection === "left" ? -20 : 20;

  return (
    <motion.div
      key={player.playerId}
      initial={{ opacity: 0, x: initialX }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: animationDelay }}
      whileHover={canClick ? { scale: 1.02 } : {}}
      whileTap={canClick ? { scale: 0.98 } : {}}
      onClick={onClick}
      className={`
        bg-[var(--bg-card)] border border-[var(--border-color)] rounded-md p-3 w-full
        flex flex-col items-center gap-2 transition-all duration-200 cursor-default relative
        shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5
        ${isDead ? "opacity-50 grayscale bg-[var(--bg-secondary)] border-dashed" : ""}
        ${isSpeaking ? "border-[var(--color-accent)] bg-[var(--color-accent-bg)]" : ""}
        ${canClick ? "cursor-pointer border-[var(--color-accent)] hover:bg-[var(--bg-hover)]" : ""}
        ${isSelected ? "bg-[var(--bg-selected)] border-[var(--color-accent)] shadow-[0_0_0_2px_var(--color-accent-bg)]" : ""}
      `}
    >
      <div className="w-full flex items-center justify-between mb-1">
        <div className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded-sm">{player.seat + 1}</div>
        <div className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis max-w-[80px]">{player.displayName}</div>
      </div>
      <div className="relative w-16 h-16 rounded-full overflow-hidden">
        <img src={dicebearUrl(player.playerId)} alt={player.displayName} className="w-full h-full object-cover" />
        {isDead && <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center text-white font-extrabold text-xs tracking-wider">RIP</div>}
      </div>
      {isSpeaking && (
        <div className="absolute top-2.5 right-2.5 w-2 h-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-accent)] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-accent)]"></span>
        </div>
      )}
    </motion.div>
  );
}
