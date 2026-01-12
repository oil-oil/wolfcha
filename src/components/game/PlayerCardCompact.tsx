"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Microphone } from "@phosphor-icons/react";
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
  onDetailClick?: () => void;
  animationDelay?: number;
  showWolfBadge?: boolean;
  seerCheckResult?: "wolf" | "good" | null;
  humanPlayer?: Player | null;
  isBadgeHolder?: boolean;
}

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
  isBadgeHolder = false,
}: PlayerCardCompactProps) {
  const isDead = !player.alive;
  const isMe = player.isHuman;

  const prevAliveRef = useRef<boolean>(player.alive);
  const [deathPulse, setDeathPulse] = useState(false);

  useEffect(() => {
    const prevAlive = prevAliveRef.current;
    if (prevAlive && !player.alive) {
      queueMicrotask(() => setDeathPulse(true));
      const t = window.setTimeout(() => setDeathPulse(false), 900);
      return () => window.clearTimeout(t);
    }
    prevAliveRef.current = player.alive;
  }, [player.alive]);
  
  const isWolfTeammate = humanPlayer?.role === "Werewolf" && 
    player.role === "Werewolf" && 
    !player.isHuman;

  const persona = player.agentProfile?.persona;
  const styleLabel = persona?.styleLabel || (isMe ? "你" : "");

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
            }
          : { opacity: 1, y: 0 }
      }
      transition={{ delay: animationDelay, duration: 0.3 }}
      whileHover={{ x: 4 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      className={cn(
        "wc-player-card",
        isDead && "wc-player-card--dead",
        isSpeaking && "wc-player-card--speaking",
        isMe && "wc-player-card--me",
        isWolfTeammate && "border-[var(--color-blood)]/70 bg-[var(--color-wolf-bg)]",
        canClick && "border-[var(--color-gold)]/50 hover:border-[var(--color-gold)]",
        isSelected && "border-[var(--color-gold)] shadow-[0_0_0_2px_rgba(197,160,89,0.25)]"
      )}
    >
      {/* 头像 */}
      <div className="wc-player-card__avatar">
        <img 
          src={dicebearUrl(player.playerId)} 
          alt={player.displayName} 
          className={cn(
            "w-full h-full object-cover",
            isSpeaking && "border-[var(--color-gold)]"
          )} 
        />
        {isDead && (
          <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center">
            <span className="text-[10px] font-bold text-white tracking-wide">RIP</span>
          </div>
        )}
      </div>

      {/* 狼人队友标记 */}
      {isWolfTeammate && !isDead && (
        <div className="absolute top-1.5 left-1.5 w-4 h-4 bg-[var(--color-blood)] rounded-full flex items-center justify-center z-10 border border-black/20">
          <WerewolfIcon size={10} className="text-white" />
        </div>
      )}

      {/* 预言家查验结果 */}
      {seerCheckResult && !isDead && (
        <div className={cn(
          "absolute top-1.5 left-1.5 w-4 h-4 rounded-full flex items-center justify-center z-10 border border-black/20",
          seerCheckResult === 'wolf' ? 'bg-[var(--color-blood)]' : 'bg-[var(--color-success)]'
        )}>
          {seerCheckResult === 'wolf' ? (
            <WerewolfIcon size={10} className="text-white" />
          ) : (
            <div className="w-2 h-2 bg-white rounded-full" />
          )}
        </div>
      )}

      {/* 警徽标记 */}
      {isBadgeHolder && !isDead && (
        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center z-10 bg-[var(--color-gold)] border border-black/20">
          <span className="text-[8px] font-black text-[var(--bg-dark)]">徽</span>
        </div>
      )}

      {/* 自己的身份图标 */}
      {isMe && !isDead && (
        <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full flex items-center justify-center z-10 bg-[var(--color-gold)] border-2 border-[var(--bg-dark)]">
          {getRoleIcon(player.role)}
        </div>
      )}
      
      {/* 信息区 */}
      <div className="wc-player-card__info">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={cn(
            "wc-seat-badge",
            isSpeaking && "bg-[var(--color-gold)] text-[#1a1614]"
          )}>{player.seat + 1}</span>
          {isMe && (
            <span className="text-[10px] bg-[var(--color-gold)] text-[#1a1614] px-1.5 rounded-sm font-bold leading-none py-0.5">YOU</span>
          )}
        </div>
        <div className="wc-player-card__name" title={player.displayName}>
          {player.displayName}
        </div>
        {styleLabel && (
          <div className="wc-player-card__meta">
            {isSpeaking ? (
              <span>发言中...</span>
            ) : (
              <span>{styleLabel}</span>
            )}
          </div>
        )}
      </div>
      
      {/* 发言中麦克风图标 */}
      {isSpeaking && (
        <div className="absolute right-2 top-2">
          <Microphone weight="fill" className="text-[var(--color-gold)] animate-pulse" size={16} />
        </div>
      )}
    </motion.div>
  );
}
