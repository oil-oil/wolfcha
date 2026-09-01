"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useAtom } from "jotai";
import type { GameState, Player, Phase } from "@/types/game";
import type { PrefetchCriteria, PrefetchedSpeech } from "../useDialogueManager";
import { gameStateAtom } from "@/store/game-machine";
import {
  transitionPhase,
  addSystemMessage,
  addPlayerMessage,
  killPlayer,
  generateAISpeechSegmentsStream,
} from "@/lib/game-master";
import { getNextSpeechSeat } from "@/lib/speech-order";
import { PHASE_CATEGORIES } from "@/lib/game-constants";
import { type FlowToken } from "@/lib/game-flow-controller";
import { audioManager, makeAudioTaskId } from "@/lib/audio-manager";
import { resolveVoiceId, type AppLocale } from "@/lib/voice-constants";
import { getLocale } from "@/i18n/locale-store";
import { isGameSessionExpiredMessage } from "@/lib/llm";

export interface DayPhaseCallbacks {
  setDialogue: (speaker: string, text: string, isStreaming?: boolean) => void;
  setIsWaitingForAI: (waiting: boolean) => void;
  setWaitingForNextRound: (waiting: boolean) => void;
  isTokenValid: (token: FlowToken) => boolean;
  initSpeechQueue: (segments: string[], player: Player, afterSpeech?: (s: unknown) => Promise<void>) => void;
  initStreamingSpeechQueue: (player: Player, afterSpeech?: (s: unknown) => Promise<void>) => void;
  appendToSpeechQueue: (segment: string) => void;
  finalizeSpeechQueue: (options?: { nextSpeakerIsAI?: boolean }) => void;
  setPrefetchedSpeech: (prefetch: PrefetchedSpeech | null) => void;
  consumePrefetchedSpeech: (criteria: PrefetchCriteria) => string[] | null;
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
    initStreamingSpeechQueue,
    appendToSpeechQueue,
    finalizeSpeechQueue,
    setPrefetchedSpeech,
    consumePrefetchedSpeech,
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

  // 用于存储流式生成的段落以便预取音频
  const streamingSegmentsRef = useRef<string[]>([]);

  const resolveNextSpeaker = useCallback((state: GameState) => {
    const nextSeat = getNextSpeechSeat(state);
    const nextPlayer = nextSeat === null
      ? null
      : state.players.find((player) => player.seat === nextSeat) ?? null;
    const nextSpeakerIsAI = !!nextPlayer && !nextPlayer.isHuman && nextPlayer.alive;

    return { nextSeat, nextSpeakerIsAI };
  }, []);

  const prefetchNextAISpeech = useCallback(async (
    state: GameState,
    player: Player
  ) => {
    if (!["DAY_SPEECH", "DAY_PK_SPEECH", "DAY_BADGE_SPEECH"].includes(state.phase)) return;
    if (!player.agentProfile) return;

    const basePrefetch: PrefetchedSpeech = {
      playerId: player.playerId,
      phase: state.phase,
      day: state.day,
      messageCount: state.messages.length,
      segments: [],
      isComplete: false,
      createdAt: Date.now(),
    };

    setPrefetchedSpeech(basePrefetch);

    const collected: string[] = [];

    try {
      const segments = await generateAISpeechSegmentsStream(state, player, {
        onSegmentReceived: (segment) => {
          collected.push(segment);
          setPrefetchedSpeech({
            ...basePrefetch,
            segments: [...collected],
            isComplete: false,
          });
        },
        onComplete: (finalSegments) => {
          setPrefetchedSpeech({
            ...basePrefetch,
            segments: finalSegments,
            isComplete: true,
          });
        },
        onError: () => {
          setPrefetchedSpeech(null);
        },
      });

      if (segments.length === 0) {
        setPrefetchedSpeech(null);
      }
    } catch {
      setPrefetchedSpeech(null);
    }
  }, [setPrefetchedSpeech]);

  /** AI 发言（流式分段输出） */
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

