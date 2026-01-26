/**
 * SmartJumpManager - 智能跳阶与状态自愈模块
 * 
 * 该模块提供纯函数，用于处理开发者模式下的非线性阶段跳转，
 * 确保游戏状态在任意跳转后保持逻辑一致性。
 */

import type { GameState, Phase, Player, Role } from "@/types/game";
import { getI18n } from "@/i18n/translator";

// ============ 阶段顺序定义 ============

/** 完整的阶段顺序（用于比较先后） */
export const PHASE_ORDER: Phase[] = [
  "LOBBY",
  "SETUP",
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
  "DAY_SPEECH",
  "DAY_VOTE",
  "DAY_RESOLVE",
  "DAY_LAST_WORDS",
  "BADGE_TRANSFER",
  "HUNTER_SHOOT",
  "GAME_END",
];

/** 需要关键决策的阶段（跳过时需要补全） */
export const ACTION_PHASES: Phase[] = [
  "NIGHT_GUARD_ACTION",
  "NIGHT_WOLF_ACTION",
  "NIGHT_WITCH_ACTION",
  "NIGHT_SEER_ACTION",
  "DAY_VOTE",
];

/** 阶段依赖的数据字段 */
export const PHASE_DEPENDENCIES: Partial<Record<Phase, string[]>> = {
  NIGHT_RESOLVE: ["guardTarget", "wolfTarget"],
  DAY_RESOLVE: ["votes"],
  DAY_LAST_WORDS: ["votes"],
};

// ============ 跳转上下文与结果类型 ============

export interface JumpTarget {
  day: number;
  phase: Phase;
}

export interface JumpOptions {
  fillMode: "auto" | "manual";
}

export type JumpDirection = "forward" | "backward" | "same";

export interface MissingTask {
  phase: Phase;
  description: string;
  field: string;
  options?: { value: number | string; label: string }[];
}

export interface JumpAnalysis {
  direction: JumpDirection;
  crossDay: boolean;
  /** 前跳时需要补全的任务 */
  missingTasks: MissingTask[];
  /** 回滚时需要复活的玩家座位 */
  playersToRevive: number[];
  /** 回滚时需要恢复的技能 */
  abilitiesToRestore: string[];
  /** 需要清理的天数（回滚时） */
  daysToClean: number[];
}

export interface SmartJumpResult {
  /** 修复后的新状态 */
  newState: GameState;
  /** 是否需要用户手动补全 */
  needsManualFill: boolean;
  /** 需要补全的任务列表 */
  missingTasks: MissingTask[];
  /** 跳转分析信息（用于 UI 展示） */
  analysis: JumpAnalysis;
}

// ============ 核心工具函数 ============

/** 获取阶段在顺序中的索引 */
export function getPhaseIndex(phase: Phase): number {
  return PHASE_ORDER.indexOf(phase);
}

/** 比较两个时间点的先后 */
export function compareTimePoints(
  a: { day: number; phase: Phase },
  b: { day: number; phase: Phase }
): number {
  if (a.day !== b.day) return a.day - b.day;
  return getPhaseIndex(a.phase) - getPhaseIndex(b.phase);
}

/** 判断跳转方向 */
export function getJumpDirection(
  current: { day: number; phase: Phase },
  target: { day: number; phase: Phase }
): JumpDirection {
  const cmp = compareTimePoints(current, target);
  if (cmp > 0) return "backward";
  if (cmp < 0) return "forward";
  return "same";
}

/** 检查阶段是否属于夜晚 */
export function isNightPhase(phase: Phase): boolean {
  return phase.startsWith("NIGHT_");
}

/** 检查阶段是否属于白天 */
export function isDayPhase(phase: Phase): boolean {
  return phase.startsWith("DAY_");
}

// ============ 跳转分析 ============

/** 分析跳转影响 */
export function analyzeJump(
  state: GameState,
  target: JumpTarget
): JumpAnalysis {
  const current = { day: state.day, phase: state.phase };
  const direction = getJumpDirection(current, target);
  const crossDay = current.day !== target.day;

  const result: JumpAnalysis = {
    direction,
    crossDay,
    missingTasks: [],
    playersToRevive: [],
    abilitiesToRestore: [],
    daysToClean: [],
  };

  if (direction === "backward") {
    // 回滚分析
    analyzeBackwardJump(state, target, result);
  } else if (direction === "forward") {
    // 前跳分析
    analyzeForwardJump(state, target, result);
  }

  return result;
}

/** 分析回滚跳转 */
function analyzeBackwardJump(
  state: GameState,
  target: JumpTarget,
  result: JumpAnalysis
): void {
  // 收集需要清理的天数
  for (let d = target.day + 1; d <= state.day; d++) {
    result.daysToClean.push(d);
  }
  // 如果目标天数和当前天数相同但阶段更早，也需要标记当前天
  if (target.day === state.day && getPhaseIndex(target.phase) < getPhaseIndex(state.phase)) {
    // 同日回滚，不需要清理整天，只清理阶段数据
  }

  // 分析需要复活的玩家
  const deadPlayers = state.players.filter((p) => !p.alive);
  for (const player of deadPlayers) {
    // 检查玩家是否在目标时间点之后死亡
    const deathDay = findPlayerDeathDay(state, player.seat);
    if (deathDay !== null && deathDay > target.day) {
      result.playersToRevive.push(player.seat);
    } else if (deathDay === target.day) {
      // 同一天死亡，检查是否在目标阶段之后
      const deathPhase = findPlayerDeathPhase(state, player.seat, deathDay);
      if (deathPhase && getPhaseIndex(deathPhase) > getPhaseIndex(target.phase)) {
        result.playersToRevive.push(player.seat);
      }
    }
  }

  // 分析需要恢复的技能
  if (state.roleAbilities.witchHealUsed) {
    const usedDay = findAbilityUsedDay(state, "witchHeal");
    if (
      usedDay !== null &&
      compareTimePoints({ day: usedDay, phase: "NIGHT_WITCH_ACTION" }, target) > 0
    ) {
      result.abilitiesToRestore.push("witchHealUsed");
    }
  }
  if (state.roleAbilities.witchPoisonUsed) {
    const usedDay = findAbilityUsedDay(state, "witchPoison");
    if (
      usedDay !== null &&
      compareTimePoints({ day: usedDay, phase: "NIGHT_WITCH_ACTION" }, target) > 0
    ) {
      result.abilitiesToRestore.push("witchPoisonUsed");
    }
  }
}

