/**
 * 游戏状态机 - 使用 jotai 实现
 * 清晰定义所有游戏阶段和转换逻辑
 */

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { GameState, Phase, Player, Role } from "@/types/game";
import { isWolfRole } from "@/types/game";
import type { GameAnalysisData } from "@/types/analysis";
import { createInitialGameState } from "@/lib/game-master";
import { getI18n } from "@/i18n/translator";

// ============ 游戏状态持久化配置 ============

const GAME_STATE_STORAGE_KEY = "wolfcha.game_state";
const GAME_STATE_VERSION = 1;
// 24 hours in milliseconds - states older than this won't be restored
const GAME_STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PersistedGameState {
  version: number;
  state: GameState;
  savedAt: number;
}

// Phases that indicate a game is in progress (for UI display purposes)
const IN_PROGRESS_PHASES: Phase[] = [
  "NIGHT_START",
  "NIGHT_GUARD_ACTION",
  "NIGHT_WOLF_ACTION",
  "NIGHT_WITCH_ACTION",
  "NIGHT_SEER_ACTION",
  "NIGHT_RESOLVE",
  "DAY_START",
  "DAY_BADGE_SIGNUP",
  "DAY_BADGE_SPEECH",
  "DAY_BADGE_ELECTION",
  "DAY_PK_SPEECH",
  "DAY_SPEECH",
  "DAY_LAST_WORDS",
  "DAY_VOTE",
  "DAY_RESOLVE",
  "BADGE_TRANSFER",
  "HUNTER_SHOOT",
];

/**
 * Check if a game state represents a game in progress that should be restored
 */
export function isGameInProgress(state: GameState | null | undefined): boolean {
  if (!state) return false;
  return IN_PROGRESS_PHASES.includes(state.phase);
}

/**
 * Check if the current phase's required action has been completed.
 * We only save state when the phase action is complete to avoid
 * restoring into the middle of an action.
 * 
 * 细粒度保存策略：
 * - 守卫选完 → 可保存
 * - 狼人选完 → 可保存
 * - 女巫决定完 → 可保存
 * - 预言家查完 → 可保存
 * - 白天/夜晚开始 → 可保存（过渡阶段）
 */
function isPhaseActionCompleted(state: GameState): boolean {
  switch (state.phase) {
    // 过渡阶段，进入时即可保存
    case "NIGHT_START":
    case "DAY_START":
      return true;

    // 警长竞选报名：即使在报名中途也属于“稳定态”（只是等待更多人的选择）
    // 刷新恢复后可继续报名/等待AI报名，不需要回退到 DAY_START 重跑整个流程
    case "DAY_BADGE_SIGNUP":
      return true;

    case "NIGHT_GUARD_ACTION": {
      const guard = state.players.find((p) => p.role === "Guard" && p.alive);
      // 没有守卫，或守卫已选择目标
      return !guard || state.nightActions.guardTarget !== undefined;
    }

    case "NIGHT_WOLF_ACTION": {
      const aliveWolves = state.players.filter((p) => p.role === "Werewolf" && p.alive);
      if (aliveWolves.length === 0) return true;
      // 狼人已选择目标
      return state.nightActions.wolfTarget !== undefined;
    }

    case "NIGHT_WITCH_ACTION": {
      const witch = state.players.find((p) => p.role === "Witch" && p.alive);
      if (!witch) return true;
      // 药都用完了
      if (state.roleAbilities.witchHealUsed && state.roleAbilities.witchPoisonUsed) return true;
      // 女巫已做出决定（救人、毒人、或明确不救）
      // 注意：witchSave === false 表示明确不救，undefined 表示还没决定
      return (
        state.nightActions.witchSave !== undefined ||
        state.nightActions.witchPoison !== undefined
      );
    }

    case "NIGHT_SEER_ACTION": {
      const seer = state.players.find((p) => p.role === "Seer" && p.alive);
      // 没有预言家，或预言家已查验
      return !seer || state.nightActions.seerTarget !== undefined;
    }

    case "NIGHT_RESOLVE":
      // 夜晚结算阶段，通常很快就会进入 DAY_START
      // 为安全起见，不在这里保存
      return false;

    case "DAY_BADGE_ELECTION": {
      const candidates = Array.isArray(state.badge?.candidates) ? state.badge.candidates : [];
      // 候选人不投票
      const voterIds = state.players
        .filter((p) => p.alive && !candidates.includes(p.seat))
        .map((p) => p.playerId);
      if (voterIds.length === 0) return true;
      return voterIds.every((id) => typeof state.badge?.votes?.[id] === "number");
    }

    case "DAY_VOTE": {
      // PK投票时，参与PK的人不投票
      const pkTargets =
        state.pkSource === "vote" && Array.isArray(state.pkTargets) ? state.pkTargets : [];
      const voterIds = state.players
        .filter((p) => p.alive && !pkTargets.includes(p.seat))
        .map((p) => p.playerId);
      if (voterIds.length === 0) return true;
      return voterIds.every((id) => typeof state.votes[id] === "number");
    }

    // 发言阶段：允许保存（会牺牲“刷新后能继续同一段流式发言”的能力）
    // 但可以显著提升 Day 1 警徽竞选、发言推进等场景的恢复颗粒度，避免刷新后回到 DAY_START 重跑流程。
    case "DAY_BADGE_SPEECH":
    case "DAY_PK_SPEECH":
    case "DAY_SPEECH":
    case "DAY_LAST_WORDS":
      return true;

    // 其他阶段比较复杂，暂不在中间保存
    case "DAY_RESOLVE":
    case "BADGE_TRANSFER":
    case "HUNTER_SHOOT":
      return false;

    default:
      return false;
  }
}

