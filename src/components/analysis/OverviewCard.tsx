"use client";

import { Crown, Scroll } from "lucide-react";
import type { GameAnalysisData } from "@/types/analysis";
import { ROLE_SHORT } from "./constants";
import { buildSimpleAvatarUrl } from "@/lib/avatar-config";

interface OverviewCardProps {
  data: GameAnalysisData;
  onSelectPlayer?: (playerId: string) => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function PlayerAvatar({ seed, size = 96 }: { seed: string; size?: number }) {
  const avatarUrl = buildSimpleAvatarUrl(seed);
  return (
    <img
      src={avatarUrl}
      alt="Avatar"
      width={size}
      height={size}
      className="rounded-full"
    />
  );
}

export function OverviewCard({ data, onSelectPlayer }: OverviewCardProps) {
  const isVillageWin = data.result === "village_win";
  const { personalStats, awards } = data;

  return (
    <div className="space-y-6">
      {/* 胜负横幅 & 用户信息 */}
      <section className="text-center space-y-6 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[radial-gradient(circle,rgba(197,160,89,0.05)_0%,transparent_70%)] pointer-events-none" />

        <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-[var(--color-gold)]/10 text-[var(--color-gold)] border border-[var(--color-gold)]/40 shadow-[0_0_20px_rgba(197,160,89,0.15)] backdrop-blur-sm">
          <Crown className="w-4 h-4" />
          <span className="font-bold text-sm tracking-[0.2em]">
            {isVillageWin ? "好人阵营获胜" : "狼人阵营获胜"}
          </span>
        </div>

        <div className="flex flex-col items-center relative z-10">
          <div className="relative group">
            <div className="w-24 h-24 rounded-full border-2 border-[var(--color-gold)]/40 p-1 bg-black/40 shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden">
              <PlayerAvatar seed={personalStats.avatar} />
            </div>
            <div className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full border-2 shadow-lg flex items-center justify-center ${
              personalStats.alignment === "wolf" 
                ? "bg-[var(--color-blood)]/90 border-[var(--color-blood)] text-white" 
                : "bg-[var(--bg-card)] border-[var(--color-gold)]/40 text-[var(--color-gold)]"
            }`}>
              <span className="text-xs font-bold">{ROLE_SHORT[personalStats.role]}</span>
            </div>
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-wide text-[var(--text-primary)]">
            {personalStats.userName}
          </h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-muted)]">
            <span className="px-2 py-0.5 border border-white/5 rounded bg-white/5">
              {formatDuration(data.duration)}
            </span>
            <span className="px-2 py-0.5 border border-white/5 rounded bg-white/5">
              {data.playerCount}人局
            </span>
          </div>
        </div>
      </section>

      {/* MVP & SVP */}
      <section className="grid grid-cols-2 gap-4">
        {/* MVP */}
        <button
          type="button"
          onClick={() => onSelectPlayer?.(awards.mvp.playerId)}
          className="analysis-card rounded-lg p-4 flex flex-col items-center overflow-hidden group relative cursor-pointer hover:bg-white/5 transition-colors text-left"
        >
          <div className="absolute -top-6 -right-6 w-12 h-12 bg-[var(--color-gold)]/20 blur-xl rounded-full" />
          <div className="absolute top-2 right-2">
            <Crown className="w-5 h-5 text-[var(--color-gold)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
          </div>
          <div className="w-12 h-12 rounded-full border border-[var(--color-gold)]/30 mb-3 bg-black/20 p-0.5">
            <PlayerAvatar seed={awards.mvp.avatar} size={44} />
          </div>
          <div className="text-xs text-[var(--color-gold)] font-bold tracking-widest mb-1">
            最佳表现
          </div>
          <div className="text-sm font-bold text-[var(--text-primary)] mb-2">
            {awards.mvp.playerName}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] text-center leading-tight bg-black/20 px-2 py-1 rounded border border-white/5">
            {awards.mvp.reason}
          </div>
        </button>

        {/* SVP */}
        <button
          type="button"
          onClick={() => onSelectPlayer?.(awards.svp.playerId)}
          className="analysis-card rounded-lg p-4 flex flex-col items-center grayscale hover:grayscale-0 transition-all duration-500 relative cursor-pointer hover:bg-white/5 text-left"
        >
          <div className="w-12 h-12 rounded-full border border-white/10 mb-3 bg-black/20 p-0.5 opacity-70">
            <PlayerAvatar seed={awards.svp.avatar} size={44} />
          </div>
          <div className="text-xs text-[var(--text-muted)] font-bold tracking-widest mb-1">
            虽败犹荣
          </div>
          <div className="text-sm font-bold text-[var(--text-secondary)] mb-2">
            {awards.svp.playerName}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] text-center leading-tight bg-black/20 px-2 py-1 rounded border border-white/5">
            {awards.svp.reason}
          </div>
        </button>
      </section>
    </div>
  );
}