/** 分析前跳跳转 */
function analyzeForwardJump(
  state: GameState,
  target: JumpTarget,
  result: JumpAnalysis
): void {
  const currentIdx = getPhaseIndex(state.phase);
  const targetIdx = getPhaseIndex(target.phase);

  // 如果当前处于关键决策阶段，且该阶段的关键数据尚未落盘，也需要补全
  if (ACTION_PHASES.includes(state.phase)) {
    const currentTasks = createMissingTasksForPhase(state, state.phase);
    result.missingTasks.push(...currentTasks);
  }

  // 收集跳过的需要补全的阶段
  if (state.day === target.day) {
    // 同日前跳
    for (let i = currentIdx + 1; i < targetIdx; i++) {
      const phase = PHASE_ORDER[i];
      if (ACTION_PHASES.includes(phase)) {
        const tasks = createMissingTasksForPhase(state, phase);
        result.missingTasks.push(...tasks);
      }
    }
  } else {
    // 跨日前跳：需要补全当前天剩余的所有关键阶段
    const alivePlayers = state.players.filter((p) => p.alive);
    const aliveVillagers = alivePlayers.filter((p) => p.alignment === "village");

    const lastNightDay = target.phase.startsWith("DAY_") ? target.day : target.day - 1;

    for (let d = state.day; d <= lastNightDay; d++) {
      const nightRecord = state.nightHistory?.[d] || {};

      const isCurrentDay = d === state.day;
      // 仅当“当前在白天阶段”时，才允许跳过本日夜晚已过去的阶段。
      // 如果当前仍在 NIGHT_*，说明这晚还未完整走完：即使阶段序上已越过，也必须补齐缺失的夜晚动作。
      const hasPassed = (phase: Phase) =>
        isCurrentDay && !state.phase.startsWith("NIGHT_") && currentIdx > getPhaseIndex(phase);

      const guard = state.players.find((p) => p.role === "Guard" && p.alive);
      const guardTargetExisting =
        d === state.day
          ? (state.nightActions.guardTarget ?? nightRecord.guardTarget)
          : nightRecord.guardTarget;
      if (guard && guardTargetExisting === undefined && !hasPassed("NIGHT_GUARD_ACTION")) {
        const { t } = getI18n();
        result.missingTasks.push({
          phase: "NIGHT_GUARD_ACTION",
          description: t("smartJump.nightGuardAction", { day: d }),
          field: `day${d}GuardTarget`,
          options: alivePlayers
            .filter((p) => p.seat !== state.nightActions.lastGuardTarget)
            .map((p) => ({ value: p.seat, label: t("devConsole.playerLabel", { seat: p.seat + 1, name: p.displayName }) })),
        });
      }

      const wolves = state.players.filter((p) => p.role === "Werewolf" && p.alive);
      const wolfTargetExisting =
        d === state.day
          ? (state.nightActions.wolfTarget ?? nightRecord.wolfTarget)
          : nightRecord.wolfTarget;
      if (wolves.length > 0 && wolfTargetExisting === undefined && !hasPassed("NIGHT_WOLF_ACTION")) {
        const { t } = getI18n();
        result.missingTasks.push({
          phase: "NIGHT_WOLF_ACTION",
          description: t("smartJump.nightWolfAction", { day: d }),
          field: `day${d}WolfTarget`,
          options: aliveVillagers.map((p) => ({
            value: p.seat,
            label: t("devConsole.playerLabel", { seat: p.seat + 1, name: p.displayName }),
          })),
        });
      }

      const witch = state.players.find((p) => p.role === "Witch" && p.alive);
      if (witch) {
        if (hasPassed("NIGHT_WITCH_ACTION")) {
          continue;
        }
        const wolfTargetForHeal = wolfTargetExisting;
        const witchSaveExisting =
          d === state.day
            ? (state.nightActions.witchSave ?? nightRecord.witchSave)
            : nightRecord.witchSave;
        const witchPoisonExisting =
          d === state.day
            ? (state.nightActions.witchPoison ?? nightRecord.witchPoison)
            : nightRecord.witchPoison;

        if (
          !state.roleAbilities.witchHealUsed &&
          witchSaveExisting === undefined &&
          (wolfTargetForHeal !== undefined || wolves.length > 0)
        ) {
          const { t } = getI18n();
          result.missingTasks.push({
            phase: "NIGHT_WITCH_ACTION",
            description: t("smartJump.nightWitchSave", { day: d }),
            field: `day${d}WitchSave`,
            options: [
              { value: "false", label: t("smartJump.witchSaveNo") },
              { value: "true", label: t("smartJump.witchSaveYes") },
            ],
          });
        }

        if (!state.roleAbilities.witchPoisonUsed && witchPoisonExisting === undefined) {
          const { t } = getI18n();
          result.missingTasks.push({
            phase: "NIGHT_WITCH_ACTION",
            description: t("smartJump.nightWitchPoison", { day: d }),
            field: `day${d}WitchPoison`,
            options: [
              { value: "none", label: t("smartJump.witchPoisonNo") },
              ...alivePlayers.map((p) => ({ value: p.seat, label: t("smartJump.witchPoisonTarget", { seat: p.seat + 1, name: p.displayName }) })),
            ],
          });
        }
      }

      const seer = state.players.find((p) => p.role === "Seer" && p.alive);
      const seerTargetExisting =
        d === state.day
          ? (state.nightActions.seerTarget ?? nightRecord.seerTarget)
          : nightRecord.seerTarget;
      if (seer && seerTargetExisting === undefined && !hasPassed("NIGHT_SEER_ACTION")) {
        const { t } = getI18n();
        const checkedSeats = (state.nightActions.seerHistory || []).map((h) => h.targetSeat);
        result.missingTasks.push({
          phase: "NIGHT_SEER_ACTION",
          description: t("smartJump.nightSeerAction", { day: d }),
          field: `day${d}SeerTarget`,
          options: alivePlayers
            .filter((p) => !p.isHuman && !checkedSeats.includes(p.seat))
            .map((p) => ({ value: p.seat, label: t("devConsole.playerLabel", { seat: p.seat + 1, name: p.displayName }) })),
        });
      }
    }

    for (let d = state.day; d < target.day; d++) {
      if (state.dayHistory?.[d]?.executed || state.dayHistory?.[d]?.voteTie) continue;
      const { t } = getI18n();
      result.missingTasks.push({
        phase: "DAY_VOTE",
        description: t("smartJump.dayVoteResult", { day: d }),
        field: `day${d}VoteResult`,
        options: alivePlayers
          .map((p) => ({ value: p.seat, label: t("devConsole.playerLabel", { seat: p.seat + 1, name: p.displayName }) }))
          .concat([{ value: -1, label: t("smartJump.voteTie") }]),
      });
    }
  }
}