/**
 * Get the "fallback" phase to restore to if the current phase action is incomplete.
 * Returns the previous stable checkpoint.
 */
export function getRestorePhase(state: GameState): Phase {
  // 如果当前阶段已完成，可以直接恢复到当前阶段
  if (isPhaseActionCompleted(state)) {
    return state.phase;
  }

  // 否则回退到上一个稳定点
  switch (state.phase) {
    case "NIGHT_GUARD_ACTION":
      return "NIGHT_START";
    case "NIGHT_WOLF_ACTION":
      // 如果守卫已选，回到守卫选完后的状态
      const guard = state.players.find((p) => p.role === "Guard" && p.alive);
      if (!guard || state.nightActions.guardTarget !== undefined) {
        return "NIGHT_GUARD_ACTION";
      }
      return "NIGHT_START";
    case "NIGHT_WITCH_ACTION":
      // 如果狼人已选，回到狼人选完后的状态
      if (state.nightActions.wolfTarget !== undefined) {
        return "NIGHT_WOLF_ACTION";
      }
      return "NIGHT_START";
    case "NIGHT_SEER_ACTION":
      // 检查女巫是否已决定
      const witch = state.players.find((p) => p.role === "Witch" && p.alive);
      const witchDone =
        !witch ||
        (state.roleAbilities.witchHealUsed && state.roleAbilities.witchPoisonUsed) ||
        state.nightActions.witchSave !== undefined ||
        state.nightActions.witchPoison !== undefined;
      if (witchDone) {
        return "NIGHT_WITCH_ACTION";
      }
      if (state.nightActions.wolfTarget !== undefined) {
        return "NIGHT_WOLF_ACTION";
      }
      return "NIGHT_START";
    case "NIGHT_RESOLVE":
      // 回到预言家阶段
      return "NIGHT_SEER_ACTION";
    case "DAY_SPEECH":
    case "DAY_BADGE_SIGNUP":
    case "DAY_BADGE_SPEECH":
    case "DAY_BADGE_ELECTION":
    case "DAY_PK_SPEECH":
    case "DAY_VOTE":
    case "DAY_LAST_WORDS":
    case "DAY_RESOLVE":
    case "BADGE_TRANSFER":
    case "HUNTER_SHOOT":
      // 白天的复杂阶段，回到 DAY_START
      return "DAY_START";
    default:
      return state.phase;
  }
}

