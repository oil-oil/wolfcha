"use client";

import { useCallback, useRef } from "react";
import { useAtom } from "jotai";
import { getI18n } from "@/i18n/translator";
import type { GameState, Player } from "@/types/game";
import { gameStateAtom } from "@/store/game-machine";
import {
  transitionPhase,
  addSystemMessage,
  generateAIBadgeVote,
  generateAIBadgeSignupBatch,
  generateBadgeTransfer,
  BADGE_VOTE_ABSTAIN,
  BADGE_TRANSFER_TORN,
} from "@/lib/game-master";
import { getSystemMessages, getUiText } from "@/lib/game-texts";
import { DELAY_CONFIG, GAME_CONFIG } from "@/lib/game-constants";
import { delay, type FlowToken } from "@/lib/game-flow-controller";
import { playNarrator } from "@/lib/narrator-audio-player";

export interface BadgePhaseCallbacks {
  setDialogue: (speaker: string, text: string, isStreaming?: boolean) => void;
  clearDialogue: () => void;
  setIsWaitingForAI: (waiting: boolean) => void;
  waitForUnpause: () => Promise<void>;
  isTokenValid: (token: FlowToken) => boolean;
  onBadgeElectionComplete: (state: GameState) => Promise<void>;
  onBadgeTransferComplete: (state: GameState) => Promise<void>;
  runAISpeech: (state: GameState, player: Player) => Promise<void>;
}

export interface BadgePhaseActions {
  startBadgeSignupPhase: (state: GameState) => Promise<void>;
  startBadgeSpeechPhase: (state: GameState) => Promise<void>;
  startBadgeElectionPhase: (state: GameState, options?: { isRevote?: boolean }) => Promise<void>;
  handleBadgeSignup: (wants: boolean) => Promise<void>;
  handleBadgeTransfer: (state: GameState, sheriff: Player, afterTransfer: (s: GameState) => Promise<void>) => Promise<void>;
  handleHumanBadgeTransfer: (targetSeat: number) => Promise<void>;
  maybeResolveBadgeElection: (state: GameState) => Promise<void>;
}

/**
 * 警长竞选阶段 Hook
 * 负责管理警长竞选报名、发言、投票、移交等流程
 */