/** 创建缺失任务（某些阶段可能有多个任务） */
function createMissingTasksForPhase(state: GameState, phase: Phase): MissingTask[] {
  if (phase === "NIGHT_WITCH_ACTION") {
    return createMissingTasksForWitch(state);
  }

  const task = createMissingTask(state, phase);
  return task ? [task] : [];
}

function createMissingTasksForWitch(state: GameState): MissingTask[] {
  const witch = state.players.find((p) => p.role === "Witch" && p.alive);
  if (!witch) return [];

  const tasks: MissingTask[] = [];

  const wolves = state.players.filter((p) => p.role === "Werewolf" && p.alive);
  const wolfTargetForHeal =
    state.nightActions.wolfTarget ?? state.nightHistory?.[state.day]?.wolfTarget;

  // 解药：仅当狼刀存在且解药未用时，才需要明确“是否使用解药”
  if (!state.roleAbilities.witchHealUsed && (wolfTargetForHeal !== undefined || wolves.length > 0)) {
    // 已经明确过是否救人，则无需补全
    if (state.nightActions.witchSave === undefined) {
      const { t } = getI18n();
      tasks.push({
        phase: "NIGHT_WITCH_ACTION",
        description: t("smartJump.witchSave"),
        field: "witchSave",
        options: [
          { value: "false", label: t("smartJump.witchSaveNo") },
          { value: "true", label: t("smartJump.witchSaveYes") },
        ],
      });
    }
  }

  // 毒药：仅当毒药未用时，才需要明确“是否毒/毒谁”
  if (!state.roleAbilities.witchPoisonUsed) {
    if (state.nightActions.witchPoison === undefined) {
      const { t } = getI18n();
      const alivePlayers = state.players.filter((p) => p.alive);
      tasks.push({
        phase: "NIGHT_WITCH_ACTION",
        description: t("smartJump.witchPoison"),
        field: "witchPoison",
        options: [
          { value: "none", label: t("smartJump.witchPoisonNo") },
          ...alivePlayers.map((p) => ({ value: p.seat, label: t("smartJump.witchPoisonTarget", { seat: p.seat + 1, name: p.displayName }) })),
        ],
      });
    }
  }

  return tasks;
}

/** 创建缺失任务 */
function createMissingTask(state: GameState, phase: Phase): MissingTask | null {
  const alivePlayers = state.players.filter((p) => p.alive);
  const aliveVillagers = alivePlayers.filter((p) => p.alignment === "village");

  switch (phase) {
    case "NIGHT_GUARD_ACTION": {
      const guard = state.players.find((p) => p.role === "Guard" && p.alive);
      if (!guard) return null;
      // 已经选择过目标则不需要补全
      if (state.nightActions.guardTarget !== undefined) return null;
      const { t } = getI18n();
      return {
        phase,
        description: t("smartJump.guardAction"),
        field: "guardTarget",
        options: alivePlayers
          .filter((p) => p.seat !== state.nightActions.lastGuardTarget)
          .map((p) => ({ value: p.seat, label: t("devConsole.playerLabel", { seat: p.seat + 1, name: p.displayName }) })),
      };
    }
    case "NIGHT_WOLF_ACTION": {
      const wolves = state.players.filter((p) => p.role === "Werewolf" && p.alive);
      if (wolves.length === 0) return null;
      if (state.nightActions.wolfTarget !== undefined) return null;
      const { t } = getI18n();
      return {
        phase,
        description: t("smartJump.wolfAction"),
        field: "wolfTarget",
        options: aliveVillagers.map((p) => ({
          value: p.seat,
          label: t("devConsole.playerLabel", { seat: p.seat + 1, name: p.displayName }),
        })),
      };
    }
    case "NIGHT_WITCH_ACTION": {
      // 女巫阶段可能有多个补全项（解药/毒药），由 createMissingTasksForPhase 统一处理
      return null;
    }
    case "NIGHT_SEER_ACTION": {
      const seer = state.players.find((p) => p.role === "Seer" && p.alive);
      if (!seer) return null;
      if (state.nightActions.seerTarget !== undefined) return null;
      const { t } = getI18n();
      const checkedSeats = (state.nightActions.seerHistory || []).map((h) => h.targetSeat);
      return {
        phase,
        description: t("smartJump.seerAction"),
        field: "seerTarget",
        options: alivePlayers
          .filter((p) => !p.isHuman && !checkedSeats.includes(p.seat))
          .map((p) => ({ value: p.seat, label: t("devConsole.playerLabel", { seat: p.seat + 1, name: p.displayName }) })),
      };
    }
    case "DAY_VOTE":
      // 已有投票结算（处决或平票）则不需要补全
      if (state.dayHistory?.[state.day]?.executed || state.dayHistory?.[state.day]?.voteTie) return null;
      const { t } = getI18n();
      return {
        phase,
        description: t("smartJump.voteAction"),
        field: "voteResult",
        options: alivePlayers
          .map((p) => ({ value: p.seat, label: t("devConsole.playerLabel", { seat: p.seat + 1, name: p.displayName }) }))
          .concat([{ value: -1, label: t("smartJump.voteTie") }]),
      };
    default:
      return null;
  }
}

/** 查找玩家死亡的天数 */
function findPlayerDeathDay(state: GameState, seat: number): number | null {
  // 从 nightHistory 和 dayHistory 中查找
  if (state.nightHistory) {
    for (const [dayStr, record] of Object.entries(state.nightHistory)) {
      if (record.deaths?.some((d) => d.seat === seat)) {
        return Number(dayStr);
      }
      if (record.hunterShot?.targetSeat === seat) {
        return Number(dayStr);
      }
    }
  }
  if (state.dayHistory) {
    for (const [dayStr, record] of Object.entries(state.dayHistory)) {
      if (record.executed?.seat === seat) {
        return Number(dayStr);
      }
      if (record.hunterShot?.targetSeat === seat) {
        return Number(dayStr);
      }
    }
  }
  return null;
}

/** 查找玩家死亡的阶段 */
function findPlayerDeathPhase(state: GameState, seat: number, day: number): Phase | null {
  const nightRecord = state.nightHistory?.[day];
  if (nightRecord?.deaths?.some((d) => d.seat === seat)) {
    return "NIGHT_RESOLVE";
  }
  if (nightRecord?.hunterShot?.targetSeat === seat) {
    return "HUNTER_SHOOT";
  }
  const dayRecord = state.dayHistory?.[day];
  if (dayRecord?.executed?.seat === seat) {
    return "DAY_RESOLVE";
  }
  if (dayRecord?.hunterShot?.targetSeat === seat) {
    return "HUNTER_SHOOT";
  }
  return null;
}