/**
 * Validate that a game state has all required fields and is structurally valid
 */
// All valid Phase values for validation
const VALID_PHASES: readonly string[] = [
  "LOBBY", "SETUP",
  "NIGHT_START", "NIGHT_GUARD_ACTION", "NIGHT_WOLF_ACTION",
  "NIGHT_WITCH_ACTION", "NIGHT_SEER_ACTION", "NIGHT_RESOLVE",
  "DAY_START", "DAY_BADGE_SIGNUP", "DAY_BADGE_SPEECH", "DAY_BADGE_ELECTION",
  "DAY_PK_SPEECH", "DAY_SPEECH", "DAY_LAST_WORDS", "DAY_VOTE", "DAY_RESOLVE",
  "BADGE_TRANSFER", "HUNTER_SHOOT", "GAME_END",
] as const;

function isValidGameState(state: unknown): state is GameState {
  if (!state || typeof state !== "object") return false;
  
  const s = state as Record<string, unknown>;
  
  // Check required string fields
  if (typeof s.gameId !== "string" || !s.gameId) return false;
  if (typeof s.phase !== "string" || !VALID_PHASES.includes(s.phase)) return false;
  
  // Check required number fields
  if (typeof s.day !== "number" || !Number.isFinite(s.day)) return false;
  
  // Check players array
  if (!Array.isArray(s.players)) return false;
  
  // Check required objects
  if (!s.badge || typeof s.badge !== "object") return false;
  if (!s.roleAbilities || typeof s.roleAbilities !== "object") return false;
  if (!s.nightActions || typeof s.nightActions !== "object") return false;
  
  // Check arrays
  if (!Array.isArray(s.messages)) return false;
  if (!Array.isArray(s.events)) return false;
  
  // Check objects (can be empty)
  if (typeof s.votes !== "object" || s.votes === null) return false;
  if (typeof s.voteHistory !== "object" || s.voteHistory === null) return false;
  if (typeof s.dailySummaries !== "object" || s.dailySummaries === null) return false;
  if (typeof s.dailySummaryFacts !== "object" || s.dailySummaryFacts === null) return false;
  
  return true;
}

/**
 * Normalize a game state to ensure all fields have valid values
 * This handles partial or corrupted data by filling in defaults
 */
function normalizeGameState(state: GameState): GameState {
  const initial = createInitialGameState();
  
  return {
    ...initial,
    ...state,
    // Ensure required fields have valid values
    gameId: state.gameId || initial.gameId,
    phase: state.phase || initial.phase,
    day: typeof state.day === "number" && Number.isFinite(state.day) ? state.day : initial.day,
    difficulty: state.difficulty || initial.difficulty,
    players: Array.isArray(state.players) ? state.players : initial.players,
    events: Array.isArray(state.events) ? state.events : initial.events,
    messages: Array.isArray(state.messages) ? state.messages : initial.messages,
    votes: state.votes && typeof state.votes === "object" ? state.votes : initial.votes,
    voteHistory: state.voteHistory && typeof state.voteHistory === "object" ? state.voteHistory : initial.voteHistory,
    dailySummaries: state.dailySummaries && typeof state.dailySummaries === "object" ? state.dailySummaries : initial.dailySummaries,
    dailySummaryFacts: state.dailySummaryFacts && typeof state.dailySummaryFacts === "object" ? state.dailySummaryFacts : initial.dailySummaryFacts,
    badge: state.badge && typeof state.badge === "object" ? {
      ...initial.badge,
      ...state.badge,
    } : initial.badge,
    nightActions: state.nightActions && typeof state.nightActions === "object" ? state.nightActions : initial.nightActions,
    roleAbilities: state.roleAbilities && typeof state.roleAbilities === "object" ? {
      ...initial.roleAbilities,
      ...state.roleAbilities,
    } : initial.roleAbilities,
    winner: state.winner ?? null,
  };
}

