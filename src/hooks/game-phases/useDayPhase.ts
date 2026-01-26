"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useAtom } from "jotai";
import type { GameState, Player, Phase } from "@/types/game";
import { gameStateAtom } from "@/store/game-machine";
import {
  transitionPhase,
  addSystemMessage,
  addPlayerMessage,
  killPlayer,
  generateAISpeechSegments,
} from "@/lib/game-master";
import { PHASE_CATEGORIES } from "@/lib/game-constants";
import { type FlowToken } from "@/lib/game-flow-controller";
import { audioManager, makeAudioTaskId } from "@/lib/audio-manager";
import { resolveVoiceId, type AppLocale } from "@/lib/voice-constants";
import { getLocale } from "@/i18n/locale-store";

export interface DayPhaseCallbacks {
  setDialogue: (speaker: string, text: string, isStreaming?: boolean) => void;
  setIsWaitingForAI: (waiting: boolean) => void;
  setWaitingForNextRound: (waiting: boolean) => void;
  isTokenValid: (token: FlowToken) => boolean;
  initSpeechQueue: (segments: string[], player: Player, afterSpeech?: (s: unknown) => Promise<void>) => void;
  setAfterLastWords: (callback: ((s: GameState) => Promise<void>) | null) => void;
}

export interface DayPhaseActions {
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
    initSpeechQueue,
    setAfterLastWords,
  } = callbacks;

  /** 判断是否为发言类阶段 */
  const isSpeechLikePhase = (phase: Phase): boolean => {
    return PHASE_CATEGORIES.SPEECH_PHASES.includes(phase as typeof PHASE_CATEGORIES.SPEECH_PHASES[number]);
  };

  const buildPostSpeechState = useCallback((
    baseState: GameState,
    speaker: Player,
    segments: string[]
  ): GameState => {
    const normalized = segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
    return normalized.reduce((nextState, segment) => {
      return addPlayerMessage(nextState, speaker.playerId, segment);
    }, baseState);
  }, []);


  // 使用 ref 来获取最新的 gameState，避免闭包问题
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  // 防止 AI 发言重复触发
  const currentSpeakingPlayerRef = useRef<string | null>(null);

  /** AI 发言（分段输出） */
  const runAISpeech = useCallback(async (
    state: GameState,
    player: Player,
    options?: { afterSpeech?: (s: GameState) => Promise<void> }
  ) => {
    if (state.phase.includes("NIGHT")) {
      console.warn("[wolfcha] runAISpeech called during NIGHT phase:", state.phase);
      return;
    }

    if (currentSpeakingPlayerRef.current === player.playerId) {
      console.warn("[wolfcha] runAISpeech: already speaking for", player.displayName);
      return;
    }

    currentSpeakingPlayerRef.current = player.playerId;
    setIsWaitingForAI(true);
    setDialogue(player.displayName, t("dayPhase.organizing"), false);

    try {
      let segments: string[];
      try {
        segments = await generateAISpeechSegments(state, player);
      } catch {
        segments = [t("dayPhase.interrupted")];
      }

      setDialogue(player.displayName, t("dayPhase.organizing"), false);

      const normalizedSegments = segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);

      try {
        // Get current locale for voice resolution
        const locale = getLocale() as AppLocale;
        const voiceId = resolveVoiceId(
          player.agentProfile?.persona?.voiceId,
          player.agentProfile?.persona?.gender,
          player.agentProfile?.persona?.age,
          locale
        );
        const tasks = normalizedSegments
          .map((text) => ({
            id: makeAudioTaskId(voiceId, text),
            text,
            voiceId,
            playerId: player.playerId,
          }));
        await audioManager.prefetchTasks(tasks, { concurrency: 3 });
      } catch {
        // ignore tts prefetch errors and continue to text-only
      }

      const liveState = gameStateRef.current;
      if (liveState.gameId === state.gameId && liveState.phase === state.phase) {
        buildPostSpeechState(state, player, normalizedSegments);
      }

      // 检查当前阶段是否仍是发言阶段，避免在投票阶段显示发言
      const currentPhase = gameStateRef.current.phase;
      if (!isSpeechLikePhase(currentPhase)) {
        console.warn("[wolfcha] runAISpeech: phase changed during AI speech generation, skipping display. Expected speech phase, got:", currentPhase);
        return;
      }

      // 初始化发言队列
      initSpeechQueue(normalizedSegments, player, options?.afterSpeech as ((s: unknown) => Promise<void>) | undefined);
    } finally {
      currentSpeakingPlayerRef.current = null;
      setIsWaitingForAI(false);
    }
  }, [setIsWaitingForAI, setDialogue, initSpeechQueue, isSpeechLikePhase]);

  // 更新 ref 以打破循环依赖
  /** 开始遗言阶段 */
  const startLastWordsPhase = useCallback(async (
    state: GameState,
    seat: number,
    afterLastWords: (s: GameState) => Promise<void>,
    token: FlowToken
  ) => {
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
  }, [setGameState, setDialogue, setWaitingForNextRound, isTokenValid, runAISpeech]);

  return {
    startLastWordsPhase,
    runAISpeech,
  };
}
