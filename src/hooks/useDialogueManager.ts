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
  isStreaming?: boolean; // 是否正在流式接收中
  isFinalized?: boolean; // 流式接收是否已完成
  committedIndices?: Set<number>; // 已提交到历史记录的段落索引
  completedIndices?: Set<number>; // 已完成显示的段落索引
  awaitingNextSegment?: boolean; // 已触发推进，等待下一段
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
      completedIndices: new Set(),
      awaitingNextSegment: false,
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
      // 还有更多段落
      speechQueueRef.current = { ...queue, currentIndex: nextIndex, awaitingNextSegment: false };
      setCurrentDialogue({
        speaker: queue.player.displayName,
        text: queue.segments[nextIndex],
        isStreaming: true,
      });
      return { finished: false, segment: queue.segments[nextIndex] };
    } else if (queue.isStreaming && !queue.isFinalized) {
      // 流式未完成，等待更多段落
      queue.awaitingNextSegment = true;
      return { finished: false, waiting: true };
    } else {
      // 所有段落已完成
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

  /** 初始化流式发言队列（不需要预先知道所有段落） */
  const initStreamingSpeechQueue = useCallback((
    player: Player,
    afterSpeech?: (s: unknown) => Promise<void>
  ) => {
    speechQueueRef.current = {
      segments: [],
      currentIndex: 0,
      player,
      afterSpeech,
      isStreaming: true,
      isFinalized: false,
      committedIndices: new Set(),
      completedIndices: new Set(),
      awaitingNextSegment: false,
    };
  }, []);

  /** 标记当前段落已提交到历史记录 */
  const markCurrentSegmentCommitted = useCallback(() => {
    const queue = speechQueueRef.current;
    if (!queue) return;
    if (!queue.committedIndices) {
      queue.committedIndices = new Set();
    }
    queue.committedIndices.add(queue.currentIndex);
  }, []);

  /** 检查当前段落是否已提交 */
  const isCurrentSegmentCommitted = useCallback(() => {
    const queue = speechQueueRef.current;
    if (!queue) return false;
    return queue.committedIndices?.has(queue.currentIndex) ?? false;
  }, []);

  /** 标记当前段落已完成显示 */
  const markCurrentSegmentCompleted = useCallback(() => {
    const queue = speechQueueRef.current;
    if (!queue) return;
    if (!queue.completedIndices) {
      queue.completedIndices = new Set();
    }
    queue.completedIndices.add(queue.currentIndex);
  }, []);

  /** 检查当前段落是否已完成显示 */
  const isCurrentSegmentCompleted = useCallback(() => {
    const queue = speechQueueRef.current;
    if (!queue) return false;
    return queue.completedIndices?.has(queue.currentIndex) ?? false;
  }, []);

  /** 向流式发言队列追加段落 */
  const appendToSpeechQueue = useCallback((segment: string) => {
    const queue = speechQueueRef.current;
    if (!queue) return;

    const trimmed = segment.trim();
    if (!trimmed) return;

    // 在添加新段落前检查是否在等待下一段
    // 如果 currentIndex 指向当前最后一个段落，说明用户在等待
    const isFirstSegment = queue.segments.length === 0;
    const isCurrentCompleted = queue.completedIndices?.has(queue.currentIndex) ?? false;
    const isAwaitingNext = queue.awaitingNextSegment === true;
    
    queue.segments.push(trimmed);

    // 如果这是第一个段落，或者用户正在等待下一段，则立即显示新段落
    const shouldDisplayImmediately = isFirstSegment || (isAwaitingNext && isCurrentCompleted);

    if (shouldDisplayImmediately) {
      // 更新 currentIndex 指向新段落
      queue.currentIndex = queue.segments.length - 1;
      queue.awaitingNextSegment = false;
      setCurrentDialogue({
        speaker: queue.player.displayName,
        text: trimmed,
        isStreaming: true,
      });
    }
  }, []);

  /** 标记流式发言队列已完成接收 */
  const finalizeSpeechQueue = useCallback(() => {
    const queue = speechQueueRef.current;
    if (!queue) return;

    queue.isStreaming = false;
    queue.isFinalized = true;
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
  };
}