/**
 * Load and validate game state from localStorage
 * Returns initial state if no valid saved state exists
 */
function loadPersistedGameState(): GameState {
  const initial = createInitialGameState();
  
  // SSR safety check
  if (typeof window === "undefined") {
    return initial;
  }
  
  try {
    const raw = localStorage.getItem(GAME_STATE_STORAGE_KEY);
    if (!raw) return initial;
    
    const parsed: PersistedGameState = JSON.parse(raw);
    
    // Version check for future migrations
    if (parsed.version !== GAME_STATE_VERSION) {
      console.warn(`[wolfcha] Game state version mismatch: ${parsed.version} !== ${GAME_STATE_VERSION}`);
      localStorage.removeItem(GAME_STATE_STORAGE_KEY);
      return initial;
    }
    
    // Check if the saved state is too old
    const age = Date.now() - parsed.savedAt;
    if (age > GAME_STATE_MAX_AGE_MS) {
      console.info("[wolfcha] Saved game state expired, starting fresh");
      localStorage.removeItem(GAME_STATE_STORAGE_KEY);
      return initial;
    }
    
    // Validate the state structure
    if (!isValidGameState(parsed.state)) {
      console.warn("[wolfcha] Invalid saved game state structure");
      localStorage.removeItem(GAME_STATE_STORAGE_KEY);
      return initial;
    }
    
    // Only restore if game is in progress
    if (!isGameInProgress(parsed.state)) {
      console.info("[wolfcha] Saved game not in progress, starting fresh");
      localStorage.removeItem(GAME_STATE_STORAGE_KEY);
      return initial;
    }
    
    // Players must exist for a valid in-progress game
    if (parsed.state.players.length === 0) {
      console.warn("[wolfcha] Saved game has no players");
      localStorage.removeItem(GAME_STATE_STORAGE_KEY);
      return initial;
    }
    
    // 细粒度恢复：如果当前阶段的动作未完成，回退到上一个稳定点
    const savedState = normalizeGameState(parsed.state);
    const restorePhase = getRestorePhase(savedState);
    
    if (restorePhase !== savedState.phase) {
      console.info(`[wolfcha] Phase ${savedState.phase} action incomplete, restoring to ${restorePhase}`);
      // 回退 phase，但保留已完成的 nightActions
      const restoredState = {
        ...savedState,
        phase: restorePhase,
      };
      console.info(`[wolfcha] Restoring game from ${new Date(parsed.savedAt).toLocaleString()} at phase ${restorePhase} (rolled back from ${savedState.phase})`);
      return restoredState;
    }
    
    console.info(`[wolfcha] Restoring game from ${new Date(parsed.savedAt).toLocaleString()} at phase ${parsed.state.phase}`);
    return savedState;
    
  } catch (error) {
    console.error("[wolfcha] Failed to load saved game state:", error);
    // Clear potentially corrupted data
    try {
      localStorage.removeItem(GAME_STATE_STORAGE_KEY);
    } catch {
      // Ignore errors when clearing
    }
    return initial;
  }
}

// 发言阶段 throttle：避免流式消息追加导致频繁 JSON 序列化
const SPEECH_SAVE_THROTTLE_MS = 3000;
let lastSpeechSaveTimestamp = 0;
let pendingSpeechSaveTimer: ReturnType<typeof setTimeout> | null = null;

// Phases where throttled saving is applied (frequent state updates during speech)
const THROTTLED_SAVE_PHASES: Phase[] = [
  "DAY_BADGE_SPEECH",
  "DAY_PK_SPEECH",
  "DAY_SPEECH",
  "DAY_LAST_WORDS",
];

/**
 * Save game state to localStorage
 * 细粒度保存：只有当阶段动作完成时才保存
 * 这样刷新后可以恢复到最近完成的检查点
 * 
 * 发言阶段使用 throttle 策略，避免频繁序列化影响性能
 */
