"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Microphone, Sparkle } from "@phosphor-icons/react";
import type { Player, Role } from "@/types/game";
import { cn } from "@/lib/utils";
import { buildSimpleAvatarUrl, getModelLogoUrl } from "@/lib/avatar-config";
import { useTranslations } from "next-intl";

interface PlayerCardCompactProps {
  player: Player;
  isSpeaking: boolean;
  canClick: boolean;
  isSelected: boolean;
  isNight?: boolean;
  isGenshinMode?: boolean;
  onClick: () => void;
  onDetailClick?: () => void;
  animationDelay?: number;
  showWolfBadge?: boolean;
  showRoleBadge?: boolean;
  showModel?: boolean;
  selectionTone?: "wolf" | "seer" | "guard" | "witch" | "hunter" | "badge" | "vote";
  seerCheckResult?: "wolf" | "good" | null;
  humanPlayer?: Player | null;
  isBadgeHolder?: boolean;
  isBadgeCandidate?: boolean;
  variant?: "default" | "mobile";
  isInSelectionPhase?: boolean;
}

export function PlayerCardCompact({
  player,
  isSpeaking,
  canClick,
  isSelected,
  isNight = false,
  isGenshinMode = false,
  onClick,
  onDetailClick,
  animationDelay = 0,
  showWolfBadge = false,
  showRoleBadge = true,
  showModel = false,
  selectionTone,
  seerCheckResult = null,
  humanPlayer,
  isBadgeHolder = false,
  isBadgeCandidate = false,
  variant = "default",
  isInSelectionPhase = false,
}: PlayerCardCompactProps) {
  const t = useTranslations();
  const isDead = !player.alive;
  const isMe = player.isHuman;
  const isReady = isMe ? !!player.displayName?.trim() : !!player.agentProfile?.persona;
  const isDisabledInSelection = isInSelectionPhase && !canClick && isReady && !isDead;

  const prevAliveRef = useRef<boolean>(player.alive);
  const prevIsReadyRef = useRef<boolean | null>(null);
  const [deathPulse, setDeathPulse] = useState(false);
  const [revealPop, setRevealPop] = useState(false);

  useEffect(() => {
    const wasReady = prevIsReadyRef.current;
    prevIsReadyRef.current = isReady;
    
    // 当从 loading 变为 ready 时触发动画（首次渲染时 wasReady 为 null，不触发）
    if (isReady && wasReady === false) {
      setRevealPop(true);
      const timer = window.setTimeout(() => setRevealPop(false), 600);
      return () => window.clearTimeout(timer);
    }
  }, [isReady]);

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
  const showWolfTeamBadge = humanPlayer?.role === "Werewolf" && player.role === "Werewolf";
  const selectionClass = (() => {
    if (!isSelected) return "";
    switch (selectionTone) {
      case "wolf":
        return "border-[var(--color-blood)] shadow-[0_0_0_2px_var(--color-blood)]";
      case "seer":
        return "border-[var(--color-seer)] shadow-[0_0_0_2px_var(--color-seer)]";
      case "guard":
        return "border-[var(--color-success)] shadow-[0_0_0_2px_var(--color-success)]";
      case "witch":
        return "border-[var(--color-witch)] shadow-[0_0_0_2px_var(--color-witch)]";
      case "hunter":
        return "border-[var(--color-warning)] shadow-[0_0_0_2px_var(--color-warning)]";
      case "badge":
        return "border-[var(--color-gold)] shadow-[0_0_0_2px_rgba(197,160,89,0.25)]";
      case "vote":
        return "border-[var(--color-accent)] shadow-[0_0_0_2px_rgba(120,160,255,0.25)]";
      default:
        return "border-[var(--color-gold)] shadow-[0_0_0_2px_rgba(197,160,89,0.25)]";
    }
  })();

  const roleLabels = useMemo<Record<Role, string>>(() => ({
    Werewolf: t("roles.werewolf"),
    Seer: t("roles.seer"),
    Witch: t("roles.witch"),
    Hunter: t("roles.hunter"),
    Guard: t("roles.guard"),
    Villager: t("roles.villager"),
  }), [t]);
  const getRoleLabel = (role: Role) => roleLabels[role] ?? t("roles.villager");
  const persona = player.agentProfile?.persona;
  const styleLabel = isGenshinMode ? (isMe ? t("common.you") : "") : persona?.styleLabel || (isMe ? t("common.you") : "");
  const modelLabel = player.agentProfile?.modelRef?.model;

  const isModelAvatar = isGenshinMode && !player.isHuman;
  const avatarSrc = isModelAvatar
    ? getModelLogoUrl(player.agentProfile?.modelRef)
    : buildSimpleAvatarUrl(player.avatarSeed ?? player.playerId, {
        gender: player.agentProfile?.persona?.gender,
      });
  const avatarClassName = cn(
    "w-full h-full transition-transform duration-500",
    isModelAvatar ? "object-contain p-2 bg-[var(--bg-secondary)]" : "object-cover group-hover:scale-110",
    isSpeaking && "border-[var(--color-gold)]"
  );

  const handleClick = (e: React.MouseEvent) => {
    if (!isReady) return; // Prevent clicking when not ready
    if (canClick) {
      onClick();
    } else if (onDetailClick) {
      onDetailClick();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={
        deathPulse
          ? {
              opacity: 1,
              y: [0, -2, 0],
              scale: [1, 1.015, 1],
            }
          : revealPop
          ? {
              opacity: 1,
              y: 0,
              scale: [1, 1.08, 1.03, 1],
            }
          : { opacity: 1, y: 0, scale: 1 }
      }
      transition={
        revealPop
          ? { delay: 0, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }
          : { delay: animationDelay, duration: 0.3 }
      }
      whileHover={variant === "mobile" ? {} : {}}
      whileTap={isReady ? { scale: 0.98 } : {}}
      onClick={handleClick}
      className={cn(
        "wc-player-card relative group transition-all duration-300",
        variant === "mobile" && "wc-player-card--mobile",
        !isReady && "wc-player-card--loading opacity-80",
        isReady && "bg-[var(--bg-card)]/80 backdrop-blur-sm",
        isDead && "wc-player-card--dead grayscale-[0.8]",
        isSpeaking && "wc-player-card--speaking ring-1 ring-[var(--color-gold)] shadow-[0_0_15px_rgba(184,134,11,0.15)]",
        isMe && "wc-player-card--me",
        isWolfTeammate && "border-[var(--color-blood)]/70 bg-[var(--color-wolf-bg)]",
        isDisabledInSelection && "wc-player-card--disabled opacity-50 grayscale-[0.3] pointer-events-none",
        canClick && isReady && "wc-player-card--selectable border-[var(--color-gold)]/50 hover:border-[var(--color-gold)] cursor-pointer",
        isSelected && "scale-[1.02]",
        isSelected && selectionClass
      )}
    >
      {/* Loading Shimmer Effect */}
      {!isReady && (
        <div className="absolute inset-0 overflow-hidden rounded-lg z-0">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
          <div className="absolute inset-0 bg-[var(--bg-card)] opacity-50" />
        </div>
      )}
      {!isReady && (
        <motion.div
          className="absolute inset-0 rounded-lg pointer-events-none z-10"
          animate={{ boxShadow: ["inset 0 0 0 rgba(197,160,89,0)", "inset 0 0 18px rgba(197,160,89,0.18)", "inset 0 0 0 rgba(197,160,89,0)"] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* 头像区域 */}
      <div className="wc-player-card__avatar relative overflow-hidden">
        <AnimatePresence mode="wait">
          {isReady ? (
            <motion.div
              key="avatar-image"
              initial={{ opacity: 0, scale: 0.8, filter: "blur(8px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full h-full"
            >
              <img 
                src={avatarSrc} 
                alt={player.displayName} 
                className={avatarClassName} 
              />
            </motion.div>
          ) : (
            <motion.div
              key="avatar-placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full flex items-center justify-center bg-black/10"
            >
              <div className="relative flex items-center justify-center">
                <motion.div
                  className="absolute inset-0 rounded-full border border-[var(--color-gold)]/25"
                  style={{ width: 46, height: 46 }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="absolute inset-2 rounded-full border border-dashed border-[var(--color-blood)]/30"
                  animate={{ rotate: -360, opacity: [0.4, 0.9, 0.4] }}
                  transition={{ duration: 4.8, repeat: Infinity, ease: "linear" }}
                />
                <div className="absolute inset-0 bg-[var(--color-gold)]/20 blur-xl rounded-full animate-pulse" />
                <Sparkle
                  size={22}
                  weight="fill"
                  className="text-[var(--text-secondary)]/45 animate-[spin_5s_linear_infinite]"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {isDead && isReady && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <span className="text-[10px] font-bold text-white tracking-widest border border-white/30 px-2 py-0.5 rounded-sm">RIP</span>
          </div>
        )}
      </div>

      {/* 狼人队友标记 */}
      {showWolfTeamBadge && !isDead && isReady && (
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-sm flex items-center justify-center z-10 bg-[var(--color-blood)] text-white border border-black/20 shadow-sm text-[10px] font-semibold tracking-wide">
          {t("playerCard.wolfTeam")}
        </div>
      )}

      {/* 预言家查验结果 */}
      {seerCheckResult && !isDead && isReady && (
        <div className={cn(
          "absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-sm flex items-center justify-center z-10 border border-black/20 shadow-sm text-[10px] font-semibold tracking-wide text-white",
          seerCheckResult === 'wolf' ? 'bg-[var(--color-blood)]' : 'bg-[var(--color-success)]'
        )}>
          {seerCheckResult === "wolf" ? t("alignments.wolf") : t("alignments.good")}
        </div>
      )}

      {/* 警徽标记 */}
      {isBadgeHolder && !isDead && isReady && (
        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-sm flex items-center justify-center z-10 bg-[var(--color-gold)] border border-black/20 shadow-[0_0_8px_rgba(184,134,11,0.35)] text-[10px] font-semibold tracking-wide text-[var(--bg-dark)]">
          {t("playerCard.badgeHolder")}
        </div>
      )}
      
      {/* 警长候选人标记 */}
      {isBadgeCandidate && !isDead && isReady && (
        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-sm flex items-center justify-center z-10 bg-[var(--color-gold)] border border-black/20 shadow-sm text-[10px] font-semibold tracking-wide text-[var(--bg-dark)]">
          {t("playerCard.badgeCandidate")}
        </div>
      )}

      {/* 自己的身份图标 */}
      {isMe && !isDead && isReady && showRoleBadge && (
        <div className="absolute bottom-0 right-0 px-1.5 py-0.5 rounded-sm flex items-center justify-center z-10 bg-[var(--color-gold)] shadow-sm translate-x-1 translate-y-1 text-[10px] font-bold text-[var(--bg-dark)]">
          {getRoleLabel(player.role)}
        </div>
      )}
      
      {/* 信息区 */}
      <div className="wc-player-card__info relative z-10">
        {variant === "mobile" ? (
          <div className="wc-player-card__name relative flex items-center gap-1 min-w-0" title={player.displayName}>
            <span className={cn(
              "wc-seat-badge transition-colors duration-300",
              isSpeaking ? "bg-[var(--color-gold)] text-[#1a1614]" : "bg-black/10 text-[var(--text-secondary)]",
              !isReady && "opacity-50"
            )}>{player.seat + 1}</span>
            <AnimatePresence mode="wait">
              {isReady ? (
                <motion.span
                  key="name-text"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="truncate font-medium text-[var(--text-primary)] flex-1 min-w-0"
                >
                  {player.displayName}
                </motion.span>
              ) : (
                <motion.div
                  key="name-loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 h-3 flex items-center"
                >
                  <div className="h-2 w-16 bg-[var(--text-secondary)]/10 rounded-full animate-pulse" />
                </motion.div>
              )}
            </AnimatePresence>
            {isMe && isReady && (
              <span className="text-[10px] bg-[var(--color-gold)]/90 text-[#1a1614] px-1.5 rounded-sm font-bold leading-none py-0.5 shadow-sm">
                {t("common.you")}
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={cn(
                "wc-seat-badge transition-colors duration-300",
                isSpeaking ? "bg-[var(--color-gold)] text-[#1a1614]" : "bg-black/10 text-[var(--text-secondary)]",
                !isReady && "opacity-50"
              )}>{player.seat + 1}</span>
              {isMe && isReady && (
                <span className="text-[10px] bg-[var(--color-gold)]/90 text-[#1a1614] px-1.5 rounded-sm font-bold leading-none py-0.5 shadow-sm">
                  {t("common.you")}
                </span>
              )}
            </div>

            <div className="wc-player-card__name relative h-5" title={player.displayName}>
              <AnimatePresence mode="wait">
                {isReady ? (
                  <motion.span
                    key="name-text"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="block truncate font-medium text-[var(--text-primary)]"
                  >
                    {player.displayName}
                  </motion.span>
                ) : (
                  <motion.div
                    key="name-loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full flex items-center"
                  >
                    <div className="h-2 w-16 bg-[var(--text-secondary)]/10 rounded-full animate-pulse" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}

        <div className="wc-player-card__meta min-h-[1.25rem] space-y-0.5">
          {isReady && styleLabel && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <span className={cn(
                "text-xs",
                isSpeaking ? "text-[var(--color-gold)]" : "text-[var(--text-secondary)]"
              )}>{styleLabel}</span>
            </motion.div>
          )}
          {isReady && showModel && modelLabel && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="text-[10px] text-[var(--text-muted)] truncate"
              title={modelLabel}
            >
              {modelLabel}
            </motion.div>
          )}
          {!isReady && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.4, 0.9, 0.4] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="text-[var(--text-muted)] text-xs flex items-center gap-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-gold)]/60" />
              {t("playerCard.joining")}
            </motion.div>
          )}
        </div>
      </div>
      
      
      {/* 边框高亮流光 (Highlight border on ready) */}
      <AnimatePresence>
        {revealPop && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 1 } }}
            className="absolute inset-0 rounded-lg pointer-events-none z-30"
            style={{
              boxShadow: "inset 0 0 20px rgba(184,134,11,0.3), 0 0 10px rgba(184,134,11,0.2)"
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
