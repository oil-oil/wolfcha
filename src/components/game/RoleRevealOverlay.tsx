"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  WerewolfIcon,
  SeerIcon,
  WitchIcon,
  HunterIcon,
  GuardIcon,
  VillagerIcon,
  NightIcon,
} from "@/components/icons/FlatIcons";
import type { Phase, Player } from "@/types/game";

interface RoleRevealOverlayProps {
  open: boolean;
  player: Player;
  phase: Phase;
  onContinue: () => void;
}

type RoleMeta = {
  title: string;
  subtitle: string;
  color: string;
  bg: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  abilities: string[];
  tips: string[];
};

function getRoleMeta(role: Player["role"]): RoleMeta {
  switch (role) {
    case "Werewolf":
      return {
        title: "狼人",
        subtitle: "夜色是你的同盟，谎言是你的武器。",
        color: "var(--color-wolf)",
        bg: "var(--color-wolf-bg)",
        Icon: WerewolfIcon,
        abilities: [
          "每晚与同伴暗中商议，选择一名玩家袭击",
          "白天隐藏身份，带节奏、制造矛盾",
        ],
        tips: [
          "留意谁的发言更像在推理而不是在情绪输出",
          "尽量避免‘过于完美’的视角，像真人一样犯小错更安全",
        ],
      };
    case "Seer":
      return {
        title: "预言家",
        subtitle: "你能看穿伪装，但别让目光暴露自己。",
        color: "var(--color-seer)",
        bg: "var(--color-seer-bg)",
        Icon: SeerIcon,
        abilities: ["每晚查验一名玩家身份（好人/狼人）", "白天用信息引导投票走向"],
        tips: ["别急着一股脑全说完，注意分寸和时机", "先建立可信度，再抛信息更容易被接受"],
      };
    case "Witch":
      return {
        title: "女巫",
        subtitle: "救与杀只在一念之间。",
        color: "var(--color-witch)",
        bg: "var(--color-witch-bg)",
        Icon: WitchIcon,
        abilities: ["解药：可救活当夜被袭击的玩家（一次）", "毒药：可毒杀一名玩家（一次）"],
        tips: ["药很珍贵，别被节奏牵着走", "观察发言与投票的连贯性，往往能抓到狼"],
      };
    case "Hunter":
      return {
        title: "猎人",
        subtitle: "最后一枪，决定谁能走到天亮。",
        color: "var(--color-hunter)",
        bg: "var(--color-hunter-bg)",
        Icon: HunterIcon,
        abilities: ["当你被放逐或被袭击出局，可立刻开枪带走一人"],
        tips: ["别轻易暴露身份，威慑力本身就是价值", "真到出局时，先想清楚‘谁最赚’"],
      };
    case "Guard":
      return {
        title: "守卫",
        subtitle: "你守住的，可能就是全村的希望。",
        color: "var(--color-guard)",
        bg: "var(--color-guard-bg)",
        Icon: GuardIcon,
        abilities: ["每晚守护一名玩家，使其免于当夜袭击", "通常不能连续两晚守护同一人"],
        tips: ["守关键位不如守‘关键时机’", "你不需要证明自己，关键时刻保住对的人就够了"],
      };
    default:
      return {
        title: "村民",
        subtitle: "你没有技能，但你有判断。",
        color: "var(--color-villager)",
        bg: "var(--color-villager-bg)",
        Icon: VillagerIcon,
        abilities: ["没有夜间技能", "白天通过发言与投票找出狼人"],
        tips: ["把发言当成证据链，而不是辩论赛", "敢于提出怀疑，但也要能自洽"],
      };
  }
}

function getNextStepText(role: Player["role"], phase: Phase) {
  if (phase === "NIGHT_START") {
    switch (role) {
      case "Werewolf":
        return "天黑请闭眼。稍后轮到你行动时，点选一名玩家作为袭击目标。";
      case "Seer":
        return "天黑请闭眼。稍后轮到你行动时，点选一名玩家进行查验。";
      case "Witch":
        return "天黑请闭眼。稍后你将决定是否用药。";
      case "Guard":
        return "天黑请闭眼。稍后轮到你行动时，点选一名玩家进行守护。";
      case "Hunter":
        return "天黑请闭眼。你先观察局势，关键时刻再亮出子弹。";
      default:
        return "天黑请闭眼。你暂时无需行动，先倾听与观察。";
    }
  }

  return "舞台已经就位。跟随主持人的提示行动即可。";
}

