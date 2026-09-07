"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAtom, useStore } from "jotai";
import type { GameState, Player } from "@/types/game";
import type { PrefetchCriteria, PrefetchedSpeech } from "../useDialogueManager";
import { gameStateAtom } from "@/store/game-machine";
import {
  transitionPhase,
  addSystemMessage,
  addPlayerMessage,
  killPlayer,
  generateAISpeechSegmentsStream,
  getSpeechContextKey,
} from "@/lib/game-master";
import { getNextSpeechSeat } from "@/lib/speech-order";
import { PHASE_CATEGORIES } from "@/lib/game-constants";
import { type FlowToken } from "@/lib/game-flow-controller";
import { audioManager, makeAudioTaskId } from "@/lib/audio-manager";
import { resolveVoiceId, type AppLocale } from "@/lib/voice-constants";
import { getLocale } from "@/i18n/locale-store";
import { createSpeechRequest, type SpeechRequest } from "@/lib/speech-request";
import { generateUUID } from "@/lib/utils";
import { withTimeout } from "@/lib/request-timeout";
import { isGameSessionExpiredMessage } from "@/lib/llm";

export interface DayPhaseCallbacks {
  setDialogue: (speaker: string, text: string, isStreaming?: boolean) => void;
  setIsWaitingForAI: (waiting: boolean) => void;
  setWaitingForNextRound: (waiting: boolean) => void;
  isTokenValid: (token: FlowToken) => boolean;
  getToken: () => FlowToken;
  initSpeechQueue: (segments: string[], player: Player, afterSpeech?: (s: unknown) => Promise<void>, request?: SpeechRequest) => void;
  initStreamingSpeechQueue: (player: Player, afterSpeech?: (s: unknown) => Promise<void>, request?: SpeechRequest) => void;
  appendToSpeechQueue: (segment: string, requestId?: string, index?: number) => void;
  finalizeSpeechQueue: (options?: { nextSpeakerIsAI?: boolean; requestId?: string }) => void;
  setPrefetchedSpeech: (prefetch: PrefetchedSpeech | null) => void;
  consumePrefetchedSpeech: (criteria: PrefetchCriteria) => string[] | null;
  setAfterLastWords: (callback: ((s: GameState) => Promise<void>) | null) => void;
}

export interface DayPhaseActions {
  isSpeechBlocked: () => boolean;
  startLastWordsPhase: (state: GameState, seat: number, afterLastWords: (s: GameState) => Promise<void>, token: FlowToken) => Promise<void>;
  runAISpeech: (state: GameState, player: Player, options?: { afterSpeech?: (s: GameState) => Promise<void> }) => Promise<void>;
}

/**
 * 白天阶段 Hook
 * 负责管理白天流程：发言、遗言等
 */
