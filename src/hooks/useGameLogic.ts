"use client";

/**
 * useGameLogic - 游戏逻辑协调层（重构版）
 * 
 * 职责：
 * 1. 协调各阶段 Hook 的调用
 * 2. 管理全局游戏状态
 * 3. 处理 Dev Mode 跳转
 * 4. 暴露统一的 API 给 UI 组件
 * 
 * 遵循原则：
 * - SRP: 仅负责协调，不包含具体业务逻辑
 * - DRY: 复用子模块，避免重复代码
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useAtom } from "jotai";
import { useLocalStorageState } from "ahooks";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { PLAYER_MODELS, type GameState, type Player, type Phase, type Role, type DevPreset, type ModelRef, type StartGameOptions } from "@/types/game";
import { gameStateAtom, isValidTransition } from "@/store/game-machine";
import { getGeneratorModel } from "@/lib/api-keys";
import {
  createInitialGameState,
  setupPlayers,
  addSystemMessage,
  addPlayerMessage,
  transitionPhase as rawTransitionPhase,
  checkWinCondition,
  killPlayer,
  generateDailySummary,
  getNextAliveSeat,
} from "@/lib/game-master";
import { buildGenshinModelRefs, generateCharacters, generateGenshinModeCharacters, sampleModelRefs } from "@/lib/character-generator";
import { getSystemMessages } from "@/lib/game-texts";
import { getRandomScenario } from "@/lib/scenarios";
import { DELAY_CONFIG, getRoleName } from "@/lib/game-constants";
import { generateUUID } from "@/lib/utils";
import {
  AsyncFlowController,
  delay,
  randomDelay,
  computeUniqueTopSeat,
} from "@/lib/game-flow-controller";
import { playNarrator } from "@/lib/narrator-audio-player";
import { PhaseManager } from "@/game/core/PhaseManager";
import { supabase } from "@/lib/supabase";
import { gameStatsTracker } from "@/hooks/useGameStats";
import { gameSessionTracker } from "@/lib/game-session-tracker";
import { isCustomKeyEnabled } from "@/lib/api-keys";

// 子模块
import { useDialogueManager, type DialogueState } from "./useDialogueManager";
import { useDayPhase } from "./game-phases/useDayPhase";
import { useBadgePhase } from "./game-phases/useBadgePhase";
import { useSpecialEvents } from "./game-phases/useSpecialEvents";

function getRandomModelRef(): ModelRef {
  const fallback = sampleModelRefs(1)[0];
  if (fallback) return fallback;
  if (PLAYER_MODELS.length === 0) {
    // Fallback to GENERATOR_MODEL if no models available
    return { provider: "zenmux" as const, model: getGeneratorModel() };
  }
  const randomIndex = Math.floor(Math.random() * PLAYER_MODELS.length);
  return PLAYER_MODELS[randomIndex];
}

// Re-export for backward compatibility
export type { DialogueState };

export function useGameLogic() {
  const t = useTranslations();
  const speakerHost = t("speakers.host");

  // ============================================
  // 基础状态
  // ============================================
  const [humanName, setHumanName] = useLocalStorageState<string>("wolfcha_human_name", {
    defaultValue: "",
  });
  const [gameStarted, setGameStarted] = useState(false);
  const [gameState, setGameState] = useAtom(gameStateAtom);
  const [isLoading, setIsLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [showTable, setShowTable] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // ============================================
  // 流程控制
  // ============================================
  const flowController = useRef(new AsyncFlowController());
  const phaseManagerRef = useRef(new PhaseManager());
  const phaseExtrasRef = useRef<{ phase: Phase; extras: Record<string, unknown> } | null>(null);
  const gameStateRef = useRef<GameState>(gameState);
  const prevPhaseRef = useRef<Phase>(gameState.phase);
  const phaseLifecycleRef = useRef<Phase>(gameState.phase);
  const prevDayRef = useRef<number>(gameState.day);
  const prevDevMutationIdRef = useRef<number | undefined>(gameState.devMutationId);
  const prevDevPhaseJumpTsRef = useRef<number | undefined>(undefined);
  const runAISpeechRef = useRef<((state: GameState, player: Player) => Promise<void>) | null>(null);
  const handleVoteCompleteRef = useRef<((state: GameState, result: { seat: number; count: number } | null, token: ReturnType<typeof getToken>) => Promise<void>) | null>(null);
  const endGameRef = useRef<((state: GameState, winner: "village" | "wolf") => Promise<void>) | null>(null);
  const resolveNightRef = useRef<((state: GameState, token: ReturnType<typeof getToken>, onComplete: (resolvedState: GameState) => Promise<void>) => Promise<void>) | null>(null);
  const startDayPhaseInternalRef = useRef<((state: GameState, token: ReturnType<typeof getToken>, options?: { skipAnnouncements?: boolean }) => Promise<void>) | null>(null);
  const badgeTransferRef = useRef<((state: GameState, sheriff: Player, afterTransfer: (s: GameState) => Promise<void>) => Promise<void>) | null>(null);
  const hunterDeathRef = useRef<((state: GameState, hunter: Player, diedAtNight: boolean) => Promise<void>) | null>(null);
  const proceedToNightRef = useRef<((state: GameState, token: ReturnType<typeof getToken>) => Promise<void>) | null>(null);
  const onStartVoteRef = useRef<((state: GameState, token: ReturnType<typeof getToken>) => Promise<void>) | null>(null);
  const onBadgeSpeechEndRef = useRef<((state: GameState) => Promise<void>) | null>(null);
  const onPkSpeechEndRef = useRef<((state: GameState) => Promise<void>) | null>(null);

  // 游戏启动相关 refs
  const pendingStartStateRef = useRef<GameState | null>(null);
  const hasContinuedAfterRevealRef = useRef(false);
  const isAwaitingRoleRevealRef = useRef(false);
  const showTableTimeoutRef = useRef<number | null>(null);

  // 回调 refs（用于人类操作后继续流程）
  const afterLastWordsRef = useRef<((state: GameState) => Promise<void>) | null>(null);
  const nightContinueRef = useRef<((state: GameState) => Promise<void>) | null>(null);
  const afterBadgeTransferRef = useRef<((state: GameState) => Promise<void>) | null>(null);
  const badgeSpeechEndRef = useRef<((state: GameState) => Promise<void>) | null>(null);

  // ============================================
  // 对话管理
  // ============================================
  const dialogue = useDialogueManager();
  const {
    currentDialogue,
    isWaitingForAI,
    waitingForNextRound,
    setIsWaitingForAI,
    setWaitingForNextRound,
    setDialogue,
    clearDialogue,
    initSpeechQueue,
    initStreamingSpeechQueue,
    appendToSpeechQueue,
    finalizeSpeechQueue,
    getSpeechQueue,
    advanceSpeechQueue,
    clearSpeechQueue,
    resetDialogueState,
    markCurrentSegmentCommitted,
    isCurrentSegmentCommitted,
    markCurrentSegmentCompleted,
    isCurrentSegmentCompleted,
  } = dialogue;

  // ============================================
  // 派生状态
  // ============================================
  const humanPlayer = gameState.players.find((p) => p.isHuman) || null;
  const isNight = gameState.phase.includes("NIGHT");

  // ============================================
  // 工具函数
  // ============================================
  const transitionPhase = useCallback((state: GameState, newPhase: Phase): GameState => {
    if (!isValidTransition(state.phase, newPhase)) {
      console.warn(`[wolfcha] Invalid phase transition: ${state.phase} -> ${newPhase}`);
    }
    return rawTransitionPhase(state, newPhase);
  }, []);

  const waitForUnpause = useCallback(async () => {
    while (gameStateRef.current.isPaused) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }, []);

  const getToken = useCallback(() => flowController.current.getToken(), []);
  const isTokenValid = useCallback((token: { isValid: () => boolean }) => token.isValid(), []);

  const scrollToBottom = useCallback(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, []);

  const queuePhaseExtras = useCallback((phase: Phase, extras: Record<string, unknown>) => {
    phaseExtrasRef.current = { phase, extras };
  }, []);

  const buildVotePhaseExtras = useCallback((token: ReturnType<typeof getToken>, options?: { isRevote?: boolean }) => {
    return {
      token,
      isRevote: options?.isRevote === true,
      humanPlayer,
      setGameState,
      setDialogue,
      setIsWaitingForAI,
      waitForUnpause,
      isTokenValid,
      onVoteComplete: async (state: GameState, result: { seat: number; count: number } | null) => {
        const nextToken = getToken();
        const fn = handleVoteCompleteRef.current;
        if (fn) {
          await fn(state, result, nextToken);
        }
      },
      onGameEnd: async (state: GameState, winner: "village" | "wolf") => {
        const fn = endGameRef.current;
        if (fn) {
          await fn(state, winner);
        }
      },
      runAISpeech: async (state: GameState, player: Player) => {
        const fn = runAISpeechRef.current;
        if (fn) {
          await fn(state, player);
        }
      },
    };
  }, [getToken, humanPlayer, isTokenValid, setDialogue, setGameState, setIsWaitingForAI, waitForUnpause]);

  const buildNightPhaseExtras = useCallback((token: ReturnType<typeof getToken>) => {
    return {
      token,
      setGameState,
      setDialogue,
      setIsWaitingForAI,
      waitForUnpause,
      isTokenValid,
      onNightComplete: async (state: GameState) => {
        const nextToken = getToken();
        const resolveFn = resolveNightRef.current;
        const startDayFn = startDayPhaseInternalRef.current;
        if (!resolveFn || !startDayFn) return;
        await resolveFn(state, nextToken, async (resolvedState) => {
          await startDayFn(resolvedState, nextToken);
        });
      },
    };
  }, [getToken, isTokenValid, setDialogue, setGameState, setIsWaitingForAI, waitForUnpause]);

  const buildDaySpeechExtras = useCallback((token: ReturnType<typeof getToken>) => {
    return {
      token,
      setGameState,
      setDialogue,
      waitForUnpause,
      runAISpeech: async (state: GameState, player: Player) => {
        const fn = runAISpeechRef.current;
        if (fn) {
          await fn(state, player);
        }
      },
      onStartVote: async (state: GameState, nextToken: ReturnType<typeof getToken>) => {
        const fn = onStartVoteRef.current;
        if (fn) {
          await fn(state, nextToken);
        }
      },
      onBadgeSpeechEnd: async (state: GameState) => {
        const fn = onBadgeSpeechEndRef.current;
        if (fn) {
          await fn(state);
        }
      },
      onPkSpeechEnd: async (state: GameState) => {
        const fn = onPkSpeechEndRef.current;
        if (fn) {
          await fn(state);
        }
      },
      onBadgeTransfer: async (state: GameState, sheriff: Player, afterTransfer: (s: GameState) => Promise<void>) => {
        const fn = badgeTransferRef.current;
        if (fn) {
          await fn(state, sheriff, afterTransfer);
        }
      },
      onHunterDeath: async (state: GameState, hunter: Player, diedAtNight: boolean) => {
        const fn = hunterDeathRef.current;
        if (fn) {
          await fn(state, hunter, diedAtNight);
        }
      },
      onGameEnd: async (state: GameState, winner: "village" | "wolf") => {
        const fn = endGameRef.current;
        if (fn) {
          await fn(state, winner);
        }
      },
    };
  }, [setDialogue, setGameState, waitForUnpause]);

  const runDaySpeechAction = useCallback(
    async (
      state: GameState,
      token: ReturnType<typeof getToken>,
      action: "START_DAY_SPEECH_AFTER_BADGE" | "ADVANCE_SPEAKER",
      options?: { skipAnnouncements?: boolean }
    ) => {
      const phaseImpl = phaseManagerRef.current.getPhase("DAY_SPEECH");
      if (!phaseImpl) return;
      await phaseImpl.handleAction(
        { state, phase: state.phase, extras: buildDaySpeechExtras(token) },
        action === "START_DAY_SPEECH_AFTER_BADGE"
          ? { type: action, options }
          : { type: action }
      );
    },
    [buildDaySpeechExtras]
  );

  const runNightPhaseAction = useCallback(
    async (state: GameState, token: ReturnType<typeof getToken>, action: "START_NIGHT" | "CONTINUE_NIGHT_AFTER_GUARD" | "CONTINUE_NIGHT_AFTER_WOLF" | "CONTINUE_NIGHT_AFTER_WITCH") => {
      const phaseImpl = phaseManagerRef.current.getPhase("NIGHT_START");
      if (!phaseImpl) return;
      await phaseImpl.handleAction(
        { state, phase: state.phase, extras: buildNightPhaseExtras(token) },
        { type: action }
      );
    },
    [buildNightPhaseExtras]
  );

  // ============================================
  // Phase lifecycle hook
  // ============================================
  useEffect(() => {
    const prevPhase = phaseLifecycleRef.current;
    const nextPhase = gameState.phase;
    if (prevPhase === nextPhase) return;

    const manager = phaseManagerRef.current;
    const prevImpl = manager.getPhase(prevPhase);
    const nextImpl = manager.getPhase(nextPhase);
    let cancelled = false;
    const queued = phaseExtrasRef.current;
    let extras = queued?.phase === nextPhase ? queued.extras : undefined;
    if (queued?.phase === nextPhase) {
      phaseExtrasRef.current = null;
    }
    if (!extras && nextPhase === "DAY_VOTE") {
      extras = buildVotePhaseExtras(getToken());
    }

    (async () => {
      if (prevImpl) {
        await prevImpl.onExit({ state: gameState, phase: prevPhase });
      }
      if (cancelled) return;
      if (nextImpl) {
        await nextImpl.onEnter({ state: gameState, phase: nextPhase, extras });
      }
    })();

    phaseLifecycleRef.current = nextPhase;
    return () => {
      cancelled = true;
    };
  }, [buildVotePhaseExtras, gameState, gameState.phase, getToken]);

  // ============================================
  // 每日总结生成
  // ============================================
  const maybeGenerateDailySummary = useCallback(
    async (state: GameState, options?: { force?: boolean }): Promise<GameState> => {
      if (state.day <= 0) return state;
      if (!options?.force && state.dailySummaries?.[state.day]?.length) return state;
      if (!state.messages || state.messages.length === 0) return state;
      try {
        const summary = await generateDailySummary(state);
        if (!summary || summary.bullets.length === 0) return state;
        return {
          ...state,
          dailySummaries: { ...state.dailySummaries, [state.day]: summary.bullets },
          dailySummaryFacts: { ...state.dailySummaryFacts, [state.day]: summary.facts },
          dailySummaryVoteData: {
            ...(state.dailySummaryVoteData ?? {}),
            ...(summary.voteData ? { [state.day]: summary.voteData } : {}),
          },
        };
      } catch {
        return state;
      }
    },
    []
  );

  const buildRawDayTranscript = useCallback((state: GameState): string => {
    const aliveIds = new Set(state.players.filter((p) => p.alive).map((p) => p.playerId));
    const dayStartIndex = (() => {
      for (let i = state.messages.length - 1; i >= 0; i--) {
        const m = state.messages[i];
        if (m.isSystem && m.content === t("gameLogicMessages.dayBreak")) return i;
      }
      return 0;
    })();

    const voteStartIndex = (() => {
      for (let i = state.messages.length - 1; i >= 0; i--) {
        const m = state.messages[i];
        if (m.isSystem && m.content === t("gameLogicMessages.voteStart")) return i;
      }
      return state.messages.length;
    })();

    const slice = state.messages.slice(
      dayStartIndex,
      voteStartIndex > dayStartIndex ? voteStartIndex : state.messages.length
    );

    return slice
      .filter((m) => !m.isSystem && aliveIds.has(m.playerId))
      .map((m) => `${m.playerName}: ${m.content}`)
      .join("\n");
  }, []);

  // ============================================
  // 特殊事件处理
  // ============================================
  // 缓存 access token 用于游戏会话保存
  const accessTokenRef = useRef<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      accessTokenRef.current = session?.access_token ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      accessTokenRef.current = session?.access_token ?? null;
    });
    return () => subscription.unsubscribe();
  }, []);

  const getAccessToken = useCallback((): string | null => {
    return accessTokenRef.current;
  }, []);

  // 监听页面卸载，记录中断的游戏会话
  useEffect(() => {
    const handleBeforeUnload = () => {
      const summary = gameSessionTracker.getSummary();
      const accessToken = accessTokenRef.current;
      if (!summary || !accessToken) return;

      // 使用 sendBeacon 确保页面关闭时请求能发出
      // 由于 sendBeacon 无法等待异步操作，仍使用 API 路由
      const payload = JSON.stringify({
        action: "update",
        sessionId: summary.sessionId,
        accessToken,
        winner: null,
        completed: false,
        roundsPlayed: summary.roundsPlayed,
        durationSeconds: summary.durationSeconds,
        aiCallsCount: summary.aiCallsCount,
        aiInputChars: summary.aiInputChars,
        aiOutputChars: summary.aiOutputChars,
        aiPromptTokens: summary.aiPromptTokens,
        aiCompletionTokens: summary.aiCompletionTokens,
      });
      navigator.sendBeacon?.(
        "/api/game-sessions",
        new Blob([payload], { type: "application/json" })
      );
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const specialEvents = useSpecialEvents({
    setDialogue,
    setIsWaitingForAI,
    waitForUnpause,
    isTokenValid,
    getAccessToken,
  });

  const { endGame, resolveNight } = specialEvents;
  endGameRef.current = endGame;
  resolveNightRef.current = resolveNight;

  // ============================================
  // 投票阶段（Phase 驱动）
  // ============================================
  const enterVotePhase = useCallback(
    async (state: GameState, token: ReturnType<typeof getToken>, options?: { isRevote?: boolean }) => {
      // 投票阶段不再触发总结 - 避免重复调用
      // 总结将在进入夜晚时统一生成，此时信息最完整（包含投票结果和遗言）
      
      queuePhaseExtras("DAY_VOTE", buildVotePhaseExtras(token, options));
      const clearedState: GameState = {
        ...state,
        votes: {},
        lastVoteReasons: state.voteReasons ? { ...state.voteReasons } : {},
        voteReasons: {},
      };
      const nextState = transitionPhase(clearedState, "DAY_VOTE");
      setGameState(nextState);
    },
    [buildVotePhaseExtras, queuePhaseExtras, setGameState, transitionPhase]
  );

  const resolveVotePhase = useCallback(
    async (state: GameState, token: ReturnType<typeof getToken>) => {
      const phaseImpl = phaseManagerRef.current.getPhase("DAY_VOTE");
      if (!phaseImpl) return;
      await phaseImpl.handleAction(
        { state, phase: "DAY_VOTE", extras: buildVotePhaseExtras(token) },
        { type: "RESOLVE_VOTES" }
      );
    },
    [buildVotePhaseExtras]
  );

  const resolveVotesSafely = useCallback(async (
    state: GameState,
    token: ReturnType<typeof getToken>
  ) => {
    if (isResolvingVotesRef.current) return;
    isResolvingVotesRef.current = true;
    try {
      await resolveVotePhase(state, token);
    } finally {
      isResolvingVotesRef.current = false;
    }
  }, [resolveVotePhase]);

  // ============================================
  // 白天阶段
  // ============================================
  const dayPhase = useDayPhase(humanPlayer, {
    setDialogue,
    setIsWaitingForAI,
    setWaitingForNextRound,
    isTokenValid,
    initSpeechQueue,
    initStreamingSpeechQueue,
    appendToSpeechQueue,
    finalizeSpeechQueue,
    setAfterLastWords: (cb) => { afterLastWordsRef.current = cb; },
  });

  const { startLastWordsPhase, runAISpeech } = dayPhase;
  runAISpeechRef.current = runAISpeech;

  // ============================================
  // 警长竞选阶段
  // ============================================
  const badgePhase = useBadgePhase({
    setDialogue,
    clearDialogue,
    setIsWaitingForAI,
    waitForUnpause,
    isTokenValid,
    onBadgeElectionComplete: async (state) => {
      const token = getToken();
      await runDaySpeechAction(state, token, "START_DAY_SPEECH_AFTER_BADGE");
    },
    onBadgeTransferComplete: async (state) => {
      const afterTransfer = afterBadgeTransferRef.current;
      afterBadgeTransferRef.current = null;
      if (afterTransfer) {
        await afterTransfer(state);
      }
    },
    runAISpeech: async (state, player) => {
      await runAISpeech(state, player);
    },
  });
  badgeTransferRef.current = badgePhase.handleBadgeTransfer;
  onStartVoteRef.current = enterVotePhase;
  onBadgeSpeechEndRef.current = async (state: GameState) => {
    await badgePhase.startBadgeElectionPhase(state);
  };
  onPkSpeechEndRef.current = async (state: GameState) => {
    const token = getToken();
    const nextState = {
      ...state,
      pkTargets: undefined,
      pkSource: undefined,
    };

    if (state.pkSource === "badge") {
      await badgePhase.startBadgeElectionPhase(nextState, { isRevote: true });
      return;
    }

    if (state.pkSource === "vote") {
      await enterVotePhase(state, token, { isRevote: true });
      return;
    }
  };

  // ============================================
  // 内部流程函数
  // ============================================
  const startDayPhaseInternal = useCallback(async (
    state: GameState,
    token: ReturnType<typeof getToken>,
    options?: { skipAnnouncements?: boolean }
  ) => {
    // 第一天：先进行警徽评选
    if (state.day === 1 && state.badge.holderSeat === null) {
      await badgePhase.startBadgeSignupPhase(state);
      return;
    }
    // 非第一天：直接进入讨论
    await runDaySpeechAction(state, token, "START_DAY_SPEECH_AFTER_BADGE", options);
  }, [badgePhase, runDaySpeechAction]);
  startDayPhaseInternalRef.current = startDayPhaseInternal;

  const proceedToNight = useCallback(async (state: GameState, token: ReturnType<typeof getToken>) => {
    if (!isTokenValid(token)) return;
    if (isAwaitingRoleRevealRef.current) return;

    // 天黑时同步游戏进度到数据库（incrementRound 内部会立即同步）
    gameSessionTracker.incrementRound().catch(() => {});

    const systemMessages = getSystemMessages();
    const lastGuardTarget = state.nightActions.guardTarget ?? state.nightActions.lastGuardTarget;
    // Preserve seerHistory across nights
    const seerHistory = state.nightActions.seerHistory;
    let nextState = {
      ...state,
      day: state.day + 1,
      nightActions: {
        ...(lastGuardTarget !== undefined ? { lastGuardTarget } : {}),
        ...(seerHistory ? { seerHistory } : {}),
      },
    };
    nextState = transitionPhase(nextState, "NIGHT_START");
    nextState = addSystemMessage(nextState, systemMessages.nightFall(nextState.day));
    setGameState(nextState);

    // Set dialogue before playing audio so message box appears immediately
    setDialogue(speakerHost, systemMessages.nightFall(nextState.day), false);

    // 播放旁白语音
    await playNarrator("nightFall");

    await delay(250);
    if (!isTokenValid(token)) return;

    setDialogue(speakerHost, systemMessages.summarizingDay, false);

    const summarized = await maybeGenerateDailySummary(state, { force: true });
    if (!isTokenValid(token)) return;

    const mergedState = {
      ...nextState,
      dailySummaries: summarized.dailySummaries,
      dailySummaryFacts: summarized.dailySummaryFacts,
      dailySummaryVoteData: summarized.dailySummaryVoteData ?? nextState.dailySummaryVoteData,
    };

    await runNightPhaseAction(mergedState, token, "START_NIGHT");
  }, [isTokenValid, maybeGenerateDailySummary, runNightPhaseAction, setGameState, setDialogue, speakerHost, transitionPhase]);
  proceedToNightRef.current = proceedToNight;

  hunterDeathRef.current = async (state: GameState, hunter: Player, diedAtNight: boolean) => {
    const token = getToken();
    await specialEvents.handleHunterDeath(state, hunter, diedAtNight, token, async (afterState) => {
      const startDayFn = startDayPhaseInternalRef.current;
      const proceedFn = proceedToNightRef.current;
      if (!startDayFn || !proceedFn) return;
      if (diedAtNight) {
        await startDayFn(afterState, token, { skipAnnouncements: true });
      } else {
        await proceedFn(afterState, token);
      }
    });
  };

  const handleVoteComplete = useCallback(async (
    state: GameState,
    result: { seat: number; count: number } | null,
    token: ReturnType<typeof getToken>
  ) => {
    if (result) {
      const executedPlayer = state.players.find((p) => p.seat === result.seat);
      const isSheriff = state.badge.holderSeat === result.seat;

      await delay(DELAY_CONFIG.MEDIUM);
      if (!isTokenValid(token)) return;

      await startLastWordsPhase(state, result.seat, async (s) => {
        // 警长死亡，先移交警徽
        if (isSheriff && executedPlayer) {
          afterBadgeTransferRef.current = async (afterTransferState) => {
            if (executedPlayer?.role === "Hunter" && afterTransferState.roleAbilities.hunterCanShoot) {
              await specialEvents.handleHunterDeath(afterTransferState, executedPlayer, false, token, async (afterHunterState) => {
                await proceedToNight(afterHunterState, token);
              });
              return;
            }

            const winnerAfterTransfer = checkWinCondition(afterTransferState);
            if (winnerAfterTransfer) {
              await endGame(afterTransferState, winnerAfterTransfer);
              return;
            }

            await proceedToNight(afterTransferState, token);
          };
          await badgePhase.handleBadgeTransfer(s, executedPlayer, async (afterTransferState) => {
            const cb = afterBadgeTransferRef.current;
            afterBadgeTransferRef.current = null;
            if (cb) await cb(afterTransferState);
          });
          return;
        }

        // 猎人开枪
        if (executedPlayer?.role === "Hunter" && s.roleAbilities.hunterCanShoot) {
          await specialEvents.handleHunterDeath(s, executedPlayer, false, token, async (afterHunterState) => {
            await proceedToNight(afterHunterState, token);
          });
          return;
        }

        // 检查胜负
        const winnerAfterLastWords = checkWinCondition(s);
        if (winnerAfterLastWords) {
          await endGame(s, winnerAfterLastWords);
          return;
        }

        await proceedToNight(s, token);
      }, token);
      return;
    }

    // 平票，等待一段时间让用户看到结果，然后进入夜晚
    await delay(DELAY_CONFIG.MEDIUM);
    if (!isTokenValid(token)) return;
    await proceedToNight(state, token);
  }, [isTokenValid, startLastWordsPhase, badgePhase, specialEvents, endGame, proceedToNight]);
  handleVoteCompleteRef.current = handleVoteComplete;

  

  // ============================================
  // 投票完成监控（安全保障机制）
  // ============================================
  const isResolvingVotesRef = useRef(false);
  useEffect(() => {
    if (gameState.phase !== "DAY_VOTE") return;
    if (isResolvingVotesRef.current) return;
    if (isWaitingForAI) return;

    const aliveIds = gameState.players.filter((p) => p.alive).map((p) => p.playerId);
    const allVoted = aliveIds.every((id) => typeof gameState.votes[id] === "number");
    
    if (allVoted && aliveIds.length > 0) {
      console.log("[wolfcha] useEffect: All votes detected, triggering resolveVotePhase as safety net");
      const token = getToken();
      void resolveVotesSafely(gameState, token);
    }
  }, [gameState.phase, gameState.votes, gameState.players, getToken, resolveVotesSafely, isWaitingForAI]);

  // ============================================
  // 同步 gameStateRef
  // ============================================
  useEffect(() => {
    gameStateRef.current = gameState;

    // Dev Mode 容错
    const prevDevMutationId = prevDevMutationIdRef.current;
    const devMutationId = gameState.devMutationId;
    const devMutated =
      typeof devMutationId === "number" &&
      (typeof prevDevMutationId !== "number" || devMutationId !== prevDevMutationId);

    const phaseChanged = prevPhaseRef.current !== gameState.phase;
    const dayChanged = prevDayRef.current !== gameState.day;
    const hardReset = phaseChanged || dayChanged || !!gameState.devPhaseJump;

    if (devMutated) {
      flowController.current.interrupt();
      pendingStartStateRef.current = null;
      hasContinuedAfterRevealRef.current = false;

      if (waitingForNextRound) setWaitingForNextRound(false);
      if (isWaitingForAI) setIsWaitingForAI(false);

      if (hardReset) {
        afterLastWordsRef.current = null;
        nightContinueRef.current = null;
        clearSpeechQueue();
        if (currentDialogue) clearDialogue();
        if (inputText) setInputText("");
      } else {
        // Dev 动作编辑：可能中断了 runNightPhase 的后台推进。若关键数据已被用户补齐，则自动继续夜晚流程。
        // 注意：只在"软编辑"时尝试恢复，避免和显式跳转冲突。
        const s = gameState;
        (async () => {
          const token = flowController.current.getToken();

          // Night phases: if the required action is already set (possibly via Dev actions tab), continue.
          if (s.phase === "NIGHT_GUARD_ACTION") {
            const guard = s.players.find((p) => p.role === "Guard" && p.alive);
            if (!guard || s.nightActions.guardTarget !== undefined) {
              await runNightPhaseAction(s, token, "CONTINUE_NIGHT_AFTER_GUARD");
            }
            return;
          }

          if (s.phase === "NIGHT_WOLF_ACTION") {
            if (s.nightActions.wolfTarget !== undefined) {
              await runNightPhaseAction(s, token, "CONTINUE_NIGHT_AFTER_WOLF");
            }
            return;
          }

          if (s.phase === "NIGHT_WITCH_ACTION") {
            const witch = s.players.find((p) => p.role === "Witch" && p.alive);
            const usedAll = s.roleAbilities.witchHealUsed && s.roleAbilities.witchPoisonUsed;
            const decided = s.nightActions.witchSave !== undefined || s.nightActions.witchPoison !== undefined;
            if (!witch || usedAll || decided) {
              await runNightPhaseAction(s, token, "CONTINUE_NIGHT_AFTER_WITCH");
            }
            return;
          }

          if (s.phase === "NIGHT_SEER_ACTION") {
            if (s.nightActions.seerTarget !== undefined) {
              // 预言家已查验，设置 nightContinueRef 以便用户确认后继续
              nightContinueRef.current = async (state) => {
                await resolveNight(state, token, async (resolvedState) => {
                  await startDayPhaseInternal(resolvedState, token);
                });
              };
            }
            return;
          }

          if (s.phase === "DAY_VOTE") {
            const aliveIds = s.players.filter((p) => p.alive).map((p) => p.playerId);
            const allVoted = aliveIds.every((id) => typeof s.votes[id] === "number");
            if (allVoted) {
              await resolveVotePhase(s, token);
            }
          }
        })();
      }
    }

    prevPhaseRef.current = gameState.phase;
    prevDayRef.current = gameState.day;
    prevDevMutationIdRef.current = devMutationId;
  }, [gameState, currentDialogue, inputText, isWaitingForAI, waitingForNextRound, clearDialogue, clearSpeechQueue, setIsWaitingForAI, setWaitingForNextRound, runNightPhaseAction, resolveNight, startDayPhaseInternal, resolveVotePhase]);

  // ============================================
  // Dev Phase Jump 处理
  // ============================================
  useEffect(() => {
    const payload = gameState.devPhaseJump;
    if (!payload) return;
    if (prevDevPhaseJumpTsRef.current === payload.ts) return;
    prevDevPhaseJumpTsRef.current = payload.ts;

    flowController.current.interrupt();
    const token = getToken();
    const to = payload.to;
    const s = gameStateRef.current;

    const clearMark = () => {
      setGameState((prev) => {
        if (!prev.devPhaseJump || prev.devPhaseJump.ts !== payload.ts) return prev;
        return { ...prev, devPhaseJump: undefined };
      });
    };

    (async () => {
      try {
        if (to === "NIGHT_START" || to === "NIGHT_GUARD_ACTION") {
          if (isAwaitingRoleRevealRef.current) return;
          await runNightPhaseAction(s, token, "START_NIGHT");
          return;
        }
        if (to === "NIGHT_WOLF_ACTION") {
          await runNightPhaseAction(s, token, "CONTINUE_NIGHT_AFTER_GUARD");
          return;
        }
        if (to === "NIGHT_WITCH_ACTION") {
          await runNightPhaseAction(s, token, "CONTINUE_NIGHT_AFTER_WOLF");
          return;
        }
        if (to === "NIGHT_SEER_ACTION") {
          await runNightPhaseAction(s, token, "CONTINUE_NIGHT_AFTER_WITCH");
          return;
        }
        if (to === "NIGHT_RESOLVE") {
          await resolveNight(s, token, async (resolvedState) => {
            await startDayPhaseInternal(resolvedState, token);
          });
          return;
        }
        if (to === "DAY_START" || to === "DAY_SPEECH") {
          await startDayPhaseInternal(s, token);
          return;
        }
        if (to === "DAY_VOTE") {
          await enterVotePhase(s, token);
          return;
        }
        if (to === "DAY_LAST_WORDS") {
          const seat = s.currentSpeakerSeat ?? s.players.find((p) => !p.alive)?.seat ?? 0;
          await startLastWordsPhase(s, seat, async (after) => {
            await proceedToNight(after, token);
          }, token);
          return;
        }
        if (to === "DAY_RESOLVE") {
          await resolveVotePhase(s, token);
          return;
        }
      } finally {
        clearMark();
      }
    })();
  }, [gameState.devPhaseJump, getToken, runNightPhaseAction, resolveNight, startDayPhaseInternal, enterVotePhase, startLastWordsPhase, resolveVotePhase, proceedToNight, setGameState]);

  /** 开始游戏 */
  const startGame = useCallback(async (options?: Partial<StartGameOptions>) => {
    const {
      fixedRoles,
      devPreset,
      difficulty = "normal",
      playerCount = 10,
      isGenshinMode = false,
      isSpectatorMode = false,
    } = options ?? {};

    const totalPlayers = playerCount;

    resetDialogueState();
    setInputText("");
    setShowTable(false);
    pendingStartStateRef.current = null;
    hasContinuedAfterRevealRef.current = false;
    isAwaitingRoleRevealRef.current = false;
    badgeSpeechEndRef.current = null;
    if (showTableTimeoutRef.current !== null) {
      window.clearTimeout(showTableTimeoutRef.current);
      showTableTimeoutRef.current = null;
    }

    setIsLoading(true);
    try {
      // 初始化游戏统计追踪器
      const statsConfig = {
        playerCount,
        difficulty,
        usedCustomKey: isCustomKeyEnabled(),
      };
      gameStatsTracker.start(statsConfig);

      // 创建游戏会话记录（前端直接调用 Supabase）
      gameSessionTracker.start({
        playerCount,
        difficulty,
        usedCustomKey: isCustomKeyEnabled(),
        modelUsed: getGeneratorModel(),
      }).then((sessionId) => {
        if (sessionId) {
          gameStatsTracker.setSessionId(sessionId);
        }
      }).catch((err) => {
        console.error("[game-session] Failed to create:", err);
      });

      const systemMessages = getSystemMessages();
      const scenario = isGenshinMode ? undefined : getRandomScenario();
      const makeId = () => generateUUID();

      // In spectator mode, there's no human player - all seats are AI
      const humanSeat = isSpectatorMode ? -1 : 0;

      const aiSeats = Array.from({ length: totalPlayers }, (_, seat) => seat).filter(
        (seat) => seat !== humanSeat
      );
      const aiSeatOrder = (() => {
        const shuffled = [...aiSeats];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
      })();

      const aiModelRefs = sampleModelRefs(isSpectatorMode ? totalPlayers : totalPlayers - 1);
      const initialPlayers: Player[] = Array.from({ length: totalPlayers }).map((_, seat) => {
        const isHuman = !isSpectatorMode && seat === humanSeat;
        return {
          playerId: makeId(),
          seat,
          displayName: isHuman ? (humanName || "你") : "",
          alive: true,
          role: "Villager" as Role,
          alignment: "village",
          isHuman,
        };
      });

      const seedPlayerIds = initialPlayers.map((p) => p.playerId);

      setGameState({
        ...createInitialGameState(),
        scenario,
        players: initialPlayers,
        phase: "LOBBY",
        day: 0,
        difficulty,
        isGenshinMode,
        isSpectatorMode,
      });

      setGameStarted(true);
      setShowTable(true);

      let characters = [];
      let genshinModelRefs: ModelRef[] | undefined = undefined;
      const numAiPlayers = isSpectatorMode ? totalPlayers : totalPlayers - 1;

      if (isGenshinMode) {
        genshinModelRefs = buildGenshinModelRefs(numAiPlayers);
        characters = await generateGenshinModeCharacters(numAiPlayers, genshinModelRefs);
        
        // 为 Genshin 模式添加逐个出现的动画效果
        characters.forEach((character, index) => {
          const seat = aiSeatOrder[index] ?? index + 1;
          window.setTimeout(() => {
            setGameState((prev) => {
              const nextPlayers = prev.players.map((pl) => {
                if (pl.seat !== seat) return pl;
                if (pl.isHuman) return pl;
                return {
                  ...pl,
                  displayName: character.displayName,
                  agentProfile: {
                    modelRef: genshinModelRefs![index] ?? getRandomModelRef(),
                    persona: character.persona,
                  },
                };
              });
              return { ...prev, players: nextPlayers };
            });
          }, 200 + index * 180); // 逐个出现，每个间隔 180ms
        });
      } else {
        characters = await generateCharacters(numAiPlayers, scenario, {
          onBaseProfiles: (profiles) => {
            profiles.forEach((p, i) => {
              const seat = aiSeatOrder[i] ?? i + 1;
              window.setTimeout(() => {
                setGameState((prev) => {
                  const nextPlayers = prev.players.map((pl) => {
                    if (pl.seat === seat) return { ...pl, displayName: p.displayName };
                    return pl;
                  });
                  return { ...prev, players: nextPlayers };
                });
              }, 420 + i * 260);
            });
          },
          onCharacter: (index, character) => {
            const seat = aiSeatOrder[index] ?? index + 1;
            window.setTimeout(() => {
              setGameState((prev) => {
                const nextPlayers = prev.players.map((pl) => {
                  if (pl.seat !== seat) return pl;
                  if (pl.isHuman) return pl;
                  return {
                    ...pl,
                    displayName: character.displayName,
                    agentProfile: {
                      modelRef: aiModelRefs[index] ?? getRandomModelRef(),
                      persona: character.persona,
                    },
                  };
                });
                return { ...prev, players: nextPlayers };
              });
            }, 120);
          },
        });
      }

      const players = setupPlayers(
        characters,
        humanSeat,
        humanName || "你",
        totalPlayers,
        fixedRoles,
        seedPlayerIds,
        isGenshinMode ? genshinModelRefs : aiModelRefs,
        aiSeatOrder
      );

      let newState: GameState = {
        ...createInitialGameState(),
        scenario,
        players,
        phase: "NIGHT_START",
        day: 1,
        difficulty,
        isGenshinMode,
        isSpectatorMode,
      };

      newState = addSystemMessage(newState, systemMessages.gameStart);
      newState = addSystemMessage(newState, systemMessages.nightFall(1));

      // Dev 预设处理
      if (devPreset === "MILK_POISON_TEST") {
        const newPlayers = newState.players.map((p, i) => {
          if (i === 0) return { ...p, role: "Guard" as Role, alignment: "village" as const, alive: true };
          if (i === 1) return { ...p, role: "Witch" as Role, alignment: "village" as const, alive: true };
          if (i === 2) return { ...p, role: "Werewolf" as Role, alignment: "wolf" as const, alive: true };
          if (i === 3) return { ...p, role: "Villager" as Role, alignment: "village" as const, alive: true };
          return { ...p, alive: true };
        });
        newState = {
          ...newState,
          players: newPlayers,
          phase: "NIGHT_WITCH_ACTION",
          day: 1,
          devMutationId: (newState.devMutationId ?? 0) + 1,
          devPhaseJump: { to: "NIGHT_WITCH_ACTION", ts: Date.now() },
          nightActions: {
            ...newState.nightActions,
            guardTarget: 3,
            wolfTarget: 3,
          },
          roleAbilities: {
            ...newState.roleAbilities,
            witchHealUsed: false,
            witchPoisonUsed: false,
            hunterCanShoot: true,
          },
        };
      } else if (devPreset === "LAST_WORDS_TEST") {
        const alivePlayers = newState.players.filter((p) => p.alive);
        const votes: Record<string, number> = {};
        alivePlayers.forEach((p) => {
          votes[p.playerId] = 0;
        });
        newState = {
          ...newState,
          phase: "DAY_VOTE",
          day: 1,
          devMutationId: (newState.devMutationId ?? 0) + 1,
          devPhaseJump: { to: "DAY_VOTE", ts: Date.now() },
          votes,
        };
      }

      setGameState(newState);

      // In spectator mode, skip role reveal and start the game immediately
      if (isSpectatorMode) {
        pendingStartStateRef.current = null;
        hasContinuedAfterRevealRef.current = true;
        isAwaitingRoleRevealRef.current = false;
        
        // Start the night phase directly
        const token = getToken();
        if (isTokenValid(token)) {
          const systemMessages = getSystemMessages();
          setDialogue(speakerHost, systemMessages.nightFall(newState.day), false);
          await playNarrator("nightFall");
          await runNightPhaseAction(newState, token, "START_NIGHT");
        }
      } else {
        pendingStartStateRef.current = devPreset ? null : newState;
        hasContinuedAfterRevealRef.current = false;
        isAwaitingRoleRevealRef.current = true;
      }
    } catch (error) {
      const msg = String(error);
      if (msg.includes("ZenMux API error: 401") || msg.includes(" 401")) {
        toast.error(t("gameLogicMessages.zenmux401"));
      } else {
        toast.error(t("gameLogicMessages.requestFailed"), { description: msg });
      }
      setDialogue(t("speakers.system"), t("gameLogicMessages.errorOccurred", { error: String(error) }), false);
      setGameStarted(false);
      setShowTable(false);
    } finally {
      setIsLoading(false);
    }
  }, [humanName, resetDialogueState, setDialogue, setGameStarted, setGameState, setInputText, setIsLoading, setShowTable, t]);

  /** 角色揭示后继续 */
  const continueAfterRoleReveal = useCallback(async () => {
    const token = getToken();
    const pending = pendingStartStateRef.current;
    if (!pending) return;
    if (hasContinuedAfterRevealRef.current) return;

    hasContinuedAfterRevealRef.current = true;
    pendingStartStateRef.current = null;
    isAwaitingRoleRevealRef.current = false;

    if (!isTokenValid(token)) return;

    const systemMessages = getSystemMessages();

    // Set dialogue before playing audio so message box appears immediately
    setDialogue(speakerHost, systemMessages.nightFall(pending.day), false);
    
    // 播放第一晚的"天黑请闭眼"旁白
    await playNarrator("nightFall");
    
    await runNightPhaseAction(pending, token, "START_NIGHT");
  }, [getToken, isTokenValid, runNightPhaseAction, setDialogue, speakerHost]);

  /** 重新开始 */
  const restartGame = useCallback(() => {
    setGameState(createInitialGameState());
    resetDialogueState();
    setInputText("");
    setShowTable(false);
    setGameStarted(false);

    pendingStartStateRef.current = null;
    hasContinuedAfterRevealRef.current = false;
    isAwaitingRoleRevealRef.current = false;
    badgeSpeechEndRef.current = null;
    if (showTableTimeoutRef.current !== null) {
      window.clearTimeout(showTableTimeoutRef.current);
      showTableTimeoutRef.current = null;
    }
  }, [setGameState, resetDialogueState]);

  /** 人类发言 */
  const handleHumanSpeech = useCallback(async () => {
    if (!inputText.trim() || !humanPlayer) return;

    const s = gameStateRef.current;
    const isMyTurn = (s.phase === "DAY_SPEECH" || s.phase === "DAY_LAST_WORDS" || s.phase === "DAY_BADGE_SPEECH" || s.phase === "DAY_PK_SPEECH") && s.currentSpeakerSeat === humanPlayer.seat;
    if (!isMyTurn) return;

    const speech = inputText.trim();
    setInputText("");

    const currentState = addPlayerMessage(gameStateRef.current, humanPlayer.playerId, speech);
    setGameState(currentState);
  }, [inputText, humanPlayer, setGameState]);

  /** 人类结束发言 */
  const handleFinishSpeaking = useCallback(async () => {
    if (!humanPlayer) return;

    if (gameStateRef.current.phase === "DAY_LAST_WORDS") {
      const next = afterLastWordsRef.current;
      afterLastWordsRef.current = null;
      if (next) {
        await delay(500);
        await next(gameStateRef.current);
      }
      return;
    }

    const startState = gameStateRef.current;
    const startGameId = startState.gameId;
    const startPhase = startState.phase;

    await delay(300);

    const liveState = gameStateRef.current;
    if (liveState.gameId !== startGameId) return;
    if (liveState.phase !== startPhase) return;

    const token = getToken();
    await runDaySpeechAction(liveState, token, "ADVANCE_SPEAKER");
  }, [humanPlayer, getToken, runDaySpeechAction]);

  /** 下一轮按钮 */
  const handleNextRound = useCallback(async () => {
    const startState = gameStateRef.current;
    const startGameId = startState.gameId;
    const startPhase = startState.phase;

    if (startPhase !== "DAY_SPEECH" && startPhase !== "DAY_LAST_WORDS" && startPhase !== "DAY_BADGE_SPEECH" && startPhase !== "DAY_PK_SPEECH") {
      return;
    }

    setWaitingForNextRound(false);
    await delay(300);

    const liveState = gameStateRef.current;
    if (liveState.gameId !== startGameId) return;
    if (liveState.phase !== startPhase) return;

    const token = getToken();
    await runDaySpeechAction(liveState, token, "ADVANCE_SPEAKER");
  }, [getToken, runDaySpeechAction, setWaitingForNextRound]);

  /** 人类投票 */
  const handleHumanVote = useCallback(async (targetSeat: number) => {
    if (!humanPlayer) return;
    if (!humanPlayer.alive) return;

    const baseState = gameStateRef.current;
    if (baseState.phase !== "DAY_VOTE" && baseState.phase !== "DAY_BADGE_ELECTION") return;
    const targetPlayer = baseState.players.find((p) => p.seat === targetSeat);
    if (!targetPlayer || !targetPlayer.alive) return;
    if (typeof baseState.votes[humanPlayer.playerId] === "number") return;

    if (baseState.phase === "DAY_BADGE_ELECTION") {
      const candidates = baseState.badge.candidates || [];
      if (candidates.includes(humanPlayer.seat)) {
        console.warn("[wolfcha] Candidate cannot vote in badge election");
        return;
      }

      const nextState: GameState = {
        ...baseState,
        badge: {
          ...baseState.badge,
          votes: { ...baseState.badge.votes, [humanPlayer.playerId]: targetSeat },
        },
      };
      setGameState(nextState);
      gameStateRef.current = nextState;

      await delay(200);
      await badgePhase.maybeResolveBadgeElection(nextState);
      return;
    }

    if (baseState.pkSource === "vote" && Array.isArray(baseState.pkTargets) && baseState.pkTargets.length > 0) {
      if (!baseState.pkTargets.includes(targetSeat)) {
        console.warn("[wolfcha] Vote target not in PK list");
        return;
      }
    }

    // 使用函数式更新确保获取最新状态（解决AI投票后状态同步问题）
    let updatedState: GameState | null = null;
    setGameState((prevState) => {
      updatedState = {
        ...prevState,
        votes: { ...prevState.votes, [humanPlayer.playerId]: targetSeat },
      };
      return updatedState;
    });

    // 等待状态更新完成
    await delay(200);
    
    // 从 ref 获取最新状态（setGameState 的函数式更新会确保 prevState 是最新的）
    const latestState = updatedState || gameStateRef.current;
    gameStateRef.current = latestState;

    // 检查是否所有人都投票了
    const aliveIds = latestState.players.filter((p) => p.alive).map((p) => p.playerId);
    const allVoted = aliveIds.every((id) => typeof latestState.votes[id] === "number");
    
    console.log("[wolfcha] handleHumanVote: allVoted =", allVoted, "votes count =", Object.keys(latestState.votes).length, "alive count =", aliveIds.length);
    
    if (allVoted && !isWaitingForAI) {
      const token = getToken();
      await resolveVotesSafely(latestState, token);
    }
  }, [humanPlayer, setGameState, badgePhase, getToken, resolveVotesSafely, isWaitingForAI]);

  /** 夜晚行动 */
  const handleNightAction = useCallback(async (targetSeat: number, witchAction?: "save" | "poison" | "pass") => {
    if (!humanPlayer) return;
    if (!humanPlayer.alive && gameState.phase !== "HUNTER_SHOOT") return;

    const token = getToken();
    const systemMessages = getSystemMessages();
    let currentState = gameState;

    // 守卫保护
    if (gameState.phase === "NIGHT_GUARD_ACTION" && humanPlayer.role === "Guard") {
      if (currentState.nightActions.lastGuardTarget === targetSeat) {
        toast.error(t("gameLogicMessages.guardNoRepeat"));
        return;
      }
      const targetPlayer = currentState.players.find((p) => p.seat === targetSeat);
      currentState = {
        ...currentState,
        nightActions: { ...currentState.nightActions, guardTarget: targetSeat },
      };
      setDialogue(t("speakers.system"), t("gameLogicMessages.youProtected", { seat: targetSeat + 1, name: targetPlayer?.displayName || "" }), false);
      setGameState(currentState);

      await delay(1000);
      await waitForUnpause();
      await runNightPhaseAction(currentState, token, "CONTINUE_NIGHT_AFTER_GUARD");
    }
    // 狼人击杀
    else if (gameState.phase === "NIGHT_WOLF_ACTION" && humanPlayer.role === "Werewolf") {
      const targetPlayer = currentState.players.find((p) => p.seat === targetSeat);
      const wolves = currentState.players.filter((p) => p.role === "Werewolf" && p.alive);
      const existingVotes: Record<string, number> = { ...(currentState.nightActions.wolfVotes || {}) };
      existingVotes[humanPlayer.playerId] = targetSeat;

      currentState = {
        ...currentState,
        nightActions: { ...currentState.nightActions, wolfVotes: existingVotes, wolfTarget: undefined },
      };
      setDialogue(t("speakers.system"), t("gameLogicMessages.youVotedAttack", { seat: targetSeat + 1, name: targetPlayer?.displayName || "" }), false);
      setGameState(currentState);

      // AI 狼人投票（并发执行）
      const aiWolves = wolves.filter((w) => !w.isHuman);
      if (aiWolves.length > 0) {
        setIsWaitingForAI(true);
        try {
          const { generateWolfAction } = await import("@/lib/game-master");
          
          // 并发执行所有 AI 狼人的投票
          const votePromises = aiWolves.map(async (w) => {
            const voteSeat = await generateWolfAction(currentState, w, existingVotes);
            return { playerId: w.playerId, voteSeat };
          });
          
          const voteResults = await Promise.all(votePromises);
          
          for (const { playerId, voteSeat } of voteResults) {
            existingVotes[playerId] = voteSeat;
          }
          currentState = {
            ...currentState,
            nightActions: { ...currentState.nightActions, wolfVotes: existingVotes },
          };
          setGameState(currentState);
        } catch (error) {
          console.error("[wolfcha] AI wolf vote failed:", error);
          // On error, AI wolves follow human's choice
          for (const w of aiWolves) {
            if (existingVotes[w.playerId] === undefined) {
              existingVotes[w.playerId] = targetSeat;
            }
          }
          currentState = {
            ...currentState,
            nightActions: { ...currentState.nightActions, wolfVotes: existingVotes },
          };
          setGameState(currentState);
          toast.error(t("gameLogicMessages.teammateTimeout"), { description: t("gameLogicMessages.aiFollowsYou") });
        } finally {
          setIsWaitingForAI(false);
        }
      }

      const chosenSeat = computeUniqueTopSeat(existingVotes);
      if (chosenSeat === null) {
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, wolfVotes: {} },
        };
        setGameState(currentState);
        setDialogue(t("speakers.system"), t("gameLogicMessages.wolfTieVote"), false);
        toast.warning(t("gameLogicMessages.wolfTieTitle"), { description: t("gameLogicMessages.wolfTieDesc") });
        return;
      }

      currentState = {
        ...currentState,
        nightActions: { ...currentState.nightActions, wolfVotes: existingVotes, wolfTarget: chosenSeat },
      };
      
      // 添加狼队达成一致的确认消息
      const chosenTarget = currentState.players.find((p) => p.seat === chosenSeat);
      setDialogue(t("speakers.system"), t("gameLogicMessages.wolfDecided", { seat: chosenSeat + 1, name: chosenTarget?.displayName || "" }), false);
      setGameState(currentState);

      await delay(800);
      await waitForUnpause();
      await runNightPhaseAction(currentState, token, "CONTINUE_NIGHT_AFTER_WOLF");
    }
    // 女巫用药
    else if (gameState.phase === "NIGHT_WITCH_ACTION" && humanPlayer.role === "Witch") {
      if (witchAction === "save" && !currentState.roleAbilities.witchHealUsed) {
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, witchSave: true },
          roleAbilities: { ...currentState.roleAbilities, witchHealUsed: true },
        };
        setDialogue(t("speakers.system"), t("gameLogicMessages.usedAntidote"), false);
      } else if (witchAction === "poison" && !currentState.roleAbilities.witchPoisonUsed) {
        const targetPlayer = currentState.players.find((p) => p.seat === targetSeat);
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, witchPoison: targetSeat },
          roleAbilities: { ...currentState.roleAbilities, witchPoisonUsed: true },
        };
        setDialogue(t("speakers.system"), t("gameLogicMessages.usedPoison", { seat: targetSeat + 1, name: targetPlayer?.displayName || "" }), false);
      } else {
        setDialogue(t("speakers.system"), t("gameLogicMessages.noPotion"), false);
      }
      setGameState(currentState);

      await delay(800);
      await waitForUnpause();
      await runNightPhaseAction(currentState, token, "CONTINUE_NIGHT_AFTER_WITCH");
    }
    // 预言家查验
    else if (gameState.phase === "NIGHT_SEER_ACTION" && humanPlayer.role === "Seer") {
      // Check if seer has already checked this night
      if (currentState.nightActions.seerTarget !== undefined) {
        return;
      }
      const targetPlayer = currentState.players.find((p) => p.seat === targetSeat);
      const isWolf = targetPlayer?.role === "Werewolf";
      const seerHistory = currentState.nightActions.seerHistory || [];

      currentState = {
        ...currentState,
        nightActions: {
          ...currentState.nightActions,
          seerTarget: targetSeat,
          seerResult: { targetSeat, isWolf: isWolf || false },
          seerHistory: [...seerHistory, { targetSeat, isWolf: isWolf || false, day: currentState.day }],
        },
      };
      setDialogue(t("speakers.seerResult"), t("gameLogicMessages.seerResultText", { seat: targetSeat + 1, name: targetPlayer?.displayName || "", result: isWolf ? t("gameLogicMessages.werewolfResult") : t("gameLogicMessages.goodResult") }), false);
      setGameState(currentState);

      nightContinueRef.current = async (s) => {
        await resolveNight(s, token, async (resolvedState) => {
          await startDayPhaseInternal(resolvedState, token);
        });
      };
      return;
    }
    // 猎人开枪
    else if (gameState.phase === "HUNTER_SHOOT" && humanPlayer.role === "Hunter") {
      const diedAtNight = (currentState as GameState & { _hunterDiedAtNight?: boolean })._hunterDiedAtNight ?? true;
      if (targetSeat >= 0) {
        currentState = killPlayer(currentState, targetSeat);
        const target = currentState.players.find((p) => p.seat === targetSeat);
        if (target) {
          currentState = addSystemMessage(currentState, systemMessages.hunterShoot(humanPlayer.seat + 1, targetSeat + 1, target.displayName));
          setDialogue(speakerHost, systemMessages.hunterShoot(humanPlayer.seat + 1, targetSeat + 1, target.displayName), false);
        }

        const shot = { hunterSeat: humanPlayer.seat, targetSeat };
        if (diedAtNight) {
          const prevNightRecord = (currentState.nightHistory || {})[currentState.day] || {};
          currentState = {
            ...currentState,
            nightHistory: {
              ...(currentState.nightHistory || {}),
              [currentState.day]: { ...prevNightRecord, hunterShot: shot },
            },
          };
        } else {
          const prevDayRecord = (currentState.dayHistory || {})[currentState.day] || {};
          currentState = {
            ...currentState,
            dayHistory: {
              ...(currentState.dayHistory || {}),
              [currentState.day]: { ...prevDayRecord, hunterShot: shot },
            },
          };
        }
        setGameState(currentState);
      }

      const winner = checkWinCondition(currentState);
      if (winner) {
        await endGame(currentState, winner);
        return;
      }

      await delay(1200);
      if (diedAtNight) {
        currentState = transitionPhase(currentState, "DAY_START");
        currentState = addSystemMessage(currentState, systemMessages.dayBreak);
        setGameState(currentState);
        await delay(800);
        await startDayPhaseInternal(currentState, token, { skipAnnouncements: true });
      } else {
        await proceedToNight(currentState, token);
      }
    }
  }, [gameState, humanPlayer, setGameState, setDialogue, setIsWaitingForAI, waitForUnpause, getToken, runNightPhaseAction, resolveNight, startDayPhaseInternal, proceedToNight, endGame, transitionPhase, speakerHost, t]);

  /** 人类警长移交 */
  const handleHumanBadgeTransfer = useCallback(async (targetSeat: number) => {
    await badgePhase.handleHumanBadgeTransfer(targetSeat);
  }, [badgePhase]);

  /** 推进发言 */
  const advanceSpeech = useCallback(async (): Promise<{ finished: boolean; shouldAdvanceToNextSpeaker: boolean }> => {
    if (gameStateRef.current.phase.includes("NIGHT")) {
      const cont = nightContinueRef.current;
      if (cont) {
        nightContinueRef.current = null;
        clearDialogue();
        setIsWaitingForAI(false);
        setWaitingForNextRound(false);
        await cont(gameStateRef.current);
        return { finished: true, shouldAdvanceToNextSpeaker: false };
      }
      return { finished: false, shouldAdvanceToNextSpeaker: false };
    }

    const queue = getSpeechQueue();
    if (!queue) {
      return { finished: false, shouldAdvanceToNextSpeaker: false };
    }

    if (queue.isStreaming && !isCurrentSegmentCompleted()) {
      return { finished: false, shouldAdvanceToNextSpeaker: false };
    }

    const { segments, currentIndex, player, afterSpeech } = queue;

    let nextState = gameStateRef.current;

    // 将当前句子添加到消息列表（如果尚未提交）
    const currentSegment = segments[currentIndex];
    if (currentSegment && currentSegment.trim().length > 0 && !isCurrentSegmentCommitted()) {
      nextState = addPlayerMessage(nextState, player.playerId, currentSegment);
      setGameState(nextState);
      markCurrentSegmentCommitted();

      const rawTranscript = buildRawDayTranscript(nextState);
      const shouldSummarizeEarly =
        nextState.day > 0 &&
        !nextState.dailySummaries?.[nextState.day]?.length &&
        rawTranscript.length > 10000;
      if (shouldSummarizeEarly) {
        void maybeGenerateDailySummary(nextState)
          .then((summarized) => {
            setGameState((prev) => {
              if (prev.gameId !== summarized.gameId || prev.day !== summarized.day) return prev;
              return {
                ...prev,
                dailySummaries: summarized.dailySummaries,
                dailySummaryFacts: summarized.dailySummaryFacts,
                dailySummaryVoteData: summarized.dailySummaryVoteData ?? prev.dailySummaryVoteData,
              };
            });
          })
          .catch(() => {});
      }
    }

    const result = advanceSpeechQueue();
    if (!result) return { finished: false, shouldAdvanceToNextSpeaker: false };

    if (!result.finished) {
      return { finished: false, shouldAdvanceToNextSpeaker: false };
    }

    setIsWaitingForAI(false);

    if (result.afterSpeech) {
      await result.afterSpeech(nextState);
      return { finished: true, shouldAdvanceToNextSpeaker: false };
    }

    // 不设置 waitingForNextRound，直接返回 shouldAdvanceToNextSpeaker: true
    // 让调用方立即调用 handleNextRound，避免单条消息时需要按两次回车的问题
    return { finished: true, shouldAdvanceToNextSpeaker: true };
  }, [clearDialogue, setIsWaitingForAI, setWaitingForNextRound, getSpeechQueue, advanceSpeechQueue, setGameState, isCurrentSegmentCommitted, markCurrentSegmentCommitted, isCurrentSegmentCompleted]);

  /** 切换暂停 */
  const togglePause = useCallback(() => {
    setGameState((prev) => ({
      ...prev,
      isPaused: !prev.isPaused,
    }));
  }, [setGameState]);

  // ============================================
  // 返回 API
  // ============================================
  return {
    // State
    humanName: humanName || "",
    setHumanName,
    gameStarted,
    gameState,
    isLoading,
    isWaitingForAI,
    waitingForNextRound,
    currentDialogue,
    inputText,
    setInputText,
    showTable,
    logRef,
    humanPlayer,
    isNight,

    // Actions
    startGame,
    continueAfterRoleReveal,
    restartGame,
    handleHumanSpeech,
    handleFinishSpeaking,
    handleBadgeSignup: badgePhase.handleBadgeSignup,
    handleHumanVote,
    handleNightAction,
    handleHumanBadgeTransfer,
    handleNextRound,
    scrollToBottom,
    advanceSpeech,
    togglePause,
    markCurrentSegmentCompleted,
    isCurrentSegmentCompleted,
  };
}