function saveGameState(state: GameState): void {
  // SSR safety check
  if (typeof window === "undefined") return;
  
  // Clear saved state when game ends or returns to lobby
  if (!isGameInProgress(state)) {
    // Clear any pending throttled save
    if (pendingSpeechSaveTimer !== null) {
      clearTimeout(pendingSpeechSaveTimer);
      pendingSpeechSaveTimer = null;
    }
    try {
      localStorage.removeItem(GAME_STATE_STORAGE_KEY);
    } catch {
      // Ignore errors
    }
    return;
  }
  
  // 只有当阶段动作完成时才保存
  // 这样刷新后恢复的是"最近完成的动作"，而不是"正在进行的动作"
  if (!isPhaseActionCompleted(state)) {
    // 动作未完成，不保存，保留之前的检查点
    return;
  }
  
  // 发言阶段使用 throttle：降低频繁 JSON.stringify 的性能损耗
  // 但遗言阶段需要立即保存，因为它是关键的阶段转换点
  if (THROTTLED_SAVE_PHASES.includes(state.phase) && state.phase !== "DAY_LAST_WORDS") {
    const now = Date.now();
    const elapsed = now - lastSpeechSaveTimestamp;
    
    if (elapsed < SPEECH_SAVE_THROTTLE_MS) {
      // 距离上次保存不足阈值，延迟保存（确保最终一定会保存最新状态）
      if (pendingSpeechSaveTimer !== null) {
        clearTimeout(pendingSpeechSaveTimer);
      }
      pendingSpeechSaveTimer = setTimeout(() => {
        pendingSpeechSaveTimer = null;
        doSaveGameState(state);
        lastSpeechSaveTimestamp = Date.now();
      }, SPEECH_SAVE_THROTTLE_MS - elapsed);
      return;
    }
    
    lastSpeechSaveTimestamp = now;
  }
  
  // Clear any pending throttled save since we're saving now
  if (pendingSpeechSaveTimer !== null) {
    clearTimeout(pendingSpeechSaveTimer);
    pendingSpeechSaveTimer = null;
  }
  
  doSaveGameState(state);
}

/** Internal: actually write state to localStorage */
function doSaveGameState(state: GameState): void {
  // Double-check: don't save if game is no longer in progress
  // This handles the case where a throttled timer fires after the user exits the game
  if (!isGameInProgress(state)) {
    return;
  }
  
  try {
    const persisted: PersistedGameState = {
      version: GAME_STATE_VERSION,
      state,
      savedAt: Date.now(),
    };
    localStorage.setItem(GAME_STATE_STORAGE_KEY, JSON.stringify(persisted));
    console.debug(`[wolfcha] Saved checkpoint at ${state.phase}, day ${state.day}`);
  } catch (error) {
    console.error("[wolfcha] Failed to save game state:", error);
  }
}

/**
 * Clear persisted game state from localStorage
 */
