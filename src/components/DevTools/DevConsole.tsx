"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useAtom } from "jotai";
import { motion, AnimatePresence } from "framer-motion";
import { gameStateAtom } from "@/store/game-machine";
import type { GameState, Phase, Role, Player } from "@/types/game";
import { X, Wrench, Play, Pause, SkipForward, Eye, Users, Crosshair, Code, ChatDots, Warning, ArrowRight, ArrowLeft, Lightning, SpeakerHigh } from "@phosphor-icons/react";
import {
  applySmartJump,
  applySmartJumpWithFilledData,
  analyzeJump,
  type JumpTarget,
  type JumpAnalysis,
  type MissingTask,
  type SmartJumpResult,
} from "@/lib/SmartJumpManager";
import { PhaseManager } from "@/game/core/PhaseManager";
import { DEFAULT_VOICE_ID, resolveVoiceId, VOICE_PRESETS, ENGLISH_VOICE_PRESETS, type AppLocale } from "@/lib/voice-constants";
import { getLocale } from "@/i18n/locale-store";
import { aiLogger } from "@/lib/ai-logger";

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

const phaseManager = new PhaseManager();

// 所有可用的游戏阶段
const ALL_PHASES: Phase[] = [
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
  "DAY_LAST_WORDS",
  "DAY_VOTE",
  "DAY_RESOLVE",
  "BADGE_TRANSFER",
  "HUNTER_SHOOT",
  "GAME_END",
];

// 所有可用的角色
const ALL_ROLES: Role[] = ["Villager", "Werewolf", "Seer", "Witch", "Hunter", "Guard"];

// Helper to get phase name with i18n
const usePhaseNames = () => {
  const t = useTranslations();
  return useMemo(() => ({
    LOBBY: t("devConsole.phases.LOBBY"),
    SETUP: t("devConsole.phases.SETUP"),
    NIGHT_START: t("devConsole.phases.NIGHT_START"),
    NIGHT_GUARD_ACTION: t("devConsole.phases.NIGHT_GUARD_ACTION"),
    NIGHT_WOLF_ACTION: t("devConsole.phases.NIGHT_WOLF_ACTION"),
    NIGHT_WITCH_ACTION: t("devConsole.phases.NIGHT_WITCH_ACTION"),
    NIGHT_SEER_ACTION: t("devConsole.phases.NIGHT_SEER_ACTION"),
    NIGHT_RESOLVE: t("devConsole.phases.NIGHT_RESOLVE"),
    DAY_START: t("devConsole.phases.DAY_START"),
    DAY_BADGE_SIGNUP: t("devConsole.phases.DAY_BADGE_SIGNUP"),
    DAY_BADGE_SPEECH: t("devConsole.phases.DAY_BADGE_SPEECH"),
    DAY_BADGE_ELECTION: t("devConsole.phases.DAY_BADGE_ELECTION"),
    DAY_SPEECH: t("devConsole.phases.DAY_SPEECH"),
    DAY_PK_SPEECH: t("devConsole.phases.DAY_PK_SPEECH"),
    DAY_LAST_WORDS: t("devConsole.phases.DAY_LAST_WORDS"),
    DAY_VOTE: t("devConsole.phases.DAY_VOTE"),
    DAY_RESOLVE: t("devConsole.phases.DAY_RESOLVE"),
    BADGE_TRANSFER: t("devConsole.phases.BADGE_TRANSFER"),
    HUNTER_SHOOT: t("devConsole.phases.HUNTER_SHOOT"),
    GAME_END: t("devConsole.phases.GAME_END"),
  } as Record<Phase, string>), [t]);
};

// Helper to get role name with i18n
const useRoleNames = () => {
  const t = useTranslations();
  return useMemo(() => ({
    Villager: t("devConsole.roles.Villager"),
    Werewolf: t("devConsole.roles.Werewolf"),
    Seer: t("devConsole.roles.Seer"),
    Witch: t("devConsole.roles.Witch"),
    Hunter: t("devConsole.roles.Hunter"),
    Guard: t("devConsole.roles.Guard"),
  } as Record<Role, string>), [t]);
};

// Helper to format player label with i18n
const useFormatPlayerLabel = () => {
  const t = useTranslations();
  return useCallback((p: Player) => 
    t("devConsole.playerLabel", { seat: p.seat + 1, name: p.displayName }) + (p.alive ? "" : t("devConsole.playerDead"))
  , [t]);
};