/** 查找技能使用的天数 */
function findAbilityUsedDay(state: GameState, ability: "witchHeal" | "witchPoison"): number | null {
  if (state.nightHistory) {
    for (const [dayStr, record] of Object.entries(state.nightHistory)) {
      if (ability === "witchHeal" && record.witchSave) {
        return Number(dayStr);
      }
      if (ability === "witchPoison" && record.witchPoison !== undefined) {
        return Number(dayStr);
      }
    }
  }
  return null;
}

// ============ 状态修复 - 回滚 ============

/** 执行回滚修复 */
export function applyBackwardJump(
  state: GameState,
  target: JumpTarget,
  analysis: JumpAnalysis
): GameState {
  let newState = { ...state };

  const sameDayBackward =
    target.day === state.day && getPhaseIndex(target.phase) < getPhaseIndex(state.phase);

  // 1. 复活玩家
  if (analysis.playersToRevive.length > 0) {
    newState.players = newState.players.map((p) =>
      analysis.playersToRevive.includes(p.seat) ? { ...p, alive: true } : p
    );
  }

  // 2. 恢复技能
  if (analysis.abilitiesToRestore.length > 0) {
    newState.roleAbilities = { ...newState.roleAbilities };
    for (const ability of analysis.abilitiesToRestore) {
      if (ability === "witchHealUsed") newState.roleAbilities.witchHealUsed = false;
      if (ability === "witchPoisonUsed") newState.roleAbilities.witchPoisonUsed = false;
    }
    // 恢复猎人开枪能力
    const hunter = newState.players.find((p) => p.role === "Hunter");
    if (hunter && analysis.playersToRevive.includes(hunter.seat)) {
      newState.roleAbilities.hunterCanShoot = true;
    }
  }

  // 3. 清理历史记录
  if (analysis.daysToClean.length > 0) {
    newState.nightHistory = { ...newState.nightHistory };
    newState.dayHistory = { ...newState.dayHistory };
    newState.voteHistory = { ...newState.voteHistory };
    newState.dailySummaries = { ...newState.dailySummaries };
    newState.dailySummaryFacts = { ...newState.dailySummaryFacts };
    if (newState.dailySummaryVoteData) newState.dailySummaryVoteData = { ...newState.dailySummaryVoteData };

    for (const day of analysis.daysToClean) {
      delete newState.nightHistory[day];
      delete newState.dayHistory[day];
      delete newState.voteHistory[day];
      delete newState.dailySummaries[day];
      delete newState.dailySummaryFacts[day];
      if (newState.dailySummaryVoteData) delete newState.dailySummaryVoteData[day];
    }
  }

  if (sameDayBackward) {
    newState.nightHistory = { ...newState.nightHistory };
    newState.dayHistory = { ...newState.dayHistory };
    newState.voteHistory = { ...newState.voteHistory };
    newState.dailySummaries = { ...newState.dailySummaries };
    newState.dailySummaryFacts = { ...newState.dailySummaryFacts };
    if (newState.dailySummaryVoteData) newState.dailySummaryVoteData = { ...newState.dailySummaryVoteData };

    const targetIdx = getPhaseIndex(target.phase);

    if (targetIdx < getPhaseIndex("NIGHT_RESOLVE")) {
      delete newState.nightHistory[target.day];
    }

    if (targetIdx < getPhaseIndex("DAY_START")) {
      delete newState.dayHistory[target.day];
      delete newState.voteHistory[target.day];
      delete newState.dailySummaries[target.day];
      delete newState.dailySummaryFacts[target.day];
      if (newState.dailySummaryVoteData) delete newState.dailySummaryVoteData[target.day];
    } else {
      delete newState.dailySummaries[target.day];
      delete newState.dailySummaryFacts[target.day];
      if (newState.dailySummaryVoteData) delete newState.dailySummaryVoteData[target.day];

      if (targetIdx <= getPhaseIndex("DAY_VOTE")) {
        delete newState.voteHistory[target.day];

        const prevDayRecord = newState.dayHistory?.[target.day];
        if (prevDayRecord) {
          newState.dayHistory[target.day] = {
            ...prevDayRecord,
            executed: undefined,
            voteTie: undefined,
          };
        }
      }
    }
  }

  // 4. 重置当前行动数据
  newState.votes = {};
  newState.nightActions = {
    lastGuardTarget: newState.nightActions.lastGuardTarget,
    seerHistory: newState.nightActions.seerHistory?.filter(
      (h) =>
        h.day < target.day ||
        (h.day === target.day && getPhaseIndex(target.phase) > getPhaseIndex("NIGHT_SEER_ACTION"))
    ),
  };

  // 5. 清理消息和事件（保留目标时间点之前的）
  newState.messages = newState.messages.filter((m) => {
    if (typeof m.day !== "number") return true;
    if (!m.phase) return m.day <= target.day;

    if (m.day < target.day) return true;
    if (m.day > target.day) return false;
    // 回溯到某阶段：表示回到该阶段开始，因此该阶段产生的消息也应被清除
    return getPhaseIndex(m.phase) < getPhaseIndex(target.phase);
  });

  // 5.1 重算存活状态：避免“淘汰导致头像灰掉但回溯未复原”
  // 规则：仅保留严格发生在回溯点之前（day/phase 更早）的死亡记录
  {
    const targetPhaseIdx = getPhaseIndex(target.phase);
    const shouldApply = (day: number, phase: Phase) => {
      if (day < target.day) return true;
      if (day > target.day) return false;
      return getPhaseIndex(phase) < targetPhaseIdx;
    };

    const deadSeats = new Set<number>();

    for (const [dayStr, record] of Object.entries(newState.nightHistory || {})) {
      const day = Number(dayStr);
      if (record.deaths && shouldApply(day, "NIGHT_RESOLVE")) {
        for (const d of record.deaths) deadSeats.add(d.seat);
      }
      if (record.hunterShot && shouldApply(day, "HUNTER_SHOOT")) {
        deadSeats.add(record.hunterShot.targetSeat);
      }
    }

    for (const [dayStr, record] of Object.entries(newState.dayHistory || {})) {
      const day = Number(dayStr);
      if (record.executed && shouldApply(day, "DAY_RESOLVE")) {
        deadSeats.add(record.executed.seat);
      }
      if (record.hunterShot && shouldApply(day, "HUNTER_SHOOT")) {
        deadSeats.add(record.hunterShot.targetSeat);
      }
    }

    newState.players = newState.players.map((p) => ({
      ...p,
      alive: !deadSeats.has(p.seat),
    }));
  }

  // 6. 更新阶段和天数
  newState.phase = target.phase;
  newState.day = target.day;
  newState.currentSpeakerSeat = null;
  newState.daySpeechStartSeat = null;
  newState.winner = null;

  newState = recomputeRoleAbilities(newState);
  return newState;
}

