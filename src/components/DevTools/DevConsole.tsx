"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useAtom } from "jotai";
import { motion, AnimatePresence } from "framer-motion";
import { gameStateAtom } from "@/store/game-machine";
import type { GameState, Phase, Role, Player } from "@/types/game";
import { X, Wrench, Play, Pause, SkipForward, Eye, Users, Crosshair, Code, ChatDots, Warning, ArrowRight, ArrowLeft, Lightning } from "@phosphor-icons/react";
import {
  applySmartJump,
  applySmartJumpWithFilledData,
  analyzeJump,
  type JumpTarget,
  type JumpAnalysis,
  type MissingTask,
  type SmartJumpResult,
} from "@/lib/SmartJumpManager";
import { SPEECH_PROMPT, WOLF_ACTION_PROMPT, SEER_ACTION_PROMPT, WITCH_ACTION_PROMPT, GUARD_ACTION_PROMPT } from "@/lib/prompts";

type AILogEntry = {
  id: string;
  timestamp: number;
  type: string;
  request: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    player?: {
      playerId: string;
      displayName: string;
      seat: number;
      role: string;
    };
  };
  response: { content: string; duration: number };
  error?: string;
};

// 所有可用的游戏阶段
const ALL_PHASES: Phase[] = [
  "LOBBY",
  "SETUP",
  "NIGHT_START",
  "NIGHT_GUARD_ACTION",
  "NIGHT_WOLF_CHAT",
  "NIGHT_WOLF_ACTION",
  "NIGHT_WITCH_ACTION",
  "NIGHT_SEER_ACTION",
  "NIGHT_RESOLVE",
  "DAY_START",
  "DAY_SPEECH",
  "DAY_LAST_WORDS",
  "DAY_VOTE",
  "DAY_RESOLVE",
  "HUNTER_SHOOT",
  "GAME_END",
];

// 所有可用的角色
const ALL_ROLES: Role[] = ["Villager", "Werewolf", "Seer", "Witch", "Hunter", "Guard"];

// 阶段中文名
const PHASE_NAMES: Record<Phase, string> = {
  LOBBY: "大厅",
  SETUP: "设置中",
  NIGHT_START: "夜晚开始",
  NIGHT_GUARD_ACTION: "守卫行动",
  NIGHT_WOLF_CHAT: "狼人私聊",
  NIGHT_WOLF_ACTION: "狼人出刀",
  NIGHT_WITCH_ACTION: "女巫行动",
  NIGHT_SEER_ACTION: "预言家查验",
  NIGHT_RESOLVE: "夜晚结算",
  DAY_START: "白天开始",
  DAY_SPEECH: "发言阶段",
  DAY_LAST_WORDS: "遗言阶段",
  DAY_VOTE: "投票阶段",
  DAY_RESOLVE: "投票结算",
  HUNTER_SHOOT: "猎人开枪",
  GAME_END: "游戏结束",
};

// 角色中文名
const ROLE_NAMES: Record<Role, string> = {
  Villager: "村民",
  Werewolf: "狼人",
  Seer: "预言家",
  Witch: "女巫",
  Hunter: "猎人",
  Guard: "守卫",
};

const formatPlayerLabel = (p: Player) => `${p.seat + 1}号 ${p.displayName}${p.alive ? "" : "（死）"}`;

type TabType = "global" | "players" | "actions" | "inspector";

interface DevConsoleProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DevConsole({ isOpen, onClose }: DevConsoleProps) {
  const [gameState, setGameState] = useAtom(gameStateAtom);
  const [activeTab, setActiveTab] = useState<TabType>("global");
  const [isPaused, setIsPaused] = useState(false);

  const bumpDevMutation = (prev: GameState): number => (prev.devMutationId ?? 0) + 1;

  // 智能跳转相关状态
  const [jumpDialogOpen, setJumpDialogOpen] = useState(false);
  const [pendingJumpTarget, setPendingJumpTarget] = useState<JumpTarget | null>(null);
  const [jumpAnalysis, setJumpAnalysis] = useState<JumpAnalysis | null>(null);
  const [missingTasks, setMissingTasks] = useState<MissingTask[]>([]);
  const [filledData, setFilledData] = useState<Record<string, number | string | boolean>>({});
  const [jumpFormError, setJumpFormError] = useState<string>("");

  const getTaskDay = useCallback(
    (task: MissingTask): number => {
      const m = String(task.field).match(/day(\d+)/);
      if (m) return Number(m[1]);
      return gameState.day;
    },
    [gameState.day]
  );

  const getPhaseRank = useCallback((phase: Phase): number => {
    const order: Phase[] = [
      "NIGHT_GUARD_ACTION",
      "NIGHT_WOLF_ACTION",
      "NIGHT_WITCH_ACTION",
      "NIGHT_SEER_ACTION",
      "DAY_VOTE",
    ];
    const idx = order.indexOf(phase);
    return idx === -1 ? 999 : idx;
  }, []);

