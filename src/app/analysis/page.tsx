"use client";

import { useRouter } from "next/navigation";
import { PostGameAnalysisPage } from "@/components/analysis";
import { useGameAnalysis } from "@/hooks/useGameAnalysis";

export default function AnalysisPage() {
  const router = useRouter();
  const { analysisData, isLoading, error, triggerAnalysis } = useGameAnalysis();

  const handleReturn = () => {
    router.push("/");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[var(--color-gold)]/30 border-t-[var(--color-gold)] rounded-full mx-auto mb-4" />
          <p className="text-[var(--text-secondary)]">正在生成复盘分析...</p>
        </div>
      </div>
    );
  }

  if (error && !analysisData) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto px-4">
          <p className="text-red-400 text-sm mb-4">分析生成失败: {error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => triggerAnalysis()}
              className="px-5 py-2.5 rounded-lg text-sm font-bold bg-[var(--color-gold)] text-black hover:bg-[var(--color-gold)]/90 transition-colors"
            >
              重试
            </button>
            <button
              onClick={handleReturn}
              className="px-5 py-2.5 rounded-lg text-sm border border-[var(--color-gold)]/20 text-[var(--text-secondary)] hover:bg-white/5 transition-colors"
            >
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!analysisData) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto px-4">
          <p className="text-[var(--text-secondary)] text-sm mb-4">暂无分析数据，请先完成一局游戏</p>
          <button
            onClick={handleReturn}
            className="px-5 py-2.5 rounded-lg text-sm border border-[var(--color-gold)]/20 text-[var(--text-secondary)] hover:bg-white/5 transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <PostGameAnalysisPage
      data={analysisData}
      onReturn={handleReturn}
    />
  );
}
