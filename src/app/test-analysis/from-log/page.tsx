"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PostGameAnalysisPage } from "@/components/analysis";
import { generateGameAnalysis } from "@/lib/game-analysis";
import { getReviewModel } from "@/lib/api-keys";
import type { GameState } from "@/types/game";
import type { GameAnalysisData } from "@/types/analysis";
import { Upload, Spinner, Warning } from "@phosphor-icons/react";

export default function TestAnalysisFromLogPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<GameAnalysisData | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);

  const showDevTools =
    process.env.NODE_ENV !== "production" &&
    (process.env.NEXT_PUBLIC_SHOW_DEVTOOLS ?? "true") === "true";

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text) as GameState;
      
      if (!data.players || !data.phase) {
        throw new Error("无效的游戏日志文件：缺少必要字段");
      }

      setGameState(data);

      const reviewModel = getReviewModel();
      const analysis = await generateGameAnalysis(data, reviewModel, 0);
      setAnalysisData(analysis);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "解析日志文件失败";
      setError(msg);
      console.error("Failed to load log:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleReturn = () => {
    if (analysisData) {
      setAnalysisData(null);
      setGameState(null);
    } else {
      router.push("/");
    }
  };

  if (!showDevTools) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">此页面仅在开发模式下可用</p>
      </div>
    );
  }

  if (analysisData) {
    return <PostGameAnalysisPage data={analysisData} onReturn={handleReturn} />;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--color-gold)] mb-2">
            从日志生成复盘
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            上传游戏日志 JSON 文件，测试复盘分析功能
          </p>
        </div>

        <label className="block">
          <div className={`
            border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
            ${isLoading 
              ? "border-[var(--color-gold)]/30 bg-[var(--color-gold)]/5" 
              : "border-[var(--color-gold)]/20 hover:border-[var(--color-gold)]/40 hover:bg-[var(--color-gold)]/5"
            }
          `}>
            {isLoading ? (
              <div className="flex flex-col items-center gap-3">
                <Spinner size={40} className="text-[var(--color-gold)] animate-spin" />
                <span className="text-[var(--text-secondary)]">正在生成复盘分析...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload size={40} className="text-[var(--color-gold)]/60" />
                <span className="text-[var(--text-secondary)]">
                  点击或拖拽上传日志文件
                </span>
                <span className="text-xs text-[var(--text-secondary)]/60">
                  支持 .json 格式
                </span>
              </div>
            )}
          </div>
          <input
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            disabled={isLoading}
            className="hidden"
          />
        </label>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
            <Warning size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400 text-sm font-medium">生成失败</p>
              <p className="text-red-400/80 text-xs mt-1">{error}</p>
            </div>
          </div>
        )}

        {gameState && !analysisData && !isLoading && (
          <div className="bg-[var(--color-gold)]/5 border border-[var(--color-gold)]/20 rounded-lg p-4">
            <p className="text-[var(--color-gold)] text-sm font-medium mb-2">已加载游戏状态</p>
            <div className="text-xs text-[var(--text-secondary)] space-y-1">
              <p>游戏ID: {gameState.gameId}</p>
              <p>玩家数: {gameState.players.length}</p>
              <p>当前阶段: {gameState.phase}</p>
              <p>当前天数: 第{gameState.day}天</p>
            </div>
          </div>
        )}

        <button
          onClick={() => router.push("/")}
          className="w-full py-3 rounded-lg border border-[var(--color-gold)]/20 text-[var(--text-secondary)] hover:bg-white/5 transition-colors"
        >
          返回首页
        </button>
      </div>
    </div>
  );
}
