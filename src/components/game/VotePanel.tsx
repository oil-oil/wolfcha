"use client";

import { useState } from "react";
import type { Player } from "@/types/game";
import { CheckCircle, User } from "@phosphor-icons/react";

interface VotePanelProps {
  players: Player[];
  currentPlayerId: string;
  onVote: (targetSeat: number) => void;
  disabled?: boolean;
}

export function VotePanel({ players, currentPlayerId, onVote, disabled }: VotePanelProps) {
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);

  const eligiblePlayers = players.filter(
    (p) => p.alive && p.playerId !== currentPlayerId
  );

  const handleConfirm = () => {
    if (selectedSeat !== null) {
      onVote(selectedSeat);
      setSelectedSeat(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-[var(--text-secondary)] mb-2">
        选择要投票放逐的玩家
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        {eligiblePlayers.map((player) => (
          <button
            key={player.playerId}
            onClick={() => setSelectedSeat(player.seat)}
            disabled={disabled}
            className={`
              p-3 rounded-lg border text-left transition-all
              ${selectedSeat === player.seat 
                ? "border-[var(--accent)] bg-[var(--accent)] text-white" 
                : "border-[var(--border-color)] bg-white hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)]"
              }
              ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            <div className="flex items-center gap-2">
              <User size={16} />
              <span className="font-medium">{player.seat + 1}号</span>
              <span className="text-sm truncate">{player.displayName}</span>
            </div>
          </button>
        ))}
      </div>

      {selectedSeat !== null && (
        <button
          onClick={handleConfirm}
          disabled={disabled}
          className="w-full h-10 flex items-center justify-center gap-2 bg-[var(--text-primary)] text-[var(--text-inverse)] rounded-sm font-medium cursor-pointer transition-all duration-150 hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircle size={18} weight="fill" />
          确认投票 {selectedSeat + 1}号
        </button>
      )}
    </div>
  );
}
