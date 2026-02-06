"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PostGameAnalysisPage } from "@/components/analysis";
import { MOCK_ANALYSIS_DATA } from "@/components/analysis/mockData";
import { TEST_ANALYSIS_DATA } from "@/components/analysis/testMockData";
import { useGameAnalysis } from "@/hooks/useGameAnalysis";

export default function AnalysisDemoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { analysisData, isLoading, error } = useGameAnalysis();

  const testMode = searchParams.get("test");
  const getMockData = () => {
    if (testMode === "village") return TEST_ANALYSIS_DATA;
    if (testMode === "wolf") return MOCK_ANALYSIS_DATA;
    return TEST_ANALYSIS_DATA;
  };

  const displayData = analysisData || getMockData();

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

  if (error) {
    console.warn("Analysis generation error, using mock data:", error);
  }

  return (
    <PostGameAnalysisPage
      data={displayData}
      onReturn={handleReturn}
    />
  );
}