/** 估算目标时间点的时间戳（用于消息过滤） */
function estimateTimestamp(target: JumpTarget): number {
  // 简化处理：基于天数和阶段生成一个虚拟时间戳
  const baseTime = Date.now() - 24 * 60 * 60 * 1000 * 10; // 10天前作为基准
  const dayOffset = target.day * 24 * 60 * 60 * 1000;
  const phaseOffset = getPhaseIndex(target.phase) * 60 * 1000; // 每阶段1分钟
  return baseTime + dayOffset + phaseOffset;
}

// ============ 状态修复 - 前跳（自动补全） ============

/** 执行前跳修复（自动模式） */
export function applyForwardJumpAuto(
  state: GameState,
  target: JumpTarget,
  analysis: JumpAnalysis
): GameState {
  let newState = { ...state };

  // 自动补全缺失的任务
  for (const task of analysis.missingTasks) {
    newState = autoFillTask(newState, task);
  }

  if (state.day !== target.day) {
    const lastNightDay = target.phase.startsWith("DAY_") ? target.day : target.day - 1;
    for (let d = state.day; d <= lastNightDay; d++) {
      newState = ensureNightResolvedForDayFromHistory(newState, d);
    }
    const lastGuardTarget = newState.nightHistory?.[lastNightDay]?.guardTarget;
    if (lastGuardTarget !== undefined) {
      newState = {
        ...newState,
        nightActions: { ...newState.nightActions, lastGuardTarget },
      };
    }
  }

  // 夜晚 -> 白天：需要先确保“夜晚结算”带来的长效状态已落盘
  if (
    state.day === target.day &&
    state.phase.startsWith("NIGHT_") &&
    target.phase.startsWith("DAY_")
  ) {
    newState = ensureNightResolvedForDay(newState, target.day);
  }

  // 更新阶段和天数
  newState.phase = target.phase;
  newState.day = target.day;

  newState = recomputeRoleAbilities(newState);
  return newState;
}

/** 自动补全单个任务 */
function autoFillTask(state: GameState, task: MissingTask): GameState {
  const newState = { ...state };
  const alivePlayers = state.players.filter((p) => p.alive);
  const aliveVillagers = alivePlayers.filter((p) => p.alignment === "village");

  const guardMatch = task.field.match(/day(\d+)GuardTarget/);
  if (guardMatch) {
    const day = Number(guardMatch[1]);
    const validTargets = alivePlayers.filter((p) => p.seat !== state.nightActions.lastGuardTarget);
    if (validTargets.length > 0) {
      const target = validTargets[Math.floor(Math.random() * validTargets.length)];
      const prev = (newState.nightHistory || {})[day] || {};
      newState.nightHistory = {
        ...(newState.nightHistory || {}),
        [day]: { ...prev, guardTarget: target.seat },
      };
    }
    return newState;
  }

  const wolfMatch = task.field.match(/day(\d+)WolfTarget/);
  if (wolfMatch) {
    const day = Number(wolfMatch[1]);
    if (aliveVillagers.length > 0) {
      const target = aliveVillagers[Math.floor(Math.random() * aliveVillagers.length)];
      const prev = (newState.nightHistory || {})[day] || {};
      newState.nightHistory = {
        ...(newState.nightHistory || {}),
        [day]: { ...prev, wolfTarget: target.seat },
      };
    }
    return newState;
  }

  const saveMatch = task.field.match(/day(\d+)WitchSave/);
  if (saveMatch) {
    const day = Number(saveMatch[1]);
    const prev = (newState.nightHistory || {})[day] || {};
    newState.nightHistory = {
      ...(newState.nightHistory || {}),
      [day]: { ...prev, witchSave: false },
    };
    return newState;
  }

  const poisonMatch = task.field.match(/day(\d+)WitchPoison/);
  if (poisonMatch) {
    const day = Number(poisonMatch[1]);
    const prev = (newState.nightHistory || {})[day] || {};
    newState.nightHistory = {
      ...(newState.nightHistory || {}),
      [day]: { ...prev, witchPoison: undefined },
    };
    return newState;
  }

  const seerMatch = task.field.match(/day(\d+)SeerTarget/);
  if (seerMatch) {
    const day = Number(seerMatch[1]);
    const checkedSeats = (state.nightActions.seerHistory || []).map((h) => h.targetSeat);
    const validTargets = alivePlayers.filter((p) => !p.isHuman && !checkedSeats.includes(p.seat));
    if (validTargets.length > 0) {
      const target = validTargets[Math.floor(Math.random() * validTargets.length)];
      const isWolf = target.role === "Werewolf";
      const prev = (newState.nightHistory || {})[day] || {};
      newState.nightHistory = {
        ...(newState.nightHistory || {}),
        [day]: { ...prev, seerTarget: target.seat, seerResult: { targetSeat: target.seat, isWolf } },
      };
      newState.nightActions = {
        ...newState.nightActions,
        seerHistory: [
          ...(newState.nightActions.seerHistory || []),
          { targetSeat: target.seat, isWolf, day },
        ],
      };
    }
    return newState;
  }

  if (task.field.startsWith("day") && task.field.endsWith("VoteResult")) {
    const dayMatch = task.field.match(/day(\d+)VoteResult/);
    if (dayMatch) {
      const day = Number(dayMatch[1]);
      const rand = Math.random();
      if (rand >= 0.2 && alivePlayers.length > 0) {
        const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        newState.dayHistory = {
          ...newState.dayHistory,
          [day]: { executed: { seat: target.seat, votes: alivePlayers.length } },
        };
        newState.players = newState.players.map((p) =>
          p.seat === target.seat ? { ...p, alive: false } : p
        );
      } else {
        newState.dayHistory = {
          ...newState.dayHistory,
          [day]: { voteTie: true },
        };
      }
    }
    return newState;
  }

  switch (task.field) {
    case "guardTarget": {
      // 随机选择一个非上次保护的目标
      const validTargets = alivePlayers.filter(
        (p) => p.seat !== state.nightActions.lastGuardTarget
      );
      if (validTargets.length > 0) {
        const target = validTargets[Math.floor(Math.random() * validTargets.length)];
        newState.nightActions = {
          ...newState.nightActions,
          guardTarget: target.seat,
        };
      }
      break;
    }
    case "wolfTarget": {
      // 随机选择一个好人
      if (aliveVillagers.length > 0) {
        const target = aliveVillagers[Math.floor(Math.random() * aliveVillagers.length)];
        newState.nightActions = {
          ...newState.nightActions,
          wolfTarget: target.seat,
        };
      }
      break;
    }
    case "witchSave": {
      // 默认不使用解药（但要显式落盘，避免后续阶段判断缺失）
      newState.nightActions = {
        ...newState.nightActions,
        witchSave: false,
      };
      break;
    }
    case "witchPoison": {
      // 默认不使用毒药
      newState.nightActions = {
        ...newState.nightActions,
        witchPoison: undefined,
      };
      break;
    }
    case "seerTarget": {
      // 随机查验一个未查验过的玩家
      const checkedSeats = (state.nightActions.seerHistory || []).map((h) => h.targetSeat);
      const validTargets = alivePlayers.filter(
        (p) => !p.isHuman && !checkedSeats.includes(p.seat)
      );
      if (validTargets.length > 0) {
        const target = validTargets[Math.floor(Math.random() * validTargets.length)];
        const isWolf = target.role === "Werewolf";
        newState.nightActions = {
          ...newState.nightActions,
          seerTarget: target.seat,
          seerResult: { targetSeat: target.seat, isWolf },
          seerHistory: [
            ...(newState.nightActions.seerHistory || []),
            { targetSeat: target.seat, isWolf, day: state.day },
          ],
        };
      }
      break;
    }
    case "voteResult": {
      // 随机选择一个出局者或平票
      const rand = Math.random();
      if (rand < 0.2) {
        // 20% 概率平票
        // 不处决任何人
      } else {
        const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        // 生成投票记录
        const votes: Record<string, number> = {};
        alivePlayers.forEach((p) => {
          votes[p.playerId] = target.seat;
        });
        newState.votes = votes;
        // 标记玩家死亡
        newState.players = newState.players.map((p) =>
          p.seat === target.seat ? { ...p, alive: false } : p
        );
        // 记录历史
        newState.dayHistory = {
          ...newState.dayHistory,
          [state.day]: {
            executed: { seat: target.seat, votes: alivePlayers.length },
          },
        };
        newState.voteHistory = {
          ...newState.voteHistory,
          [state.day]: votes,
        };
      }
      break;
    }
    default:
      break;
  }

  return newState;
}

