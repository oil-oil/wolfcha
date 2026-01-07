"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Player, Role } from "@/types/game";
import { cn } from "@/lib/utils";
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
  isNight?: boolean;
  onClick: () => void;
  onDetailClick?: () => void; // 点击查看详情
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
  isNight = false,
  onClick,
  onDetailClick,
  animationDelay = 0,
  showWolfBadge = false,
  seerCheckResult = null,
  humanPlayer,
}: PlayerCardCompactProps) {
  const isDead = !player.alive;
  const isMe = player.isHuman;

  const prevAliveRef = useRef<boolean>(player.alive);
  const [deathPulse, setDeathPulse] = useState(false);

  useEffect(() => {
    const prevAlive = prevAliveRef.current;
    if (prevAlive && !player.alive) {
      setDeathPulse(true);
      const t = window.setTimeout(() => setDeathPulse(false), 900);
      return () => window.clearTimeout(t);
    }
    prevAliveRef.current = player.alive;
  }, [player.alive]);
  
  // 狼人玩家可以看到其他狼人
  const isWolfTeammate = humanPlayer?.role === "Werewolf" && 
    player.role === "Werewolf" && 
    !player.isHuman;

  const persona = player.agentProfile?.persona;
  const styleLabel = persona?.styleLabel || (isMe ? "你" : "");

  const baseCardClass = isNight
    ? isDead
      ? "bg-[#14100e]/72 border border-white/6 shadow-[0_6px_18px_rgba(0,0,0,0.45)]"
      : "bg-[#1a1512]/70 border border-white/5 shadow-[0_6px_18px_rgba(0,0,0,0.35)] hover:shadow-[0_10px_26px_rgba(0,0,0,0.45)]"
    : "bg-[var(--bg-card)] border border-transparent shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.1)]";

  const wolfTeammateClass = isWolfTeammate
    ? isNight
      ? "bg-[#231312]/75 border-[#8a1c1c]/55 shadow-[0_6px_18px_rgba(0,0,0,0.35),0_0_0_1px_rgba(138,28,28,0.18)]"
      : "border-[var(--color-wolf)] bg-[var(--color-wolf-bg)]"
    : "";

  const canClickClass = canClick
    ? isNight
      ? "border-[var(--color-accent)] hover:bg-white/5"
      : "border-[var(--color-accent)] hover:bg-[var(--color-accent-bg)]"
    : "";

  const selectedClass = isSelected
    ? isNight
      ? "bg-white/5 border-[var(--color-accent)] shadow-[0_0_0_2px_rgba(184,134,11,0.18)]"
      : "bg-[var(--color-accent-bg)] border-[var(--color-accent)] shadow-[0_0_0_2px_var(--color-accent-bg)]"
    : "";

  const handleClick = (e: React.MouseEvent) => {
    if (canClick) {
      onClick();
    } else if (onDetailClick) {
      onDetailClick();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={
        deathPulse
          ? {
              opacity: 1,
              y: [0, -2, 0],
              scale: [1, 1.015, 1],
              backgroundColor: [
                isNight ? "rgba(26, 21, 18, 0.7)" : "rgba(255, 255, 255, 1)",
                "rgba(239, 68, 68, 0.12)",
                isNight ? "rgba(26, 21, 18, 0.7)" : "rgba(255, 255, 255, 1)",
              ],
            }
          : { opacity: 1, y: 0 }
      }
      transition={{ delay: animationDelay }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      className={cn(
        "relative rounded-xl px-3 py-2.5 flex items-center gap-3 transition-all duration-200 cursor-pointer hover:-translate-y-0.5",
        baseCardClass,
        wolfTeammateClass,
        isDead && (isNight ? "opacity-55 grayscale brightness-75" : "opacity-50 grayscale"),
        isSpeaking &&
          `border-[var(--color-accent)] ${isNight ? "bg-white/5" : "bg-[var(--color-accent-bg)]"} animate-[speaker-pulse_2s_ease-in-out_infinite]`,
        canClickClass,
        selectedClass,
        isMe && "border-l-4 border-l-[var(--color-accent)]"
      )}
    >
      <div className="w-11 h-11 rounded-full shrink-0 relative">
        <img src={dicebearUrl(player.playerId)} alt={player.displayName} className={`w-full h-full object-cover rounded-full border-2 shadow-sm ${isNight ? (isDead ? "border-white/10" : "border-white/20") : "border-white"}`} />
        {isDead && (
          <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">RIP</span>
          </div>
        )}
      </div>
      {/* 狼人队友标记 */}
      {isWolfTeammate && !isDead && (
        <div className={`absolute top-1.5 left-1.5 w-4 h-4 bg-[var(--color-wolf)] rounded-full flex items-center justify-center z-10 ${isNight ? "border border-black/30" : "border border-white"}`}>
          <WerewolfIcon size={10} className="text-white" />
        </div>
      )}
      {/* 预言家查验结果 */}
      {seerCheckResult && !isDead && (
        <div className={`absolute top-1.5 left-1.5 w-4 h-4 rounded-full flex items-center justify-center z-10 ${seerCheckResult === 'wolf' ? 'bg-[var(--color-wolf)]' : 'bg-[var(--color-success)]'} ${isNight ? "border border-black/30" : "border border-white"}`}>
          {seerCheckResult === 'wolf' ? (
            <WerewolfIcon size={10} className="text-white" />
          ) : (
            <div className="w-2 h-2 bg-white rounded-full" />
          )}
        </div>
      )}
      {/* 自己的身份图标 */}
      {isMe && !isDead && (
        <div
          className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center border shadow-sm z-10 ${
            isNight
              ? "bg-black/35 border-white/10 text-[#f0e6d2]"
              : "bg-white border-[var(--border-color)] text-[var(--color-accent)]"
          }`}
        >
          {getRoleIcon(player.role)}
        </div>
      )}
      
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-[10px] font-semibold shrink-0 ${isNight ? "text-white/55" : "text-[var(--text-muted)]"}`}>{player.seat + 1}号</span>
          {isMe && (
            <span className="text-[10px] bg-[var(--color-accent)] text-white px-1 rounded-sm font-bold leading-none py-0.5">YOU</span>
          )}
        </div>
        <div className={`text-sm font-semibold truncate ${isNight ? "text-[#f0e6d2]" : "text-[var(--text-primary)]"}`} title={player.displayName}>
          {player.displayName}
        </div>
        {/* 背景信息标签 */}
        {styleLabel && (
          <div className={`text-[10px] mt-0.5 truncate ${isNight ? "text-white/45" : "text-[var(--text-muted)]"}`}>
            {styleLabel}
          </div>
        )}
      </div>
      
      {isSpeaking && (
        <div className="w-2 h-2 bg-[var(--color-accent)] rounded-full animate-pulse shrink-0" />
      )}
    </motion.div>
  );
}