  const deriveFillContext = useCallback(
    (data: Record<string, number | string | boolean>) => {
      const alive = new Set(gameState.players.filter((p) => p.alive).map((p) => p.seat));

      const allPlayersBySeat = new Map(gameState.players.map((p) => [p.seat, p] as const));

      const seerChecked = new Set<number>((gameState.nightActions.seerHistory || []).map((h) => h.targetSeat));

      const dayUsedBottle = new Map<number, "save" | "poison">();

      const existingHealUsedDay = Object.entries(gameState.nightHistory || {}).find(([, r]) => r.witchSave === true);
      const existingPoisonUsedDay = Object.entries(gameState.nightHistory || {}).find(([, r]) => r.witchPoison !== undefined);

      let witchHealUsed = Boolean(gameState.roleAbilities.witchHealUsed) || Boolean(existingHealUsedDay);
      let witchPoisonUsed = Boolean(gameState.roleAbilities.witchPoisonUsed) || Boolean(existingPoisonUsedDay);

      const minDay = Math.min(
        gameState.day,
        ...missingTasks.map((t) => getTaskDay(t)).filter((d) => Number.isFinite(d))
      );
      const maxDay = Math.max(
        gameState.day,
        ...missingTasks.map((t) => getTaskDay(t)).filter((d) => Number.isFinite(d))
      );

      const lastGuardByDay = new Map<number, number | undefined>();
      let lastGuardTarget = gameState.nightActions.lastGuardTarget;

      const aliveAtNightStart = new Map<number, Set<number>>();

      const resolveNight = (day: number) => {
        const wolfTargetRaw = data[`day${day}WolfTarget`];
        const guardTargetRaw = data[`day${day}GuardTarget`];
        const witchSaveRaw = data[`day${day}WitchSave`];
        const witchPoisonRaw = data[`day${day}WitchPoison`];

        const history = gameState.nightHistory?.[day];

        const wolfTarget =
          typeof wolfTargetRaw === "number" ? wolfTargetRaw : typeof history?.wolfTarget === "number" ? history.wolfTarget : undefined;
        const guardTarget =
          typeof guardTargetRaw === "number" ? guardTargetRaw : typeof history?.guardTarget === "number" ? history.guardTarget : undefined;
        const witchSave =
          typeof witchSaveRaw === "string"
            ? witchSaveRaw === "true"
            : typeof history?.witchSave === "boolean"
              ? history.witchSave
              : undefined;

        const poisonChoice =
          typeof witchPoisonRaw === "number"
            ? witchPoisonRaw
            : witchPoisonRaw === "none"
              ? undefined
              : typeof history?.witchPoison === "number"
                ? history.witchPoison
                : undefined;

        const isProtected = wolfTarget !== undefined && guardTarget === wolfTarget;
        const isSaved = wolfTarget !== undefined && witchSave === true;

        const willMilk = wolfTarget !== undefined && isProtected && isSaved;

        if (wolfTarget !== undefined) {
          if (willMilk) {
            alive.delete(wolfTarget);
          } else if (!isProtected && !isSaved) {
            alive.delete(wolfTarget);
          }
        }

        if (poisonChoice !== undefined) {
          alive.delete(poisonChoice);
        }

        if (typeof guardTarget === "number") {
          lastGuardTarget = guardTarget;
        }
      };

      const resolveDayVote = (day: number) => {
        const voteRaw = data[`day${day}VoteResult`];
        const history = gameState.dayHistory?.[day];

        const executedSeat =
          typeof voteRaw === "number" && voteRaw >= 0
            ? voteRaw
            : typeof history?.executed?.seat === "number"
              ? history.executed.seat
              : undefined;

        const isTie = typeof voteRaw === "number" && voteRaw === -1 ? true : Boolean(history?.voteTie);
        if (isTie) return;
        if (typeof executedSeat === "number") {
          alive.delete(executedSeat);
        }
      };

      for (let d = minDay; d <= maxDay; d++) {
        aliveAtNightStart.set(d, new Set(alive));
        lastGuardByDay.set(d, lastGuardTarget);

        const seerRaw = data[`day${d}SeerTarget`];
        const seerHistory = gameState.nightHistory?.[d]?.seerTarget;
        const seerTarget = typeof seerRaw === "number" ? seerRaw : typeof seerHistory === "number" ? seerHistory : undefined;
        if (typeof seerTarget === "number") seerChecked.add(seerTarget);

        const saveRaw = data[`day${d}WitchSave`];
        if (saveRaw === "true") {
          dayUsedBottle.set(d, "save");
          witchHealUsed = true;
        }
        const poisonRaw = data[`day${d}WitchPoison`];
        if (typeof poisonRaw === "number") {
          dayUsedBottle.set(d, "poison");
          witchPoisonUsed = true;
        }

        resolveNight(d);
        resolveDayVote(d);
      }

      const anyPoisonDay = (() => {
        if (existingPoisonUsedDay) return Number(existingPoisonUsedDay[0]);
        for (const [k, v] of Object.entries(data)) {
          const m = k.match(/day(\d+)WitchPoison/);
          if (m && typeof v === "number") return Number(m[1]);
        }
        return null;
      })();

      const anyHealDay = (() => {
        if (existingHealUsedDay) return Number(existingHealUsedDay[0]);
        for (const [k, v] of Object.entries(data)) {
          const m = k.match(/day(\d+)WitchSave/);
          if (m && v === "true") return Number(m[1]);
        }
        return null;
      })();

      return {
        aliveAtNightStart,
        allPlayersBySeat,
        seerChecked,
        lastGuardByDay,
        dayUsedBottle,
        witchPoisonUsed,
        witchHealUsed,
        anyPoisonDay,
        anyHealDay,
      };
    },
    [gameState, missingTasks, getTaskDay]
  );

  const fillCtx = useMemo(() => deriveFillContext(filledData), [deriveFillContext, filledData]);

  const isTaskOptionDisabled = useCallback(
    (
      task: MissingTask,
      opt: { value: any; label: string },
      ctx: ReturnType<typeof deriveFillContext>
    ): boolean => {
      const day = getTaskDay(task);

      const aliveSet = ctx.aliveAtNightStart.get(day) || new Set(gameState.players.filter((p) => p.alive).map((p) => p.seat));

      if (task.field.includes("WitchPoison")) {
        const usedBottle = ctx.dayUsedBottle.get(day);
        const isNone = opt.value === "none";
        const isSeat = typeof opt.value === "number";

        if (usedBottle === "save" && !isNone) return true;
        if (ctx.anyPoisonDay !== null && ctx.anyPoisonDay !== day && !isNone) return true;
        if (isSeat && !aliveSet.has(opt.value)) return true;
        return false;
      }

      if (task.field.includes("WitchSave")) {
        const usedBottle = ctx.dayUsedBottle.get(day);
        if (usedBottle === "poison" && String(opt.value) === "true") return true;
        if (ctx.anyHealDay !== null && ctx.anyHealDay !== day && String(opt.value) === "true") return true;
        return false;
      }

      if (task.field.includes("GuardTarget")) {
        if (typeof opt.value === "number" && !aliveSet.has(opt.value)) return true;
        const lastGuard = ctx.lastGuardByDay.get(day);
        if (typeof opt.value === "number" && typeof lastGuard === "number" && opt.value === lastGuard) return true;
        return false;
      }

      if (task.field.includes("WolfTarget")) {
        if (typeof opt.value === "number" && !aliveSet.has(opt.value)) return true;
        return false;
      }

      if (task.field.includes("SeerTarget")) {
        if (typeof opt.value === "number" && !aliveSet.has(opt.value)) return true;
        if (typeof opt.value === "number" && ctx.seerChecked.has(opt.value)) return true;
        return false;
      }

      if (task.field.includes("VoteResult")) {
        if (opt.value === -1) return false;
        if (typeof opt.value === "number" && !aliveSet.has(opt.value)) return true;
        return false;
      }

      return false;
    },
    [deriveFillContext, getTaskDay, gameState.players]
  );