// ============ 主入口函数 ============

/**
 * 应用智能跳转
 * @param currentState 当前游戏状态
 * @param target 目标时间点
 * @param options 跳转选项
 * @returns 跳转结果
 */
export function applySmartJump(
  currentState: GameState,
  target: JumpTarget,
  options: JumpOptions
): SmartJumpResult {
  const normalizedState = recomputeRoleAbilities(currentState);
  const analysis = analyzeJump(normalizedState, target);

  // 同一位置，无需处理
  if (analysis.direction === "same") {
    return {
      newState: currentState,
      needsManualFill: false,
      missingTasks: [],
      analysis,
    };
  }

  let newState: GameState;
  let needsManualFill = false;

  if (analysis.direction === "backward") {
    // 回滚不需要补全，直接执行
    newState = applyBackwardJump(normalizedState, target, analysis);
  } else {
    // 前跳检查是否需要补全
    if (analysis.missingTasks.length > 0 && options.fillMode === "manual") {
      // 需要手动补全，返回当前状态和任务列表
      return {
        newState: normalizedState,
        needsManualFill: true,
        missingTasks: analysis.missingTasks,
        analysis,
      };
    }
    // 自动补全
    newState = applyForwardJumpAuto(normalizedState, target, analysis);
  }

  // 更新 devMutationId 触发副作用
  newState.devMutationId = (currentState.devMutationId ?? 0) + 1;
  newState.devPhaseJump = { to: target.phase, ts: Date.now() };

  return {
    newState,
    needsManualFill: false,
    missingTasks: [],
    analysis,
  };
}

/**
 * 应用手动补全数据后的跳转
 * @param currentState 当前游戏状态
 * @param target 目标时间点
 * @param filledData 用户填写的数据
 */