export function useBadgePhase(
  callbacks: BadgePhaseCallbacks
): BadgePhaseActions {
  const getTexts = () => {
    const { t } = getI18n();
    return {
      t,
      systemMessages: getSystemMessages(),
      uiText: getUiText(),
      speakerHost: t("speakers.host"),
      speakerHint: t("speakers.hint"),
      speakerSystem: t("speakers.system"),
    };
  };
  const [gameState, setGameState] = useAtom(gameStateAtom);

  const {
    setDialogue,
    clearDialogue,
    setIsWaitingForAI,
    waitForUnpause,
    isTokenValid,
    onBadgeElectionComplete,
    onBadgeTransferComplete,
    runAISpeech,
  } = callbacks;

  // 使用 ref 打破循环依赖
  const startBadgeSpeechPhaseRef = useRef<(state: GameState) => Promise<void>>(async () => {});
  const maybeStartBadgeSpeechAfterSignupRef = useRef<(state: GameState) => Promise<void>>(async () => {});
  
  // 用于保存人类警长移交时的回调
  const humanBadgeTransferCallbackRef = useRef<((state: GameState) => Promise<void>) | null>(null);
  
  // 用于在 AI 投票循环中获取最新状态
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  // Prevent concurrent AI signup runs
  const aiSignupPromiseRef = useRef<Promise<GameState> | null>(null);

  /** 生成警长投票详情 */
  const generateBadgeVoteDetails = useCallback((
    votes: Record<string, number>,
    players: Player[],
    candidates: number[] = []
  ): string => {
    const { t } = getI18n();
    const aliveById = new Set(players.filter((p) => p.alive).map((p) => p.playerId));
    const aliveBySeat = new Set(players.filter((p) => p.alive).map((p) => p.seat));
    const candidateSet = new Set(candidates);
    const badgeVoteGroups: Record<number, number[]> = {};
    Object.entries(votes).forEach(([playerId, targetSeat]) => {
      if (!aliveById.has(playerId)) return;
      if (!aliveBySeat.has(targetSeat)) return;
      if (candidateSet.size > 0 && !candidateSet.has(targetSeat)) return;
      const voter = players.find(p => p.playerId === playerId);
      if (voter) {
        if (!badgeVoteGroups[targetSeat]) badgeVoteGroups[targetSeat] = [];
        badgeVoteGroups[targetSeat].push(voter.seat);
      }
    });

    const badgeVoteResults = Object.entries(badgeVoteGroups)
      .sort(([, votersA], [, votersB]) => votersB.length - votersA.length)
      .map(([targetSeat, voters]) => {
        const target = players.find(p => p.seat === Number(targetSeat));
        return {
          targetSeat: Number(targetSeat),
          targetName: target?.displayName || t("common.unknown"),
          voterSeats: voters,
          voteCount: voters.length
        };
      });

    return `[VOTE_RESULT]${JSON.stringify({ title: t("badgePhase.voteDetailTitle"), results: badgeVoteResults })}`;
  }, []);

  // 用于防止重复结算的标志
  const isResolvingBadgeElectionRef = useRef(false);

  /** 开始警徽PK发言 */
  const startBadgePkSpeech = useCallback(async (state: GameState, pkTargets: number[]) => {
    const texts = getTexts();
    let currentState = transitionPhase(state, "DAY_PK_SPEECH");
    const firstSeat = pkTargets[0] ?? null;
    currentState = {
      ...currentState,
      pkTargets,
      pkSource: "badge",
      currentSpeakerSeat: firstSeat,
      daySpeechStartSeat: firstSeat,
      badge: {
        ...currentState.badge,
        candidates: pkTargets,
        votes: {},
      },
    };
    currentState = addSystemMessage(currentState, texts.t("badgePhase.tiePk"));
    setGameState(currentState);
    setDialogue(texts.speakerHost, texts.t("badgePhase.tiePk"), false);

    await delay(DELAY_CONFIG.DIALOGUE);
    await waitForUnpause();

    const firstSpeaker = currentState.players.find((p) => p.seat === firstSeat);
    if (firstSpeaker && !firstSpeaker.isHuman) {
      await runAISpeech(currentState, firstSpeaker);
    } else if (firstSpeaker?.isHuman) {
      setDialogue(texts.speakerHint, texts.uiText.yourTurn, false);
    }
  }, [setGameState, setDialogue, waitForUnpause, runAISpeech]);

  /** 结算警长竞选投票 */
  const maybeResolveBadgeElection = useCallback(async (state: GameState) => {
    const texts = getTexts();
    if (state.phase !== "DAY_BADGE_ELECTION") return;
    
    // 防止重复结算
    if (isResolvingBadgeElectionRef.current) return;
    
    // 如果警长已经选出，不再结算
    if (state.badge.holderSeat !== null) return;

    const candidates = state.badge.candidates || [];
    const voters = state.players.filter((p) => p.alive && !candidates.includes(p.seat));
    const voterIds = voters.map((p) => p.playerId);
    const allVoted = voterIds.every((id) => typeof state.badge.votes[id] === "number");
    if (!allVoted) return;
    
    // 设置结算中标志
    isResolvingBadgeElectionRef.current = true;

    // 计票
    const aliveById = new Set(state.players.filter((p) => p.alive).map((p) => p.playerId));
    const aliveBySeat = new Set(state.players.filter((p) => p.alive).map((p) => p.seat));
    const candidateSet = new Set(candidates);
    const counts: Record<number, number> = {};
    for (const [voterId, seat] of Object.entries(state.badge.votes)) {
      if (!aliveById.has(voterId)) continue;
      if (!aliveBySeat.has(seat)) continue;
      if (candidateSet.size > 0 && !candidateSet.has(seat)) continue;
      counts[seat] = (counts[seat] || 0) + 1;
    }
    const entries = Object.entries(counts);
    let max = -1;
    for (const [, c] of entries) max = Math.max(max, c);
    const topSeats = entries.filter(([, c]) => c === max).map(([s]) => Number(s));

    // 平票处理
    if (topSeats.length !== 1) {
      const revoteCount = (state.badge.revoteCount || 0) + 1;

      // 第二轮仍平票：自动撕毁（本局无警长）
      if (revoteCount >= GAME_CONFIG.MAX_BADGE_REVOTE_COUNT) {
        // 添加投票详情
        const badgeVoteDetailMessage = generateBadgeVoteDetails(state.badge.votes, state.players, state.badge.candidates || []);

        const badgeTieTearMessage = texts.t("badgePhase.tieTear" as never);

        let nextState: GameState = {
          ...state,
          badge: {
            ...state.badge,
            holderSeat: null,
            votes: {},
            candidates: [],
            revoteCount,
            history: { ...state.badge.history, [state.day]: { ...state.badge.votes } },
          },
        };

        nextState = addSystemMessage(nextState, badgeVoteDetailMessage);
        nextState = addSystemMessage(nextState, badgeTieTearMessage);

        setGameState(nextState);
        setDialogue(texts.speakerHost, badgeTieTearMessage, false);

        await delay(DELAY_CONFIG.DIALOGUE);
        isResolvingBadgeElectionRef.current = false;
        await onBadgeElectionComplete(nextState);
        return;
      }

      // 进入PK发言
      isResolvingBadgeElectionRef.current = false;
      const nextState: GameState = {
        ...state,
        badge: {
          ...state.badge,
          votes: {},
          revoteCount,
          candidates: topSeats,
        },
      };
      await startBadgePkSpeech(nextState, topSeats);
      return;
    }

    // 唯一最高票
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

    // 添加投票详情
    const badgeVoteDetailMessage = generateBadgeVoteDetails(state.badge.votes, state.players, state.badge.candidates || []);
    nextState = addSystemMessage(nextState, badgeVoteDetailMessage);
    nextState = addSystemMessage(nextState, texts.systemMessages.badgeElected(winnerSeat + 1, winner?.displayName || "", votedCount));

    setGameState(nextState);
    setDialogue(texts.speakerHost, texts.systemMessages.badgeElected(winnerSeat + 1, winner?.displayName || "", votedCount), false);

    await delay(DELAY_CONFIG.DIALOGUE);
    isResolvingBadgeElectionRef.current = false;
    await onBadgeElectionComplete(nextState);
  }, [setGameState, setDialogue, generateBadgeVoteDetails, onBadgeElectionComplete]);

  /** AI 报名决策（在用户决定后同时进行） */
  const resolveAIBadgeSignup = useCallback(async (state: GameState): Promise<GameState> => {
    if (aiSignupPromiseRef.current) {
      const resolved = await aiSignupPromiseRef.current;
      const fallback = gameStateRef.current ?? state;
      const base = resolved ?? fallback;
      return {
        ...base,
        badge: {
          ...base.badge,
          signup: { ...base.badge.signup, ...state.badge.signup },
        },
      };
    }

    const task = (async (): Promise<GameState> => {
      const baseState = gameStateRef.current ?? state;
      const alivePlayers = baseState.players.filter((p) => p.alive);
      const aiPlayers = alivePlayers.filter((p) => !p.isHuman);
      const pendingAI = aiPlayers.filter(
        (p) => typeof baseState.badge.signup?.[p.playerId] !== "boolean"
      );
      // If all AI have signed up, merge baseState (with AI signups) and state (with human signup)
      if (pendingAI.length === 0) {
        return {
          ...baseState,
          badge: {
            ...baseState.badge,
            signup: { ...baseState.badge.signup, ...state.badge.signup },
          },
        };
      }

      setIsWaitingForAI(true);
      try {
        const results = await generateAIBadgeSignupBatch(baseState, pendingAI);
        const latestState = gameStateRef.current ?? baseState;
        const mergedSignup = {
          ...latestState.badge.signup,
          ...baseState.badge.signup,
          ...results,
        };
        const nextState: GameState = {
          ...latestState,
          badge: {
            ...latestState.badge,
            signup: mergedSignup,
          },
        };
        setGameState(nextState);
        return nextState;
      } finally {
        setIsWaitingForAI(false);
      }
    })();

    aiSignupPromiseRef.current = task;
    try {
      return await task;
    } finally {
      aiSignupPromiseRef.current = null;
    }
  }, [setGameState, setIsWaitingForAI]);

  /** 开始警长竞选报名 */
  const startBadgeSignupPhase = useCallback(async (state: GameState) => {
    const texts = getTexts();
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

    currentState = addSystemMessage(currentState, texts.t("badgePhase.signupStart"));
    setGameState(currentState);
    clearDialogue();

    const alivePlayers = currentState.players.filter((p) => p.alive);
    const human = alivePlayers.find((p) => p.isHuman);
    if (!human) {
      const nextState = await resolveAIBadgeSignup(currentState);
      await maybeStartBadgeSpeechAfterSignupRef.current(nextState);
      return;
    }

    void resolveAIBadgeSignup(currentState);
  }, [setGameState, clearDialogue, resolveAIBadgeSignup]);

  /** 报名结束后检查是否开始发言 */
  const maybeStartBadgeSpeechAfterSignup = useCallback(async (state: GameState) => {
    const texts = getTexts();
    const alivePlayers = state.players.filter((p) => p.alive);
    const signup = state.badge.signup || {};
    const allDecided = alivePlayers.every((p) => typeof signup[p.playerId] === "boolean");
    if (!allDecided) return;

    const candidates = alivePlayers
      .filter((p) => signup[p.playerId] === true)
      .map((p) => p.seat);

    if (candidates.length === 0) {
      let nextState = addSystemMessage(state, texts.t("badgePhase.noSignup"));
      setGameState(nextState);
      setDialogue(texts.speakerHost, texts.t("badgePhase.noSignup"), false);
      await delay(DELAY_CONFIG.DIALOGUE);
      await onBadgeElectionComplete(nextState);
      return;
    }

    await startBadgeSpeechPhaseRef.current({
      ...state,
      badge: { ...state.badge, candidates },
    });
  }, [setGameState, setDialogue, onBadgeElectionComplete]);

  /** 人类报名处理 */
  const handleBadgeSignup = useCallback(async (wants: boolean) => {
    if (gameState.phase !== "DAY_BADGE_SIGNUP") return;
    const human = gameState.players.find((p) => p.isHuman);
    if (!human?.alive) return;
    if (typeof gameState.badge.signup?.[human.playerId] === "boolean") return;

    let nextState: GameState = {
      ...gameState,
      badge: {
        ...gameState.badge,
        signup: { ...gameState.badge.signup, [human.playerId]: wants },
      },
    };
    setGameState(nextState);
    nextState = await resolveAIBadgeSignup(nextState);
    await maybeStartBadgeSpeechAfterSignup(nextState);
  }, [gameState, setGameState, resolveAIBadgeSignup, maybeStartBadgeSpeechAfterSignup]);

  /** 开始警长竞选发言 */
  const startBadgeSpeechPhase = useCallback(async (state: GameState) => {
    const texts = getTexts();
    let currentState = transitionPhase(state, "DAY_BADGE_SPEECH");
    currentState = { ...currentState, currentSpeakerSeat: null, daySpeechStartSeat: null };

    currentState = addSystemMessage(currentState, texts.systemMessages.badgeSpeechStart);
    setDialogue(texts.speakerHost, texts.systemMessages.badgeSpeechStart, false);

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

    await delay(DELAY_CONFIG.DIALOGUE);
    await waitForUnpause();

    if (firstSpeaker && !firstSpeaker.isHuman) {
      await runAISpeech(currentState, firstSpeaker);
    } else if (firstSpeaker?.isHuman) {
      setDialogue(texts.speakerHint, texts.uiText.yourTurn, false);
    }
  }, [setGameState, setDialogue, waitForUnpause, runAISpeech]);

  /** 开始警长竞选投票 */
  const startBadgeElectionPhase = useCallback(async (state: GameState, options?: { isRevote?: boolean }) => {
    const texts = getTexts();
    const isRevote = options?.isRevote === true || state.phase === "DAY_BADGE_ELECTION";
    const shouldTransition = state.phase !== "DAY_BADGE_ELECTION";
    let currentState = shouldTransition ? transitionPhase(state, "DAY_BADGE_ELECTION") : state;

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
      currentState = addSystemMessage(currentState, texts.systemMessages.badgeElectionStart);
      
      // 播放警徽竞选投票语音
      await playNarrator("badgeElectionStart");
    }

    const candidates = currentState.badge.candidates || [];
    if (candidates.length === 1) {
      // 只有一人竞选，直接当选，不展示投票环节
      const winnerSeat = candidates[0];
      const winner = currentState.players.find((p) => p.seat === winnerSeat);
      let nextState: GameState = {
        ...currentState,
        badge: {
          ...currentState.badge,
          holderSeat: winnerSeat,
          history: { ...currentState.badge.history, [currentState.day]: {} },
        },
      };
      // 使用特殊消息，不显示票数
      const autoElectMsg = texts.t("badgePhase.autoElected", { seat: winnerSeat + 1, name: winner?.displayName || "" });
      nextState = addSystemMessage(nextState, autoElectMsg);
      setGameState(nextState);
      setDialogue(texts.speakerHost, autoElectMsg, false);
      await delay(DELAY_CONFIG.DIALOGUE);
      await onBadgeElectionComplete(nextState);
      return;
    }

    // AI 玩家投票（候选人不投票）
    const human = currentState.players.find((p) => p.isHuman);
    const humanIsCandidate = human && candidates.includes(human.seat);
    
    // 只对非候选人显示投票提示
    if (human?.alive && !humanIsCandidate) {
      setDialogue(texts.speakerHost, texts.uiText.badgeVotePrompt, false);
    } else {
      setDialogue(texts.speakerHost, texts.uiText.aiVoting, false);
    }
    setGameState(currentState);
    const aiPlayers = currentState.players.filter((p) => p.alive && !p.isHuman && !candidates.includes(p.seat));
    try {
      for (const aiPlayer of aiPlayers) {
        setIsWaitingForAI(true);
        let targetSeat: number;
        try {
          targetSeat = await generateAIBadgeVote(currentState, aiPlayer);
        } catch (e) {
          console.warn("[wolfcha] AI badge vote threw, treating as abstain", e);
          targetSeat = BADGE_VOTE_ABSTAIN;
        }

        // Abstain (-1) is recorded as-is; only correct non-abstain to a valid candidate
        if (targetSeat !== BADGE_VOTE_ABSTAIN && candidates.length > 0 && !candidates.includes(targetSeat)) {
          targetSeat = candidates[Math.floor(Math.random() * candidates.length)];
        }

        // 从最新状态获取投票，避免覆盖人类玩家的投票
        const latestState = gameStateRef.current;
        currentState = {
          ...currentState,
          badge: {
            ...currentState.badge,
            votes: { ...latestState.badge.votes, [aiPlayer.playerId]: targetSeat },
          },
        };
        setGameState(currentState);
      }
    } finally {
      setIsWaitingForAI(false);
    }

    // AI投票结束后统一结算一次
    await maybeResolveBadgeElection(currentState);
  }, [setGameState, setDialogue, setIsWaitingForAI, maybeResolveBadgeElection]);

  // 更新 ref 以打破循环依赖
  startBadgeSpeechPhaseRef.current = startBadgeSpeechPhase;
  maybeStartBadgeSpeechAfterSignupRef.current = maybeStartBadgeSpeechAfterSignup;

  /** 警长移交警徽 */
  const handleBadgeTransfer = useCallback(async (
    state: GameState,
    sheriff: Player,
    afterTransfer: (s: GameState) => Promise<void>
  ) => {
    const texts = getTexts();
    let currentState = transitionPhase(state, "BADGE_TRANSFER");
    currentState = addSystemMessage(currentState, texts.systemMessages.badgeTransferStart(sheriff.seat + 1, sheriff.displayName));
    setGameState(currentState);

    await waitForUnpause();

    if (sheriff.isHuman) {
      // 保存回调以便人类操作后继续流程
      humanBadgeTransferCallbackRef.current = afterTransfer;
      setDialogue(texts.speakerSystem, texts.t("badgePhase.transferPrompt"), false);
      return;
    }

    // AI 警长选择移交对象
    setIsWaitingForAI(true);
    const targetSeat = await generateBadgeTransfer(currentState, sheriff);
    setIsWaitingForAI(false);

    if (targetSeat === BADGE_TRANSFER_TORN) {
      // 撕毁警徽
      currentState = {
        ...currentState,
        badge: { ...currentState.badge, holderSeat: null },
      };
      currentState = addSystemMessage(currentState, texts.systemMessages.badgeTorn(sheriff.seat + 1, sheriff.displayName));
      setDialogue(texts.speakerHost, texts.systemMessages.badgeTorn(sheriff.seat + 1, sheriff.displayName), false);
    } else {
      // 正常移交
      const target = currentState.players.find((p) => p.seat === targetSeat);
      if (target) {
        currentState = {
          ...currentState,
          badge: { ...currentState.badge, holderSeat: targetSeat },
        };
        currentState = addSystemMessage(currentState, texts.systemMessages.badgeTransferred(sheriff.seat + 1, targetSeat + 1, target.displayName));
        setDialogue(texts.speakerHost, texts.systemMessages.badgeTransferred(sheriff.seat + 1, targetSeat + 1, target.displayName), false);
      }
    }
    setGameState(currentState);

    await delay(DELAY_CONFIG.LONG);
    await waitForUnpause();
    await afterTransfer(currentState);
  }, [setGameState, setDialogue, setIsWaitingForAI, waitForUnpause]);

  /** 人类警长移交警徽 */
  const handleHumanBadgeTransfer = useCallback(async (targetSeat: number) => {
    const texts = getTexts();
    if (gameState.phase !== "BADGE_TRANSFER") return;

    const sheriffSeat = gameState.badge.holderSeat;
    const human = gameState.players.find((p) => p.isHuman);
    if (!human || human.seat !== sheriffSeat) return;

    let currentState: GameState;

    if (targetSeat === BADGE_TRANSFER_TORN) {
      // 撕毁警徽
      currentState = {
        ...gameState,
        badge: { ...gameState.badge, holderSeat: null },
      };
      currentState = addSystemMessage(currentState, texts.systemMessages.badgeTorn(sheriffSeat! + 1, human.displayName));
      setDialogue(texts.speakerHost, texts.systemMessages.badgeTorn(sheriffSeat! + 1, human.displayName), false);
    } else {
      // 正常移交
      const target = gameState.players.find((p) => p.seat === targetSeat);
      if (!target || !target.alive) return;

      currentState = {
        ...gameState,
        badge: { ...gameState.badge, holderSeat: targetSeat },
      };
      currentState = addSystemMessage(currentState, texts.systemMessages.badgeTransferred(sheriffSeat! + 1, targetSeat + 1, target.displayName));
      setDialogue(texts.speakerHost, texts.systemMessages.badgeTransferred(sheriffSeat! + 1, targetSeat + 1, target.displayName), false);
    }

    setGameState(currentState);

    await delay(DELAY_CONFIG.LONG);
    await waitForUnpause();
    
    // 使用保存的回调继续流程
    const callback = humanBadgeTransferCallbackRef.current;
    humanBadgeTransferCallbackRef.current = null;
    if (callback) {
      await callback(currentState);
    } else {
      // 如果没有保存的回调，使用默认的onBadgeTransferComplete
      await onBadgeTransferComplete(currentState);
    }
  }, [gameState, setGameState, setDialogue, waitForUnpause, onBadgeTransferComplete]);

  return {
    startBadgeSignupPhase,
    startBadgeSpeechPhase,
    startBadgeElectionPhase,
    handleBadgeSignup,
    handleBadgeTransfer,
    handleHumanBadgeTransfer,
    maybeResolveBadgeElection,
  };
}
