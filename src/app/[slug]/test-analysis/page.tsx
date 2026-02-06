"use client";

import { useRouter } from "next/navigation";
import { PostGameAnalysisPage } from "@/components/analysis";
import { MOCK_ANALYSIS_DATA } from "@/components/analysis/mockData";

export default function TestAnalysisPage() {
  const router = useRouter();
  const showDevTools =
    process.env.NODE_ENV !== "production" &&
    (process.env.NEXT_PUBLIC_SHOW_DEVTOOLS ?? "true") === "true";

  if (!showDevTools) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">此页面仅在开发模式下可用</p>
      </div>
    );
  }

  const handleReturn = () => {
    router.push("/");
  };

  return (
    <PostGameAnalysisPage
      data={MOCK_ANALYSIS_DATA}
      onReturn={handleReturn}
    />
  );
}
