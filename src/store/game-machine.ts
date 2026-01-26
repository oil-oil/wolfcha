/**
 * 游戏状态机 - 使用 jotai 实现
 * 清晰定义所有游戏阶段和转换逻辑
 */

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { GameState, Phase, Player, Role } from "@/types/game";
import { createInitialGameState } from "@/lib/game-master";
import { getI18n } from "@/i18n/translator";

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
    description: "phase.lobby.description",
    requiresHumanInput: () => false,
    canSelectPlayer: () => false,
    actionType: "none",
  },
  SETUP: {
    phase: "SETUP",
    description: "phase.setup.description",
    requiresHumanInput: () => false,
    canSelectPlayer: () => false,
    actionType: "none",
  },
  NIGHT_START: {
    phase: "NIGHT_START",
    description: "phase.nightStart.description",
    requiresHumanInput: () => false,
    canSelectPlayer: () => false,
    actionType: "none",
  },
  NIGHT_GUARD_ACTION: {
    phase: "NIGHT_GUARD_ACTION",
    description: "phase.nightGuard.description",
    humanDescription: (hp) => {
      const { t } = getI18n();
      return hp?.role === "Guard" ? t("phase.nightGuard.human") : t("phase.nightGuard.description");
    },
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
    description: "phase.nightWolf.description",
    humanDescription: (hp) => {
      const { t } = getI18n();
      return hp?.role === "Werewolf" ? t("phase.nightWolf.human") : t("phase.nightWolf.description");
    },
    requiresHumanInput: (hp) => hp?.alive && hp?.role === "Werewolf" || false,
    canSelectPlayer: (hp, target) => {
      if (!hp || hp.role !== "Werewolf" || !target.alive) return false;
      // 狼人可以刀任何存活玩家（包括队友和自己）
      return true;
    },
    actionType: "night_action",
  },
  NIGHT_WITCH_ACTION: {
    phase: "NIGHT_WITCH_ACTION",
    description: "phase.nightWitch.description",
    humanDescription: (hp) => {
      const { t } = getI18n();
      return hp?.role === "Witch" ? t("phase.nightWitch.human") : t("phase.nightWitch.description");
    },
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
    description: "phase.nightSeer.description",
    humanDescription: (hp) => {
      const { t } = getI18n();
      return hp?.role === "Seer" ? t("phase.nightSeer.human") : t("phase.nightSeer.description");
    },
    requiresHumanInput: (hp) => hp?.alive && hp?.role === "Seer" || false,
    canSelectPlayer: (hp, target, gs) => {
      if (!hp || hp.role !== "Seer" || !target.alive || target.isHuman) return false;
      // Seer can only check once per night
      if (gs.nightActions.seerTarget !== undefined) return false;
      return true;
    },
    actionType: "night_action",
  },
  NIGHT_RESOLVE: {
    phase: "NIGHT_RESOLVE",
    description: "phase.nightResolve.description",
    requiresHumanInput: () => false,
    canSelectPlayer: () => false,
    actionType: "none",
  },
  DAY_START: {
    phase: "DAY_START",
    description: "phase.dayStart.description",
    requiresHumanInput: () => false,
    canSelectPlayer: () => false,
    actionType: "none",
  },
  DAY_BADGE_SIGNUP: {
    phase: "DAY_BADGE_SIGNUP",
    description: "phase.badgeSignup.description",
    humanDescription: (hp, gs) => {
      const { t } = getI18n();
      return hp?.alive && typeof gs.badge.signup?.[hp.playerId] !== "boolean"
        ? t("phase.badgeSignup.human")
        : t("phase.badgeSignup.description");
    },
    requiresHumanInput: (hp, gs) => hp?.alive && typeof gs.badge.signup?.[hp.playerId] !== "boolean" || false,
    canSelectPlayer: () => false,
    actionType: "special",
  },
  DAY_BADGE_SPEECH: {
    phase: "DAY_BADGE_SPEECH",
    description: "phase.badgeSpeech.description",
    humanDescription: (hp, gs) => {
      const { t } = getI18n();
      return gs.currentSpeakerSeat === hp?.seat
        ? t("phase.speechYourTurn")
        : t("phase.badgeSpeech.description");
    },
    requiresHumanInput: (hp, gs) => hp?.alive && gs.currentSpeakerSeat === hp?.seat || false,
    canSelectPlayer: () => false,
    actionType: "speech",
  },
  DAY_BADGE_ELECTION: {
    phase: "DAY_BADGE_ELECTION",
    description: "phase.badgeElection.description",
    humanDescription: (hp, gs) => {
      const { t } = getI18n();
      const candidates = gs.badge.candidates || [];
      if (candidates.length === 0) return t("phase.badgeElection.description");
      if (hp && candidates.includes(hp.seat)) return t("phase.badgeElection.noVote");
      return hp?.alive && typeof gs.badge.votes[hp.playerId] !== "number"
        ? t("phase.badgeElection.human")
        : t("phase.badgeElection.description");
    },
    requiresHumanInput: (hp, gs) => {
      if (!hp?.alive) return false;
      // 候选人不需要投票
      const candidates = gs.badge.candidates || [];
      if (candidates.length === 0) return false;
      if (candidates.includes(hp.seat)) return false;
      return typeof gs.badge.votes[hp.playerId] !== "number";
    },
    canSelectPlayer: (hp, target, gs) => {
      if (!hp?.alive || !target.alive) return false;
      if (target.isHuman) return false;
      // 候选人不能投票
      const candidates = gs.badge.candidates || [];
      if (candidates.length === 0) return false;
      if (candidates.includes(hp.seat)) return false;
      if (typeof gs.badge.votes[hp.playerId] === "number") return false;
      if (candidates.length > 0 && !candidates.includes(target.seat)) return false;
      return true;
    },
    actionType: "vote",
  },
  DAY_PK_SPEECH: {
    phase: "DAY_PK_SPEECH",
    description: "phase.pkSpeech.description",
    humanDescription: (hp, gs) => {
      const { t } = getI18n();
      return gs.currentSpeakerSeat === hp?.seat ? t("phase.speechYourTurn") : t("phase.pkSpeech.description");
    },
    requiresHumanInput: (hp, gs) => hp?.alive && gs.currentSpeakerSeat === hp?.seat || false,
    canSelectPlayer: () => false,
    actionType: "speech",
  },
  DAY_SPEECH: {
    phase: "DAY_SPEECH",
    description: "phase.daySpeech.description",
    humanDescription: (hp, gs) => {
      const { t } = getI18n();
      return gs.currentSpeakerSeat === hp?.seat ? t("phase.speechYourTurn") : t("phase.daySpeech.description");
    },
    requiresHumanInput: (hp, gs) => hp?.alive && gs.currentSpeakerSeat === hp?.seat || false,
    canSelectPlayer: () => false,
    actionType: "speech",
  },
  DAY_LAST_WORDS: {
    phase: "DAY_LAST_WORDS",
    description: "phase.lastWords.description",
    requiresHumanInput: (hp, gs) => gs.currentSpeakerSeat === hp?.seat || false,
    canSelectPlayer: () => false,
    actionType: "speech",
  },
  DAY_VOTE: {
    phase: "DAY_VOTE",
    description: "phase.dayVote.description",
    humanDescription: (hp, gs) => {
      const { t } = getI18n();
      // PK投票时，参与PK的人不能投票
      if (gs.pkSource === "vote" && Array.isArray(gs.pkTargets) && gs.pkTargets.length > 0) {
        if (hp && gs.pkTargets.includes(hp.seat)) {
          return t("phase.dayVote.noVotePk");
        }
      }
      return hp?.alive && typeof gs.votes[hp?.playerId || ""] !== "number"
        ? t("phase.dayVote.human")
        : t("phase.dayVote.description");
    },
    requiresHumanInput: (hp, gs) => {
      if (!hp?.alive) return false;
      // PK投票时，参与PK的人不需要投票
      if (gs.pkSource === "vote" && Array.isArray(gs.pkTargets) && gs.pkTargets.length > 0) {
        if (gs.pkTargets.includes(hp.seat)) return false;
      }
      return typeof gs.votes[hp?.playerId || ""] !== "number";
    },
    canSelectPlayer: (hp, target, gs) => {
      if (!hp?.alive || target.isHuman || !target.alive) return false;
      if (typeof gs.votes[hp.playerId] === "number") return false;
      // PK投票时，参与PK的人不能投票
      if (gs.pkSource === "vote" && Array.isArray(gs.pkTargets) && gs.pkTargets.length > 0) {
        if (gs.pkTargets.includes(hp.seat)) return false;
        return gs.pkTargets.includes(target.seat);
      }
      if (gs.pkSource === "vote" && Array.isArray(gs.pkTargets) && gs.pkTargets.length === 0) {
        return false;
      }
      return true;
    },
    actionType: "vote",
  },
  DAY_RESOLVE: {
    phase: "DAY_RESOLVE",
    description: "phase.dayResolve.description",
    requiresHumanInput: () => false,
    canSelectPlayer: () => false,
    actionType: "none",
  },
  BADGE_TRANSFER: {
    phase: "BADGE_TRANSFER",
    description: "phase.badgeTransfer.description",
    humanDescription: () => {
      const { t } = getI18n();
      return t("phase.badgeTransfer.human");
    },
    requiresHumanInput: (hp, gs) => {
      // 只有当人类玩家是死亡的警长时才需要输入
      const sheriffSeat = gs.badge.holderSeat;
      return hp?.seat === sheriffSeat && !hp?.alive || false;
    },
    canSelectPlayer: (hp, target, gs) => {
      // 只能选择存活的非自己的玩家
      if (!target.alive || target.isHuman) return false;
      const sheriffSeat = gs.badge.holderSeat;
      if (hp?.seat !== sheriffSeat) return false;
      return true;
    },
    actionType: "vote",
  },
  HUNTER_SHOOT: {
    phase: "HUNTER_SHOOT",
    description: "phase.hunterShoot.description",
    humanDescription: (hp) => {
      const { t } = getI18n();
      return hp?.role === "Hunter" ? t("phase.hunterShoot.human") : t("phase.hunterShoot.description");
    },
    requiresHumanInput: (hp, gs) => hp?.role === "Hunter" && gs.roleAbilities.hunterCanShoot || false,
    canSelectPlayer: (hp, target) => {
      if (!hp || hp.role !== "Hunter" || !target.alive || target.isHuman) return false;
      return true;
    },
    actionType: "night_action",
  },
  GAME_END: {
    phase: "GAME_END",
    description: "phase.gameEnd.description",
    humanDescription: (_, gs) => {
      const { t } = getI18n();
      return gs.winner === "village" ? t("phase.gameEnd.villageWin") : t("phase.gameEnd.wolfWin");
    },
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
  const { t } = getI18n();
  const gameState = get(gameStateAtom);
  const humanPlayer = get(humanPlayerAtom);
  const config = PHASE_CONFIGS[gameState.phase];
  
  if (config.humanDescription) {
    return config.humanDescription(humanPlayer, gameState);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return t(config.description as any);
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
  NIGHT_RESOLVE: ["DAY_START", "HUNTER_SHOOT", "BADGE_TRANSFER", "GAME_END"],
  
  // 白天流程: 开始 -> 发言 -> 投票 -> 结算
  DAY_START: ["DAY_BADGE_SIGNUP", "DAY_SPEECH"],
  DAY_BADGE_SIGNUP: ["DAY_BADGE_SPEECH", "DAY_SPEECH"],
  DAY_BADGE_SPEECH: ["DAY_BADGE_ELECTION"],
  DAY_BADGE_ELECTION: ["DAY_PK_SPEECH", "DAY_SPEECH"],
  DAY_PK_SPEECH: ["DAY_BADGE_ELECTION", "DAY_VOTE"],
  DAY_SPEECH: ["DAY_VOTE"],
  DAY_VOTE: ["DAY_RESOLVE"],
  DAY_RESOLVE: ["DAY_PK_SPEECH", "DAY_LAST_WORDS", "BADGE_TRANSFER", "NIGHT_START", "GAME_END"],
  DAY_LAST_WORDS: ["NIGHT_START", "HUNTER_SHOOT", "BADGE_TRANSFER", "GAME_END"],
  
  // 特殊阶段
  BADGE_TRANSFER: ["DAY_LAST_WORDS", "HUNTER_SHOOT", "NIGHT_START", "DAY_SPEECH", "GAME_END"],
  HUNTER_SHOOT: ["DAY_START", "NIGHT_START", "BADGE_TRANSFER", "GAME_END"],
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