export function RoleRevealOverlay({ open, player, phase, onContinue }: RoleRevealOverlayProps) {
  const meta = getRoleMeta(player.role);
  const NextStepIcon = NightIcon;

  const isNight = phase.includes("NIGHT");

  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRevealed(false);
    const t = window.setTimeout(() => setRevealed(true), 650);
    return () => window.clearTimeout(t);
  }, [open]);

  const cardAccent = useMemo(() => meta.color, [meta.color]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="role-reveal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
        >
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              background:
                "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.78) 55%, rgba(0,0,0,0.92) 100%)",
            }}
          />

          <div className="relative w-full max-w-[680px] px-6">
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="glass-panel rounded-3xl p-1 shadow-2xl"
              style={{
                background: "rgba(20, 16, 14, 0.62)",
                backdropFilter: "blur(14px)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <div className="rounded-[22px] overflow-hidden" style={{ perspective: 1200 }}>
                <motion.div
                  initial={false}
                  animate={{ rotateY: revealed ? 0 : 180 }}
                  transition={{ duration: 0.7, ease: "easeInOut" }}
                  className="relative"
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                    <div
                      className="px-6 pt-7 pb-6"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.12) 60%, rgba(0,0,0,0.25) 100%)",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold tracking-wider uppercase text-white/60">身份牌</div>
                        <div className="text-xs text-white/55">请独自查看</div>
                      </div>
                      <div className="mt-6 flex items-center justify-center">
                        <motion.div
                          animate={{ rotate: [0, 4, -4, 0], scale: [1, 1.02, 1] }}
                          transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                          className="w-40 h-56 rounded-3xl flex flex-col items-center justify-center gap-3"
                          style={{
                            background: "rgba(0,0,0,0.28)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            boxShadow: `0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06) inset`,
                          }}
                        >
                          <div
                            className="w-14 h-14 rounded-2xl flex items-center justify-center"
                            style={{
                              background: "rgba(255,255,255,0.06)",
                              border: "1px solid rgba(255,255,255,0.10)",
                            }}
                          >
                            <meta.Icon size={28} className="text-white/90" />
                          </div>
                          <div className="text-sm font-bold text-white/85">命运正在揭晓…</div>
                          <div className="text-xs text-white/55">请保持安静</div>
                        </motion.div>
                      </div>
                      <div className="mt-6 text-center text-sm text-white/70">稍候片刻，舞台将为你点亮。</div>
                    </div>
                  </div>

                  <div className="relative" style={{ backfaceVisibility: "hidden" }}>
                    <div
                      className="px-6 pt-7 pb-5"
                      style={{
                        background: isNight
                          ? `linear-gradient(135deg, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.16) 55%, rgba(0,0,0,0.26) 100%), linear-gradient(135deg, ${meta.bg} 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.12) 100%)`
                          : `linear-gradient(135deg, ${meta.bg} 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.12) 100%)`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-xs font-bold tracking-wider uppercase text-white/60">你的身份</div>
                          <div className="mt-1 flex items-center gap-3">
                            <div
                              className="w-12 h-12 rounded-2xl flex items-center justify-center"
                              style={{
                                background: "rgba(0,0,0,0.25)",
                                border: "1px solid rgba(255,255,255,0.10)",
                                boxShadow: `0 0 0 1px rgba(255,255,255,0.04) inset, 0 10px 30px rgba(0,0,0,0.35)`,
                              }}
                            >
                              <meta.Icon size={24} className="text-white" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-3xl font-black tracking-tight text-white font-serif">
                                {meta.title}
                              </div>
                              <div className="mt-1 text-sm text-white/70 leading-relaxed">{meta.subtitle}</div>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="text-xs text-white/55">{player.seat + 1}号</div>
                          <div className="text-sm font-semibold text-white/80">{player.displayName}</div>
                        </div>
                      </div>

                      <motion.div
                        className="mt-6 h-px w-full"
                        initial={{ opacity: 0, scaleX: 0.85 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        transition={{ delay: 0.1 }}
                        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)" }}
                      />

                      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-2xl p-4" style={{ background: "rgba(0,0,0,0.20)", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <div className="text-xs font-bold tracking-wider text-white/60 uppercase">能力</div>
                          <div className="mt-2 space-y-2">
                            {meta.abilities.map((t, i) => (
                              <div key={i} className="text-sm text-white/80 leading-relaxed">
                                {t}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-2xl p-4" style={{ background: "rgba(0,0,0,0.20)", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <div className="text-xs font-bold tracking-wider text-white/60 uppercase">提醒</div>
                          <div className="mt-2 space-y-2">
                            {meta.tips.map((t, i) => (
                              <div key={i} className="text-sm text-white/75 leading-relaxed">
                                {t}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="px-6 py-5" style={{ background: "rgba(0,0,0,0.25)" }}>
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 text-white/80">
                          <NextStepIcon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold tracking-wider text-white/60 uppercase">接下来</div>
                          <div className="mt-1 text-sm text-white/80 leading-relaxed">
                            {getNextStepText(player.role, phase)}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <button
                            onClick={onContinue}
                            className="inline-flex items-center justify-center h-10 px-5 text-sm font-bold rounded-xl border-none cursor-pointer transition-all duration-150 bg-white text-black hover:bg-white/90 active:scale-[0.98]"
                            style={{ boxShadow: `0 10px 30px rgba(0,0,0,0.35), 0 0 0 2px ${String(cardAccent)}22` }}
                          >
                            继续
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
