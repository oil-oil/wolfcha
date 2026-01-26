"use client";

import { ReactNode } from "react";
import { MarketingNav } from "./MarketingNav";
import { MarketingFooter } from "./MarketingFooter";
import { GameBackground } from "@/components/game/GameBackground";

interface MarketingPageWrapperProps {
  children: ReactNode;
}

export function MarketingPageWrapper({ children }: MarketingPageWrapperProps) {
  return (
    <div className="relative h-screen w-full overflow-hidden flex flex-col bg-[var(--bg-main)] text-[var(--text-primary)]">
      {/* Background - Fixed behind everything */}
      <GameBackground isNight={false} />
      
      {/* Scrollable Container */}
      <div className="flex-1 overflow-y-auto scroll-smooth">
        <MarketingNav />
        <main className="min-h-[calc(100vh-4rem-300px)]">
          {children}
        </main>
        <MarketingFooter />
      </div>
    </div>
  );
}
