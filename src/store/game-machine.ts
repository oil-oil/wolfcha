/**
 * 游戏状态机 - 使用 jotai 实现
 * 清晰定义所有游戏阶段和转换逻辑
 */

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { GameState, Phase, Player, Role } from "@/types/game";
import { createInitialGameState } from "@/lib/game-master";

// ============ 基础状态 Atoms ============

// 持久化存储
export const humanNameAtom = atomWithStorage("wolfcha_human_name", "");
export const apiKeyConfirmedAtom = atom(false);

// 游戏核心状态
export const gameStateAtom = atom<GameState>(createInitialGameState());

// UI 状态
export const uiStateAtom = atom({
  isLoading: false,
  isWaitingForAI: false,
  showTable: false,
  selectedSeat: null as number | null,
  showRoleReveal: false,
  showLog: false,
});

// 当前对话状态
export interface DialogueState {
  speaker: string;
  text: string;
  isStreaming: boolean;
}
export const dialogueAtom = atom<DialogueState | null>(null);

// 输入文本
export const inputTextAtom = atom("");

// ============ 派生状态 Atoms ============

// 人类玩家
export const humanPlayerAtom = atom((get) => {
  const gameState = get(gameStateAtom);
  return gameState.players.find((p) => p.isHuman) || null;
});

// 是否夜晚
export const isNightAtom = atom((get) => {
  const gameState = get(gameStateAtom);
  return gameState.phase.includes("NIGHT");
});

// 存活玩家
export const alivePlayersAtom = atom((get) => {
  const gameState = get(gameStateAtom);
  return gameState.players.filter((p) => p.alive);
});

// AI 玩家（排除人类）
export const aiPlayersAtom = atom((get) => {
  const gameState = get(gameStateAtom);
  return gameState.players.filter((p) => !p.isHuman);
});

// ============ 阶段相关逻辑 ============

// 阶段配置 - 定义每个阶段的行为
export interface PhaseConfig {
  phase: Phase;
  description: string;
  humanDescription?: (humanPlayer: Player | null, gameState: GameState) => string;
  requiresHumanInput: (humanPlayer: Player | null, gameState: GameState) => boolean;
  canSelectPlayer: (humanPlayer: Player | null, targetPlayer: Player, gameState: GameState) => boolean;
  actionType: "none" | "speech" | "vote" | "night_action" | "special";
}