    // 重置流式段落收集器
    streamingSegmentsRef.current = [];
    let hasReceivedFirstSegment = false;
    let isTimedOut = false;

    // Get current locale for voice resolution
    const locale = getLocale() as AppLocale;
    const voiceId = resolveVoiceId(
      player.agentProfile?.persona?.voiceId,
      player.agentProfile?.persona?.gender,
      player.agentProfile?.persona?.age,
      locale
    );

    const prefetchCriteria: PrefetchCriteria = {
      playerId: player.playerId,
      phase: state.phase,
      day: state.day,
      messageCount: state.messages.length,
    };

    const prefetchedSegments = consumePrefetchedSpeech(prefetchCriteria);
    if (prefetchedSegments && prefetchedSegments.length > 0) {
      currentSpeakingPlayerRef.current = player.playerId;

      const ttsEnabled = audioManager.isEnabled();
      const firstSegment = prefetchedSegments[0];

      if (ttsEnabled && firstSegment) {
        // Wait for first segment TTS before showing text
        setDialogue(player.displayName, t("dayPhase.organizing"), true);
        const task = {
          id: makeAudioTaskId(voiceId, firstSegment),
          text: firstSegment,
          voiceId,
          playerId: player.playerId,
        };
        try {
          await audioManager.ensureReady(task);
        } catch {
          // TTS failed, continue without audio
        }
        setIsWaitingForAI(false);
        initSpeechQueue(
          prefetchedSegments,
          player,
          options?.afterSpeech as ((s: unknown) => Promise<void>) | undefined
        );
        audioManager.addToQueue(task);
        // Prefetch remaining segments in order (chained to preserve sequence)
        let chain = Promise.resolve();
        for (let i = 1; i < prefetchedSegments.length; i++) {
          const seg = prefetchedSegments[i];
          const segTask = { id: makeAudioTaskId(voiceId, seg), text: seg, voiceId, playerId: player.playerId };
          chain = chain.then(() =>
            audioManager.ensureReady(segTask).then(() => audioManager.addToQueue(segTask)).catch(() => {})
          );
        }
      } else {
        setIsWaitingForAI(false);
        initSpeechQueue(
          prefetchedSegments,
          player,
          options?.afterSpeech as ((s: unknown) => Promise<void>) | undefined
        );
      }

      currentSpeakingPlayerRef.current = null;
      return;
    }

    currentSpeakingPlayerRef.current = player.playerId;
    setIsWaitingForAI(true);
    setDialogue(player.displayName, t("dayPhase.organizing"), true);