type TabType = "global" | "players" | "actions" | "inspector" | "tts";

interface DevConsoleProps {
  isOpen: boolean;
  onClose: () => void;
}

function TTSTab() {
  const t = useTranslations();
  const [text, setText] = useState(t("devConsole.ttsTest.defaultText"));
  const [voiceId, setVoiceId] = useState<string>(DEFAULT_VOICE_ID.female);
  const [status, setStatus] = useState<number | null>(null);
  const [contentType, setContentType] = useState<string>("");
  const [byteLength, setByteLength] = useState<number | null>(null);
  const [bodyPreview, setBodyPreview] = useState<string>("");
  const [audioObjectUrl, setAudioObjectUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
    };
  }, [audioObjectUrl]);

  const runTest = useCallback(async () => {
    setIsLoading(true);
    setError("");
    setBodyPreview("");
    setStatus(null);
    setContentType("");
    setByteLength(null);
    if (audioObjectUrl) {
      URL.revokeObjectURL(audioObjectUrl);
      setAudioObjectUrl("");
    }

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId }),
      });

      setStatus(res.status);
      const ct = res.headers.get("content-type") || "";
      setContentType(ct);

      const ab = await res.arrayBuffer();
      setByteLength(ab.byteLength);
      const isJson = ct.includes("application/json") || ct.includes("text/");

      if (!res.ok || isJson) {
        const txt = new TextDecoder().decode(new Uint8Array(ab));
        setBodyPreview(txt.slice(0, 2000));
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
        }
        return;
      }

      const blob = new Blob([ab], { type: ct || "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      setAudioObjectUrl(url);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [text, voiceId, audioObjectUrl]);

  return (
    <div className="space-y-3">
      <Section title={t("devConsole.ttsTest.title")}>
        <div className="space-y-2">
          <div className="text-xs text-gray-400">
            {t("devConsole.ttsTest.description")}
          </div>

          <input
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
            placeholder={t("devConsole.ttsTest.voiceIdPlaceholder")}
          />

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400 min-h-[88px]"
            placeholder={t("devConsole.ttsTest.textPlaceholder")}
          />

          <button
            type="button"
            onClick={runTest}
            disabled={isLoading || !text.trim() || !voiceId.trim()}
            className={`w-full px-4 py-2 rounded font-medium text-sm transition-colors ${
              isLoading || !text.trim() || !voiceId.trim()
                ? "bg-gray-700 text-gray-400"
                : "bg-yellow-600 hover:bg-yellow-500 text-white"
            }`}
          >
            {isLoading ? t("devConsole.ttsTest.loading") : t("devConsole.ttsTest.send")}
          </button>
        </div>
      </Section>

      <Section title={t("devConsole.ttsTest.responseTitle")}>
        <div className="space-y-2 text-xs">
          <div className="bg-gray-800 rounded px-3 py-2">
            <span className="text-gray-400">Status:</span> <span className="text-white">{status ?? "-"}</span>
          </div>
          <div className="bg-gray-800 rounded px-3 py-2">
            <span className="text-gray-400">Content-Type:</span> <span className="text-white">{contentType || "-"}</span>
          </div>
          <div className="bg-gray-800 rounded px-3 py-2">
            <span className="text-gray-400">Bytes:</span> <span className="text-white">{byteLength ?? "-"}</span>
          </div>
          {audioObjectUrl && (
            <div className="space-y-2">
              <audio ref={audioRef} className="w-full" controls src={audioObjectUrl} />
              <button
                type="button"
                className="w-full bg-gray-800 rounded px-3 py-2 text-white hover:bg-gray-700 transition-colors"
                onClick={() => {
                  const el = audioRef.current;
                  if (!el) return;
                  el.play().catch((e) => setError(`Audio playback error: ${String(e)}`));
                }}
              >
                {t("devConsole.ttsTest.playButton")}
              </button>
              <a
                className="block bg-gray-800 rounded px-3 py-2 text-blue-300 hover:text-blue-200 underline"
                href={audioObjectUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t("devConsole.ttsTest.openAudio")}
              </a>
            </div>
          )}
          {bodyPreview && (
            <pre className="bg-gray-800 rounded p-3 text-xs text-green-400 overflow-auto max-h-[220px] font-mono whitespace-pre-wrap">
              {bodyPreview}
            </pre>
          )}
          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded px-3 py-2 text-red-200">
              {error}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

export function DevConsole({ isOpen, onClose }: DevConsoleProps) {
  const t = useTranslations();
  const phaseNames = usePhaseNames();
  const [gameState, setGameState] = useAtom(gameStateAtom);
  const [activeTab, setActiveTab] = useState<TabType>("global");

  const bumpDevMutation = (prev: GameState): number => (prev.devMutationId ?? 0) + 1;

  const togglePause = useCallback(() => {
    setGameState((prev) => ({
      ...prev,
      isPaused: !prev.isPaused,
      devMutationId: bumpDevMutation(prev),
    }));
  }, [setGameState]);

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
          setJumpFormError(t("devConsole.jumpDialog.fillError"));
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
  }, [pendingJumpTarget, gameState, setGameState, missingTasks, filledData, jumpAnalysis?.direction, t]);

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

  // 设置警长（若已有警长则移除）
  const setSheriff = (seat: number | null) => {
    setGameState((prev) => ({
      ...prev,
      badge: {
        ...prev.badge,
        holderSeat: seat,
        // 如果移除警长，清空相关竞选数据
        ...(seat === null ? { candidates: [], signup: {}, votes: {} } : {}),
      },
      devMutationId: bumpDevMutation(prev),
    }));
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "global", label: t("devConsole.tabs.global"), icon: <Wrench size={16} /> },
    { id: "players", label: t("devConsole.tabs.players"), icon: <Users size={16} /> },
    { id: "actions", label: t("devConsole.tabs.actions"), icon: <Crosshair size={16} /> },
    { id: "tts", label: t("devConsole.tabs.tts"), icon: <SpeakerHigh size={16} /> },
    { id: "inspector", label: t("devConsole.tabs.inspector"), icon: <Code size={16} /> },
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
            <span className="font-bold text-white">{t("devConsole.title")}</span>
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
                togglePause={togglePause}
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
                setSheriff={setSheriff}
              />
            )}
            {activeTab === "tts" && <TTSTab />}
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
                    {jumpAnalysis.direction === "backward"
                      ? t("devConsole.jumpDialog.backward")
                      : t("devConsole.jumpDialog.forward")}
                  </div>
                  <div className="text-xs text-gray-400">
                    {t("devConsole.jumpDialog.jumpTo", {
                      day: pendingJumpTarget.day,
                      phase: phaseNames[pendingJumpTarget.phase],
                    })}
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
                        {t("devConsole.jumpDialog.revivePlayers", {
                          count: jumpAnalysis.playersToRevive.length,
                        })}
                      </div>
                      <div className="text-xs text-gray-300">
                        {jumpAnalysis.playersToRevive.map((seat) => {
                          const p = gameState.players.find((x) => x.seat === seat);
                          return p
                            ? t("devConsole.playerLabel", { seat: seat + 1, name: p.displayName })
                            : t("devConsole.seatOnly", { seat: seat + 1 });
                        }).join("、")}
                      </div>
                    </div>
                  )}
                  {jumpAnalysis.abilitiesToRestore.length > 0 && (
                    <div className="bg-purple-900/30 border border-purple-700/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-purple-400 text-sm font-medium mb-2">
                        <Lightning size={16} />
                        {t("devConsole.jumpDialog.restoreAbilities")}
                      </div>
                      <div className="text-xs text-gray-300">
                        {jumpAnalysis.abilitiesToRestore.map((a) => 
                          a === "witchHealUsed"
                            ? t("devConsole.jumpDialog.witchHeal")
                            : a === "witchPoisonUsed"
                              ? t("devConsole.jumpDialog.witchPoison")
                              : a
                        ).join("、")}
                      </div>
                    </div>
                  )}
                  {jumpAnalysis.daysToClean.length > 0 && (
                    <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                        <Warning size={16} />
                        {t("devConsole.jumpDialog.clearDays", {
                          days: jumpAnalysis.daysToClean.join("、"),
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 前跳补全任务 */}
              {jumpAnalysis.direction === "forward" && missingTasks.length > 0 && (
                <div className="space-y-3">
                  <div className="text-sm text-gray-300 mb-2">
                    {t("devConsole.jumpDialog.forwardHint")}
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
                          <option value="">{t("devConsole.jumpDialog.selectPlaceholder")}</option>
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
                  {t("devConsole.jumpDialog.noFillNeeded")}
                </div>
              )}
            </div>

            {/* 弹窗底部按钮 */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-700 bg-gray-800/30">
              <button
                onClick={cancelJump}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
              >
                {t("devConsole.jumpDialog.cancel")}
              </button>
              {missingTasks.length > 0 && (
                <button
                  onClick={randomFillMissingTasks}
                  className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white text-sm font-medium transition-colors"
                >
                  {t("devConsole.jumpDialog.randomFill")}
                </button>
              )}
              <button
                onClick={confirmJump}
                className="px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-medium transition-colors"
              >
                {jumpAnalysis.direction === "backward"
                  ? t("devConsole.jumpDialog.confirmRollback")
                  : t("devConsole.jumpDialog.confirmJump")}
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
  togglePause,
  jumpToPhase,
  setDay,
}: {
  gameState: GameState;
  togglePause: () => void;
  jumpToPhase: (phase: Phase) => void;
  setDay: (day: number) => void;
}) {
  const t = useTranslations();
  const phaseNames = usePhaseNames();
  const formatPlayerLabel = useFormatPlayerLabel();
  const actionDays = useMemo(() => {
    const days = new Set<number>();
    Object.keys(gameState.nightHistory || {}).forEach((d) => days.add(Number(d)));
    Object.keys(gameState.voteHistory || {}).forEach((d) => days.add(Number(d)));
    return Array.from(days)
      .filter((d) => Number.isFinite(d) && d > 0)
      .sort((a, b) => a - b);
  }, [gameState.nightHistory, gameState.voteHistory]);

  const getSeatLabel = (seat: number | undefined) => {
    if (seat === undefined) return t("devConsole.none");
    const p = gameState.players.find((x) => x.seat === seat);
    return p ? formatPlayerLabel(p) : t("devConsole.seatOnly", { seat: seat + 1 });
  };

  const getDeathReasonLabel = (reason: "wolf" | "poison" | "milk") => {
    if (reason === "wolf") return t("devConsole.deathReason.wolf");
    if (reason === "poison") return t("devConsole.deathReason.poison");
    return t("devConsole.deathReason.milk");
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
      .map(([seatStr, c]) => `${getSeatLabel(Number(seatStr))}: ${c}${t("devConsole.voteCountSuffix")}`);
  };

  return (
    <div className="space-y-4">
      {/* 当前状态 */}
      <Section title={t("devConsole.currentState")}>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-gray-800 rounded px-3 py-2">
            <span className="text-gray-400">{t("devConsole.labels.phase")}</span>{" "}
            <span className="text-yellow-400">{phaseNames[gameState.phase]}</span>
          </div>
          <div className="bg-gray-800 rounded px-3 py-2">
            <span className="text-gray-400">{t("devConsole.labels.day")}</span>{" "}
            <span className="text-blue-400">{t("devConsole.dayLabel", { day: gameState.day })}</span>
          </div>
          <div className="bg-gray-800 rounded px-3 py-2">
            <span className="text-gray-400">{t("devConsole.labels.alive")}</span>{" "}
            <span className="text-green-400">
              {gameState.players.filter((p) => p.alive).length}/{gameState.players.length}
            </span>
          </div>
          <div className="bg-gray-800 rounded px-3 py-2">
            <span className="text-gray-400">{t("devConsole.labels.speaker")}</span>{" "}
            <span className="text-purple-400">
              {gameState.currentSpeakerSeat !== null
                ? t("devConsole.seatOnly", { seat: gameState.currentSpeakerSeat + 1 })
                : t("devConsole.none")}
            </span>
          </div>
        </div>
      </Section>

      {/* 游戏暂停控制 */}
      <Section title={t("devConsole.gameControl")}>
        <button
          onClick={togglePause}
          className={`w-full px-4 py-2 rounded font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
            gameState.isPaused
              ? "bg-green-600 hover:bg-green-500 text-white"
              : "bg-yellow-600 hover:bg-yellow-500 text-white"
          }`}
        >
          {gameState.isPaused ? (
            <>
              <Play size={18} weight="fill" />
              {t("devConsole.resume")}
            </>
          ) : (
            <>
              <Pause size={18} weight="fill" />
              {t("devConsole.pause")}
            </>
          )}
        </button>
        {gameState.isPaused && (
          <div className="mt-2 text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-600/30 rounded px-3 py-2">
            {t("devConsole.pausedWarning")}
          </div>
        )}
      </Section>

      {/* 阶段跳转 */}
      <Section title={t("devConsole.phaseJump")}>
        <select
          value={gameState.phase}
          onChange={(e) => jumpToPhase(e.target.value as Phase)}
          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
        >
          {ALL_PHASES.map((phase) => (
            <option key={phase} value={phase}>
              {phaseNames[phase]} ({phase})
            </option>
          ))}
        </select>
      </Section>

      {/* 天数修改 */}
      <Section title={t("devConsole.dayModify")}>
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
      <Section title={t("devConsole.actionRecords")}>
        {actionDays.length === 0 ? (
          <div className="text-xs text-gray-400">{t("devConsole.actionRecordsEmpty")}</div>
        ) : (
          <div className="space-y-3">
            {actionDays.map((day) => {
              const night = gameState.nightHistory?.[day];
              const votes = gameState.voteHistory?.[day];
              const dayRecord = gameState.dayHistory?.[day];

              return (
                <div key={day} className="bg-gray-800/60 rounded-lg border border-gray-700 p-3">
                  <div className="text-sm font-semibold text-white mb-2">
                    {t("devConsole.dayLabel", { day })}
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="text-gray-300">
                      <span className="text-gray-400">{t("devConsole.actionRecordDetails.guardProtect")}</span>{" "}
                      {getSeatLabel(night?.guardTarget)}
                    </div>
                    <div className="text-gray-300">
                      <span className="text-gray-400">{t("devConsole.actionRecordDetails.wolfTarget")}</span>{" "}
                      {getSeatLabel(night?.wolfTarget)}
                    </div>
                    <div className="text-gray-300">
                      <span className="text-gray-400">{t("devConsole.actionRecordDetails.witchSave")}</span>{" "}
                      {night?.witchSave ? t("devConsole.yes") : t("devConsole.no")}
                    </div>
                    <div className="text-gray-300">
                      <span className="text-gray-400">{t("devConsole.actionRecordDetails.witchPoison")}</span>{" "}
                      {getSeatLabel(night?.witchPoison)}
                    </div>
                    <div className="text-gray-300">
                      <span className="text-gray-400">{t("devConsole.actionRecordDetails.seerCheck")}</span>{" "}
                      {getSeatLabel(night?.seerTarget)}
                      {night?.seerResult ? (
                        <span className="text-gray-400">
                          {t("devConsole.actionRecordDetails.seerResult", {
                            alignment: night.seerResult.isWolf
                              ? t("devConsole.wolf")
                              : t("devConsole.good"),
                          })}
                        </span>
                      ) : null}
                    </div>

                    <div className="text-gray-300">
                      <span className="text-gray-400">{t("devConsole.actionRecordDetails.nightDeaths")}</span>{" "}
                      {!night?.deaths || night.deaths.length === 0
                        ? t("devConsole.none")
                        : night.deaths
                            .map((d) => `${getSeatLabel(d.seat)}（${getDeathReasonLabel(d.reason)}）`)
                            .join("，")}
                    </div>

                    <div className="text-gray-300">
                      <span className="text-gray-400">{t("devConsole.actionRecordDetails.hunterShotNight")}</span>{" "}
                      {night?.hunterShot
                        ? `${getSeatLabel(night.hunterShot.hunterSeat)} → ${getSeatLabel(night.hunterShot.targetSeat)}`
                        : t("devConsole.none")}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-300 mb-1">
                      {t("devConsole.actionRecordDetails.dayExecution")}
                    </div>
                    {!dayRecord ? (
                      <div className="text-xs text-gray-400">{t("devConsole.none")}</div>
                    ) : dayRecord.voteTie ? (
                      <div className="text-xs text-gray-200">
                        {t("devConsole.actionRecordDetails.voteTieNoElim")}
                      </div>
                    ) : dayRecord.executed ? (
                      <div className="text-xs text-gray-200">
                        {getSeatLabel(dayRecord.executed.seat)}（{dayRecord.executed.votes}
                        {t("devConsole.voteCountSuffix")}）
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">{t("devConsole.none")}</div>
                    )}

                    <div className="mt-2 text-xs text-gray-300">
                      <span className="text-gray-400">{t("devConsole.actionRecordDetails.hunterShotDay")}</span>{" "}
                      {dayRecord?.hunterShot
                        ? `${getSeatLabel(dayRecord.hunterShot.hunterSeat)} → ${getSeatLabel(dayRecord.hunterShot.targetSeat)}`
                        : t("devConsole.none")}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-300 mb-1">
                      {t("devConsole.actionRecordDetails.voteInfo")}
                    </div>
                    {!votes || Object.keys(votes).length === 0 ? (
                      <div className="text-xs text-gray-400">{t("devConsole.none")}</div>
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
  const t = useTranslations();
  const roleNames = useRoleNames();
  const formatPlayerLabel = useFormatPlayerLabel();
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const [promptActiveTab, setPromptActiveTab] = useState<"prompt" | "speech">("prompt");
  const [aiLogs, setAiLogs] = useState<AILogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  // 获取当前角色的提示词
  const getPlayerPrompt = (player: Player) => {
    const phase = gameState.phase;
    const prompt = phaseManager.getPrompt(phase, { state: gameState }, player);
    if (prompt) return prompt.system;
    return t("devConsole.promptNotFound");
  };

  useEffect(() => {
    if (!isPromptDialogOpen || !selectedPlayer) return;

    let cancelled = false;
    setIsLoadingLogs(true);
    setLogsError(null);
    (async () => {
      try {
        const logs = await aiLogger.getLogs();
        if (cancelled) return;
        setAiLogs(Array.isArray(logs) ? (logs as AILogEntry[]) : []);
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
    if (!selectedPlayer) return [] as Array<{ id: string; label: string; lines: string[]; day: number }>;
    const items = aiLogs
      .filter((x) => x?.type === "speech" && x.request?.player?.playerId === selectedPlayer.playerId)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((entry) => {
        const system = entry.request.messages.find((m) => m.role === "system")?.content || "";
        const user = entry.request.messages.find((m) => m.role === "user")?.content || "";

        const dayMatch = user.match(/第\s*(\d+)\s*天/);
        const day = dayMatch ? Number(dayMatch[1]) : NaN;

        let phaseLabel = t("devConsole.speechPhase.unknown");
        if (system.includes("遗言")) phaseLabel = t("devConsole.speechPhase.lastWords");
        else if (user.includes("夜晚")) phaseLabel = t("devConsole.speechPhase.night");
        else if (user.includes("白天")) phaseLabel = t("devConsole.speechPhase.day");

        const label = Number.isFinite(day)
          ? t("devConsole.dayPhaseLabel", { day, phase: phaseLabel })
          : phaseLabel;

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

        return { id: entry.id, label, lines, day };
      });

    return items.filter((x) => {
      if (!Number.isFinite(x.day)) return true;
      return (x.day as number) <= gameState.day;
    });
  }, [aiLogs, selectedPlayer, gameState.day, t]);
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
                  {t("devConsole.human")}
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
              {player.alive ? t("devConsole.kill") : t("devConsole.revive")}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{t("devConsole.roleLabel")}</span>
            <select
              value={player.role}
              onChange={(e) => setPlayerRole(player.seat, e.target.value as Role)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-400"
            >
              {ALL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleNames[role]}
                </option>
              ))}
            </select>
            <span
              className={`px-2 py-0.5 rounded text-[10px] ${
                player.alignment === "wolf" ? "bg-red-600" : "bg-blue-600"
              }`}
            >
              {player.alignment === "wolf" ? t("devConsole.wolf") : t("devConsole.good")}
            </span>
            <button
              onClick={() => {
                setSelectedPlayer(player);
                setIsPromptDialogOpen(true);
                setPromptActiveTab("prompt");
              }}
              className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title={t("devConsole.viewPrompt")}
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
                {t("devConsole.playerLabel", {
                  seat: selectedPlayer.seat + 1,
                  name: selectedPlayer.displayName,
                })}
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
                {t("devConsole.promptTab")}
              </button>
              <button
                onClick={() => setPromptActiveTab("speech")}
                className={`px-3 py-1.5 rounded text-sm ${
                  promptActiveTab === "speech"
                    ? "bg-gray-700 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {t("devConsole.speechTab")}
              </button>
            </div>

            {promptActiveTab === "prompt" && (
              <>
                {/* 显示玩家使用的 model */}
                <div className="mb-3 p-2 bg-gray-800/50 rounded border border-gray-700">
                  <span className="text-xs text-gray-400">{t("devConsole.modelLabel")}</span>
                  <span className="text-xs text-blue-400 font-mono">
                    {selectedPlayer.agentProfile?.modelRef?.model ||
                      (selectedPlayer.isHuman ? t("devConsole.humanPlayer") : t("devConsole.unknown"))}
                  </span>
                </div>
                <div className="mb-3 p-2 bg-gray-800/50 rounded border border-gray-700">
                  <span className="text-xs text-gray-400">{t("devConsole.voicePresetLabel")}</span>
                  <span className="text-xs text-yellow-400 font-mono">
                    {(() => {
                      const locale = getLocale() as AppLocale;
                      const voiceId = resolveVoiceId(
                        selectedPlayer.agentProfile?.persona?.voiceId,
                        selectedPlayer.agentProfile?.persona?.gender,
                        selectedPlayer.agentProfile?.persona?.age,
                        locale
                      );
                      const presets = locale === "en" ? ENGLISH_VOICE_PRESETS : VOICE_PRESETS;
                      const preset = presets.find((p) => p.id === voiceId);
                      return preset ? `${preset.name} (${preset.id})` : voiceId;
                    })()}
                  </span>
                </div>
                <pre className="bg-gray-800 rounded p-3 text-xs text-green-400 overflow-auto max-h-[60vh] font-mono whitespace-pre-wrap">
                  {getPlayerPrompt(selectedPlayer)}
                </pre>
              </>
            )}

            {promptActiveTab === "speech" && (
              <div className="space-y-3">
                {isLoadingLogs && <div className="text-sm text-gray-400">{t("devConsole.loadingLogs")}</div>}
                {!isLoadingLogs && logsError && (
                  <div className="text-sm text-red-400">
                    {t("devConsole.loadFailed", { error: logsError })}
                  </div>
                )}
                {!isLoadingLogs && !logsError && speechItems.length === 0 && (
                  <div className="text-sm text-gray-400">{t("devConsole.noSpeechLogs")}</div>
                )}

                {speechItems.map((item, idx) => (
                  <div key={item.id || `${item.label}::${idx}`} className="bg-gray-800 rounded p-3">
                    <div className="text-xs text-gray-400 mb-2">{item.label}</div>
                    <div className="space-y-1">
                      {item.lines.map((line, idx) => (
                        <div key={idx} className="text-sm text-gray-100 whitespace-pre-wrap break-words">
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
  setSheriff,
}: {
  gameState: GameState;
  setNightAction: (key: string, value: any) => void;
  patchNightActions: (patch: Partial<GameState["nightActions"]>) => void;
  setNextSpeaker: (seat: number | null) => void;
  clearVotes: () => void;
  forceVote: (voterId: string, targetSeat: number) => void;
  setSheriff: (seat: number | null) => void;
}) {
  const t = useTranslations();
  const formatPlayerLabel = useFormatPlayerLabel();
  const [selectedVoter, setSelectedVoter] = useState<string>("");
  const [selectedTarget, setSelectedTarget] = useState<number>(0);

  const allPlayers = gameState.players;
  const alivePlayers = gameState.players.filter((p) => p.alive);

  return (
    <div className="space-y-4">
      {/* 夜间行动 */}
      <Section title={t("devConsole.nightActions")}>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-20">{t("devConsole.actions.guardTarget")}</span>
            <select
              value={gameState.nightActions.guardTarget ?? ""}
              onChange={(e) =>
                setNightAction("guardTarget", e.target.value ? parseInt(e.target.value) : undefined)
              }
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
            >
              <option value="">{t("devConsole.none")}</option>
              {allPlayers.map((p) => (
                <option key={p.seat} value={p.seat}>
                  {formatPlayerLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-20">{t("devConsole.actions.wolfTarget")}</span>
            <select
              value={gameState.nightActions.wolfTarget ?? ""}
              onChange={(e) =>
                setNightAction("wolfTarget", e.target.value ? parseInt(e.target.value) : undefined)
              }
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
            >
              <option value="">{t("devConsole.none")}</option>
              {allPlayers.map((p) => (
                <option key={p.seat} value={p.seat}>
                  {formatPlayerLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-20">{t("devConsole.actions.witchSave")}</span>
            <button
              onClick={() => setNightAction("witchSave", !gameState.nightActions.witchSave)}
              className={`px-3 py-1 rounded text-xs ${
                gameState.nightActions.witchSave
                  ? "bg-green-600 text-white"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              {gameState.nightActions.witchSave ? t("devConsole.yes") : t("devConsole.no")}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-20">{t("devConsole.actions.witchPoison")}</span>
            <select
              value={gameState.nightActions.witchPoison ?? ""}
              onChange={(e) =>
                setNightAction("witchPoison", e.target.value ? parseInt(e.target.value) : undefined)
              }
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
            >
              <option value="">{t("devConsole.none")}</option>
              {allPlayers.map((p) => (
                <option key={p.seat} value={p.seat}>
                  {formatPlayerLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-20">{t("devConsole.actions.seerCheck")}</span>
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
              <option value="">{t("devConsole.none")}</option>
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
      <Section title={t("devConsole.speechControl")}>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-20">{t("devConsole.actions.nextSpeaker")}</span>
          <select
            value={gameState.nextSpeakerSeatOverride ?? ""}
            onChange={(e) => setNextSpeaker(e.target.value ? parseInt(e.target.value) : null)}
            className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
          >
            <option value="">{t("devConsole.none")}</option>
            {allPlayers.map((p) => (
              <option key={p.seat} value={p.seat}>
                {formatPlayerLabel(p)}
              </option>
            ))}
          </select>
        </div>
      </Section>

      {/* 警长控制 */}
      <Section title={t("devConsole.badgeControl")}>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-20">{t("devConsole.actions.currentBadge")}</span>
            <span className="text-sm text-yellow-400">
              {gameState.badge.holderSeat !== null
                ? formatPlayerLabel(allPlayers.find((p) => p.seat === gameState.badge.holderSeat)!)
                : t("devConsole.none")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-20">{t("devConsole.actions.setBadge")}</span>
            <select
              value={gameState.badge.holderSeat ?? ""}
              onChange={(e) => setSheriff(e.target.value ? parseInt(e.target.value) : null)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
            >
              <option value="">{t("devConsole.actions.clearBadgeOption")}</option>
              {alivePlayers.map((p) => (
                <option key={p.seat} value={p.seat}>
                  {formatPlayerLabel(p)}
                </option>
              ))}
            </select>
          </div>
          {gameState.badge.holderSeat !== null && (
            <button
              onClick={() => setSheriff(null)}
              className="w-full px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-white text-xs"
            >
              {t("devConsole.removeBadge")}
            </button>
          )}
        </div>
      </Section>

      {/* 投票控制 */}
      <Section title={t("devConsole.voteControl")}>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={selectedVoter}
              onChange={(e) => setSelectedVoter(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
            >
              <option value="">{t("devConsole.selectVoter")}</option>
              {alivePlayers.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {t("devConsole.playerLabel", { seat: p.seat + 1, name: p.displayName })}
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
                  {t("devConsole.seatOnly", { seat: p.seat + 1 })}
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
              {t("devConsole.vote")}
            </button>
          </div>
          <button
            onClick={clearVotes}
            className="w-full px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-white text-xs"
          >
            {t("devConsole.clearVotes")}
          </button>
          {/* 当前投票情况 */}
          {Object.keys(gameState.votes).length > 0 && (
            <div className="mt-2 p-2 bg-gray-800 rounded text-xs">
              <div className="text-gray-400 mb-1">{t("devConsole.currentVotes")}</div>
              {Object.entries(gameState.votes).map(([voterId, targetSeat]) => {
                const voter = gameState.players.find((p) => p.playerId === voterId);
                return (
                  <div key={voterId} className="text-gray-300">
                    {voter?.seat !== undefined
                      ? t("devConsole.seatOnly", { seat: voter.seat + 1 })
                      : "?"}
                    {" → "}
                    {t("devConsole.seatOnly", { seat: targetSeat + 1 })}
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
  const t = useTranslations();
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
        {t("devConsole.copyState")}
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
  const t = useTranslations();
  const showDevTools =
    process.env.NODE_ENV !== "production" && (process.env.NEXT_PUBLIC_SHOW_DEVTOOLS ?? "true") === "true";

  if (!showDevTools) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-5 right-5 z-[99] w-12 h-12 rounded-full bg-yellow-500 hover:bg-yellow-400 shadow-lg flex items-center justify-center transition-all hover:scale-110"
      title={t("devConsole.devMode")}
    >
      <Wrench size={24} className="text-gray-900" />
    </button>
  );
}