export const PHASE_CONFIGS: Record<Phase, PhaseConfig> = {
  LOBBY: {
    phase: "LOBBY",
    description: "准备开始",
    requiresHumanInput: () => false,
    canSelectPlayer: () => false,
    actionType: "none",
  },
  SETUP: {
    phase: "SETUP",
    description: "生成角色中...",
    requiresHumanInput: () => false,
    canSelectPlayer: () => false,
    actionType: "none",
  },
  NIGHT_START: {
    phase: "NIGHT_START",
    description: "夜晚降临",
    requiresHumanInput: () => false,
    canSelectPlayer: () => false,
    actionType: "none",
  },
  NIGHT_GUARD_ACTION: {
    phase: "NIGHT_GUARD_ACTION",
    description: "守卫行动中",
    humanDescription: (hp) => hp?.role === "Guard" ? "选择要保护的玩家" : "守卫行动中",
    requiresHumanInput: (hp) => hp?.alive && hp?.role === "Guard" || false,
    canSelectPlayer: (hp, target, gs) => {
      if (!hp || hp.role !== "Guard" || !target.alive) return false;
      // 不能连续保护同一人
      if (gs.nightActions.lastGuardTarget === target.seat) return false;
      return true;
    },
    actionType: "night_action",
  },
  NIGHT_WOLF_ACTION: {
    phase: "NIGHT_WOLF_ACTION",
    description: "狼人行动中",
    humanDescription: (hp) => hp?.role === "Werewolf" ? "选择击杀目标" : "狼人行动中",
    requiresHumanInput: (hp) => hp?.alive && hp?.role === "Werewolf" || false,
    canSelectPlayer: (hp, target) => {
      if (!hp || hp.role !== "Werewolf" || !target.alive || target.isHuman) return false;
      // 狼人只能击杀好人阵营
      return target.alignment === "village";
    },
    actionType: "night_action",
  },
  NIGHT_WITCH_ACTION: {
    phase: "NIGHT_WITCH_ACTION",
    description: "女巫行动中",
    humanDescription: (hp) => hp?.role === "Witch" ? "是否使用药水？" : "女巫行动中",
    requiresHumanInput: (hp, gs) => {
      if (!hp?.alive || hp?.role !== "Witch") return false;
      return !gs.roleAbilities.witchHealUsed || !gs.roleAbilities.witchPoisonUsed;
    },
    canSelectPlayer: (hp, target, gs) => {
      if (!hp || hp.role !== "Witch" || !target.alive) return false;
      // 毒药已用则不能选
      if (gs.roleAbilities.witchPoisonUsed) return false;
      return true;
    },
    actionType: "special",
  },
  NIGHT_SEER_ACTION: {
    phase: "NIGHT_SEER_ACTION",
    description: "预言家行动中",
    humanDescription: (hp) => hp?.role === "Seer" ? "选择查验目标" : "预言家行动中",
    requiresHumanInput: (hp) => hp?.alive && hp?.role === "Seer" || false,
    canSelectPlayer: (hp, target) => {
      if (!hp || hp.role !== "Seer" || !target.alive || target.isHuman) return false;
      return true;
    },
    actionType: "night_action",
  },
  NIGHT_RESOLVE: {
    phase: "NIGHT_RESOLVE",
    description: "天亮了",
    requiresHumanInput: () => false,
    canSelectPlayer: () => false,
    actionType: "none",
  },
  DAY_START: {
    phase: "DAY_START",
    description: "白天开始",
    requiresHumanInput: () => false,
    canSelectPlayer: () => false,
    actionType: "none",
  },
  DAY_BADGE_SPEECH: {
    phase: "DAY_BADGE_SPEECH",
    description: "警徽竞选发言",
    humanDescription: (hp, gs) => gs.currentSpeakerSeat === hp?.seat ? "轮到你发言" : "警徽竞选发言",
    requiresHumanInput: (hp, gs) => hp?.alive && gs.currentSpeakerSeat === hp?.seat || false,
    canSelectPlayer: () => false,
    actionType: "speech",
  },
  DAY_BADGE_ELECTION: {
    phase: "DAY_BADGE_ELECTION",
    description: "警徽评选",
    humanDescription: (hp, gs) => hp?.alive && typeof gs.badge.votes[hp.playerId] !== "number" ? "投票选警徽" : "警徽评选",
    requiresHumanInput: (hp, gs) => hp?.alive && typeof gs.badge.votes[hp.playerId] !== "number" || false,
    canSelectPlayer: (hp, target, gs) => {
      if (!hp?.alive || !target.alive) return false;
      if (target.isHuman) return false;
      if (typeof gs.badge.votes[hp.playerId] === "number") return false;
      return true;
    },
    actionType: "vote",
  },
  DAY_SPEECH: {
    phase: "DAY_SPEECH",
    description: "发言阶段",
    humanDescription: (hp, gs) => gs.currentSpeakerSeat === hp?.seat ? "轮到你发言" : "发言阶段",
    requiresHumanInput: (hp, gs) => hp?.alive && gs.currentSpeakerSeat === hp?.seat || false,
    canSelectPlayer: () => false,
    actionType: "speech",
  },
  DAY_LAST_WORDS: {
    phase: "DAY_LAST_WORDS",
    description: "遗言阶段",
    requiresHumanInput: (hp, gs) => gs.currentSpeakerSeat === hp?.seat || false,
    canSelectPlayer: () => false,
    actionType: "speech",
  },
  DAY_VOTE: {
    phase: "DAY_VOTE",
    description: "投票阶段",
    requiresHumanInput: (hp, gs) => hp?.alive && typeof gs.votes[hp?.playerId || ""] !== "number" || false,
    canSelectPlayer: (hp, target, gs) => {
      if (!hp?.alive || target.isHuman || !target.alive) return false;
      if (typeof gs.votes[hp.playerId] === "number") return false;
      return true;
    },
    actionType: "vote",
  },
  DAY_RESOLVE: {
    phase: "DAY_RESOLVE",
    description: "处决结算",
    requiresHumanInput: () => false,
    canSelectPlayer: () => false,
    actionType: "none",
  },
  HUNTER_SHOOT: {
    phase: "HUNTER_SHOOT",
    description: "猎人开枪",
    humanDescription: (hp) => hp?.role === "Hunter" ? "选择开枪目标" : "猎人开枪",
    requiresHumanInput: (hp, gs) => hp?.role === "Hunter" && gs.roleAbilities.hunterCanShoot || false,
    canSelectPlayer: (hp, target) => {
      if (!hp || hp.role !== "Hunter" || !target.alive || target.isHuman) return false;
      return true;
    },
    actionType: "night_action",
  },
  GAME_END: {
    phase: "GAME_END",
    description: "游戏结束",
    humanDescription: (_, gs) => gs.winner === "village" ? "好人胜利" : "狼人胜利",
    requiresHumanInput: () => false,
    canSelectPlayer: () => false,
    actionType: "none",
  },
};