export function useDayPhase(
  humanPlayer: Player | null,
  callbacks: DayPhaseCallbacks
): DayPhaseActions {
  const t = useTranslations();
  const speakerHost = t("speakers.host");
  const [gameState, setGameState] = useAtom(gameStateAtom);

  const {
    setDialogue,
    setIsWaitingForAI,
    setWaitingForNextRound,
    isTokenValid,
    getToken,
    initStreamingSpeechQueue,
    appendToSpeechQueue,
    finalizeSpeechQueue,
    setPrefetchedSpeech,
    consumePrefetchedSpeech,
    setAfterLastWords,
  } = callbacks;

  const store = useStore();
  const activeRequestRef = useRef<(SpeechRequest & { controller: AbortController }) | null>(null);
  const prefetchControllerRef = useRef<AbortController | null>(null);
  const failedRequestRef = useRef<SpeechRequest | null>(null);
  const isSpeechBlocked = useCallback(() => failedRequestRef.current?.isValid() === true, []);

  useEffect(() => {
    if (activeRequestRef.current && !activeRequestRef.current.isValid()) {
      activeRequestRef.current.controller.abort();
      prefetchControllerRef.current?.abort();
    }
  }, [gameState]);
  useEffect(() => () => {
    activeRequestRef.current?.controller.abort();
    activeRequestRef.current = null;
    prefetchControllerRef.current?.abort();
  }, []);

  const prefetchNextAISpeech = useCallback(async (state: GameState, player: Player) => {
    if (!player.agentProfile) return;
    prefetchControllerRef.current?.abort();
    const controller = new AbortController();
    prefetchControllerRef.current = controller;
    const token = getToken();
    const isValid = () => !controller.signal.aborted && token.isValid() &&
      prefetchControllerRef.current === controller && store.get(gameStateAtom).gameId === state.gameId;
    const base: PrefetchedSpeech = {
      gameId: state.gameId, contextKey: getSpeechContextKey(state, player),
      playerId: player.playerId, phase: state.phase, day: state.day,
      messageCount: state.messages.length, segments: [], isComplete: false, createdAt: Date.now(),
    };
    setPrefetchedSpeech(base);
    try {
      const segments = await generateAISpeechSegmentsStream(state, player, { signal: controller.signal });
      if (isValid()) setPrefetchedSpeech({ ...base, segments, isComplete: true });
    } catch {
      if (isValid()) setPrefetchedSpeech(null);
    }
  }, [getToken, setPrefetchedSpeech, store]);

  /** 每次请求持有独立段落和令牌；所有异步回调在写入前验证来源。 */
  const runAISpeech = useCallback(async (
    state: GameState,
    player: Player,
    options?: { afterSpeech?: (s: GameState) => Promise<void> }
  ) => {
    if (!PHASE_CATEGORIES.SPEECH_PHASES.includes(state.phase as typeof PHASE_CATEGORIES.SPEECH_PHASES[number])) return;
    if (activeRequestRef.current?.isValid()) return;
    activeRequestRef.current?.controller.abort();
    const controller = new AbortController();
    const id = generateUUID();
    const request = createSpeechRequest(id, state, player, getToken(), () => store.get(gameStateAtom),
      () => activeRequestRef.current?.id === id);
    activeRequestRef.current = { ...request, controller };
    failedRequestRef.current = null;
    if (!request.isValid()) return;
    const isValid = () => request.isValid() && !controller.signal.aborted;
    const afterSpeech = options?.afterSpeech as ((s: unknown) => Promise<void>) | undefined;
    const voiceId = resolveVoiceId(player.agentProfile?.persona?.voiceId,
      player.agentProfile?.persona?.gender, player.agentProfile?.persona?.age, getLocale() as AppLocale);
    const collected: string[] = [];
    let displayedCount = 0;
    let displayChain = Promise.resolve();
    let audioChain = Promise.resolve();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const appendSegment = (segment: string, index: number) => {
      if (!isValid() || index !== collected.length) return;
      collected.push(segment);
      const task = { id: makeAudioTaskId(voiceId, segment), playbackId: `${id}:${index}`, isValid, text: segment, voiceId, playerId: player.playerId };
      // 首段 TTS 等待不能让后续文字先进入队列。后续音频只预加载，不阻塞字幕。
      displayChain = displayChain.then(async () => {
        if (!isValid()) return;
        let firstAudioReady = false;
        if (index === 0 && audioManager.isEnabled()) {
          try {
            await withTimeout(audioManager.ensureReady(task), 15000);
            firstAudioReady = true;
          } catch { /* 保留文字，不重发失败的 TTS 请求 */ }
        }
        if (!isValid()) return;
        if (index === 0) {
          clearTimeout(timeoutId);
          setIsWaitingForAI(false);
        }
        appendToSpeechQueue(segment, id, index);
        displayedCount += 1;
        if (audioManager.isEnabled()) {
          if (index === 0) {
            if (firstAudioReady) audioManager.addToQueue(task);
            return;
          }
          audioChain = audioChain.then(async () => {
            if (!isValid()) return;
            try { await withTimeout(audioManager.ensureReady(task), 15000); } catch { return; }
            if (isValid()) audioManager.addToQueue(task);
          });
        }
      });
    };

    const prefetched = consumePrefetchedSpeech({
      gameId: state.gameId, contextKey: getSpeechContextKey(state, player),
      playerId: player.playerId, phase: state.phase, day: state.day, messageCount: state.messages.length,
    });
    prefetchControllerRef.current?.abort();
    initStreamingSpeechQueue(player, afterSpeech, request);
    setIsWaitingForAI(true);
    setDialogue(player.displayName, t("dayPhase.organizing"), true);

    const timeoutPromise = new Promise<"timeout">((resolve) => {
      timeoutId = setTimeout(() => {
        if (!isValid()) { resolve("timeout"); return; }
        controller.abort();
        // 超时兜底仍属于本次请求；关闭网络回调后才能写入。
        if (displayedCount === 0) appendToSpeechQueue(t("dayPhase.timeout"), id, 0);
        finalizeSpeechQueue({ requestId: id });
        setIsWaitingForAI(false);
        resolve("timeout");
      }, 60000);
    });

    try {
      const streamPromise = prefetched
        ? Promise.resolve(prefetched.forEach(appendSegment))
        : generateAISpeechSegmentsStream(state, player, { signal: controller.signal, onSegmentReceived: appendSegment });
      const result = await Promise.race([streamPromise, timeoutPromise]);
      if (result === "timeout" || !isValid()) return;
      await displayChain;
      if (!isValid()) return;
      const nextSeat = getNextSpeechSeat(state);
      const nextPlayer = state.players.find((p) => p.seat === nextSeat);
      const nextSpeakerIsAI = !!nextPlayer && !nextPlayer.isHuman && nextPlayer.alive;
      finalizeSpeechQueue({ nextSpeakerIsAI, requestId: id });
      // 按相同段落 ID 构造预计状态，已提交的段落不会重复进入预取上下文。
      if (nextSpeakerIsAI && nextPlayer) {
        const postState = collected.reduce((next, segment, index) =>
          addPlayerMessage(next, player.playerId, segment, { id: `${id}:${index}` }), store.get(gameStateAtom));
        void prefetchNextAISpeech({ ...postState, currentSpeakerSeat: nextPlayer.seat }, nextPlayer);
      }
    } catch (error) {
      if (!isValid()) return;
      await displayChain;
      if (!isValid()) return;
      // 错误属于系统，不能记为角色台词。保留已确认段落，阻止自动推进至下一人。
      failedRequestRef.current = request;
      if (!collected.length) setDialogue(speakerHost, t(isGameSessionExpiredMessage(String(error))
        ? "dayPhase.sessionExpired" : "dayPhase.interrupted"), false);
      finalizeSpeechQueue({ requestId: id });
      toast.error(getLocale() === "zh" ? "发言生成失败，游戏已暂停推进" : "Speech failed. Progress is paused.", {
        duration: Infinity,
        action: { label: getLocale() === "zh" ? "重试发言" : "Retry speech", onClick: () => {
          if (!request.isValid()) return;
          activeRequestRef.current = null;
          void runAISpeech(store.get(gameStateAtom), player, options);
        } },
      });
    } finally {
      clearTimeout(timeoutId);
      if (request.isValid()) setIsWaitingForAI(false);
    }
  }, [appendToSpeechQueue, consumePrefetchedSpeech, finalizeSpeechQueue, getToken,
    initStreamingSpeechQueue, prefetchNextAISpeech, setDialogue, setIsWaitingForAI, speakerHost, store, t]);

  // 更新 ref 以打破循环依赖
  /** 开始遗言阶段 */
  const startLastWordsPhase = useCallback(async (
    state: GameState,
    seat: number,
    afterLastWords: (s: GameState) => Promise<void>,
    token: FlowToken
  ) => {
    if (!isTokenValid(token)) return;
    const speaker = state.players.find((p) => p.seat === seat);
    if (!speaker) {
      await afterLastWords(state);
      return;
    }

    setWaitingForNextRound(false);

    // 确保遗言发言者已标记为死亡
    let currentState = speaker.alive ? killPlayer(state, seat) : state;
    currentState = transitionPhase(currentState, "DAY_LAST_WORDS");
    currentState = { ...currentState, currentSpeakerSeat: seat };
    currentState = addSystemMessage(currentState, t("dayPhase.lastWordsSystem", { seat: seat + 1, name: speaker.displayName }));
    setGameState(currentState);

    if (speaker.isHuman) {
      // 保存回调，等待人类发言完毕后调用
      setAfterLastWords(afterLastWords);
      setDialogue(speakerHost, t("dayPhase.lastWordsPrompt", { seat: seat + 1, name: speaker.displayName }), false);
      return;
    }

    if (!isTokenValid(token)) return;

    await runAISpeech(currentState, speaker, {
      afterSpeech: async (s) => {
        if (!isTokenValid(token)) return;
        await afterLastWords(s as GameState);
      },
    });
  }, [setGameState, setDialogue, setWaitingForNextRound, isTokenValid, runAISpeech, setAfterLastWords, speakerHost, t]);

  return {
    isSpeechBlocked,
    startLastWordsPhase,
    runAISpeech,
  };
}
