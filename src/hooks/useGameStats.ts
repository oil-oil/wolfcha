"use client";

import { useCallback, useRef } from "react";

export interface GameStatsConfig {
  userId?: string;
  playerCount: number;
  difficulty?: string;
  usedCustomKey: boolean;
  modelUsed?: string;
  userAgent?: string;
}

export interface AiCallStats {
  inputChars: number;
  outputChars: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface GameStatsSummary {
  sessionId?: string;
  winner: "wolf" | "villager" | null;
  completed: boolean;
  roundsPlayed: number;
  durationSeconds: number;
  aiCallsCount: number;
  aiInputChars: number;
  aiOutputChars: number;
  aiPromptTokens: number;
  aiCompletionTokens: number;
}

interface StatsState {
  sessionId: string | null;
  startTime: number;
  config: GameStatsConfig | null;
  aiCallsCount: number;
  aiInputChars: number;
  aiOutputChars: number;
  aiPromptTokens: number;
  aiCompletionTokens: number;
  roundsPlayed: number;
}

const createInitialState = (): StatsState => ({
  sessionId: null,
  startTime: 0,
  config: null,
  aiCallsCount: 0,
  aiInputChars: 0,
  aiOutputChars: 0,
  aiPromptTokens: 0,
  aiCompletionTokens: 0,
  roundsPlayed: 0,
});

export function useGameStats() {
  const statsRef = useRef<StatsState>(createInitialState());

  const startSession = useCallback((config: GameStatsConfig) => {
    statsRef.current = {
      ...createInitialState(),
      startTime: Date.now(),
      config,
    };
  }, []);

  const addAiCall = useCallback((stats: AiCallStats) => {
    const s = statsRef.current;
    s.aiCallsCount += 1;
    s.aiInputChars += stats.inputChars;
    s.aiOutputChars += stats.outputChars;
    if (stats.promptTokens) s.aiPromptTokens += stats.promptTokens;
    if (stats.completionTokens) s.aiCompletionTokens += stats.completionTokens;
  }, []);

  const incrementRound = useCallback(() => {
    statsRef.current.roundsPlayed += 1;
  }, []);

  const getSummary = useCallback((winner: "wolf" | "villager" | null, completed: boolean): GameStatsSummary | null => {
    const s = statsRef.current;
    if (!s.config) return null;

    const durationSeconds = Math.round((Date.now() - s.startTime) / 1000);

    return {
      sessionId: s.sessionId ?? undefined,
      winner,
      completed,
      roundsPlayed: s.roundsPlayed,
      durationSeconds,
      aiCallsCount: s.aiCallsCount,
      aiInputChars: s.aiInputChars,
      aiOutputChars: s.aiOutputChars,
      aiPromptTokens: s.aiPromptTokens,
      aiCompletionTokens: s.aiCompletionTokens,
    };
  }, []);

  const reset = useCallback(() => {
    statsRef.current = createInitialState();
  }, []);

  return {
    startSession,
    addAiCall,
    incrementRound,
    getSummary,
    reset,
  };
}

// 全局单例，供非 hook 场景使用（如 llm.ts）
let globalStats: StatsState = createInitialState();

export const gameStatsTracker = {
  start(config: GameStatsConfig) {
    globalStats = {
      ...createInitialState(),
      startTime: Date.now(),
      config,
    };
  },

  setSessionId(sessionId: string) {
    globalStats.sessionId = sessionId;
  },

  getSessionId(): string | null {
    return globalStats.sessionId;
  },

  getConfig(): GameStatsConfig | null {
    return globalStats.config;
  },

  addAiCall(stats: AiCallStats) {
    globalStats.aiCallsCount += 1;
    globalStats.aiInputChars += stats.inputChars;
    globalStats.aiOutputChars += stats.outputChars;
    if (stats.promptTokens) globalStats.aiPromptTokens += stats.promptTokens;
    if (stats.completionTokens) globalStats.aiCompletionTokens += stats.completionTokens;
  },

  incrementRound() {
    globalStats.roundsPlayed += 1;
  },

  getSummary(winner: "wolf" | "villager" | null, completed: boolean): GameStatsSummary | null {
    if (!globalStats.config) return null;

    const durationSeconds = Math.round((Date.now() - globalStats.startTime) / 1000);

    return {
      sessionId: globalStats.sessionId ?? undefined,
      winner,
      completed,
      roundsPlayed: globalStats.roundsPlayed,
      durationSeconds,
      aiCallsCount: globalStats.aiCallsCount,
      aiInputChars: globalStats.aiInputChars,
      aiOutputChars: globalStats.aiOutputChars,
      aiPromptTokens: globalStats.aiPromptTokens,
      aiCompletionTokens: globalStats.aiCompletionTokens,
    };
  },

  reset() {
    globalStats = createInitialState();
  },
};
