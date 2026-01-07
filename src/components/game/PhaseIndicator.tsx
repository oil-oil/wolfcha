"use client";

import { cn } from "@/lib/utils";
import type { Phase, Player } from "@/types/game";
import { Moon, Sun, Eye, ChatCircle, Users, CheckCircle, Timer, Scroll } from "@phosphor-icons/react";
import { WolfIcon } from "@/components/icons/WolfIcon";
import { motion, AnimatePresence } from "framer-motion";

interface PhaseIndicatorProps {
  phase: Phase;
  day: number;
  humanPlayer: Player | null;
  currentSpeakerSeat: number | null;
  winner: "village" | "wolf" | null;
}

const phaseConfig: Record<Phase, { icon: React.ReactNode; label: string; color: string; bgColor: string }> = {
  LOBBY: { icon: <Timer size={20} />, label: "等待开始", color: "text-[var(--text-muted)]", bgColor: "bg-[var(--bg-muted)]" },
  SETUP: { icon: <Timer size={20} className="animate-spin" />, label: "生成角色中", color: "text-[var(--text-muted)]", bgColor: "bg-[var(--bg-muted)]" },
  NIGHT_START: { icon: <Moon size={20} />, label: "夜晚降临", color: "text-[var(--color-seer)]", bgColor: "bg-blue-100/20" },
  NIGHT_GUARD_ACTION: { icon: <Moon size={20} />, label: "守卫行动", color: "text-[var(--color-guard)]", bgColor: "bg-blue-100/20" },
  NIGHT_WOLF_CHAT: { icon: <WolfIcon size={20} />, label: "狼人私聊", color: "text-red-500", bgColor: "bg-red-100/20" },
  NIGHT_WOLF_ACTION: { icon: <WolfIcon size={20} />, label: "狼人行动", color: "text-red-500", bgColor: "bg-red-100/20" },
  NIGHT_WITCH_ACTION: { icon: <Moon size={20} />, label: "女巫行动", color: "text-[var(--color-witch)]", bgColor: "bg-purple-100/20" },
  NIGHT_SEER_ACTION: { icon: <Eye size={20} />, label: "预言家行动", color: "text-[var(--color-seer)]", bgColor: "bg-indigo-100/20" },
  NIGHT_RESOLVE: { icon: <Moon size={20} />, label: "夜晚结算", color: "text-[var(--color-seer)]", bgColor: "bg-blue-100/20" },
  DAY_START: { icon: <Sun size={20} />, label: "天亮了", color: "text-amber-500", bgColor: "bg-amber-100/20" },
  DAY_SPEECH: { icon: <ChatCircle size={20} />, label: "讨论环节", color: "text-amber-500", bgColor: "bg-amber-100/20" },
  DAY_LAST_WORDS: { icon: <Scroll size={20} />, label: "遗言阶段", color: "text-amber-500", bgColor: "bg-amber-100/20" },
  DAY_VOTE: { icon: <Users size={20} />, label: "投票环节", color: "text-orange-500", bgColor: "bg-orange-100/20" },
  DAY_RESOLVE: { icon: <CheckCircle size={20} />, label: "投票结算", color: "text-orange-500", bgColor: "bg-orange-100/20" },
  HUNTER_SHOOT: { icon: <Users size={20} />, label: "猎人开枪", color: "text-orange-500", bgColor: "bg-orange-100/20" },
  GAME_END: { icon: <CheckCircle size={20} />, label: "游戏结束", color: "text-green-500", bgColor: "bg-green-100/20" },
};

export function PhaseIndicator({
  phase,
  day,
  humanPlayer,
  currentSpeakerSeat,
  winner,
}: PhaseIndicatorProps) {
  const config = phaseConfig[phase];
  
  const getDetailText = () => {
    switch (phase) {
      case "NIGHT_SEER_ACTION":
        return humanPlayer?.role === "Seer" ? "请选择要查验的玩家" : "预言家正在查验...";
      case "NIGHT_WOLF_CHAT":
        return humanPlayer?.role === "Werewolf" ? "狼队正在私聊..." : "狼人正在私聊...";
      case "NIGHT_WOLF_ACTION":
        return humanPlayer?.role === "Werewolf" ? "请选择击杀目标" : "狼人正在行动...";
      case "DAY_SPEECH":
        if (currentSpeakerSeat === humanPlayer?.seat) {
          return "轮到你发言了";
        }
        return currentSpeakerSeat !== null ? `${currentSpeakerSeat + 1}号正在发言` : "";
      case "DAY_LAST_WORDS":
        if (currentSpeakerSeat === humanPlayer?.seat) {
          return "轮到你发表遗言了";
        }
        return currentSpeakerSeat !== null ? `${currentSpeakerSeat + 1}号正在发表遗言` : "";
      case "DAY_VOTE":
        return "请投票选出要放逐的玩家";
      case "GAME_END":
        return winner === "village" ? "好人阵营胜利" : "狼人阵营胜利";
      default:
        return "";
    }
  };

  const detailText = getDetailText();

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] overflow-hidden relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={cn("flex items-center justify-center w-10 h-10 rounded-full shrink-0", 
            config.bgColor
          )}
        >
          <span className={config.color}>{config.icon}</span>
        </motion.div>
      </AnimatePresence>
      
      <div className="flex-1 min-w-0">
        <motion.div 
          layout
          className="flex items-center gap-2"
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={config.label}
              initial={{ y: 5, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -5, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="font-medium truncate"
            >
              {config.label}
            </motion.span>
          </AnimatePresence>
          <span className="text-xs text-[var(--text-muted)] shrink-0">第 {day} 天</span>
        </motion.div>
        
        <AnimatePresence mode="wait">
          {detailText && (
            <motion.p
              key={detailText}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 5 }}
              transition={{ duration: 0.2 }}
              className="text-sm text-[var(--text-secondary)] mt-0.5 truncate"
            >
              {detailText}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