// 当前阶段配置
export const currentPhaseConfigAtom = atom((get) => {
  const gameState = get(gameStateAtom);
  return PHASE_CONFIGS[gameState.phase];
});

// 当前阶段描述
export const phaseDescriptionAtom = atom((get) => {
  const gameState = get(gameStateAtom);
  const humanPlayer = get(humanPlayerAtom);
  const config = PHASE_CONFIGS[gameState.phase];
  
  if (config.humanDescription) {
    return config.humanDescription(humanPlayer, gameState);
  }
  return config.description;
});

// 是否需要人类输入
export const needsHumanInputAtom = atom((get) => {
  const gameState = get(gameStateAtom);
  const humanPlayer = get(humanPlayerAtom);
  const config = PHASE_CONFIGS[gameState.phase];
  
  return config.requiresHumanInput(humanPlayer, gameState);
});

// 检查是否可以选择某个玩家
export const canSelectPlayerAtom = atom((get) => {
  const gameState = get(gameStateAtom);
  const humanPlayer = get(humanPlayerAtom);
  const config = PHASE_CONFIGS[gameState.phase];
  
  return (targetPlayer: Player) => config.canSelectPlayer(humanPlayer, targetPlayer, gameState);
});

// 当前操作类型
export const currentActionTypeAtom = atom((get) => {
  const config = get(currentPhaseConfigAtom);
  return config.actionType;
});

// ============ UI 操作 Atoms ============

// 设置选中的座位
export const setSelectedSeatAtom = atom(
  null,
  (get, set, seat: number | null) => {
    set(uiStateAtom, (prev) => ({ ...prev, selectedSeat: seat }));
  }
);

// 设置加载状态
export const setLoadingAtom = atom(
  null,
  (get, set, isLoading: boolean) => {
    set(uiStateAtom, (prev) => ({ ...prev, isLoading }));
  }
);

// 设置等待 AI 状态
export const setWaitingForAIAtom = atom(
  null,
  (get, set, isWaitingForAI: boolean) => {
    set(uiStateAtom, (prev) => ({ ...prev, isWaitingForAI }));
  }
);

// 切换日志显示
export const toggleLogAtom = atom(
  null,
  (get, set) => {
    set(uiStateAtom, (prev) => ({ ...prev, showLog: !prev.showLog }));
  }
);

// 设置角色揭示弹窗
export const setRoleRevealAtom = atom(
  null,
  (get, set, show: boolean) => {
    set(uiStateAtom, (prev) => ({ ...prev, showRoleReveal: show }));
  }
);

// 重置游戏
export const resetGameAtom = atom(null, (get, set) => {
  set(gameStateAtom, createInitialGameState());
  set(dialogueAtom, null);
  set(inputTextAtom, "");
  set(uiStateAtom, {
    isLoading: false,
    isWaitingForAI: false,
    showTable: false,
    selectedSeat: null,
    showRoleReveal: false,
    showLog: false,
  });
});

// ============ 状态机转换规则 ============

/**
 * 定义有效的阶段转换
 * key: 当前阶段
 * value: 可转换到的阶段列表
 */
