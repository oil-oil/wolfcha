"use client";

import { motion } from "framer-motion";
import {
  Eye,
  Skull,
  Shield,
  Drop,
  Crosshair,
  Users,
  HourglassSimple,
  ChatCircle,
  CheckCircle,
} from "@phosphor-icons/react";
import {
  WerewolfIcon,
  SeerIcon,
  WitchIcon,
  HunterIcon,
  GuardIcon,
  SpeechIcon,
  NightIcon,
  DayIcon,
} from "@/components/icons/FlatIcons";
import type { GameState, Player, Phase } from "@/types/game";

interface PhaseStatusBarProps {
  gameState: GameState;
  humanPlayer: Player | null;
  isWaitingForAI: boolean;
}

const phaseMessages: Record<Phase, { icon: React.ReactNode; message: string; waitingMessage?: string }> = {
  LOBBY: { icon: <HourglassSimple size={16} />, message: "等待开始..." },
  SETUP: { icon: <HourglassSimple size={16} />, message: "准备中..." },
  NIGHT_START: { icon: <NightIcon size={16} />, message: "夜幕降临..." },
  NIGHT_GUARD_ACTION: { 
    icon: <Shield size={16} />, 
    message: "守卫行动阶段",
    waitingMessage: "守卫正在选择保护目标..."
  },
  NIGHT_WOLF_ACTION: { 
    icon: <Skull size={16} />, 
    message: "狼人行动阶段",
    waitingMessage: "狼人正在商议目标..."
  },
  NIGHT_WITCH_ACTION: { 
    icon: <Drop size={16} />, 
    message: "女巫行动阶段",
    waitingMessage: "女巫正在决定是否用药..."
  },
  NIGHT_SEER_ACTION: { 
    icon: <Eye size={16} />, 
    message: "预言家查验阶段",
    waitingMessage: "预言家正在查验身份..."
  },
  NIGHT_RESOLVE: { icon: <NightIcon size={16} />, message: "结算夜晚..." },
  DAY_START: { icon: <DayIcon size={16} />, message: "天亮了" },
  DAY_SPEECH: { 
    icon: <ChatCircle size={16} />, 
    message: "讨论发言阶段",
    waitingMessage: "正在等待发言..."
  },
  DAY_VOTE: { 
    icon: <Users size={16} />, 
    message: "投票阶段",
    waitingMessage: "正在等待投票..."
  },
  DAY_RESOLVE: { icon: <CheckCircle size={16} />, message: "投票结算中..." },
  DAY_LAST_WORDS: { icon: <ChatCircle size={16} />, message: "遗言阶段" },
  HUNTER_SHOOT: { 
    icon: <Crosshair size={16} />, 
    message: "猎人开枪",
    waitingMessage: "猎人正在选择目标..."
  },
  GAME_END: { icon: <CheckCircle size={16} />, message: "游戏结束" },
};

export function PhaseStatusBar({ gameState, humanPlayer, isWaitingForAI }: PhaseStatusBarProps) {
  const phase = gameState.phase;
  const config = phaseMessages[phase];
  const isNight = phase.includes("NIGHT");
  
  // 判断当前阶段是否需要人类玩家操作
  const needsHumanAction = () => {
    if (!humanPlayer?.alive) return false;
    
    switch (phase) {
      case "NIGHT_GUARD_ACTION":
        return humanPlayer.role === "Guard";
      case "NIGHT_WOLF_ACTION":
        return humanPlayer.role === "Werewolf";
      case "NIGHT_WITCH_ACTION":
        return humanPlayer.role === "Witch";
      case "NIGHT_SEER_ACTION":
        return humanPlayer.role === "Seer";
      case "DAY_SPEECH":
        return gameState.currentSpeakerSeat === humanPlayer.seat;
      case "DAY_VOTE":
        return !gameState.votes[humanPlayer.playerId];
      case "DAY_LAST_WORDS":
        return gameState.currentSpeakerSeat === humanPlayer.seat;
      case "HUNTER_SHOOT":
        return humanPlayer.role === "Hunter";
      default:
        return false;
    }
  };

  const showWaiting = isWaitingForAI && !needsHumanAction();
  const message = showWaiting && config.waitingMessage ? config.waitingMessage : config.message;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm ${
        isNight 
          ? "bg-[#1a1512] text-[#f0e6d2] border border-[#3e2723]" 
          : "bg-white text-[var(--text-primary)] border border-[var(--border-color)]"
      }`}
    >
      <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
        isNight ? "bg-white/10" : "bg-[var(--bg-secondary)]"
      }`}>
        {config.icon}
      </div>
      
      <div className="flex-1">
        <span className="font-medium">{message}</span>
      </div>

      {/* 等待指示器 */}
      {showWaiting && (
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
              className={`w-1.5 h-1.5 rounded-full ${isNight ? "bg-indigo-400" : "bg-[var(--color-accent)]"}`}
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
              className={`w-1.5 h-1.5 rounded-full ${isNight ? "bg-indigo-400" : "bg-[var(--color-accent)]"}`}
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
              className={`w-1.5 h-1.5 rounded-full ${isNight ? "bg-indigo-400" : "bg-[var(--color-accent)]"}`}
            />
          </div>
        </div>
      )}

      {/* 需要操作提示 */}
      {needsHumanAction() && (
        <span className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full ${
          isNight 
            ? "text-yellow-400 bg-yellow-400/15" 
            : "text-[var(--color-accent)] bg-[var(--color-accent)]/10"
        }`}>
          <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse" />
          等待你操作
        </span>
      )}
    </motion.div>
  );
}