  // 智能跳转到指定阶段
  const smartJumpToPhase = useCallback((phase: Phase, targetDay?: number) => {
    const target: JumpTarget = { day: targetDay ?? gameState.day, phase };
    const analysis = analyzeJump(gameState, target);
    
    // 如果是同一位置，不处理
    if (analysis.direction === "same") return;

    // 如果有需要确认的内容（回滚复活/前跳补全），弹出确认框
    const needsConfirm = 
      analysis.playersToRevive.length > 0 ||
      analysis.abilitiesToRestore.length > 0 ||
      analysis.missingTasks.length > 0;

    if (needsConfirm) {
      setPendingJumpTarget(target);
      setJumpAnalysis(analysis);
      setMissingTasks(analysis.missingTasks);
      setFilledData({});
      setJumpFormError("");
      setJumpDialogOpen(true);
    } else {
      // 无需确认，直接执行
      const result = applySmartJump(gameState, target, { fillMode: "auto" });
      setGameState(result.newState);
    }
  }, [gameState, setGameState]);

  // 确认执行跳转
  const confirmJump = useCallback(() => {
    if (!pendingJumpTarget) return;

    // 回滚：直接执行（不需要补全）
    if (jumpAnalysis?.direction === "backward") {
      const result = applySmartJump(gameState, pendingJumpTarget, { fillMode: "auto" });
      setGameState(result.newState);
    } else {
      // 前跳：若需要补全，必须全部填完后才能跳转
      if (missingTasks.length > 0) {
        const missingFields = missingTasks
          .map((t) => t.field)
          .filter((f) => filledData[f] === undefined || filledData[f] === "");

        if (missingFields.length > 0) {
          setJumpFormError("请先完成所有补全项后再确认跳转");
          return;
        }

        const newState = applySmartJumpWithFilledData(gameState, pendingJumpTarget, filledData);
        setGameState(newState);
      } else {
        const result = applySmartJump(gameState, pendingJumpTarget, { fillMode: "auto" });
        setGameState(result.newState);
      }
    }

    setJumpDialogOpen(false);
    setPendingJumpTarget(null);
    setJumpAnalysis(null);
    setMissingTasks([]);
    setFilledData({});
    setJumpFormError("");
  }, [pendingJumpTarget, gameState, setGameState, missingTasks, filledData, jumpAnalysis?.direction]);

  const randomFillMissingTasks = useCallback(() => {
    if (missingTasks.length === 0) return;
    setJumpFormError("");
    setFilledData((prev) => {
      const next = { ...prev };
      const tasks = [...missingTasks].sort((a, b) => {
        const da = getTaskDay(a);
        const db = getTaskDay(b);
        if (da !== db) return da - db;
        return getPhaseRank(a.phase) - getPhaseRank(b.phase);
      });

      for (const task of tasks) {
        if (next[task.field] !== undefined && next[task.field] !== "") continue;
        if (!task.options || task.options.length === 0) continue;

        const ctx = deriveFillContext(next);
        const valid = task.options.filter((opt) => !isTaskOptionDisabled(task, opt as any, ctx));
        if (valid.length === 0) continue;
        const chosen = valid[Math.floor(Math.random() * valid.length)];
        next[task.field] = chosen.value;
      }

      return next;
    });
  }, [missingTasks, deriveFillContext, getPhaseRank, getTaskDay, isTaskOptionDisabled]);

  // 取消跳转
  const cancelJump = useCallback(() => {
    setJumpDialogOpen(false);
    setPendingJumpTarget(null);
    setJumpAnalysis(null);
    setMissingTasks([]);
    setFilledData({});
    setJumpFormError("");
  }, []);

  // 兼容旧接口的跳转（直接跳转，用于简单场景）
  const jumpToPhase = (phase: Phase) => {
    smartJumpToPhase(phase);
  };

  // 智能修改天数
  const setDay = (day: number) => {
    const targetDay = Math.max(1, day);
    if (targetDay === gameState.day) return;
    
    // 跳转到目标天数的夜晚开始阶段
    const targetPhase: Phase = targetDay > gameState.day ? "NIGHT_START" : "NIGHT_START";
    smartJumpToPhase(targetPhase, targetDay);
  };

  // 修改玩家角色
  const setPlayerRole = (seat: number, role: Role) => {
    setGameState((prev) => {
      const newPlayers = prev.players.map((p) =>
        p.seat === seat
          ? { ...p, role, alignment: role === "Werewolf" ? "wolf" : "village" }
          : p
      ) as Player[];
      return {
        ...prev,
        players: newPlayers,
        devMutationId: bumpDevMutation(prev),
      };
    });
  };

  // 修改玩家存活状态
  const setPlayerAlive = (seat: number, alive: boolean) => {
    setGameState((prev) => {
      const newPlayers = prev.players.map((p) =>
        p.seat === seat ? { ...p, alive } : p
      );
      return { ...prev, players: newPlayers, devMutationId: bumpDevMutation(prev) };
    });
  };

