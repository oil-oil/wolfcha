"use client";

import { Scroll } from "lucide-react";

interface AnalysisHeaderProps {
  gameId: string;
}

export function AnalysisHeader({ gameId }: AnalysisHeaderProps) {
  const shortId = gameId.slice(0, 6).toUpperCase();

  return (
    <header className="sticky top-0 z-50 bg-[var(--bg-main)]/90 backdrop-blur-md border-b border-[var(--color-gold)]/20 px-5 py-4 flex justify-between items-center shadow-lg">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 border border-[var(--color-gold)]/30 rounded flex items-center justify-center bg-black/20">
          <Scroll className="w-5 h-5 text-[var(--color-gold)]" />
        </div>
        <h1 className="font-bold text-xl text-[var(--color-gold)] tracking-wider drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          Wolfcha
        </h1>
      </div>
      <div className="text-xs text-[var(--color-gold)]/60 tracking-widest border border-[var(--color-gold)]/20 px-2 py-1 rounded">
        局号 #{shortId}
      </div>
    </header>
  );
}
