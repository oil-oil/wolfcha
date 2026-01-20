"use client";

import { useState, useCallback, useRef } from "react";
import type { Player } from "@/types/game";

export interface DialogueState {
  speaker: string;
  text: string;
  isStreaming: boolean;
}

export interface SpeechQueueState {
  segments: string[];
  currentIndex: number;
  player: Player;
  afterSpeech?: (s: unknown) => Promise<void>;
}

/**
 * 对话管理 Hook
 * 负责管理游戏中的对话显示、AI发言队列等
 */
export function useDialogueManager() {
  const [currentDialogue, setCurrentDialogue] = useState<DialogueState | null>(null);
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);
  const [waitingForNextRound, setWaitingForNextRound] = useState(false);
  const speechQueueRef = useRef<SpeechQueueState | null>(null);

  /** 设置对话内容 */
  const setDialogue = useCallback((speaker: string, text: string, isStreaming = false) => {
    setCurrentDialogue({ speaker, text, isStreaming });
  }, []);

  /** 清除对话 */
  const clearDialogue = useCallback(() => {
    setCurrentDialogue(null);
  }, []);

  /** 初始化发言队列 */
  const initSpeechQueue = useCallback((
    segments: string[],
    player: Player,
    afterSpeech?: (s: unknown) => Promise<void>
  ) => {
    const normalizedSegments = segments.map((s) => s.trim()).filter((s) => s.length > 0);
    speechQueueRef.current = {
      segments: normalizedSegments,
      currentIndex: 0,
      player,
      afterSpeech,
    };

    if (normalizedSegments.length > 0) {
      setCurrentDialogue({
        speaker: player.displayName,
        text: normalizedSegments[0],
        isStreaming: true,
      });
    }
  }, []);

  /** 获取当前发言队列 */
  const getSpeechQueue = useCallback(() => {
    return speechQueueRef.current;
  }, []);

  /** 更新发言队列索引 */
  const advanceSpeechQueue = useCallback(() => {
    const queue = speechQueueRef.current;
    if (!queue) return null;

    const nextIndex = queue.currentIndex + 1;
    if (nextIndex < queue.segments.length) {
      speechQueueRef.current = { ...queue, currentIndex: nextIndex };
      setCurrentDialogue({
        speaker: queue.player.displayName,
        text: queue.segments[nextIndex],
        isStreaming: true,
      });
      return { finished: false, segment: queue.segments[nextIndex] };
    } else {
      const afterSpeech = queue.afterSpeech;
      speechQueueRef.current = null;
      clearDialogue();
      return { finished: true, afterSpeech };
    }
  }, [clearDialogue]);

  /** 清除发言队列 */
  const clearSpeechQueue = useCallback(() => {
    speechQueueRef.current = null;
  }, []);

  /** 重置所有对话状态 */
  const resetDialogueState = useCallback(() => {
    setCurrentDialogue(null);
    setIsWaitingForAI(false);
    setWaitingForNextRound(false);
    speechQueueRef.current = null;
  }, []);

  return {
    // State
    currentDialogue,
    isWaitingForAI,
    waitingForNextRound,

    // Setters
    setIsWaitingForAI,
    setWaitingForNextRound,

    // Actions
    setDialogue,
    clearDialogue,
    initSpeechQueue,
    getSpeechQueue,
    advanceSpeechQueue,
    clearSpeechQueue,
    resetDialogueState,
  };
}