export function applySmartJumpWithFilledData(
  currentState: GameState,
  target: JumpTarget,
  filledData: Record<string, number | string | boolean>
): GameState {
  let newState = { ...currentState };

  // 应用用户填写的数据
  for (const [field, value] of Object.entries(filledData)) {
    const guardMatch = field.match(/day(\d+)GuardTarget/);
    if (guardMatch) {
      const day = Number(guardMatch[1]);
      const prev = (newState.nightHistory || {})[day] || {};
      newState.nightHistory = {
        ...(newState.nightHistory || {}),
        [day]: { ...prev, guardTarget: value as number },
      };
      continue;
    }

    const wolfMatch = field.match(/day(\d+)WolfTarget/);
    if (wolfMatch) {
      const day = Number(wolfMatch[1]);
      const prev = (newState.nightHistory || {})[day] || {};
      newState.nightHistory = {
        ...(newState.nightHistory || {}),
        [day]: { ...prev, wolfTarget: value as number },
      };
      continue;
    }

    const saveMatch = field.match(/day(\d+)WitchSave/);
    if (saveMatch) {
      const day = Number(saveMatch[1]);
      const raw = value as string | boolean;
      const shouldSave = typeof raw === "boolean" ? raw : raw === "true";
      const prev = (newState.nightHistory || {})[day] || {};
      newState.nightHistory = {
        ...(newState.nightHistory || {}),
        [day]: { ...prev, witchSave: shouldSave },
      };
      if (shouldSave) {
        newState.roleAbilities = { ...newState.roleAbilities, witchHealUsed: true };
      }
      continue;
    }

    const poisonMatch = field.match(/day(\d+)WitchPoison/);
    if (poisonMatch) {
      const day = Number(poisonMatch[1]);
      const prev = (newState.nightHistory || {})[day] || {};
      if (value === "none") {
        newState.nightHistory = {
          ...(newState.nightHistory || {}),
          [day]: { ...prev, witchPoison: undefined },
        };
      } else {
        const seat = value as number;
        newState.nightHistory = {
          ...(newState.nightHistory || {}),
          [day]: { ...prev, witchPoison: seat },
        };
        newState.roleAbilities = { ...newState.roleAbilities, witchPoisonUsed: true };
      }
      continue;
    }

    const seerMatch = field.match(/day(\d+)SeerTarget/);
    if (seerMatch) {
      const day = Number(seerMatch[1]);
      const seat = value as number;
      const targetPlayer = newState.players.find((p) => p.seat === seat);
      if (targetPlayer) {
        const isWolf = targetPlayer.role === "Werewolf";
        const prev = (newState.nightHistory || {})[day] || {};
        newState.nightHistory = {
          ...(newState.nightHistory || {}),
          [day]: { ...prev, seerTarget: seat, seerResult: { targetSeat: seat, isWolf } },
        };
        newState.nightActions = {
          ...newState.nightActions,
          seerHistory: [
            ...(newState.nightActions.seerHistory || []),
            { targetSeat: seat, isWolf, day },
          ],
        };
      }
      continue;
    }

    if (field.startsWith("day") && field.endsWith("VoteResult")) {
      const dayMatch = field.match(/day(\d+)VoteResult/);
      if (dayMatch) {
        const day = Number(dayMatch[1]);
        const seat = value as number;
        if (seat === -1) {
          newState.dayHistory = { ...newState.dayHistory, [day]: { voteTie: true } };
        } else {
          newState.players = newState.players.map((p) =>
            p.seat === seat ? { ...p, alive: false } : p
          );
          newState.dayHistory = {
            ...newState.dayHistory,
            [day]: { executed: { seat, votes: 1 } },
          };
        }
      }
      continue;
    }

    switch (field) {
      case "guardTarget":
        newState.nightActions = { ...newState.nightActions, guardTarget: value as number };
        break;
      case "wolfTarget":
        newState.nightActions = { ...newState.nightActions, wolfTarget: value as number };
        break;
      case "witchSave": {
        const raw = value as string | boolean;
        const shouldSave = typeof raw === "boolean" ? raw : raw === "true";

        newState.nightActions = { ...newState.nightActions, witchSave: shouldSave };
        if (shouldSave) {
          newState.roleAbilities = { ...newState.roleAbilities, witchHealUsed: true };
        }
        break;
      }
      case "witchPoison": {
        // "none" | seat(number)
        if (value === "none") {
          newState.nightActions = { ...newState.nightActions, witchPoison: undefined };
        } else {
          const seat = value as number;
          newState.nightActions = { ...newState.nightActions, witchPoison: seat };
          newState.roleAbilities = { ...newState.roleAbilities, witchPoisonUsed: true };
        }
        break;
      }
      case "seerTarget": {
        const seat = value as number;
        const targetPlayer = newState.players.find((p) => p.seat === seat);
        if (targetPlayer) {
          const isWolf = targetPlayer.role === "Werewolf";
          newState.nightActions = {
            ...newState.nightActions,
            seerTarget: seat,
            seerResult: { targetSeat: seat, isWolf },
            seerHistory: [
              ...(newState.nightActions.seerHistory || []),
              { targetSeat: seat, isWolf, day: currentState.day },
            ],
          };
        }
        break;
      }
      case "voteResult": {
        const seat = value as number;
        if (seat === -1) {
          // 平票
          newState.dayHistory = {
            ...newState.dayHistory,
            [currentState.day]: { voteTie: true },
          };
        } else {
          // 处决
          const alivePlayers = newState.players.filter((p) => p.alive);
          const votes: Record<string, number> = {};
          alivePlayers.forEach((p) => {
            votes[p.playerId] = seat;
          });
          newState.votes = votes;
          newState.players = newState.players.map((p) =>
            p.seat === seat ? { ...p, alive: false } : p
          );
          newState.dayHistory = {
            ...newState.dayHistory,
            [currentState.day]: { executed: { seat, votes: alivePlayers.length } },
          };
          newState.voteHistory = {
            ...newState.voteHistory,
            [currentState.day]: votes,
          };
        }
        break;
      }
    }
  }

  if (currentState.day !== target.day) {
    const lastNightDay = target.phase.startsWith("DAY_") ? target.day : target.day - 1;
    for (let d = currentState.day; d <= lastNightDay; d++) {
      newState = ensureNightResolvedForDayFromHistory(newState, d);
    }

    const lastGuardTarget = newState.nightHistory?.[lastNightDay]?.guardTarget;
    if (lastGuardTarget !== undefined) {
      newState = {
        ...newState,
        nightActions: { ...newState.nightActions, lastGuardTarget },
      };
    }
  }

  // 更新阶段和天数
  if (
    currentState.day === target.day &&
    currentState.phase.startsWith("NIGHT_") &&
    target.phase.startsWith("DAY_")
  ) {
    newState = ensureNightResolvedForDay(newState, target.day);
  }

  newState = recomputeRoleAbilities(newState);
  newState.phase = target.phase;
  newState.day = target.day;
  newState.devMutationId = (currentState.devMutationId ?? 0) + 1;
  newState.devPhaseJump = { to: target.phase, ts: Date.now() };

  return newState;
}

function ensureNightResolvedForDay(state: GameState, day: number): GameState {
  const nightActions = state.nightActions || ({} as GameState["nightActions"]);
  const { wolfTarget, guardTarget, witchSave, witchPoison } = nightActions;

  const aliveAtNightStart = getAliveSeatsAtNightStart(state, day);

  const guard = state.players.find((p) => p.role === "Guard");
  const witch = state.players.find((p) => p.role === "Witch");
  const seer = state.players.find((p) => p.role === "Seer");
  const wolves = state.players.filter((p) => p.role === "Werewolf");

  const hasAliveGuard = guard ? aliveAtNightStart.has(guard.seat) : false;
  const hasAliveWitch = witch ? aliveAtNightStart.has(witch.seat) : false;
  const hasAliveSeer = seer ? aliveAtNightStart.has(seer.seat) : false;
  const hasAliveWolves = wolves.some((p) => aliveAtNightStart.has(p.seat));

  const guardTargetEffective = hasAliveGuard ? guardTarget : undefined;
  const wolfTargetEffective = hasAliveWolves ? wolfTarget : undefined;
  const witchSaveEffective = hasAliveWitch ? witchSave : undefined;
  const witchPoisonEffective = hasAliveWitch ? witchPoison : undefined;
  const seerTargetEffective = hasAliveSeer ? nightActions.seerTarget : undefined;
  const seerResultEffective = hasAliveSeer ? nightActions.seerResult : undefined;

  const deaths: Array<{ seat: number; reason: "wolf" | "poison" | "milk" }> = [];

  const poisonUsedOnOtherDay = (() => {
    for (const [dayStr, record] of Object.entries(state.nightHistory || {})) {
      if (Number(dayStr) !== day && record.witchPoison !== undefined) return true;
    }
    return false;
  })();

  // 狼刀结算（包含毒奶规则）
  if (wolfTargetEffective !== undefined) {
    const isProtected = guardTargetEffective === wolfTargetEffective;
    const isSaved = witchSaveEffective === true;

    if (isProtected && isSaved) {
      deaths.push({ seat: wolfTargetEffective, reason: "milk" });
    } else if (!isProtected && !isSaved) {
      deaths.push({ seat: wolfTargetEffective, reason: "wolf" });
    }
  }

  // 女巫毒杀
  if (witchPoisonEffective !== undefined && !poisonUsedOnOtherDay) {
    deaths.push({ seat: witchPoisonEffective, reason: "poison" });
  }

  // 应用死亡到玩家存活状态
  if (deaths.length > 0) {
    const deathSeats = new Set(deaths.map((d) => d.seat));
    state = {
      ...state,
      players: state.players.map((p) => (deathSeats.has(p.seat) ? { ...p, alive: false } : p)),
    };
  }

  // 猎人能力：被毒/毒奶死亡不能开枪
  const hunter = state.players.find((p) => p.role === "Hunter");
  if (hunter && deaths.some((d) => d.seat === hunter.seat && (d.reason === "poison" || d.reason === "milk"))) {
    state = {
      ...state,
      roleAbilities: { ...state.roleAbilities, hunterCanShoot: false },
    };
  }

  // 更新 lastGuardTarget
  state = {
    ...state,
    nightActions: {
      ...state.nightActions,
      lastGuardTarget: guardTargetEffective ?? state.nightActions.lastGuardTarget,
    },
  };

  // 写入 nightHistory（用于 DevTools 展示 & 后续回滚判定）
  const prevNightRecord = (state.nightHistory || {})[day] || {};
  state = {
    ...state,
    nightHistory: {
      ...(state.nightHistory || {}),
      [day]: {
        ...prevNightRecord,
        guardTarget: guardTargetEffective,
        wolfTarget: wolfTargetEffective,
        witchSave: witchSaveEffective,
        witchPoison: poisonUsedOnOtherDay ? undefined : witchPoisonEffective,
        seerTarget: seerTargetEffective,
        seerResult: seerResultEffective,
        deaths,
      },
    },
  };

  return state;
}

