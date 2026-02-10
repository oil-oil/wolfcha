"use client";

import { useState } from "react";
import type { GameAnalysisData } from "@/types/analysis";
import { AnalysisHeader } from "./AnalysisHeader";
import { OverviewCard } from "./OverviewCard";
import { PersonalStatsCard } from "./PersonalStatsCard";
import { TimelineReview } from "./TimelineReview";
import { PlayerReviews } from "./PlayerReviews";
import { AnalysisFooter } from "./AnalysisFooter";
import { IdentityDashboard } from "./IdentityDashboard";
import { PlayerDetailModal } from "./PlayerDetailModal";
import { ShareModal } from "./ShareModal";
import type { PlayerSnapshot } from "@/types/analysis";

interface PostGameAnalysisPageProps {
  data: GameAnalysisData;
  onReturn?: () => void;
}

export function PostGameAnalysisPage({
  data,
  onReturn,
}: PostGameAnalysisPageProps) {
  const [selectedRoundIndex, setSelectedRoundIndex] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSnapshot | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [overrideTag, setOverrideTag] = useState<string | null>(null);

  const selectedDay = data.roundStates[selectedRoundIndex]?.day;
  // Use the actual sheriff seat from the game (find the first round that has one)
  const sheriffSeat = data.roundStates.find(r => r.sheriffSeat !== undefined)?.sheriffSeat;

  const openPlayerDetail = (playerId: string) => {
    const found = data.players.find((p) => p.playerId === playerId);
    if (found) setSelectedPlayer(found);
  };

  const handleShare = () => {
    setIsShareModalOpen(true);
  };

  return (
    <div className="analysis-page min-h-screen pb-24" data-theme="dark">
      <AnalysisHeader gameId={data.gameId} />

      <main className="max-w-md lg:max-w-5xl mx-auto px-4 py-8">
        {/* Desktop: Two-column layout / Mobile: Single column */}
        <div className="lg:grid lg:grid-cols-12 lg:gap-8">
          {/* Left Column - Overview & Personal Stats */}
          <div className="lg:col-span-5 space-y-8">
            <OverviewCard data={data} onSelectPlayer={openPlayerDetail} />
            <PersonalStatsCard stats={data.personalStats} overrideTag={overrideTag} onOverrideTagChange={setOverrideTag} />
            <div className="hidden lg:block">
              <PlayerReviews reviews={data.reviews} onSelectPlayer={openPlayerDetail} />
              <div className="mt-8">
                <AnalysisFooter onShare={handleShare} onReturn={onReturn} />
              </div>
            </div>
          </div>

          {/* Right Column - Timeline & Reviews */}
          <div className="lg:col-span-7 space-y-8 mt-8 lg:mt-0">
            <section>
              <h3 className="text-center font-bold text-[var(--color-gold)]/40 text-xs mb-6 tracking-[0.3em] analysis-ornament-border pb-3">
                局势回顾
              </h3>
              <IdentityDashboard
                roundStates={data.roundStates}
                onRoundChange={setSelectedRoundIndex}
              />
            </section>

            <TimelineReview
              timeline={data.timeline}
              selectedDay={selectedDay}
              sheriffSeat={sheriffSeat !== undefined ? sheriffSeat + 1 : undefined}
            />

            {/* Mobile only: Reviews & Footer */}
            <div className="lg:hidden space-y-8">
              <PlayerReviews reviews={data.reviews} onSelectPlayer={openPlayerDetail} />
              <AnalysisFooter onShare={handleShare} onReturn={onReturn} />
            </div>
          </div>
        </div>
      </main>

      <PlayerDetailModal
        player={selectedPlayer}
        isOpen={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
      />

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        data={data}
        overrideTag={overrideTag}
      />
    </div>
  );
}
