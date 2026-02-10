"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { Crown, Skull, Users } from "lucide-react";
import type { RoundState, PlayerSnapshot } from "@/types/analysis";
import { ROLE_NAMES } from "./constants";
import { PlayerDetailModal } from "./PlayerDetailModal";
import { buildSimpleAvatarUrl } from "@/lib/avatar-config";

interface IdentityDashboardProps {
  roundStates: RoundState[];
  onRoundChange?: (roundIndex: number) => void;
}

const DEATH_CAUSE_LABELS: Record<string, string> = {
  killed: "被刀",
  exiled: "被票",
  poisoned: "被毒",
  shot: "被枪",
  milk: "毒奶",
};

function PlayerCard({ player, onClick, seatOffset }: { player: PlayerSnapshot; onClick: () => void; seatOffset: number }) {
  const avatarUrl = buildSimpleAvatarUrl(player.avatar || player.name);
  const roleName = ROLE_NAMES[player.role];
  const isWolf = player.alignment === "wolf";

  return (
    <div
      onClick={onClick}
      className={`relative flex flex-col items-center p-2 rounded-lg transition-all duration-300 cursor-pointer hover:scale-105 hover:bg-[var(--bg-card)]/80 ${
        player.isAlive
          ? "bg-[var(--bg-card)]/60"
          : "bg-[var(--bg-card)]/30 opacity-50"
      } ${player.isHumanPlayer ? "ring-1 ring-[var(--color-gold)]/50" : ""}`}
    >
      <div className="relative">
        <div
          className={`w-10 h-10 rounded-full overflow-hidden border-2 ${
            isWolf
              ? "border-[var(--color-blood)]/60"
              : "border-[var(--color-gold)]/40"
          } ${!player.isAlive ? "grayscale" : ""}`}
        >
          <Image
            src={avatarUrl}
            alt={player.name}
            width={40}
            height={40}
            className="object-cover"
            unoptimized
          />
        </div>

        {player.isSheriff && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--color-gold)] rounded-full flex items-center justify-center shadow-lg">
            <Crown className="w-2.5 h-2.5 text-[var(--bg-main)]" />
          </div>
        )}

        {!player.isAlive && player.deathCause && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[var(--color-blood)] rounded-full flex items-center justify-center">
            <Skull className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>

      <div className="mt-1.5 text-center">
        <div className="text-[10px] text-[var(--text-muted)]">
          {player.seat + seatOffset}号
        </div>
        <div
          className={`text-[10px] font-medium ${
            isWolf ? "text-[var(--color-blood)]" : "text-[var(--color-gold)]"
          }`}
        >
          {roleName}
        </div>
      </div>

      {!player.isAlive && player.deathCause && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[8px] text-white/80 bg-black/60 px-1 py-0.5 rounded">
            {DEATH_CAUSE_LABELS[player.deathCause]}
          </span>
        </div>
      )}
    </div>
  );
}

function RoundInfo({ round }: { round: RoundState }) {
  const isStart = round.day === 0;

  return (
    <div className="flex items-center justify-between mb-4 px-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-[var(--text-primary)]">
          {isStart ? "游戏开局" : `第${round.day}天结束`}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-[var(--color-gold)]" />
          <span className="text-[var(--color-gold)]">
            好人 {round.aliveCount.village}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-[var(--color-blood)]" />
          <span className="text-[var(--color-blood)]">
            狼人 {round.aliveCount.wolf}
          </span>
        </div>
      </div>
    </div>
  );
}

export function IdentityDashboard({
  roundStates,
  onRoundChange,
}: IdentityDashboardProps) {
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSnapshot | null>(null);

  const currentRound = useMemo(
    () => roundStates[currentRoundIndex] || roundStates[0],
    [roundStates, currentRoundIndex]
  );

  const playerCount = currentRound.players.length;
  const halfCount = Math.ceil(playerCount / 2);
  
  // Detect seat indexing: if min seat is 0, data is 0-indexed; if 1, data is 1-indexed
  const minSeat = Math.min(...currentRound.players.map(p => p.seat));
  const seatOffset = minSeat === 0 ? 1 : 0; // Add 1 for display if 0-indexed
  
  // Sort players by seat for consistent ordering
  const sortedPlayers = useMemo(
    () => [...currentRound.players].sort((a, b) => a.seat - b.seat),
    [currentRound]
  );
  
  const topRow = useMemo(
    () => sortedPlayers.slice(0, halfCount),
    [sortedPlayers, halfCount]
  );
  const bottomRow = useMemo(
    () => sortedPlayers.slice(halfCount),
    [sortedPlayers, halfCount]
  );
  
  const gridCols = playerCount <= 6 ? playerCount : halfCount;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const index = parseInt(e.target.value, 10);
    setCurrentRoundIndex(index);
    onRoundChange?.(index);
  };

  const sliderLabels = useMemo(
    () =>
      roundStates.map((r) => ({
        label: r.day === 0 ? "开局" : `第${r.day}天`,
        day: r.day,
      })),
    [roundStates]
  );

  return (
    <div className="analysis-card p-4 rounded-lg mb-6">
      <RoundInfo round={currentRound} />

      <div className="space-y-2 mb-4">
        {playerCount <= 6 ? (
          <div 
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
          >
            {currentRound.players.map((player) => (
              <PlayerCard key={player.seat} player={player} onClick={() => setSelectedPlayer(player)} seatOffset={seatOffset} />
            ))}
          </div>
        ) : (
          <>
            <div 
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
            >
              {topRow.map((player) => (
                <PlayerCard key={player.seat} player={player} onClick={() => setSelectedPlayer(player)} seatOffset={seatOffset} />
              ))}
            </div>
            <div 
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
            >
              {bottomRow.map((player) => (
                <PlayerCard key={player.seat} player={player} onClick={() => setSelectedPlayer(player)} seatOffset={seatOffset} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-4 px-2">
        <div className="relative">
          <input
            type="range"
            min={0}
            max={roundStates.length - 1}
            value={currentRoundIndex}
            onChange={handleSliderChange}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-[var(--color-gold)]
              [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(197,160,89,0.5)]
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-moz-range-thumb]:w-4
              [&::-moz-range-thumb]:h-4
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-[var(--color-gold)]
              [&::-moz-range-thumb]:border-0
              [&::-moz-range-thumb]:cursor-pointer"
          />

          <div className="flex justify-between mt-2">
            {sliderLabels.map((item, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setCurrentRoundIndex(idx);
                  onRoundChange?.(idx);
                }}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  idx === currentRoundIndex
                    ? "bg-[var(--color-gold)]/20 text-[var(--color-gold)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <PlayerDetailModal
        player={selectedPlayer}
        isOpen={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
      />
    </div>
  );
}
