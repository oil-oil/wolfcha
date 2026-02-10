/**
 * 游戏分析生成 Hook
 * 在 GAME_END 时自动触发分析数据生成
 */

import { useEffect, useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  gameStateAtom,
  gameAnalysisAtom,
  analysisLoadingAtom,
  analysisErrorAtom,
} from "@/store/game-machine";
import { generateGameAnalysis } from "@/lib/game-analysis";
import { gameStatsTracker } from "@/hooks/useGameStats";
import { getReviewModel } from "@/lib/api-keys";

export function useGameAnalysis() {
  const gameState = useAtomValue(gameStateAtom);
  const [analysisData, setAnalysisData] = useAtom(gameAnalysisAtom);
  const [isLoading, setIsLoading] = useAtom(analysisLoadingAtom);
  const [error, setError] = useAtom(analysisErrorAtom);

  const triggerAnalysis = useCallback(async () => {
    if (gameState.phase !== "GAME_END" || !gameState.winner) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const winner = gameState.winner === "wolf" ? "wolf" : "villager";
      
      // 优先使用 GameState.startTime 计算时长，避免刷新后丢失
      let durationSeconds = 0;
      if (gameState.startTime) {
        durationSeconds = Math.round((Date.now() - gameState.startTime) / 1000);
      } else {
        // 降级方案：尝试从 gameStatsTracker 获取
        const statsSummary = gameStatsTracker.getSummary(winner, true);
        durationSeconds = statsSummary?.durationSeconds ?? 0;
      }
      
      const reviewModel = getReviewModel();
      const data = await generateGameAnalysis(gameState, reviewModel, durationSeconds);
      setAnalysisData(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "分析生成失败";
      setError(errorMessage);
      console.error("Game analysis generation failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [gameState, setAnalysisData, setIsLoading, setError]);

  useEffect(() => {
    // 触发条件：游戏结束、有胜利方、未加载中
    // 如果 analysisData 的 gameId 与当前游戏不匹配，也需要重新生成
    const needsAnalysis = gameState.phase === "GAME_END" && 
      gameState.winner && 
      !isLoading &&
      (!analysisData || analysisData.gameId !== gameState.gameId);
    
    if (needsAnalysis) {
      triggerAnalysis();
    }
  }, [gameState.phase, gameState.winner, gameState.gameId, analysisData, isLoading, triggerAnalysis]);

  const clearAnalysis = useCallback(() => {
    setAnalysisData(null);
    setError(null);
  }, [setAnalysisData, setError]);

  return {
    analysisData,
    isLoading,
    error,
    triggerAnalysis,
    clearAnalysis,
  };
}

export function useAnalysisData() {
  return useAtomValue(gameAnalysisAtom);
}

export function useAnalysisLoading() {
  return useAtomValue(analysisLoadingAtom);
}

export function useAnalysisError() {
  return useAtomValue(analysisErrorAtom);
}