function getAliveSeatsAtNightStart(state: GameState, day: number): Set<number> {
  const alive = new Set<number>(state.players.map((p) => p.seat));
  if (day <= 1) return alive;

  for (let d = 1; d <= day - 1; d++) {
    const night = state.nightHistory?.[d];
    if (night?.deaths) {
      for (const death of night.deaths) {
        alive.delete(death.seat);
      }
    }
    if (night?.hunterShot) {
      alive.delete(night.hunterShot.targetSeat);
    }

    const dayRecord = state.dayHistory?.[d];
    if (dayRecord?.executed) {
      alive.delete(dayRecord.executed.seat);
    }
    if (dayRecord?.hunterShot) {
      alive.delete(dayRecord.hunterShot.targetSeat);
    }
  }

  return alive;
}

function recomputeRoleAbilities(state: GameState): GameState {
  const nightRecords = Object.values(state.nightHistory || {});

  const witchHealUsed =
    nightRecords.some((r) => r.witchSave === true) || state.nightActions.witchSave === true;

  const witchPoisonUsed =
    nightRecords.some((r) => r.witchPoison !== undefined) ||
    state.nightActions.witchPoison !== undefined;

  if (
    state.roleAbilities.witchHealUsed === witchHealUsed &&
    state.roleAbilities.witchPoisonUsed === witchPoisonUsed
  ) {
    return state;
  }

  return {
    ...state,
    roleAbilities: {
      ...state.roleAbilities,
      witchHealUsed,
      witchPoisonUsed,
    },
  };
}

function ensureNightResolvedForDayFromHistory(state: GameState, day: number): GameState {
  const record = state.nightHistory?.[day];
  if (!record) return state;

  const { wolfTarget, guardTarget, witchSave, witchPoison } = record;
  const deaths: Array<{ seat: number; reason: "wolf" | "poison" | "milk" }> = [];

  const aliveAtNightStart = getAliveSeatsAtNightStart(state, day);

  const guard = state.players.find((p) => p.role === "Guard");
  const witch = state.players.find((p) => p.role === "Witch");
  const seer = state.players.find((p) => p.role === "Seer");
  const wolves = state.players.filter((p) => p.role === "Werewolf");

  const hasAliveGuard = guard ? aliveAtNightStart.has(guard.seat) : false;
  const hasAliveWitch = witch ? aliveAtNightStart.has(witch.seat) : false;
  const hasAliveSeer = seer ? aliveAtNightStart.has(seer.seat) : false;
  const hasAliveWolves = wolves.some((p) => aliveAtNightStart.has(p.seat));

  const guardTargetEffective = hasAliveGuard ? guardTarget : undefined;
  const wolfTargetEffective = hasAliveWolves ? wolfTarget : undefined;
  const witchSaveEffective = hasAliveWitch ? witchSave : undefined;
  const witchPoisonEffective = hasAliveWitch ? witchPoison : undefined;
  const seerTargetEffective = hasAliveSeer ? record.seerTarget : undefined;
  const seerResultEffective = hasAliveSeer ? record.seerResult : undefined;

  const poisonUsedOnOtherDay = (() => {
    for (const [dayStr, r] of Object.entries(state.nightHistory || {})) {
      if (Number(dayStr) !== day && r.witchPoison !== undefined) return true;
    }
    return false;
  })();

  if (wolfTargetEffective !== undefined) {
    const isProtected = guardTargetEffective === wolfTargetEffective;
    const isSaved = witchSaveEffective === true;
    if (isProtected && isSaved) {
      deaths.push({ seat: wolfTargetEffective, reason: "milk" });
    } else if (!isProtected && !isSaved) {
      deaths.push({ seat: wolfTargetEffective, reason: "wolf" });
    }
  }

  if (witchPoisonEffective !== undefined && !poisonUsedOnOtherDay) {
    deaths.push({ seat: witchPoisonEffective, reason: "poison" });
  }

  if (deaths.length > 0) {
    const deathSeats = new Set(deaths.map((d) => d.seat));
    state = {
      ...state,
      players: state.players.map((p) => (deathSeats.has(p.seat) ? { ...p, alive: false } : p)),
    };
  }

  const hunter = state.players.find((p) => p.role === "Hunter");
  if (hunter && deaths.some((d) => d.seat === hunter.seat && (d.reason === "poison" || d.reason === "milk"))) {
    state = {
      ...state,
      roleAbilities: { ...state.roleAbilities, hunterCanShoot: false },
    };
  }

  const prev = (state.nightHistory || {})[day] || {};
  state = {
    ...state,
    nightHistory: {
      ...(state.nightHistory || {}),
      [day]: {
        ...prev,
        guardTarget: guardTargetEffective,
        wolfTarget: wolfTargetEffective,
        witchSave: witchSaveEffective,
        witchPoison: poisonUsedOnOtherDay ? undefined : witchPoisonEffective,
        seerTarget: seerTargetEffective,
        seerResult: seerResultEffective,
        deaths,
      },
    },
  };

  return state;
}
