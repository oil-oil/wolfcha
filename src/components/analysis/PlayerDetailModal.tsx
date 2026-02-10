"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import Image from "next/image";
import type { PlayerSnapshot } from "@/types/analysis";
import { ROLE_ICONS, ROLE_NAMES } from "./constants";
import { buildSimpleAvatarUrl } from "@/lib/avatar-config";

interface PlayerDetailModalProps {
  player: PlayerSnapshot | null;
  isOpen: boolean;
  onClose: () => void;
}

const DEATH_CAUSE_LABELS: Record<string, string> = {
  killed: "被狼人击杀",
  exiled: "被投票放逐",
  poisoned: "被女巫毒杀",
  shot: "被猎人击杀",
};

const ALIGNMENT_LABELS: Record<string, { label: string; color: string }> = {
  village: { label: "好人阵营", color: "text-[var(--color-gold)]" },
  wolf: { label: "狼人阵营", color: "text-[var(--color-blood)]" },
};

export function PlayerDetailModal({ player, isOpen, onClose }: PlayerDetailModalProps) {
  if (!player) return null;

  const avatarUrl = buildSimpleAvatarUrl(player.avatar || player.name);
  const roleIcon = ROLE_ICONS[player.role];
  const roleName = ROLE_NAMES[player.role];
  const isWolf = player.alignment === "wolf";
  const alignmentInfo = ALIGNMENT_LABELS[player.alignment] || ALIGNMENT_LABELS.village;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[320px] max-w-[90vw]"
          >
            <div className="bg-[var(--bg-card)] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="relative pt-8 pb-6 px-6 text-center bg-gradient-to-b from-white/5 to-transparent">
                <button
                  onClick={onClose}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-[var(--text-muted)]" />
                </button>

                <div className="relative w-20 h-20 mx-auto mb-4">
                  <div className={`absolute inset-0 rounded-full blur-xl ${isWolf ? "bg-[var(--color-blood)]/20" : "bg-[var(--color-gold)]/20"}`} />
                  <div className={`relative w-full h-full rounded-full border-4 overflow-hidden ${
                    isWolf ? "border-[var(--color-blood)]/50" : "border-[var(--color-gold)]/50"
                  } ${!player.isAlive ? "grayscale opacity-60" : ""}`}>
                    <Image
                      src={avatarUrl}
                      alt={player.name}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  {!player.isAlive && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-white font-bold text-xs bg-black/60 px-2 py-1 rounded">OUT</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="text-xs font-bold bg-white/10 text-[var(--text-secondary)] px-2 py-0.5 rounded">
                    {player.seat + 1}号位
                  </span>
                  {player.isSheriff && (
                    <span className="text-xs font-bold bg-[var(--color-gold)] text-[var(--bg-main)] px-2 py-0.5 rounded">
                      警长
                    </span>
                  )}
                  {player.isHumanPlayer && (
                    <span className="text-xs font-bold bg-[var(--color-gold)]/80 text-[var(--bg-main)] px-2 py-0.5 rounded">
                      你
                    </span>
                  )}
                </div>

                <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">{player.name}</h2>

                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold ${
                  isWolf 
                    ? "bg-[var(--color-blood)]/20 text-[var(--color-blood)]" 
                    : "bg-[var(--color-gold)]/20 text-[var(--color-gold)]"
                }`}>
                  <Image src={roleIcon} alt={roleName} width={16} height={16} />
                  <span>{roleName}</span>
                </div>
              </div>

              <div className="px-6 pb-6 space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-white/5">
                  <span className="text-xs text-[var(--text-muted)]">阵营</span>
                  <span className={`text-sm font-medium ${alignmentInfo.color}`}>{alignmentInfo.label}</span>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-white/5">
                  <span className="text-xs text-[var(--text-muted)]">状态</span>
                  <span className={`text-sm font-medium ${player.isAlive ? "text-green-400" : "text-[var(--color-blood)]"}`}>
                    {player.isAlive ? "存活" : "出局"}
                  </span>
                </div>

                {!player.isAlive && player.deathCause && (
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-xs text-[var(--text-muted)]">死因</span>
                    <span className="text-sm text-[var(--text-secondary)]">
                      {DEATH_CAUSE_LABELS[player.deathCause] || player.deathCause}
                    </span>
                  </div>
                )}

                {!player.isAlive && player.deathDay && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-[var(--text-muted)]">出局时间</span>
                    <span className="text-sm text-[var(--text-secondary)]">第{player.deathDay}天</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
