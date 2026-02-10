"use client";

import { Share2 } from "lucide-react";

interface AnalysisFooterProps {
  onShare?: () => void;
  onReturn?: () => void;
}

export function AnalysisFooter({ onShare, onReturn }: AnalysisFooterProps) {
  return (
    <footer className="pt-2 pb-6 flex flex-col gap-4">
      <button
        onClick={onShare}
        className="w-full bg-[var(--color-gold)]/90 text-[#1a1614] font-bold py-4 rounded-lg shadow-[0_4px_14px_rgba(197,160,89,0.3)] hover:bg-[var(--color-gold)] hover:translate-y-[-1px] transition-all flex items-center justify-center gap-2 tracking-wider"
      >
        <Share2 className="w-4 h-4" />
        分享海报
      </button>
      <button
        onClick={onReturn}
        className="w-full bg-transparent text-[var(--color-gold)]/60 font-bold py-4 rounded-lg hover:bg-white/5 hover:text-[var(--color-gold)] transition border border-[var(--color-gold)]/20 tracking-wider"
      >
        返回大厅
      </button>
    </footer>
  );
}