export const VALID_TRANSITIONS: Record<Phase, Phase[]> = {
  LOBBY: ["SETUP"],
  SETUP: ["NIGHT_START"],
  
  // 夜晚流程: 守卫 -> 狼人 -> 女巫 -> 预言家 -> 结算
  NIGHT_START: ["NIGHT_GUARD_ACTION"],
  NIGHT_GUARD_ACTION: ["NIGHT_WOLF_ACTION"],
  NIGHT_WOLF_ACTION: ["NIGHT_WITCH_ACTION"],
  NIGHT_WITCH_ACTION: ["NIGHT_SEER_ACTION"],
  NIGHT_SEER_ACTION: ["NIGHT_RESOLVE"],
  NIGHT_RESOLVE: ["DAY_START", "HUNTER_SHOOT", "GAME_END"],
  
  // 白天流程: 开始 -> 发言 -> 投票 -> 结算
  DAY_START: ["DAY_BADGE_SPEECH", "DAY_SPEECH"],
  DAY_BADGE_SPEECH: ["DAY_BADGE_ELECTION"],
  DAY_BADGE_ELECTION: ["DAY_SPEECH"],
  DAY_SPEECH: ["DAY_VOTE"],
  DAY_VOTE: ["DAY_RESOLVE"],
  DAY_RESOLVE: ["DAY_LAST_WORDS", "NIGHT_START", "GAME_END"],
  DAY_LAST_WORDS: ["NIGHT_START", "HUNTER_SHOOT", "GAME_END"],
  
  // 特殊阶段
  HUNTER_SHOOT: ["DAY_START", "NIGHT_START", "GAME_END"],
  GAME_END: ["LOBBY"], // 允许重新开始
};

/**
 * 检查阶段转换是否有效
 */
export function isValidTransition(from: Phase, to: Phase): boolean {
  const validTargets = VALID_TRANSITIONS[from];
  return validTargets?.includes(to) ?? false;
}

/**
 * 安全的阶段转换 atom
 * 如果转换无效，会抛出错误（开发环境）或记录警告（生产环境）
 */
export const safeTransitionAtom = atom(
  null,
  (get, set, nextPhase: Phase) => {
    const currentState = get(gameStateAtom);
    const currentPhase = currentState.phase;
    
    if (!isValidTransition(currentPhase, nextPhase)) {
      const error = `Invalid phase transition: ${currentPhase} -> ${nextPhase}`;
      if (process.env.NODE_ENV === "development") {
        console.error(error);
        // 在开发环境下仍然允许转换，但会警告
      }
      console.warn(error);
    }
    
    set(gameStateAtom, {
      ...currentState,
      phase: nextPhase,
    });
  }
);

// ============ 夜晚阶段处理 ============

/**
 * 检查某个角色是否需要在当前夜晚行动
 */
export const roleNeedsActionAtom = atom((get) => {
  const gameState = get(gameStateAtom);
  
  return (role: Role): boolean => {
    const player = gameState.players.find(p => p.role === role && p.alive);
    if (!player) return false;
    
    switch (role) {
      case "Guard":
        return true; // 守卫每晚都可以行动
      case "Werewolf":
        return true; // 狼人每晚都要行动
      case "Witch":
        return !gameState.roleAbilities.witchHealUsed || !gameState.roleAbilities.witchPoisonUsed;
      case "Seer":
        return true; // 预言家每晚都可以查验
      case "Hunter":
        return false; // 猎人不在夜晚行动
      default:
        return false;
    }
  };
});

/**
 * 获取下一个夜晚阶段
 */
export function getNextNightPhase(currentPhase: Phase, gameState: GameState): Phase {
  const phaseOrder: Phase[] = [
    "NIGHT_START",
    "NIGHT_GUARD_ACTION", 
    "NIGHT_WOLF_ACTION",
    "NIGHT_WITCH_ACTION",
    "NIGHT_SEER_ACTION",
    "NIGHT_RESOLVE",
  ];
  
  const currentIndex = phaseOrder.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
    return "NIGHT_RESOLVE";
  }
  
  // 检查下一个阶段是否需要执行
  const nextPhase = phaseOrder[currentIndex + 1];
  
  // 如果该阶段的角色不存在或已死亡，跳过
  const roleForPhase: Record<string, Role> = {
    NIGHT_GUARD_ACTION: "Guard",
    NIGHT_WOLF_ACTION: "Werewolf",
    NIGHT_WITCH_ACTION: "Witch",
    NIGHT_SEER_ACTION: "Seer",
  };
  
  const requiredRole = roleForPhase[nextPhase];
  if (requiredRole) {
    const hasAliveRole = gameState.players.some(p => p.role === requiredRole && p.alive);
    if (!hasAliveRole) {
      // 递归跳到下一个阶段
      return getNextNightPhase(nextPhase, gameState);
    }
    
    // 女巫特殊检查：两瓶药都用完则跳过
    if (requiredRole === "Witch") {
      if (gameState.roleAbilities.witchHealUsed && gameState.roleAbilities.witchPoisonUsed) {
        return getNextNightPhase(nextPhase, gameState);
      }
    }
  }
  
  return nextPhase;
}
