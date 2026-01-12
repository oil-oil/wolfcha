"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAtom } from "jotai";
import { useLocalStorageState } from "ahooks";
import { toast } from "sonner";
import {
  createInitialGameState,
  setupPlayers,
  addSystemMessage,
  addPlayerMessage,
  transitionPhase as rawTransitionPhase,
  checkWinCondition,
  killPlayer,
  tallyVotes,
  getNextAliveSeat,
  generateAISpeechSegments,
  generateAIVote,
  generateAIBadgeVote,
  generateDailySummary,
  generateSeerAction,
  generateWolfAction,
  generateGuardAction,
  generateWitchAction,
  generateHunterShoot,
  type WitchAction,
} from "@/lib/game-master";
import { generateCharacters } from "@/lib/character-generator";
import type { GameState, Player, Phase } from "@/types/game";
import { SYSTEM_MESSAGES, UI_TEXT } from "@/lib/prompts";
import { gameStateAtom, isValidTransition } from "@/store/game-machine";

export interface DialogueState {
  speaker: string;
  text: string;
  isStreaming: boolean;
}

export function useGameLogic() {
  const apiKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || "";
  const [humanName, setHumanName] = useLocalStorageState<string>("wolfcha_human_name", {
    defaultValue: "",
  });
  const [apiKeyConfirmed, setApiKeyConfirmed] = useState(false);
  const [gameState, setGameState] = useAtom(gameStateAtom);
  const [isLoading, setIsLoading] = useState(false);
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);
  const [currentDialogue, setCurrentDialogue] = useState<DialogueState | null>(null);
  const [inputText, setInputText] = useState("");
  const [showTable, setShowTable] = useState(false);
  const [waitingForNextRound, setWaitingForNextRound] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const pendingStartStateRef = useRef<GameState | null>(null);
  const hasContinuedAfterRevealRef = useRef(false);
  const isAwaitingRoleRevealRef = useRef(false);
  const afterLastWordsRef = useRef<((state: GameState) => Promise<void>) | null>(null);
  const nightContinueRef = useRef<((state: GameState) => Promise<void>) | null>(null);
  const gameStateRef = useRef<GameState>(gameState);
  const isResolvingVotesRef = useRef(false);
  const resolveVotesRef = useRef<(state: GameState) => Promise<void>>(async () => {});
  const badgeSpeechEndRef = useRef<((state: GameState) => Promise<void>) | null>(null);
  const showTableTimeoutRef = useRef<number | null>(null);
  
  // AI speech queue for press-to-advance
  const speechQueueRef = useRef<{
    segments: string[];
    currentIndex: number;
    player: Player;
    afterSpeech?: (s: GameState) => Promise<void>;
  } | null>(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const humanPlayer = gameState.players.find((p) => p.isHuman) || null;
  const isNight = gameState.phase.includes("NIGHT");
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const transitionPhase = useCallback((state: GameState, newPhase: Phase): GameState => {
    if (!isValidTransition(state.phase, newPhase)) {
      console.warn(`[wolfcha] Invalid phase transition: ${state.phase} -> ${newPhase}`);
    }
    return rawTransitionPhase(state, newPhase);
  }, []);

  const isSpeechLikePhase = (phase: Phase) => {
    return phase === "DAY_SPEECH" || phase === "DAY_LAST_WORDS" || phase === "DAY_BADGE_SPEECH";
  };

  const maybeResolveBadgeElection = useCallback(async (state: GameState) => {
    if (isResolvingVotesRef.current) return;
    if (state.phase !== "DAY_BADGE_ELECTION") return;

    // Candidates don't vote - only non-candidates need to vote
    const candidates = state.badge.candidates || [];
    const voters = state.players.filter((p) => p.alive && !candidates.includes(p.seat));
    const voterIds = voters.map((p) => p.playerId);
    const allVoted = voterIds.every((id) => typeof state.badge.votes[id] === "number");
    if (!allVoted) return;

    isResolvingVotesRef.current = true;
    try {
      const counts: Record<number, number> = {};
      for (const seat of Object.values(state.badge.votes)) {
        counts[seat] = (counts[seat] || 0) + 1;
      }
      const entries = Object.entries(counts);
      let max = -1;
      for (const [, c] of entries) max = Math.max(max, c);
      const topSeats = entries.filter(([, c]) => c === max).map(([s]) => Number(s));

      if (topSeats.length !== 1) {
        // 平票：清票重投
        const revoteCount = (state.badge.revoteCount || 0) + 1;

        // 避免无限重投：超过一定次数则随机在最高票中选一个
        if (revoteCount >= 4) {
          const winnerSeat = topSeats[Math.floor(Math.random() * topSeats.length)];
          const winner = state.players.find((p) => p.seat === winnerSeat);
          const votedCount = counts[winnerSeat] || 0;

          let nextState: GameState = {
            ...state,
            badge: {
              ...state.badge,
              holderSeat: winnerSeat,
              revoteCount,
              history: { ...state.badge.history, [state.day]: { ...state.badge.votes } },
            },
          };
          nextState = addSystemMessage(nextState, SYSTEM_MESSAGES.badgeElected(winnerSeat + 1, winner?.displayName || "", votedCount));
          setGameState(nextState);
          gameStateRef.current = nextState;
          setDialogue("主持人", SYSTEM_MESSAGES.badgeElected(winnerSeat + 1, winner?.displayName || "", votedCount), false);

          await delay(900);
          await startDaySpeechAfterBadge(nextState);
          return;
        }

        const nextState: GameState = {
          ...state,
          badge: {
            ...state.badge,
            votes: {},
            revoteCount,
          },
        };
        const withMsg = addSystemMessage(nextState, SYSTEM_MESSAGES.badgeRevote);
        setGameState(withMsg);
        gameStateRef.current = withMsg;
        setDialogue("主持人", SYSTEM_MESSAGES.badgeRevote, false);

        // 重新触发 AI 投票
        void startBadgeElectionPhase(withMsg);
        return;
      }

      const winnerSeat = topSeats[0];
      const winner = state.players.find((p) => p.seat === winnerSeat);
      const votedCount = counts[winnerSeat] || 0;

      let nextState: GameState = {
        ...state,
        badge: {
          ...state.badge,
          holderSeat: winnerSeat,
          history: { ...state.badge.history, [state.day]: { ...state.badge.votes } },
        },
      };
      nextState = addSystemMessage(nextState, SYSTEM_MESSAGES.badgeElected(winnerSeat + 1, winner?.displayName || "", votedCount));
      setGameState(nextState);
      gameStateRef.current = nextState;
      setDialogue("主持人", SYSTEM_MESSAGES.badgeElected(winnerSeat + 1, winner?.displayName || "", votedCount), false);

      await delay(900);
      await startDaySpeechAfterBadge(nextState);
    } finally {
      isResolvingVotesRef.current = false;
    }
  }, []);

  const maybeGenerateDailySummary = useCallback(async (state: GameState): Promise<GameState> => {
    if (!apiKey) return state;
    if (state.day <= 0) return state;
    if (state.dailySummaries?.[state.day]?.length) return state;
    if (!state.messages || state.messages.length === 0) return state;
    try {
      const summary = await generateDailySummary(apiKey, state);
      if (!summary || summary.length === 0) return state;
      return {
        ...state,
        dailySummaries: { ...state.dailySummaries, [state.day]: summary },
      };
    } catch {
      return state;
    }
  }, [apiKey]);

  const scrollToBottom = useCallback(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, []);

  const setDialogue = useCallback((speaker: string, text: string, isStreaming = false) => {
    setCurrentDialogue({ speaker, text, isStreaming });
  }, []);

  const clearDialogue = useCallback(() => {
    setCurrentDialogue(null);
  }, []);

  const randomDelay = (minMs: number, maxMs: number) => {
    const ms = Math.floor(minMs + Math.random() * (maxMs - minMs));
    return delay(ms);
  };

  const computeUniqueTopSeat = useCallback((votes: Record<string, number>): number | null => {
    const counts: Record<number, number> = {};
    for (const seat of Object.values(votes)) {
      counts[seat] = (counts[seat] || 0) + 1;
    }
    const entries = Object.entries(counts);
    if (entries.length === 0) return null;

    let max = -1;
    for (const [, c] of entries) max = Math.max(max, c);

    const topSeats = entries
      .filter(([, c]) => c === max)
      .map(([s]) => Number(s));

    return topSeats.length === 1 ? topSeats[0] : null;
  }, []);

  const maybeResolveVotes = useCallback(async (state: GameState) => {
    if (isResolvingVotesRef.current) return;
    if (state.phase !== "DAY_VOTE") return;

    const aliveIds = state.players.filter((p) => p.alive).map((p) => p.playerId);
    const allVoted = aliveIds.every((id) => typeof state.votes[id] === "number");
    if (!allVoted) return;

    isResolvingVotesRef.current = true;
    try {
      await resolveVotesRef.current(state);
    } finally {
      isResolvingVotesRef.current = false;
    }
  }, []);

  // 开始游戏
  const startGame = useCallback(async () => {
    if (!apiKey) {
      setDialogue("系统", "缺少 OpenRouter API Key，请在环境变量 NEXT_PUBLIC_OPENROUTER_API_KEY 中配置", false);
      toast.error("缺少 OpenRouter API Key", {
        description: "请在 .env.local 设置 NEXT_PUBLIC_OPENROUTER_API_KEY，并重启 dev server",
      });
      setApiKeyConfirmed(false);
      return;
    }
    
    // 确保每次开局都是干净状态（避免热更新/残留状态导致等待界面直接显示完整名单）
    setGameState(createInitialGameState());
    setCurrentDialogue(null);
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
      const characters = await generateCharacters(apiKey, 9);
      const players = setupPlayers(characters, 0, humanName || "你");
      
      let newState: GameState = {
        ...createInitialGameState(),
        players,
        phase: "NIGHT_START",
        day: 1,
      };

      newState = addSystemMessage(newState, SYSTEM_MESSAGES.gameStart);
      newState = addSystemMessage(newState, SYSTEM_MESSAGES.nightFall(1));
      setGameState(newState);
      // 先显示“召唤/等待”界面，再自动切到桌面
      setShowTable(false);
      showTableTimeoutRef.current = window.setTimeout(() => {
        setShowTable(true);
        showTableTimeoutRef.current = null;
      }, 6400);

      pendingStartStateRef.current = newState;
      hasContinuedAfterRevealRef.current = false;
      isAwaitingRoleRevealRef.current = true;
    } catch (error) {
      const msg = String(error);
      if (msg.includes("OpenRouter API error: 401")) {
        toast.error("OpenRouter 401 Unauthorized", {
          description:
            "常见原因：1) 改了 .env.local 但没重启 next dev；2) key 带了引号/空格/换行；3) key 已失效。",
        });
      } else {
        toast.error("请求失败", { description: msg });
      }
      setDialogue("系统", `出错了: ${error}`, false);
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, humanName]);

  const startLastWordsPhase = useCallback(
    async (state: GameState, seat: number, afterLastWords: (s: GameState) => Promise<void>) => {
      const speaker = state.players.find((p) => p.seat === seat);
      if (!speaker) {
        await afterLastWords(state);
        return;
      }

      afterLastWordsRef.current = afterLastWords;
      let currentState = transitionPhase(state, "DAY_LAST_WORDS");
      currentState = { ...currentState, currentSpeakerSeat: seat };
      currentState = addSystemMessage(currentState, `请 ${seat + 1}号 ${speaker.displayName} 发表遗言`);
      setGameState(currentState);

      if (speaker.isHuman) {
        setDialogue("主持人", `请你发表遗言（${seat + 1}号 ${speaker.displayName}）`, false);
        return;
      }

      await runAISpeech(currentState, speaker, {
        afterSpeech: async (s) => {
          const next = afterLastWordsRef.current;
          afterLastWordsRef.current = null;
          if (next) await next(s);
        },
      });
    },
    []
  );

  // 夜晚阶段 - 新流程: 守卫 -> 狼人 -> 女巫 -> 预言家
  const runNightPhase = useCallback(async (state: GameState) => {
    if (isAwaitingRoleRevealRef.current) return;
    let currentState = state;

    // === 守卫行动 ===
    currentState = transitionPhase(currentState, "NIGHT_GUARD_ACTION");
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.guardActionStart);
    setGameState(currentState);

    const guard = currentState.players.find((p) => p.role === "Guard" && p.alive);
    if (guard) {
      if (guard.isHuman) {
        setDialogue("系统", UI_TEXT.waitingGuard, false);
        return;
      } else {
        setIsWaitingForAI(true);
        setDialogue("系统", UI_TEXT.guardActing, false);
        const guardTarget = await generateGuardAction(apiKey!, currentState, guard);
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, guardTarget },
        };
        setGameState(currentState);
        setIsWaitingForAI(false);
      }
    }

    await delay(800);

    const wolves = currentState.players.filter((p) => p.role === "Werewolf" && p.alive);
    const humanWolf = wolves.find((w) => w.isHuman);

    // === 狼人行动（出刀）===
    currentState = transitionPhase(currentState, "NIGHT_WOLF_ACTION");
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.wolfActionStart);
    setGameState(currentState);

    if (humanWolf) {
      setDialogue("系统", UI_TEXT.waitingWolf, false);
      return;
    } else if (wolves.length > 0) {
      setIsWaitingForAI(true);
      setDialogue("系统", UI_TEXT.wolfActing, false);

      let wolfVotes: Record<string, number> = {};
      const maxRevotes = 3;
      for (let round = 1; round <= maxRevotes; round++) {
        wolfVotes = {};
        for (const wolf of wolves) {
          const targetSeat = await generateWolfAction(apiKey!, currentState, wolf, wolfVotes);
          wolfVotes[wolf.playerId] = targetSeat;
        }

        const chosenSeat = computeUniqueTopSeat(wolfVotes);
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, wolfVotes, wolfTarget: chosenSeat ?? undefined },
        };
        setGameState(currentState);

        if (chosenSeat !== null) break;
        await delay(600);
      }

      // 如果多轮仍平票，兜底随机选一个最高票目标
      if (currentState.nightActions.wolfTarget === undefined) {
        const counts: Record<number, number> = {};
        for (const seat of Object.values(wolfVotes)) {
          counts[seat] = (counts[seat] || 0) + 1;
        }
        const entries = Object.entries(counts);
        let max = -1;
        for (const [, c] of entries) max = Math.max(max, c);
        const topSeats = entries.filter(([, c]) => c === max).map(([s]) => Number(s));
        const fallbackSeat = topSeats[Math.floor(Math.random() * topSeats.length)];
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, wolfVotes, wolfTarget: fallbackSeat },
        };
        setGameState(currentState);
      }

      setIsWaitingForAI(false);
    }

    await delay(800);

    // === 女巫行动 ===
    currentState = transitionPhase(currentState, "NIGHT_WITCH_ACTION");
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.witchActionStart);
    setGameState(currentState);

    const witch = currentState.players.find((p) => p.role === "Witch" && p.alive);
    const canWitchAct = witch && (!currentState.roleAbilities.witchHealUsed || !currentState.roleAbilities.witchPoisonUsed);

    if (witch && canWitchAct) {
      if (witch.isHuman) {
        setDialogue("系统", UI_TEXT.waitingWitch, false);
        return;
      } else {
        setIsWaitingForAI(true);
        setDialogue("系统", UI_TEXT.witchActing, false);
        const witchAction = await generateWitchAction(apiKey!, currentState, witch, currentState.nightActions.wolfTarget);
        
        if (witchAction.type === "save") {
          currentState = {
            ...currentState,
            nightActions: { ...currentState.nightActions, witchSave: true },
            roleAbilities: { ...currentState.roleAbilities, witchHealUsed: true },
          };
        } else if (witchAction.type === "poison" && witchAction.target !== undefined) {
          currentState = {
            ...currentState,
            nightActions: { ...currentState.nightActions, witchPoison: witchAction.target },
            roleAbilities: { ...currentState.roleAbilities, witchPoisonUsed: true },
          };
        }
        setGameState(currentState);
        setIsWaitingForAI(false);
      }
    }

    await delay(800);

    // === 预言家行动 ===
    currentState = transitionPhase(currentState, "NIGHT_SEER_ACTION");
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.seerActionStart);
    setGameState(currentState);

    const seer = currentState.players.find((p) => p.role === "Seer" && p.alive);
    if (seer) {
      if (seer.isHuman) {
        setDialogue("系统", UI_TEXT.waitingSeer, false);
        return;
      } else {
        setIsWaitingForAI(true);
        setDialogue("系统", UI_TEXT.seerChecking, false);

        const targetSeat = await generateSeerAction(apiKey!, currentState, seer);
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
        setGameState(currentState);
        setIsWaitingForAI(false);
      }
    }

    await delay(1000);
    await resolveNight(currentState);
  }, [apiKey]);

  // 结算夜晚 - 考虑守卫保护和女巫药水
  // 标准流程：第一天先进行警长竞选，竞选结束后再公布死讯
  const resolveNight = useCallback(async (state: GameState) => {
    let currentState = transitionPhase(state, "NIGHT_RESOLVE");
    setGameState(currentState);

    const { wolfTarget, guardTarget, witchSave, witchPoison } = currentState.nightActions;
    let wolfKillSuccessful = false;
    let wolfVictimSeat: number | undefined;
    let poisonVictimSeat: number | undefined;

    // 狼人击杀判定（先不公布，只记录）
    if (wolfTarget !== undefined) {
      const isProtected = guardTarget === wolfTarget;
      const isSaved = witchSave === true;

      if (!isProtected && !isSaved) {
        wolfKillSuccessful = true;
        wolfVictimSeat = wolfTarget;
      }
    }

    // 女巫毒杀判定（先不公布，只记录）
    if (witchPoison !== undefined) {
      poisonVictimSeat = witchPoison;
    }

    // 更新守卫的上一晚保护记录，并存储待公布的死亡信息
    currentState = {
      ...currentState,
      nightActions: {
        ...currentState.nightActions,
        lastGuardTarget: guardTarget,
        pendingWolfVictim: wolfKillSuccessful ? wolfVictimSeat : undefined,
        pendingPoisonVictim: poisonVictimSeat,
      },
    };

    setGameState(currentState);

    await delay(1200);
    currentState = transitionPhase(currentState, "DAY_START");
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.dayBreak);
    setGameState(currentState);
    setDialogue("主持人", SYSTEM_MESSAGES.dayBreak, false);

    await delay(800);
    await startDayPhase(currentState);
  }, [])

  // 处理猎人死亡开枪
  // diedAtNight: true = 夜晚被杀，开枪后进入白天; false = 白天被处决，开枪后进入夜晚
  const handleHunterDeath = useCallback(async (state: GameState, hunter: Player, diedAtNight: boolean = true) => {
    let currentState = transitionPhase(state, "HUNTER_SHOOT");
    setGameState(currentState);

    if (hunter.isHuman) {
      setDialogue("系统", UI_TEXT.hunterShoot, false);
      // 存储是否夜间死亡的信息，供后续使用
      (currentState as GameState & { _hunterDiedAtNight?: boolean })._hunterDiedAtNight = diedAtNight;
      return;
    }

    // AI猎人开枪
    setIsWaitingForAI(true);
    const targetSeat = await generateHunterShoot(apiKey!, currentState, hunter);
    setIsWaitingForAI(false);

    if (targetSeat !== null) {
      currentState = killPlayer(currentState, targetSeat);
      const target = currentState.players.find((p) => p.seat === targetSeat);
      if (target) {
        currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.hunterShoot(hunter.seat + 1, targetSeat + 1, target.displayName));
        setDialogue("主持人", SYSTEM_MESSAGES.hunterShoot(hunter.seat + 1, targetSeat + 1, target.displayName), false);
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
      // 夜晚被杀 -> 进入白天
      currentState = transitionPhase(currentState, "DAY_START");
      currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.dayBreak);
      setGameState(currentState);
      await delay(800);
      await startDayPhase(currentState);
    } else {
      // 白天被处决 -> 进入夜晚
      currentState = await maybeGenerateDailySummary(currentState);
      let nextState = { ...currentState, day: currentState.day + 1, nightActions: {} };
      nextState = transitionPhase(nextState, "NIGHT_START");
      nextState = addSystemMessage(nextState, SYSTEM_MESSAGES.nightFall(nextState.day));
      setGameState(nextState);
      await delay(1200);
      await runNightPhase(nextState);
    }
  }, [apiKey, runNightPhase, maybeGenerateDailySummary]);

  // AI 发言（分段输出，需要用户按键推进）
  const runAISpeech = useCallback(async (
    state: GameState,
    player: Player,
    options?: { afterSpeech?: (s: GameState) => Promise<void> }
  ) => {
    if (state.phase.includes("NIGHT")) {
      console.warn("[wolfcha] runAISpeech called during NIGHT phase:", state.phase);
      return;
    }

    setIsWaitingForAI(true);
    setCurrentDialogue({ speaker: player.displayName, text: "（正在组织语言…）", isStreaming: false });

    let segments: string[] = [];
    try {
      segments = await generateAISpeechSegments(apiKey!, state, player);
    } catch (error) {
      segments = ["（话音被打断了）"];
    }

    // 初始化队列，显示第一条
    speechQueueRef.current = {
      segments,
      currentIndex: 0,
      player,
      afterSpeech: options?.afterSpeech,
    };

    if (segments.length > 0) {
      setCurrentDialogue({ speaker: player.displayName, text: segments[0], isStreaming: true });
    }
  }, [apiKey]);

  const maybeStartBadgeSpeechAfterSignup = async (state: GameState) => {
    const alivePlayers = state.players.filter((p) => p.alive);
    const signup = state.badge.signup || {};
    const allDecided = alivePlayers.every((p) => typeof signup[p.playerId] === "boolean");
    if (!allDecided) return;

    const candidates = alivePlayers
      .filter((p) => signup[p.playerId] === true)
      .map((p) => p.seat);

    if (candidates.length === 0) {
      let nextState = addSystemMessage(state, "无人报名竞选警长，跳过警徽竞选");
      setGameState(nextState);
      gameStateRef.current = nextState;
      setDialogue("主持人", "无人报名竞选警长，跳过警徽竞选", false);
      await delay(900);
      await startDaySpeechAfterBadge(nextState);
      return;
    }

    await startBadgeSpeechPhase({
      ...state,
      badge: { ...state.badge, candidates },
    });
  };

  const startBadgeSignupPhase = useCallback(async (state: GameState) => {
    let currentState = transitionPhase(state, "DAY_BADGE_SIGNUP");
    currentState = {
      ...currentState,
      currentSpeakerSeat: null,
      daySpeechStartSeat: null,
      badge: {
        ...currentState.badge,
        signup: {},
        candidates: [],
      },
    };

    currentState = addSystemMessage(currentState, "进入警徽竞选报名环节");
    setGameState(currentState);
    // 不设置 dialogue，因为 DialogArea 中有专门的警长竞选报名面板
    clearDialogue();
    gameStateRef.current = currentState;

    const alivePlayers = currentState.players.filter((p) => p.alive);
    const aiPlayers = alivePlayers.filter((p) => !p.isHuman);
    for (const ai of aiPlayers) {
      if (gameStateRef.current.phase !== "DAY_BADGE_SIGNUP") break;
      const bias = ai.agentProfile?.persona?.riskBias;
      const roll = Math.random();
      const wants = bias === "aggressive" ? roll < 0.55 : bias === "safe" ? roll < 0.18 : roll < 0.35;

      const nextState: GameState = {
        ...gameStateRef.current,
        badge: {
          ...gameStateRef.current.badge,
          signup: { ...gameStateRef.current.badge.signup, [ai.playerId]: wants },
        },
      };
      setGameState(nextState);
      gameStateRef.current = nextState;
    }

    const human = alivePlayers.find((p) => p.isHuman);
    if (!human) {
      await maybeStartBadgeSpeechAfterSignup(gameStateRef.current);
      return;
    }

    await maybeStartBadgeSpeechAfterSignup(gameStateRef.current);
  }, [transitionPhase]);

  // 白天阶段
  // 标准流程：第一天先进行警长竞选，竞选结束后再公布死讯
  const startDayPhase = useCallback(async (state: GameState) => {
    // 第一天：先进行警徽评选（死讯在竞选结束后公布）
    if (state.day === 1 && state.badge.holderSeat === null) {
      await startBadgeSignupPhase(state);
      return;
    }

    // 非第一天：直接进入讨论（会先公布死讯）
    await startDaySpeechAfterBadge(state);
  }, []);

  const startDaySpeechAfterBadge = useCallback(async (state: GameState) => {
    let currentState = state;

    // 警长竞选结束后，公布昨晚死讯
    const { pendingWolfVictim, pendingPoisonVictim } = currentState.nightActions;
    let hasDeaths = false;
    let wolfVictim: Player | undefined;
    let poisonVictim: Player | undefined;

    // 处理狼人击杀
    if (pendingWolfVictim !== undefined) {
      hasDeaths = true;
      currentState = killPlayer(currentState, pendingWolfVictim);
      wolfVictim = currentState.players.find((p) => p.seat === pendingWolfVictim);
      if (wolfVictim) {
        currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.playerKilled(wolfVictim.seat + 1, wolfVictim.displayName));
        setDialogue("主持人", SYSTEM_MESSAGES.playerKilled(wolfVictim.seat + 1, wolfVictim.displayName), false);
        setGameState(currentState);
        await delay(1200);
      }
    }

    // 处理女巫毒杀
    if (pendingPoisonVictim !== undefined) {
      hasDeaths = true;
      currentState = killPlayer(currentState, pendingPoisonVictim);
      poisonVictim = currentState.players.find((p) => p.seat === pendingPoisonVictim);
      if (poisonVictim) {
        // 被毒死的猎人不能开枪
        if (poisonVictim.role === "Hunter") {
          currentState = {
            ...currentState,
            roleAbilities: { ...currentState.roleAbilities, hunterCanShoot: false },
          };
        }
        currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.playerPoisoned(poisonVictim.seat + 1, poisonVictim.displayName));
        setDialogue("主持人", SYSTEM_MESSAGES.playerPoisoned(poisonVictim.seat + 1, poisonVictim.displayName), false);
        setGameState(currentState);
        await delay(1200);
      }
    }

    // 如果没有死亡，宣布平安夜
    if (!hasDeaths) {
      currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.peacefulNight);
      setDialogue("主持人", SYSTEM_MESSAGES.peacefulNight, false);
      setGameState(currentState);
      await delay(1000);
    }

    // 清除待公布的死亡信息
    currentState = {
      ...currentState,
      nightActions: {
        ...currentState.nightActions,
        pendingWolfVictim: undefined,
        pendingPoisonVictim: undefined,
      },
    };
    setGameState(currentState);

    // 检查猎人开枪（被狼杀死的猎人可以开枪，被毒死的不行）
    if (wolfVictim?.role === "Hunter" && currentState.roleAbilities.hunterCanShoot) {
      await handleHunterDeath(currentState, wolfVictim, true);
      return;
    }

    // 检查胜负
    const winner = checkWinCondition(currentState);
    if (winner) {
      await endGame(currentState, winner);
      return;
    }

    // 进入讨论阶段
    currentState = transitionPhase(currentState, "DAY_SPEECH");
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.dayDiscussion);

    const alivePlayers = currentState.players.filter((p) => p.alive);
    const startSeat = alivePlayers.length > 0
      ? alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat
      : null;
    const firstSpeaker = startSeat !== null
      ? alivePlayers.find((p) => p.seat === startSeat) || null
      : null;
    currentState = { ...currentState, daySpeechStartSeat: startSeat, currentSpeakerSeat: firstSpeaker?.seat ?? null };

    setDialogue("主持人", "请各位玩家依次发言", false);
    setGameState(currentState);

    await delay(1500);

    if (firstSpeaker && !firstSpeaker.isHuman) {
      await runAISpeech(currentState, firstSpeaker);
    } else if (firstSpeaker?.isHuman) {
      setDialogue("提示", UI_TEXT.yourTurn, false);
    }
  }, [runAISpeech]);

  const handleBadgeSignup = useCallback(async (wants: boolean) => {
    const state = gameStateRef.current;
    if (state.phase !== "DAY_BADGE_SIGNUP") return;
    const human = state.players.find((p) => p.isHuman);
    if (!human?.alive) return;
    if (typeof state.badge.signup?.[human.playerId] === "boolean") return;

    const nextState: GameState = {
      ...state,
      badge: {
        ...state.badge,
        signup: { ...state.badge.signup, [human.playerId]: wants },
      },
    };
    setGameState(nextState);
    gameStateRef.current = nextState;
    await maybeStartBadgeSpeechAfterSignup(nextState);
  }, []);

  const startBadgeSpeechPhase = useCallback(async (state: GameState) => {
    let currentState = transitionPhase(state, "DAY_BADGE_SPEECH");
    currentState = { ...currentState, currentSpeakerSeat: null, daySpeechStartSeat: null };

    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.badgeSpeechStart);
    setDialogue("主持人", SYSTEM_MESSAGES.badgeSpeechStart, false);

    const candidates = currentState.badge.candidates || [];
    const candidatePlayers = currentState.players.filter((p) => p.alive && candidates.includes(p.seat));
    const startSeat = candidatePlayers.length > 0
      ? candidatePlayers[Math.floor(Math.random() * candidatePlayers.length)].seat
      : null;
    const firstSpeaker = startSeat !== null
      ? candidatePlayers.find((p) => p.seat === startSeat) || null
      : null;

    currentState = {
      ...currentState,
      daySpeechStartSeat: startSeat,
      currentSpeakerSeat: firstSpeaker?.seat ?? null,
    };

    setGameState(currentState);
    gameStateRef.current = currentState;

    badgeSpeechEndRef.current = async (s: GameState) => {
      await startBadgeElectionPhase(s);
    };

    await delay(900);

    if (firstSpeaker && !firstSpeaker.isHuman) {
      await runAISpeech(currentState, firstSpeaker);
    } else if (firstSpeaker?.isHuman) {
      setDialogue("提示", UI_TEXT.yourTurn, false);
    }
  }, [runAISpeech]);

  const startBadgeElectionPhase = useCallback(async (state: GameState) => {
    const isRevote = state.phase === "DAY_BADGE_ELECTION";
    let currentState = isRevote ? state : transitionPhase(state, "DAY_BADGE_ELECTION");

    currentState = {
      ...currentState,
      currentSpeakerSeat: null,
      badge: {
        ...currentState.badge,
        votes: isRevote ? currentState.badge.votes : {},
        revoteCount: isRevote ? currentState.badge.revoteCount : 0,
      },
    };

    if (!isRevote) {
      currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.badgeElectionStart);
    }

    setDialogue("主持人", UI_TEXT.badgeVotePrompt, false);
    setGameState(currentState);
    gameStateRef.current = currentState;

    // Candidates don't vote - only non-candidates vote
    const candidates = currentState.badge.candidates || [];
    const aiPlayers = currentState.players.filter((p) => p.alive && !p.isHuman && !candidates.includes(p.seat));
    for (const aiPlayer of aiPlayers) {
      if (gameStateRef.current.phase !== "DAY_BADGE_ELECTION") break;
      setIsWaitingForAI(true);
      const latestState = gameStateRef.current;
      let targetSeat = await generateAIBadgeVote(apiKey!, latestState, aiPlayer);

      const candidates = latestState.badge.candidates || [];
      if (candidates.length > 0 && !candidates.includes(targetSeat)) {
        targetSeat = candidates[Math.floor(Math.random() * candidates.length)];
      }

      if (gameStateRef.current.phase !== "DAY_BADGE_ELECTION") break;
      const nextState: GameState = {
        ...gameStateRef.current,
        badge: {
          ...gameStateRef.current.badge,
          votes: { ...gameStateRef.current.badge.votes, [aiPlayer.playerId]: targetSeat },
        },
      };
      setGameState(nextState);
      gameStateRef.current = nextState;
      await maybeResolveBadgeElection(nextState);
    }
    setIsWaitingForAI(false);

    // If human is not alive or is a candidate (candidates don't vote), resolve immediately
    const human = currentState.players.find((p) => p.isHuman);
    const humanIsCandidate = human && candidates.includes(human.seat);
    if (!human?.alive || humanIsCandidate) {
      await maybeResolveBadgeElection(gameStateRef.current);
    }
  }, [apiKey, maybeResolveBadgeElection]);

  // 推进到下一句话（用户按 Enter/Right/点击 时调用）
  const advanceSpeech = useCallback(async (): Promise<{ finished: boolean; shouldAdvanceToNextSpeaker: boolean }> => {
    if (gameStateRef.current.phase.includes("NIGHT")) {
      // 夜晚：用于"查验结果"等需要玩家确认后再继续的流程
      const cont = nightContinueRef.current;
      if (cont) {
        nightContinueRef.current = null;
        clearDialogue();
        setIsWaitingForAI(false);
        setWaitingForNextRound(false);
        await cont(gameStateRef.current);
        return { finished: true, shouldAdvanceToNextSpeaker: false };
      }

      // 夜晚没有待确认的推进逻辑时，不做任何事，避免误触把提示清空
      return { finished: false, shouldAdvanceToNextSpeaker: false };
    }

    const queue = speechQueueRef.current;
    if (!queue) {
      // 没有队列，可能是等待下一轮
      return { finished: false, shouldAdvanceToNextSpeaker: false };
    }

    const { segments, currentIndex, player, afterSpeech } = queue;
    
    // 将当前句子添加到消息列表
    const currentSegment = segments[currentIndex];
    if (currentSegment) {
      const newState = addPlayerMessage(gameStateRef.current, player.playerId, currentSegment);
      setGameState(newState);
    }

    const nextIndex = currentIndex + 1;
    
    if (nextIndex < segments.length) {
      // 还有下一句，显示它
      speechQueueRef.current = { ...queue, currentIndex: nextIndex };
      setCurrentDialogue({ speaker: player.displayName, text: segments[nextIndex], isStreaming: true });
      return { finished: false, shouldAdvanceToNextSpeaker: false };
    } else {
      // 发言结束
      speechQueueRef.current = null;
      clearDialogue();
      setIsWaitingForAI(false);

      if (afterSpeech) {
        await afterSpeech(gameStateRef.current);
        return { finished: true, shouldAdvanceToNextSpeaker: false };
      }

      // 等待用户点击"下一轮"按钮
      setWaitingForNextRound(true);
      return { finished: true, shouldAdvanceToNextSpeaker: true };
    }
  }, [clearDialogue]);

  // 下一个发言者
  const moveToNextSpeaker = useCallback(async (state: GameState) => {
    if (!isSpeechLikePhase(state.phase)) {
      console.warn("[wolfcha] moveToNextSpeaker called outside speech phase:", state.phase);
      return;
    }

    const getNextCandidateSeat = (): number | null => {
      const candidates = state.badge.candidates || [];
      const aliveCandidateSeats = candidates.filter((seat) => state.players.some((p) => p.seat === seat && p.alive));
      if (aliveCandidateSeats.length === 0) return null;

      const total = state.players.length;
      let cursor = (state.currentSpeakerSeat ?? -1) + 1;
      for (let step = 0; step < total; step++) {
        const seat = ((cursor + step) % total + total) % total;
        if (aliveCandidateSeats.includes(seat)) return seat;
      }
      return null;
    };

    const nextSeat = state.phase === "DAY_BADGE_SPEECH"
      ? getNextCandidateSeat()
      : getNextAliveSeat(state, state.currentSpeakerSeat ?? -1);

    const startSeat = state.daySpeechStartSeat;
    if (nextSeat === null) {
      if (state.phase === "DAY_BADGE_SPEECH") {
        const next = badgeSpeechEndRef.current;
        badgeSpeechEndRef.current = null;
        if (next) await next(state);
        return;
      }
      await startVotePhase(state);
      return;
    }

    // 绕一圈回到起点则结束发言，进入投票
    if (startSeat !== null && nextSeat === startSeat) {
      if (state.phase === "DAY_BADGE_SPEECH") {
        const next = badgeSpeechEndRef.current;
        badgeSpeechEndRef.current = null;
        if (next) await next(state);
        return;
      }
      await startVotePhase(state);
      return;
    }

    const currentState = { ...state, currentSpeakerSeat: nextSeat };
    setGameState(currentState);

    const nextPlayer = currentState.players.find((p) => p.seat === nextSeat);
    if (nextPlayer && !nextPlayer.isHuman) {
      await runAISpeech(currentState, nextPlayer);
    } else if (nextPlayer?.isHuman) {
      setDialogue("提示", UI_TEXT.yourTurn, false);
    }
  }, []);

  // 投票阶段
  const startVotePhase = useCallback(async (state: GameState) => {
    let currentState = transitionPhase(state, "DAY_VOTE");
    currentState = { ...currentState, currentSpeakerSeat: null, votes: {} };
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.voteStart);
    setDialogue("主持人", humanPlayer?.alive ? UI_TEXT.votePrompt : UI_TEXT.aiVoting, false);
    setGameState(currentState);
    gameStateRef.current = currentState;

    if (humanPlayer?.alive) {
      setDialogue("提示", UI_TEXT.clickToVote, false);
    }

    const aiPlayers = currentState.players.filter((p) => p.alive && !p.isHuman);
    for (const aiPlayer of aiPlayers) {
      if (gameStateRef.current.phase !== "DAY_VOTE") break;
      setIsWaitingForAI(true);
      const latestState = gameStateRef.current;
      const targetSeat = await generateAIVote(apiKey!, latestState, aiPlayer);

      if (gameStateRef.current.phase !== "DAY_VOTE") break;

      const nextState = {
        ...gameStateRef.current,
        votes: { ...gameStateRef.current.votes, [aiPlayer.playerId]: targetSeat },
      };
      setGameState(nextState);
      gameStateRef.current = nextState;
      await maybeResolveVotes(nextState);
    }
    setIsWaitingForAI(false);

    if (!humanPlayer?.alive) {
      await maybeResolveVotes(gameStateRef.current);
    }
  }, [apiKey, humanPlayer, maybeResolveVotes]);

  // 结算投票
  const resolveVotes = useCallback(async (state: GameState) => {
    let currentState = transitionPhase(state, "DAY_RESOLVE");
    
    // 记录投票历史
    const currentVotes = { ...state.votes };
    const newHistory = { ...state.voteHistory, [state.day]: currentVotes };
    currentState = { ...currentState, voteHistory: newHistory };
    
    setGameState(currentState);

    const result = tallyVotes(currentState);

    if (result) {
      currentState = killPlayer(currentState, result.seat);
      const executed = currentState.players.find((p) => p.seat === result.seat);
      currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.playerExecuted(result.seat + 1, executed?.displayName || "", result.count));
      setDialogue("主持人", SYSTEM_MESSAGES.playerExecuted(result.seat + 1, executed?.displayName || "", result.count), false);
    } else {
      currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.voteTie);
      setDialogue("主持人", SYSTEM_MESSAGES.voteTie, false);
    }

    setGameState(currentState);

    const winner = checkWinCondition(currentState);
    if (winner) {
      await endGame(currentState, winner);
      return;
    }

    const proceedToNight = async (s: GameState) => {
      // 不阻塞 UI：先切到夜晚，再后台生成每日总结
      void maybeGenerateDailySummary(s)
        .then((summarized) => {
          setGameState((prev) => {
            if (prev.gameId !== summarized.gameId) return prev;
            return { ...prev, dailySummaries: summarized.dailySummaries };
          });
        })
        .catch(() => {
          // ignore
        });

      await delay(350);

      let nextState = { ...s, day: s.day + 1, nightActions: {} };
      nextState = transitionPhase(nextState, "NIGHT_START");
      nextState = addSystemMessage(nextState, SYSTEM_MESSAGES.nightFall(nextState.day));
      setGameState(nextState);

      await delay(250);
      await runNightPhase(nextState);
    };

    if (result) {
      const executedPlayer = currentState.players.find((p) => p.seat === result.seat);
      
      await delay(800);
      await startLastWordsPhase(currentState, result.seat, async (s) => {
        // 检查被处决的是否是猎人（可以开枪）
        if (executedPlayer?.role === "Hunter" && s.roleAbilities.hunterCanShoot) {
          await handleHunterDeath(s, executedPlayer, false); // false = 白天被处决
          return;
        }
        
        // 再次检查胜负（猎人开枪可能改变局势）
        const winnerAfterLastWords = checkWinCondition(s);
        if (winnerAfterLastWords) {
          await endGame(s, winnerAfterLastWords);
          return;
        }
        
        await proceedToNight(s);
      });
      return;
    }

    await proceedToNight(currentState);
  }, [startLastWordsPhase, runNightPhase, setGameState, setDialogue, maybeGenerateDailySummary]);

  useEffect(() => {
    resolveVotesRef.current = resolveVotes;
  }, [resolveVotes]);

  // 游戏结束
  const endGame = useCallback(async (state: GameState, winner: "village" | "wolf") => {
    let currentState = transitionPhase(state, "GAME_END");
    currentState = { ...currentState, winner };

    const getRoleName = (role: string) => {
      switch (role) {
        case "Werewolf": return "狼人";
        case "Seer": return "预言家";
        case "Witch": return "女巫";
        case "Hunter": return "猎人";
        case "Guard": return "守卫";
        default: return "村民";
      }
    };
    const roleReveal = currentState.players
      .map((p) => `${p.seat + 1}号 ${p.displayName}: ${getRoleName(p.role)}`)
      .join(" | ");

    currentState = addSystemMessage(currentState, winner === "village" ? SYSTEM_MESSAGES.villageWin : SYSTEM_MESSAGES.wolfWin);
    currentState = addSystemMessage(currentState, `身份揭晓：${roleReveal}`);
    setDialogue("主持人", winner === "village" ? "好人阵营胜利，村庄恢复了和平" : "狼人阵营胜利，村庄陷入黑暗", false);

    setGameState(currentState);
  }, []);

  // 人类发言（不自动结束，可多次发言）
  const handleHumanSpeech = useCallback(async () => {
    if (!inputText.trim() || !humanPlayer) return;

    const s = gameStateRef.current;
    const isMyTurn = (s.phase === "DAY_SPEECH" || s.phase === "DAY_LAST_WORDS" || s.phase === "DAY_BADGE_SPEECH") && s.currentSpeakerSeat === humanPlayer.seat;
    if (!isMyTurn) return;

    const speech = inputText.trim();
    setInputText("");

    const currentState = addPlayerMessage(gameStateRef.current, humanPlayer.playerId, speech);
    setGameState(currentState);
  }, [inputText, humanPlayer]);

  // 人类结束发言 - 自动进入下一位
  const handleFinishSpeaking = useCallback(async () => {
    if (!humanPlayer) return;

    if (gameState.phase === "DAY_LAST_WORDS") {
      const next = afterLastWordsRef.current;
      afterLastWordsRef.current = null;
      if (next) {
        await delay(500);
        await next(gameState);
      }
      return;
    }

    // 直接进入下一位发言
    await delay(300);
    await moveToNextSpeaker(gameStateRef.current);
  }, [humanPlayer, moveToNextSpeaker]);

  // 下一轮按钮处理
  const handleNextRound = useCallback(async () => {
    if (!isSpeechLikePhase(gameStateRef.current.phase)) {
      return;
    }

    setWaitingForNextRound(false);
    await delay(300);
    await moveToNextSpeaker(gameStateRef.current);
  }, [moveToNextSpeaker]);

  // 人类投票
  const handleHumanVote = useCallback(async (targetSeat: number) => {
    if (!humanPlayer) return;

    const baseState = gameStateRef.current;
    if (baseState.phase !== "DAY_VOTE" && baseState.phase !== "DAY_BADGE_ELECTION") return;

    if (baseState.phase === "DAY_BADGE_ELECTION") {
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
      await maybeResolveBadgeElection(nextState);
      return;
    }

    const nextState: GameState = {
      ...baseState,
      votes: { ...baseState.votes, [humanPlayer.playerId]: targetSeat },
    };
    setGameState(nextState);
    gameStateRef.current = nextState;

    await delay(200);
    await maybeResolveVotes(nextState);
  }, [humanPlayer, maybeResolveVotes, maybeResolveBadgeElection]);

  // 夜晚行动 - 支持所有角色
  const handleNightAction = useCallback(async (targetSeat: number, witchAction?: "save" | "poison" | "pass") => {
    if (!humanPlayer) return;
    if (!humanPlayer.alive && gameState.phase !== "HUNTER_SHOOT") return;

    let currentState = gameState;

    // === 守卫保护 ===
    if (gameState.phase === "NIGHT_GUARD_ACTION" && humanPlayer.role === "Guard") {
      if (currentState.nightActions.lastGuardTarget === targetSeat) {
        toast.error("守卫不能连续两晚守护同一人");
        return;
      }
      const targetPlayer = currentState.players.find((p) => p.seat === targetSeat);
      currentState = {
        ...currentState,
        nightActions: { ...currentState.nightActions, guardTarget: targetSeat },
      };
      setDialogue("系统", `你保护了 ${targetSeat + 1}号 ${targetPlayer?.displayName}`, false);
      setGameState(currentState);

      await delay(1000);
      // 继续狼人行动
      await continueNightAfterGuard(currentState);
    }
    // === 狼人击杀 ===
    else if (gameState.phase === "NIGHT_WOLF_ACTION" && humanPlayer.role === "Werewolf") {
      const targetPlayer = currentState.players.find((p) => p.seat === targetSeat);
      const wolves = currentState.players.filter((p) => p.role === "Werewolf" && p.alive);
      const existingVotes: Record<string, number> = { ...(currentState.nightActions.wolfVotes || {}) };
      existingVotes[humanPlayer.playerId] = targetSeat;

      currentState = {
        ...currentState,
        nightActions: { ...currentState.nightActions, wolfVotes: existingVotes, wolfTarget: undefined },
      };
      setDialogue("系统", `你投票选择袭击 ${targetSeat + 1}号 ${targetPlayer?.displayName}，等待队友投票...`, false);
      setGameState(currentState);

      const aiWolves = wolves.filter((w) => !w.isHuman);
      if (aiWolves.length > 0) {
        setIsWaitingForAI(true);
        for (const w of aiWolves) {
          await randomDelay(500, 1200);
          const voteSeat = await generateWolfAction(apiKey!, currentState, w, existingVotes);
          existingVotes[w.playerId] = voteSeat;
          currentState = {
            ...currentState,
            nightActions: { ...currentState.nightActions, wolfVotes: existingVotes },
          };
          setGameState(currentState);
        }
        setIsWaitingForAI(false);
      }

      const chosenSeat = computeUniqueTopSeat(existingVotes);
      if (chosenSeat === null) {
        // 平票：清空投票，要求人狼重新投
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, wolfVotes: {} },
        };
        setGameState(currentState);
        setDialogue("系统", "狼队投票出现平票，请重新投票。", false);
        return;
      }

      currentState = {
        ...currentState,
        nightActions: { ...currentState.nightActions, wolfVotes: existingVotes, wolfTarget: chosenSeat },
      };
      setGameState(currentState);

      await delay(800);
      await continueNightAfterWolf(currentState);
    }
    // === 女巫用药 ===
    else if (gameState.phase === "NIGHT_WITCH_ACTION" && humanPlayer.role === "Witch") {
      if (witchAction === "save" && !currentState.roleAbilities.witchHealUsed) {
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, witchSave: true },
          roleAbilities: { ...currentState.roleAbilities, witchHealUsed: true },
        };
        setDialogue("系统", "你使用了解药", false);
      } else if (witchAction === "poison" && !currentState.roleAbilities.witchPoisonUsed) {
        const targetPlayer = currentState.players.find((p) => p.seat === targetSeat);
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, witchPoison: targetSeat },
          roleAbilities: { ...currentState.roleAbilities, witchPoisonUsed: true },
        };
        setDialogue("系统", `你对 ${targetSeat + 1}号 ${targetPlayer?.displayName} 使用了毒药`, false);
      } else {
        setDialogue("系统", "你选择不使用药水", false);
      }
      setGameState(currentState);

      await delay(800);
      await continueNightAfterWitch(currentState);
    }
    // === 预言家查验 ===
    else if (gameState.phase === "NIGHT_SEER_ACTION" && humanPlayer.role === "Seer") {
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
      setDialogue("查验结果", `${targetSeat + 1}号 ${targetPlayer?.displayName} 是${isWolf ? "狼人" : "好人"}`, false);
      setGameState(currentState);

      // 关键：查验结果需要给玩家时间确认，避免被后续主持人消息覆盖
      nightContinueRef.current = async (s) => {
        await resolveNight(s);
      };
      return;
    }
    // === 猎人开枪 ===
    else if (gameState.phase === "HUNTER_SHOOT" && humanPlayer.role === "Hunter") {
      if (targetSeat >= 0) {
        currentState = killPlayer(currentState, targetSeat);
        const target = currentState.players.find((p) => p.seat === targetSeat);
        if (target) {
          currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.hunterShoot(humanPlayer.seat + 1, targetSeat + 1, target.displayName));
          setDialogue("主持人", SYSTEM_MESSAGES.hunterShoot(humanPlayer.seat + 1, targetSeat + 1, target.displayName), false);
        }
        setGameState(currentState);
      }

      const winner = checkWinCondition(currentState);
      if (winner) {
        await endGame(currentState, winner);
        return;
      }

      await delay(1200);
      currentState = transitionPhase(currentState, "DAY_START");
      currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.dayBreak);
      setGameState(currentState);

      await delay(800);
      await startDayPhase(currentState);
    }
  }, [apiKey, gameState, humanPlayer, resolveNight]);

  // 守卫行动后继续夜晚流程
  const continueNightAfterGuard = useCallback(async (state: GameState) => {
    let currentState = transitionPhase(state, "NIGHT_WOLF_ACTION");
    setGameState(currentState);

    const wolves = currentState.players.filter((p) => p.role === "Werewolf" && p.alive);
    const humanWolf = wolves.find((w) => w.isHuman);

    if (humanWolf) {
      setDialogue("系统", UI_TEXT.waitingWolf, false);
      return;
    }

    if (wolves.length > 0) {
      setIsWaitingForAI(true);
      setDialogue("系统", UI_TEXT.wolfActing, false);
      let wolfVotes: Record<string, number> = {};
      const maxRevotes = 3;
      for (let round = 1; round <= maxRevotes; round++) {
        wolfVotes = {};
        for (const wolf of wolves) {
          const targetSeat = await generateWolfAction(apiKey!, currentState, wolf, wolfVotes);
          wolfVotes[wolf.playerId] = targetSeat;
        }
        const chosenSeat = computeUniqueTopSeat(wolfVotes);
        currentState = { ...currentState, nightActions: { ...currentState.nightActions, wolfVotes, wolfTarget: chosenSeat ?? undefined } };
        setGameState(currentState);
        if (chosenSeat !== null) break;
        await delay(600);
      }
      if (currentState.nightActions.wolfTarget === undefined) {
        const counts: Record<number, number> = {};
        for (const seat of Object.values(wolfVotes)) {
          counts[seat] = (counts[seat] || 0) + 1;
        }
        const entries = Object.entries(counts);
        let max = -1;
        for (const [, c] of entries) max = Math.max(max, c);
        const topSeats = entries.filter(([, c]) => c === max).map(([s]) => Number(s));
        const fallbackSeat = topSeats[Math.floor(Math.random() * topSeats.length)];
        currentState = { ...currentState, nightActions: { ...currentState.nightActions, wolfVotes, wolfTarget: fallbackSeat } };
        setGameState(currentState);
      }
      setIsWaitingForAI(false);
    }

    await delay(800);
    await continueNightAfterWolf(currentState);
  }, [apiKey]);

  // 狼人行动后继续夜晚流程
  const continueNightAfterWolf = useCallback(async (state: GameState) => {
    let currentState = transitionPhase(state, "NIGHT_WITCH_ACTION");
    setGameState(currentState);

    const witch = currentState.players.find((p) => p.role === "Witch" && p.alive);
    const canWitchAct = witch && (!currentState.roleAbilities.witchHealUsed || !currentState.roleAbilities.witchPoisonUsed);

    if (witch && canWitchAct) {
      if (witch.isHuman) {
        const wolfTarget = currentState.nightActions.wolfTarget;
        const canSeeVictim = !currentState.roleAbilities.witchHealUsed && wolfTarget !== undefined;
        const victim = canSeeVictim ? currentState.players.find((p) => p.seat === wolfTarget) : null;
        
        let dialogueText = "";
        if (canSeeVictim && victim) {
          dialogueText = `狼人袭击了 ${wolfTarget! + 1}号 ${victim.displayName}，是否使用药水？`;
        } else if (currentState.roleAbilities.witchHealUsed) {
          dialogueText = "解药已用，无法感知刀口。是否使用毒药？";
        } else {
          dialogueText = "今晚无人被袭击，是否使用毒药？";
        }
        setDialogue("系统", dialogueText, false);
        return;
      }
      setIsWaitingForAI(true);
      setDialogue("系统", UI_TEXT.witchActing, false);
      const witchAction = await generateWitchAction(apiKey!, currentState, witch, currentState.nightActions.wolfTarget);
      if (witchAction.type === "save") {
        currentState = { ...currentState, nightActions: { ...currentState.nightActions, witchSave: true }, roleAbilities: { ...currentState.roleAbilities, witchHealUsed: true } };
      } else if (witchAction.type === "poison" && witchAction.target !== undefined) {
        currentState = { ...currentState, nightActions: { ...currentState.nightActions, witchPoison: witchAction.target }, roleAbilities: { ...currentState.roleAbilities, witchPoisonUsed: true } };
      }
      setGameState(currentState);
      setIsWaitingForAI(false);
    }

    await delay(800);
    await continueNightAfterWitch(currentState);
  }, [apiKey]);

  // 女巫行动后继续夜晚流程
  const continueNightAfterWitch = useCallback(async (state: GameState) => {
    let currentState = transitionPhase(state, "NIGHT_SEER_ACTION");
    setGameState(currentState);

    const seer = currentState.players.find((p) => p.role === "Seer" && p.alive);
    if (seer) {
      if (seer.isHuman) {
        setDialogue("系统", UI_TEXT.waitingSeer, false);
        return;
      }
      setIsWaitingForAI(true);
      setDialogue("系统", UI_TEXT.seerChecking, false);
      const targetSeat = await generateSeerAction(apiKey!, currentState, seer);
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
      setGameState(currentState);
      setIsWaitingForAI(false);
    }

    await delay(1000);
    await resolveNight(currentState);
  }, [apiKey, resolveNight]);

  const continueAfterRoleReveal = useCallback(async () => {
    const pending = pendingStartStateRef.current;
    if (!pending) return;
    if (hasContinuedAfterRevealRef.current) return;

    hasContinuedAfterRevealRef.current = true;
    pendingStartStateRef.current = null;
    isAwaitingRoleRevealRef.current = false;

    await runNightPhase(pending);
  }, [runNightPhase]);

  // 重新开始
  const restartGame = useCallback(() => {
    setGameState(createInitialGameState());
    setCurrentDialogue(null);
    setInputText("");
    setShowTable(false);
    setApiKeyConfirmed(false);

    pendingStartStateRef.current = null;
    hasContinuedAfterRevealRef.current = false;
    isAwaitingRoleRevealRef.current = false;
    badgeSpeechEndRef.current = null;
    if (showTableTimeoutRef.current !== null) {
      window.clearTimeout(showTableTimeoutRef.current);
      showTableTimeoutRef.current = null;
    }
  }, []);

  return {
    // State
    apiKey: apiKey || "",
    humanName: humanName || "",
    setHumanName,
    apiKeyConfirmed,
    setApiKeyConfirmed,
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
    handleBadgeSignup,
    handleHumanVote,
    handleNightAction,
    handleNextRound,
    scrollToBottom,
    advanceSpeech,
  };
}