  const patchNightActions = useCallback((patch: Partial<GameState["nightActions"]>) => {
    setGameState((prev) => {
      const day = prev.day;
      const nextNightActions = { ...prev.nightActions, ...patch };

      // 同步覆盖当轮 nightHistory（便于 DevTools 展示与后续回滚判定）
      const prevNightRecord = (prev.nightHistory || {})[day] || {};
      const nextNightRecord: any = { ...prevNightRecord };
      if (Object.prototype.hasOwnProperty.call(patch, "guardTarget")) nextNightRecord.guardTarget = nextNightActions.guardTarget;
      if (Object.prototype.hasOwnProperty.call(patch, "wolfTarget")) nextNightRecord.wolfTarget = nextNightActions.wolfTarget;
      if (Object.prototype.hasOwnProperty.call(patch, "witchSave")) nextNightRecord.witchSave = nextNightActions.witchSave;
      if (Object.prototype.hasOwnProperty.call(patch, "witchPoison")) nextNightRecord.witchPoison = nextNightActions.witchPoison;
      if (Object.prototype.hasOwnProperty.call(patch, "seerTarget")) nextNightRecord.seerTarget = nextNightActions.seerTarget;
      if (Object.prototype.hasOwnProperty.call(patch, "seerResult")) nextNightRecord.seerResult = nextNightActions.seerResult;

      let nextRoleAbilities = prev.roleAbilities;
      // 动作面板的改动应覆盖“当前轮次”信息，因此女巫用药/撤销用药需要同步 abilities。
      if (Object.prototype.hasOwnProperty.call(patch, "witchSave")) {
        const shouldUseHeal = nextNightActions.witchSave === true;
        nextRoleAbilities = { ...nextRoleAbilities, witchHealUsed: shouldUseHeal };
      }
      if (Object.prototype.hasOwnProperty.call(patch, "witchPoison")) {
        const shouldUsePoison = typeof nextNightActions.witchPoison === "number";
        nextRoleAbilities = { ...nextRoleAbilities, witchPoisonUsed: shouldUsePoison };
      }

      return {
        ...prev,
        nightActions: nextNightActions,
        roleAbilities: nextRoleAbilities,
        nightHistory: {
          ...(prev.nightHistory || {}),
          [day]: nextNightRecord,
        },
        devMutationId: bumpDevMutation(prev),
      };
    });
  }, [setGameState]);

  // 设置夜间行动（兼容旧接口）
  const setNightAction = (key: string, value: any) => {
    patchNightActions({ [key]: value } as Partial<GameState["nightActions"]>);
  };

  // 设置当前发言者
  const setCurrentSpeaker = (seat: number | null) => {
    setGameState((prev) => ({ ...prev, currentSpeakerSeat: seat, devMutationId: bumpDevMutation(prev) }));
  };

  // 设置下一位发言者（覆盖一次）
  const setNextSpeaker = (seat: number | null) => {
    setGameState((prev) => ({ ...prev, nextSpeakerSeatOverride: seat, devMutationId: bumpDevMutation(prev) }));
  };

  // 清空投票
  const clearVotes = () => {
    setGameState((prev) => {
      const day = prev.day;
      const executedSeat = prev.dayHistory?.[day]?.executed?.seat;

      // 清空当日结算结果，避免“投票已结算但 votes 被清空”导致状态不一致
      const nextDayHistory = { ...(prev.dayHistory || {}) };
      if (nextDayHistory[day]) {
        const { executed, voteTie, ...rest } = nextDayHistory[day] as any;
        nextDayHistory[day] = rest;
      }

      const nextVoteHistory = { ...(prev.voteHistory || {}) };
      delete nextVoteHistory[day];

      const nextPlayers =
        typeof executedSeat === "number"
          ? prev.players.map((p) => (p.seat === executedSeat ? { ...p, alive: true } : p))
          : prev.players;

      return {
        ...prev,
        players: nextPlayers,
        votes: {},
        dayHistory: nextDayHistory,
        voteHistory: nextVoteHistory,
        devMutationId: bumpDevMutation(prev),
      };
    });
  };