export function clearPersistedGameState(): void {
  if (typeof window === "undefined") return;
  // Clear any pending throttled save
  if (pendingSpeechSaveTimer !== null) {
    clearTimeout(pendingSpeechSaveTimer);
    pendingSpeechSaveTimer = null;
  }
  try {
    localStorage.removeItem(GAME_STATE_STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}

// ============ 基础状态 Atoms ============

// 持久化存储
export const humanNameAtom = atomWithStorage("wolfcha_human_name", "");
export const apiKeyConfirmedAtom = atom(false);

// Raw game state atom with localStorage persistence
const rawGameStateAtom = atom<GameState>(loadPersistedGameState());

// 游戏核心状态 - wraps raw atom to handle persistence
export const gameStateAtom = atom(
  (get) => get(rawGameStateAtom),
  (get, set, update: GameState | ((prev: GameState) => GameState)) => {
    const prev = get(rawGameStateAtom);
    const next = typeof update === "function" ? update(prev) : update;
    set(rawGameStateAtom, next);
    // Persist to localStorage
    saveGameState(next);
  }
);

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

// 游戏分析数据 - 使用 localStorage 持久化存储
export const gameAnalysisAtom = atomWithStorage<GameAnalysisData | null>("wolfcha_analysis_data", null);
export const analysisLoadingAtom = atom(false);
export const analysisErrorAtom = atom<string | null>(null);

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
      return hp ? isWolfRole(hp.role) ? t("phase.nightWolf.human") : t("phase.nightWolf.description") : t("phase.nightWolf.description");
    },
    requiresHumanInput: (hp) => hp?.alive && isWolfRole(hp?.role ?? "Villager") || false,
    canSelectPlayer: (hp, target) => {
      if (!hp || !isWolfRole(hp.role) || !target.alive) return false;
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
      // Revealed Idiot cannot vote
      if (hp.role === "Idiot" && gs.roleAbilities.idiotRevealed) return false;
      // PK投票时，参与PK的人不需要投票
      if (gs.pkSource === "vote" && Array.isArray(gs.pkTargets) && gs.pkTargets.length > 0) {
        if (gs.pkTargets.includes(hp.seat)) return false;
      }
      return typeof gs.votes[hp?.playerId || ""] !== "number";
    },
    canSelectPlayer: (hp, target, gs) => {
      if (!hp?.alive || target.isHuman || !target.alive) return false;
      // Revealed Idiot cannot vote
      if (hp.role === "Idiot" && gs.roleAbilities.idiotRevealed) return false;
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
  WHITE_WOLF_KING_BOOM: {
    phase: "WHITE_WOLF_KING_BOOM",
    description: "phase.whiteWolfKingBoom.description",
    humanDescription: (hp) => {
      const { t } = getI18n();
      return hp?.role === "WhiteWolfKing" ? t("phase.whiteWolfKingBoom.human") : t("phase.whiteWolfKingBoom.description");
    },
    requiresHumanInput: (hp, gs) => hp?.role === "WhiteWolfKing" && hp?.alive && !gs.roleAbilities.whiteWolfKingBoomUsed || false,
    canSelectPlayer: (hp, target) => {
      if (!hp || hp.role !== "WhiteWolfKing" || !target.alive || target.isHuman) return false;
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

// 重置游戏（用于开始新游戏，保留持久化状态直到新游戏开始）
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
  set(gameAnalysisAtom, null);
  set(analysisLoadingAtom, false);
  set(analysisErrorAtom, null);
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
  DAY_BADGE_SPEECH: ["DAY_BADGE_ELECTION", "WHITE_WOLF_KING_BOOM"],
  DAY_BADGE_ELECTION: ["DAY_PK_SPEECH", "DAY_SPEECH"],
  DAY_PK_SPEECH: ["DAY_BADGE_ELECTION", "DAY_VOTE", "WHITE_WOLF_KING_BOOM"],
  DAY_SPEECH: ["DAY_VOTE", "WHITE_WOLF_KING_BOOM"],
  DAY_VOTE: ["DAY_RESOLVE"],
  DAY_RESOLVE: ["DAY_PK_SPEECH", "DAY_LAST_WORDS", "BADGE_TRANSFER", "NIGHT_START", "GAME_END"],
  DAY_LAST_WORDS: ["NIGHT_START", "HUNTER_SHOOT", "BADGE_TRANSFER", "GAME_END"],
  
  // 特殊阶段
  BADGE_TRANSFER: ["DAY_LAST_WORDS", "HUNTER_SHOOT", "NIGHT_START", "DAY_SPEECH", "GAME_END"],
  HUNTER_SHOOT: ["DAY_START", "NIGHT_START", "BADGE_TRANSFER", "GAME_END"],
  WHITE_WOLF_KING_BOOM: ["NIGHT_START", "HUNTER_SHOOT", "GAME_END"],
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
      case "WhiteWolfKing":
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
    const hasAliveRole = requiredRole === "Werewolf"
      ? gameState.players.some(p => isWolfRole(p.role) && p.alive)
      : gameState.players.some(p => p.role === requiredRole && p.alive);
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