    // 60秒超时机制：避免卡死在"正在组织语言"状态
    const ORGANIZING_TIMEOUT_MS = 60000;
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      setTimeout(() => {
        if (!hasReceivedFirstSegment) {
          isTimedOut = true;
          resolve("timeout");
        }
      }, ORGANIZING_TIMEOUT_MS);
    });

    try {
      // 初始化流式发言队列
      initStreamingSpeechQueue(player, options?.afterSpeech as ((s: unknown) => Promise<void>) | undefined);

      // Chain to ensure audio segments are queued in order
      let audioChain = Promise.resolve();

      // 使用流式生成，带超时保护
      const streamPromise = generateAISpeechSegmentsStream(state, player, {
        onSegmentReceived: (segment, index) => {
          // 如果已超时，忽略后续段落
          if (isTimedOut) return;

          // 检查当前阶段是否仍是发言阶段
          const currentPhase = gameStateRef.current.phase;
          if (!isSpeechLikePhase(currentPhase)) {
            return;
          }

          // Deduplication: skip if segment already collected
          if (streamingSegmentsRef.current.includes(segment)) {
            return;
          }
          streamingSegmentsRef.current.push(segment);

          const task = {
            id: makeAudioTaskId(voiceId, segment),
            text: segment,
            voiceId,
            playerId: player.playerId,
          };

          const ttsEnabled = audioManager.isEnabled();

          if (!hasReceivedFirstSegment) {
            hasReceivedFirstSegment = true;
            if (ttsEnabled) {
              // First segment: wait for TTS to be ready before showing text
              // so the user sees "organizing" until audio is synthesized
              audioChain = audioChain.then(() =>
                audioManager.ensureReady(task).then(() => {
                  if (isTimedOut) return;
                  setIsWaitingForAI(false);
                  appendToSpeechQueue(segment);
                  audioManager.addToQueue(task);
                }).catch(() => {
                  // TTS failed, show text anyway
                  setIsWaitingForAI(false);
                  appendToSpeechQueue(segment);
                })
              );
            } else {
              // No TTS: show text immediately
              setIsWaitingForAI(false);
              appendToSpeechQueue(segment);
            }
          } else {
            // Subsequent segments: show text immediately, prefetch in background
            appendToSpeechQueue(segment);
            if (ttsEnabled) {
              // Chain ensures addToQueue runs in segment arrival order
              audioChain = audioChain.then(() =>
                audioManager.ensureReady(task).then(() => {
                  audioManager.addToQueue(task);
                }).catch(() => {})
              );
            }
          }
        },
        onComplete: () => {
          // 如果已超时，忽略完成回调
          if (isTimedOut) return;

          // 检查当前阶段是否仍是发言阶段
          const currentState = gameStateRef.current;
          const currentPhase = currentState.phase;
          if (!isSpeechLikePhase(currentPhase)) {
            console.warn("[wolfcha] runAISpeech: phase changed during AI speech generation, skipping display. Expected speech phase, got:", currentPhase);
            return;
          }

          const { nextSeat, nextSpeakerIsAI } = resolveNextSpeaker(currentState);

          if (nextSeat !== null && nextSpeakerIsAI) {
            const postSpeechState = buildPostSpeechState(currentState, player, streamingSegmentsRef.current);
            const nextPlayer = postSpeechState.players.find((p) => p.seat === nextSeat);
            if (nextPlayer && !nextPlayer.isHuman && nextPlayer.alive) {
              void prefetchNextAISpeech(postSpeechState, nextPlayer);
            }
          }

          // 标记流式生成完成，并传递下一个发言者信息
          finalizeSpeechQueue({ nextSpeakerIsAI });
        },
        onError: (error) => {
          // 如果已超时，忽略错误回调
          if (isTimedOut) return;

          // 如果没有收到任何段落，显示中断消息
          if (!hasReceivedFirstSegment) {
            appendToSpeechQueue(t(
              isGameSessionExpiredMessage(error)
                ? "dayPhase.sessionExpired"
                : "dayPhase.interrupted",
            ));
            finalizeSpeechQueue();
          }
        },
      });

      // 等待流式生成完成或超时
      const result = await Promise.race([streamPromise, timeoutPromise]);

      // 处理超时情况
      if (result === "timeout") {
        console.warn(`[wolfcha] runAISpeech: timeout after ${ORGANIZING_TIMEOUT_MS}ms for ${player.displayName}, skipping to next speaker`);
        // 显示超时消息并标记完成
        appendToSpeechQueue(t("dayPhase.timeout"));
        finalizeSpeechQueue();
      }
    } catch (error) {
      // 如果流式生成失败且没有收到任何段落
      if (!hasReceivedFirstSegment && !isTimedOut) {
        initSpeechQueue(
          [t(
            isGameSessionExpiredMessage(String(error))
              ? "dayPhase.sessionExpired"
              : "dayPhase.interrupted",
          )],
          player,
          options?.afterSpeech as ((s: unknown) => Promise<void>) | undefined,
        );
      }
    } finally {
      currentSpeakingPlayerRef.current = null;
      if (!hasReceivedFirstSegment) {
        setIsWaitingForAI(false);
      }
    }
  }, [
    setIsWaitingForAI,
    setDialogue,
    initSpeechQueue,
    initStreamingSpeechQueue,
    appendToSpeechQueue,
    finalizeSpeechQueue,
    consumePrefetchedSpeech,
    prefetchNextAISpeech,
    resolveNextSpeaker,
    buildPostSpeechState,
    isSpeechLikePhase,
    t,
  ]);

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