  // 强制投票
  const forceVote = (voterId: string, targetSeat: number) => {
    setGameState((prev) => {
      const day = prev.day;
      const nextVotes = { ...prev.votes, [voterId]: targetSeat };

      const executedSeat = prev.dayHistory?.[day]?.executed?.seat;
      const nextPlayers =
        typeof executedSeat === "number"
          ? prev.players.map((p) => (p.seat === executedSeat ? { ...p, alive: true } : p))
          : prev.players;

      // 修改 votes 视为“覆盖当轮投票信息”，因此清除当日结算字段，并同步 voteHistory
      const nextDayHistory = { ...(prev.dayHistory || {}) };
      if (nextDayHistory[day]) {
        const { executed, voteTie, ...rest } = nextDayHistory[day] as any;
        nextDayHistory[day] = rest;
      }

      return {
        ...prev,
        players: nextPlayers,
        votes: nextVotes,
        dayHistory: nextDayHistory,
        voteHistory: { ...(prev.voteHistory || {}), [day]: nextVotes },
        devMutationId: bumpDevMutation(prev),
      };
    });
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "global", label: "全局", icon: <Wrench size={16} /> },
    { id: "players", label: "玩家", icon: <Users size={16} /> },
    { id: "actions", label: "动作", icon: <Crosshair size={16} /> },
    { id: "inspector", label: "状态", icon: <Code size={16} /> },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 300 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed right-0 top-0 bottom-0 w-[400px] z-[100] bg-gray-900/95 backdrop-blur-md border-l border-gray-700 shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
            <div className="flex items-center gap-2">
              <Wrench size={20} className="text-yellow-400" />
              <span className="font-bold text-white">开发者控制台</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "text-yellow-400 border-b-2 border-yellow-400 bg-gray-800/50"
                    : "text-gray-400 hover:text-white hover:bg-gray-800/30"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === "global" && (
              <GlobalTab
                gameState={gameState}
                isPaused={isPaused}
                setIsPaused={setIsPaused}
                jumpToPhase={jumpToPhase}
                setDay={setDay}
              />
            )}
            {activeTab === "players" && (
              <PlayersTab
                gameState={gameState}
                setPlayerRole={setPlayerRole}
                setPlayerAlive={setPlayerAlive}
              />
            )}
            {activeTab === "actions" && (
              <ActionsTab
                gameState={gameState}
                setNightAction={setNightAction}
                patchNightActions={patchNightActions}
                setNextSpeaker={setNextSpeaker}
                clearVotes={clearVotes}
                forceVote={forceVote}
              />
            )}
            {activeTab === "inspector" && <InspectorTab gameState={gameState} />}
          </div>
        </motion.div>
      )}

      {/* 智能跳转确认/补全弹窗 */}
      {jumpDialogOpen && pendingJumpTarget && jumpAnalysis && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={cancelJump}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl w-[480px] max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 bg-gray-800/50">
              <div className="flex items-center gap-3">
                {jumpAnalysis.direction === "backward" ? (
                  <ArrowLeft size={22} className="text-blue-400" />
                ) : (
                  <ArrowRight size={22} className="text-orange-400" />
                )}
                <div>
                  <div className="font-bold text-white">
                    {jumpAnalysis.direction === "backward" ? "状态回滚" : "前跳补全"}
                  </div>
                  <div className="text-xs text-gray-400">
                    跳转至第 {pendingJumpTarget.day} 天 · {PHASE_NAMES[pendingJumpTarget.phase]}
                  </div>
                </div>
              </div>
              <button
                onClick={cancelJump}
                className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="p-5 space-y-4 max-h-[50vh] overflow-y-auto">
              {/* 回滚影响提示 */}
              {jumpAnalysis.direction === "backward" && (
                <div className="space-y-3">
                  {jumpAnalysis.playersToRevive.length > 0 && (
                    <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-blue-400 text-sm font-medium mb-2">
                        <Warning size={16} />
                        将复活 {jumpAnalysis.playersToRevive.length} 名玩家
                      </div>
                      <div className="text-xs text-gray-300">
                        {jumpAnalysis.playersToRevive.map((seat) => {
                          const p = gameState.players.find((x) => x.seat === seat);
                          return p ? `${seat + 1}号 ${p.displayName}` : `${seat + 1}号`;
                        }).join("、")}
                      </div>
                    </div>
                  )}
                  {jumpAnalysis.abilitiesToRestore.length > 0 && (
                    <div className="bg-purple-900/30 border border-purple-700/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-purple-400 text-sm font-medium mb-2">
                        <Lightning size={16} />
                        将恢复技能
                      </div>
                      <div className="text-xs text-gray-300">
                        {jumpAnalysis.abilitiesToRestore.map((a) => 
                          a === "witchHealUsed" ? "女巫解药" : 
                          a === "witchPoisonUsed" ? "女巫毒药" : a
                        ).join("、")}
                      </div>
                    </div>
                  )}
                  {jumpAnalysis.daysToClean.length > 0 && (
                    <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                        <Warning size={16} />
                        将清除第 {jumpAnalysis.daysToClean.join("、")} 天的历史记录
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 前跳补全任务 */}
              {jumpAnalysis.direction === "forward" && missingTasks.length > 0 && (
                <div className="space-y-3">
                  <div className="text-sm text-gray-300 mb-2">
                    跳转将跳过以下决策点，请选择如何处理：
                  </div>
                  {jumpFormError && (
                    <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-3 py-2 text-sm text-red-300">
                      {jumpFormError}
                    </div>
                  )}
                  {missingTasks.map((task, idx) => (
                    <div key={idx} className="bg-gray-800/60 border border-gray-700 rounded-lg p-3">
                      <div className="text-sm font-medium text-yellow-400 mb-2">
                        {task.description}
                      </div>
                      {task.options && (
                        <select
                          value={String(filledData[task.field] ?? "")}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFilledData((prev) => ({
                              ...prev,
                              [task.field]: isNaN(Number(val)) ? val : Number(val),
                            }));
                          }}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                        >
                          <option value="">-- 请选择 --</option>
                          {task.options.map((opt, i) => (
                            <option
                              key={i}
                              value={opt.value}
                              disabled={isTaskOptionDisabled(task, opt as any, fillCtx)}
                            >
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 无需特殊处理的情况 */}
              {jumpAnalysis.direction === "forward" && missingTasks.length === 0 && (
                <div className="text-sm text-gray-400 text-center py-4">
                  此跳转无需补全数据，可直接执行。
                </div>
              )}
            </div>

            {/* 弹窗底部按钮 */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-700 bg-gray-800/30">
              <button
                onClick={cancelJump}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
              >
                取消
              </button>
              {missingTasks.length > 0 && (
                <button
                  onClick={randomFillMissingTasks}
                  className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white text-sm font-medium transition-colors"
                >
                  一键随机补全
                </button>
              )}
              <button
                onClick={confirmJump}
                className="px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-medium transition-colors"
              >
                {jumpAnalysis.direction === "backward" ? "确认回滚" : "确认跳转"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============ 全局控制 Tab ============
function GlobalTab({
  gameState,
  isPaused,
  setIsPaused,
  jumpToPhase,
  setDay,
}: {
  gameState: GameState;
  isPaused: boolean;
  setIsPaused: (v: boolean) => void;
  jumpToPhase: (phase: Phase) => void;
  setDay: (day: number) => void;
}) {
  const actionDays = useMemo(() => {
    const days = new Set<number>();
    Object.keys(gameState.nightHistory || {}).forEach((d) => days.add(Number(d)));
    Object.keys(gameState.voteHistory || {}).forEach((d) => days.add(Number(d)));
    return Array.from(days)
      .filter((d) => Number.isFinite(d) && d > 0)
      .sort((a, b) => a - b);
  }, [gameState.nightHistory, gameState.voteHistory]);

  const getSeatLabel = (seat: number | undefined) => {
    if (seat === undefined) return "无";
    const p = gameState.players.find((x) => x.seat === seat);
    return p ? formatPlayerLabel(p) : `${seat + 1}号`;
  };

  const getDeathReasonLabel = (reason: "wolf" | "poison" | "milk") => {
    if (reason === "wolf") return "狼刀";
    if (reason === "poison") return "女巫毒";
    return "毒奶";
  };

  const getVoteLine = (voterId: string, targetSeat: number) => {
    const voter = gameState.players.find((p) => p.playerId === voterId);
    const voterLabel = voter ? formatPlayerLabel(voter) : voterId;
    return `${voterLabel} → ${getSeatLabel(targetSeat)}`;
  };

  const getVoteCountSummary = (votes: Record<string, number>) => {
    const counts: Record<number, number> = {};
    Object.values(votes).forEach((seat) => {
      counts[seat] = (counts[seat] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([seatStr, c]) => `${getSeatLabel(Number(seatStr))}: ${c}票`);
  };

  return (
    <div className="space-y-4">
      {/* 当前状态 */}
      <Section title="当前状态">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-gray-800 rounded px-3 py-2">
            <span className="text-gray-400">阶段:</span>{" "}
            <span className="text-yellow-400">{PHASE_NAMES[gameState.phase]}</span>
          </div>
          <div className="bg-gray-800 rounded px-3 py-2">
            <span className="text-gray-400">天数:</span>{" "}
            <span className="text-blue-400">第 {gameState.day} 天</span>
          </div>
          <div className="bg-gray-800 rounded px-3 py-2">
            <span className="text-gray-400">存活:</span>{" "}
            <span className="text-green-400">
              {gameState.players.filter((p) => p.alive).length}/{gameState.players.length}
            </span>
          </div>
          <div className="bg-gray-800 rounded px-3 py-2">
            <span className="text-gray-400">发言者:</span>{" "}
            <span className="text-purple-400">
              {gameState.currentSpeakerSeat !== null ? `${gameState.currentSpeakerSeat + 1}号` : "无"}
            </span>
          </div>
        </div>
      </Section>

      {/* 阶段跳转 */}
      <Section title="阶段跳转">
        <select
          value={gameState.phase}
          onChange={(e) => jumpToPhase(e.target.value as Phase)}
          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
        >
          {ALL_PHASES.map((phase) => (
            <option key={phase} value={phase}>
              {PHASE_NAMES[phase]} ({phase})
            </option>
          ))}
        </select>
      </Section>

      {/* 天数修改 */}
      <Section title="天数修改">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDay(gameState.day - 1)}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm"
          >
            -
          </button>
          <input
            type="number"
            value={gameState.day}
            onChange={(e) => setDay(parseInt(e.target.value) || 1)}
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-white text-sm text-center focus:outline-none focus:border-yellow-400"
          />
          <button
            onClick={() => setDay(gameState.day + 1)}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm"
          >
            +
          </button>
        </div>
      </Section>

      {/* 全场动作信息记录 */}
      <Section title="全场动作信息记录">
        {actionDays.length === 0 ? (
          <div className="text-xs text-gray-400">暂无记录（需要至少经历一次夜晚结算或投票）</div>
        ) : (
          <div className="space-y-3">
            {actionDays.map((day) => {
              const night = gameState.nightHistory?.[day];
              const votes = gameState.voteHistory?.[day];
              const dayRecord = gameState.dayHistory?.[day];

              return (
                <div key={day} className="bg-gray-800/60 rounded-lg border border-gray-700 p-3">
                  <div className="text-sm font-semibold text-white mb-2">第 {day} 天</div>

                  <div className="space-y-1 text-xs">
                    <div className="text-gray-300">
                      <span className="text-gray-400">守卫守护:</span> {getSeatLabel(night?.guardTarget)}
                    </div>
                    <div className="text-gray-300">
                      <span className="text-gray-400">狼人出刀:</span> {getSeatLabel(night?.wolfTarget)}
                    </div>
                    <div className="text-gray-300">
                      <span className="text-gray-400">女巫救人:</span> {night?.witchSave ? "是" : "否"}
                    </div>
                    <div className="text-gray-300">
                      <span className="text-gray-400">女巫毒人:</span> {getSeatLabel(night?.witchPoison)}
                    </div>
                    <div className="text-gray-300">
                      <span className="text-gray-400">预言家查验:</span> {getSeatLabel(night?.seerTarget)}
                      {night?.seerResult ? (
                        <span className="text-gray-400">（结果: {night.seerResult.isWolf ? "狼人" : "好人"}）</span>
                      ) : null}
                    </div>

                    <div className="text-gray-300">
                      <span className="text-gray-400">夜晚死亡:</span>{" "}
                      {!night?.deaths || night.deaths.length === 0
                        ? "无"
                        : night.deaths
                            .map((d) => `${getSeatLabel(d.seat)}（${getDeathReasonLabel(d.reason)}）`)
                            .join("，")}
                    </div>

                    <div className="text-gray-300">
                      <span className="text-gray-400">猎人开枪(夜):</span>{" "}
                      {night?.hunterShot
                        ? `${getSeatLabel(night.hunterShot.hunterSeat)} → ${getSeatLabel(night.hunterShot.targetSeat)}`
                        : "无"}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-300 mb-1">白天处决</div>
                    {!dayRecord ? (
                      <div className="text-xs text-gray-400">无</div>
                    ) : dayRecord.voteTie ? (
                      <div className="text-xs text-gray-200">平票，无人出局</div>
                    ) : dayRecord.executed ? (
                      <div className="text-xs text-gray-200">
                        {getSeatLabel(dayRecord.executed.seat)}（{dayRecord.executed.votes}票）
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">无</div>
                    )}

                    <div className="mt-2 text-xs text-gray-300">
                      <span className="text-gray-400">猎人开枪(日):</span>{" "}
                      {dayRecord?.hunterShot
                        ? `${getSeatLabel(dayRecord.hunterShot.hunterSeat)} → ${getSeatLabel(dayRecord.hunterShot.targetSeat)}`
                        : "无"}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-300 mb-1">投票信息</div>
                    {!votes || Object.keys(votes).length === 0 ? (
                      <div className="text-xs text-gray-400">无</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          {Object.entries(votes).map(([voterId, targetSeat]) => (
                            <div key={voterId} className="text-xs text-gray-200">
                              {getVoteLine(voterId, targetSeat)}
                            </div>
                          ))}
                        </div>
                        <div className="space-y-1">
                          {getVoteCountSummary(votes).map((line) => (
                            <div key={line} className="text-xs text-gray-400">
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

// ============ 玩家管理 Tab ============
function PlayersTab({
  gameState,
  setPlayerRole,
  setPlayerAlive,
}: {
  gameState: GameState;
  setPlayerRole: (seat: number, role: Role) => void;
  setPlayerAlive: (seat: number, alive: boolean) => void;
}) {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const [promptActiveTab, setPromptActiveTab] = useState<"prompt" | "speech">("prompt");
  const [aiLogs, setAiLogs] = useState<AILogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  // 获取当前角色的提示词
  const getPlayerPrompt = (player: Player) => {
    switch (player.role) {
      case "Werewolf":
        return WOLF_ACTION_PROMPT(gameState, player).system;
      case "Seer":
        return SEER_ACTION_PROMPT(gameState, player).system;
      case "Witch":
        return WITCH_ACTION_PROMPT(gameState, player, undefined).system;
      case "Guard":
        return GUARD_ACTION_PROMPT(gameState, player).system;
      default:
        return SPEECH_PROMPT(gameState, player).system;
    }
  };

  useEffect(() => {
    if (!isPromptDialogOpen || !selectedPlayer) return;

    let cancelled = false;
    setIsLoadingLogs(true);
    setLogsError(null);
    (async () => {
      try {
        const res = await fetch("/api/ai-log");
        const data = await res.json();
        if (cancelled) return;
        setAiLogs(Array.isArray(data?.logs) ? (data.logs as AILogEntry[]) : []);
      } catch (e) {
        if (cancelled) return;
        setLogsError(String(e));
        setAiLogs([]);
      } finally {
        if (cancelled) return;
        setIsLoadingLogs(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPromptDialogOpen, selectedPlayer]);

  const speechItems = useMemo(() => {
    if (!selectedPlayer) return [] as Array<{ id: string; label: string; lines: string[] }>;
    const items = aiLogs
      .filter((x) => x?.type === "speech" && x.request?.player?.playerId === selectedPlayer.playerId)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((entry) => {
        const system = entry.request.messages.find((m) => m.role === "system")?.content || "";
        const user = entry.request.messages.find((m) => m.role === "user")?.content || "";

        const dayMatch = user.match(/第\s*(\d+)\s*天/);
        const day = dayMatch ? Number(dayMatch[1]) : NaN;

        let phaseLabel = "未知阶段";
        if (system.includes("遗言")) phaseLabel = "遗言";
        else if (user.includes("夜晚")) phaseLabel = "夜晚";
        else if (user.includes("白天")) phaseLabel = "白天";

        const label = Number.isFinite(day) ? `第${day}天 · ${phaseLabel}` : phaseLabel;

        const content = entry.response?.content ?? "";
        let lines: string[] = [];
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            lines = parsed.map((x) => String(x));
          }
        } catch {
          lines = content
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        }

        if (lines.length === 0 && content) {
          lines = [content];
        }

        return { id: entry.id, label, lines };
      });

    return items.filter((x) => {
      const m = x.label.match(/第(\d+)天/);
      if (!m) return true;
      const d = Number(m[1]);
      if (!Number.isFinite(d)) return true;
      return d <= gameState.day;
    });
  }, [aiLogs, selectedPlayer, gameState.day]);
  return (
    <div className="space-y-2">
      {gameState.players.map((player) => (
        <div
          key={player.playerId}
          className={`p-3 rounded-lg border ${
            player.alive
              ? "bg-gray-800/50 border-gray-700"
              : "bg-red-900/20 border-red-800/50"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  player.alive ? "bg-blue-600" : "bg-gray-600"
                }`}
              >
                {player.seat + 1}
              </span>
              <span className={`font-medium ${player.alive ? "text-white" : "text-gray-500"}`}>
                {player.displayName}
              </span>
              {player.isHuman && (
                <span className="px-1.5 py-0.5 bg-green-600 rounded text-[10px] text-white">
                  人类
                </span>
              )}
            </div>
            <button
              onClick={() => setPlayerAlive(player.seat, !player.alive)}
              className={`px-2 py-1 rounded text-xs font-medium ${
                player.alive
                  ? "bg-red-600 hover:bg-red-500 text-white"
                  : "bg-green-600 hover:bg-green-500 text-white"
              }`}
            >
              {player.alive ? "击杀" : "复活"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">角色:</span>
            <select
              value={player.role}
              onChange={(e) => setPlayerRole(player.seat, e.target.value as Role)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-400"
            >
              {ALL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_NAMES[role]}
                </option>
              ))}
            </select>
            <span
              className={`px-2 py-0.5 rounded text-[10px] ${
                player.alignment === "wolf" ? "bg-red-600" : "bg-blue-600"
              }`}
            >
              {player.alignment === "wolf" ? "狼" : "好"}
            </span>
            <button
              onClick={() => {
                setSelectedPlayer(player);
                setIsPromptDialogOpen(true);
                setPromptActiveTab("prompt");
              }}
              className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="查看提示词"
            >
              <ChatDots size={16} />
            </button>
          </div>
        </div>
      ))}

      {isPromptDialogOpen && selectedPlayer && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
          <div className="bg-gray-900 rounded-lg p-4 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-white">
                {selectedPlayer.seat + 1}号 {selectedPlayer.displayName}
              </h3>
              <button
                onClick={() => setIsPromptDialogOpen(false)}
                className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setPromptActiveTab("prompt")}
                className={`px-3 py-1.5 rounded text-sm ${
                  promptActiveTab === "prompt"
                    ? "bg-gray-700 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                提示词
              </button>
              <button
                onClick={() => setPromptActiveTab("speech")}
                className={`px-3 py-1.5 rounded text-sm ${
                  promptActiveTab === "speech"
                    ? "bg-gray-700 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                发言
              </button>
            </div>

            {promptActiveTab === "prompt" && (
              <pre className="bg-gray-800 rounded p-4 text-sm text-green-400 font-mono whitespace-pre-wrap">
                {getPlayerPrompt(selectedPlayer)}
              </pre>
            )}

            {promptActiveTab === "speech" && (
              <div className="space-y-3">
                {isLoadingLogs && <div className="text-sm text-gray-400">正在加载日志…</div>}
                {!isLoadingLogs && logsError && (
                  <div className="text-sm text-red-400">加载失败：{logsError}</div>
                )}
                {!isLoadingLogs && !logsError && speechItems.length === 0 && (
                  <div className="text-sm text-gray-400">暂无该玩家的发言日志</div>
                )}

                {speechItems.map((item, idx) => (
                  <div key={item.id || `${item.label}::${idx}`} className="bg-gray-800 rounded p-3">
                    <div className="text-xs text-gray-400 mb-2">{item.label}</div>
                    <div className="space-y-1">
                      {item.lines.map((line, idx) => (
                        <div key={idx} className="text-sm text-gray-100">
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ 动作模拟 Tab ============
function ActionsTab({
  gameState,
  setNightAction,
  patchNightActions,
  setNextSpeaker,
  clearVotes,
  forceVote,
}: {
  gameState: GameState;
  setNightAction: (key: string, value: any) => void;
  patchNightActions: (patch: Partial<GameState["nightActions"]>) => void;
  setNextSpeaker: (seat: number | null) => void;
  clearVotes: () => void;
  forceVote: (voterId: string, targetSeat: number) => void;
}) {
  const [selectedVoter, setSelectedVoter] = useState<string>("");
  const [selectedTarget, setSelectedTarget] = useState<number>(0);

  const allPlayers = gameState.players;
  const alivePlayers = gameState.players.filter((p) => p.alive);

  return (
    <div className="space-y-4">
      {/* 夜间行动 */}
      <Section title="夜间行动">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-20">守卫目标:</span>
            <select
              value={gameState.nightActions.guardTarget ?? ""}
              onChange={(e) =>
                setNightAction("guardTarget", e.target.value ? parseInt(e.target.value) : undefined)
              }
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
            >
              <option value="">无</option>
              {allPlayers.map((p) => (
                <option key={p.seat} value={p.seat}>
                  {formatPlayerLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-20">狼刀目标:</span>
            <select
              value={gameState.nightActions.wolfTarget ?? ""}
              onChange={(e) =>
                setNightAction("wolfTarget", e.target.value ? parseInt(e.target.value) : undefined)
              }
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
            >
              <option value="">无</option>
              {allPlayers.map((p) => (
                <option key={p.seat} value={p.seat}>
                  {formatPlayerLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-20">女巫救人:</span>
            <button
              onClick={() => setNightAction("witchSave", !gameState.nightActions.witchSave)}
              className={`px-3 py-1 rounded text-xs ${
                gameState.nightActions.witchSave
                  ? "bg-green-600 text-white"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              {gameState.nightActions.witchSave ? "是" : "否"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-20">女巫毒人:</span>
            <select
              value={gameState.nightActions.witchPoison ?? ""}
              onChange={(e) =>
                setNightAction("witchPoison", e.target.value ? parseInt(e.target.value) : undefined)
              }
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
            >
              <option value="">无</option>
              {allPlayers.map((p) => (
                <option key={p.seat} value={p.seat}>
                  {formatPlayerLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-20">预言家查验:</span>
            <select
              value={gameState.nightActions.seerTarget ?? ""}
              onChange={(e) => {
                const targetSeat = e.target.value ? parseInt(e.target.value) : undefined;
                if (targetSeat !== undefined) {
                  const target = gameState.players.find(p => p.seat === targetSeat);
                  const isWolf = target?.role === "Werewolf";
                  const newHistory = [
                    ...(gameState.nightActions.seerHistory || []),
                    { day: gameState.day, targetSeat, isWolf }
                  ];
                  // 批量写入，避免一次操作触发多次 devMutationId
                  patchNightActions({
                    seerTarget: targetSeat,
                    seerResult: { targetSeat, isWolf },
                    seerHistory: newHistory,
                  });
                } else {
                  setNightAction("seerTarget", undefined);
                }
              }}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
            >
              <option value="">无</option>
              {allPlayers.map((p) => (
                <option key={p.seat} value={p.seat}>
                  {formatPlayerLabel(p)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      {/* 发言控制 */}
      <Section title="发言控制">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-20">下一位发言:</span>
          <select
            value={gameState.nextSpeakerSeatOverride ?? ""}
            onChange={(e) => setNextSpeaker(e.target.value ? parseInt(e.target.value) : null)}
            className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
          >
            <option value="">无</option>
            {allPlayers.map((p) => (
              <option key={p.seat} value={p.seat}>
                {formatPlayerLabel(p)}
              </option>
            ))}
          </select>
        </div>
      </Section>

      {/* 投票控制 */}
      <Section title="投票控制">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={selectedVoter}
              onChange={(e) => setSelectedVoter(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
            >
              <option value="">选择投票人</option>
              {alivePlayers.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.seat + 1}号 {p.displayName}
                </option>
              ))}
            </select>
            <span className="text-gray-400">→</span>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(parseInt(e.target.value))}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
            >
              {alivePlayers.map((p) => (
                <option key={p.seat} value={p.seat}>
                  {p.seat + 1}号
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                if (selectedVoter) {
                  forceVote(selectedVoter, selectedTarget);
                }
              }}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-xs"
            >
              投票
            </button>
          </div>
          <button
            onClick={clearVotes}
            className="w-full px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-white text-xs"
          >
            清空所有投票
          </button>
          {/* 当前投票情况 */}
          {Object.keys(gameState.votes).length > 0 && (
            <div className="mt-2 p-2 bg-gray-800 rounded text-xs">
              <div className="text-gray-400 mb-1">当前投票:</div>
              {Object.entries(gameState.votes).map(([voterId, targetSeat]) => {
                const voter = gameState.players.find((p) => p.playerId === voterId);
                return (
                  <div key={voterId} className="text-gray-300">
                    {voter?.seat !== undefined ? voter.seat + 1 : "?"}号 → {targetSeat + 1}号
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

// ============ 状态检视 Tab ============
function InspectorTab({ gameState }: { gameState: GameState }) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(["root"]));

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // 简化的 JSON 显示
  const stateForDisplay = useMemo(() => {
    return {
      phase: gameState.phase,
      day: gameState.day,
      currentSpeakerSeat: gameState.currentSpeakerSeat,
      players: gameState.players.map((p) => ({
        seat: p.seat,
        name: p.displayName,
        role: p.role,
        alive: p.alive,
        isHuman: p.isHuman,
      })),
      nightActions: gameState.nightActions,
      roleAbilities: gameState.roleAbilities,
      votes: gameState.votes,
      winner: gameState.winner,
    };
  }, [gameState]);

  return (
    <div className="space-y-2">
      <pre className="bg-gray-800 rounded p-3 text-xs text-green-400 overflow-auto max-h-[60vh] font-mono">
        {JSON.stringify(stateForDisplay, null, 2)}
      </pre>
      <button
        onClick={() => {
          navigator.clipboard.writeText(JSON.stringify(gameState, null, 2));
        }}
        className="w-full px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-white text-xs"
      >
        复制完整状态到剪贴板
      </button>
    </div>
  );
}

// ============ 通用组件 ============
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}

// ============ 悬浮入口按钮 ============
export function DevModeButton({ onClick }: { onClick: () => void }) {
  // 仅在开发环境显示
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className="fixed bottom-5 right-5 z-[99] w-12 h-12 rounded-full bg-yellow-500 hover:bg-yellow-400 shadow-lg flex items-center justify-center transition-all hover:scale-110"
      title="开发者模式"
    >
      <Wrench size={24} className="text-gray-900" />
    </button>
  );
}
