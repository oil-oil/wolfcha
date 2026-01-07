"use client";

import { cn } from "@/lib/utils";
import type { Player, GameState } from "@/types/game";
import { User, Skull, ChatCircle } from "@phosphor-icons/react";

interface PlayerCardProps {
  player: Player;
  isCurrentSpeaker: boolean;
  isHuman: boolean;
  isSelectable: boolean;
  onClick?: () => void;
}

export function PlayerCard({
  player,
  isCurrentSpeaker,
  isHuman,
  isSelectable,
  onClick,
}: PlayerCardProps) {
  const isDead = !player.alive;

  return (
    <div
      onClick={isSelectable ? onClick : undefined}
      className={cn(
        "p-3 rounded-lg border transition-all",
        isDead && "opacity-40",
        isCurrentSpeaker && "border-[var(--accent)] bg-[var(--bg-secondary)]",
        !isCurrentSpeaker && "border-transparent",
        isSelectable && "cursor-pointer hover:bg-[var(--bg-secondary)] hover:border-[var(--border-dark)]",
        isHuman && "bg-[var(--bg-secondary)]"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center border-2",
            isDead ? "border-[var(--danger)] bg-[var(--bg-secondary)]" : "border-[var(--border-dark)] bg-white",
            isCurrentSpeaker && "border-[var(--accent)]"
          )}
        >
          {isDead ? (
            <Skull size={20} className="text-[var(--danger)]" />
          ) : isHuman ? (
            <User size={20} weight="fill" />
          ) : (
            <User size={20} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{player.seat + 1}号</span>
            <span className="text-sm truncate">{player.displayName}</span>
            {isHuman && (
              <span className="text-xs px-1.5 py-0.5 bg-[var(--accent)] text-white rounded">
                你
              </span>
            )}
          </div>
          {player.agentProfile && (
            <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
              {player.agentProfile.modelRef.model.split("/")[1]?.slice(0, 12)}
            </p>
          )}
        </div>
        {isCurrentSpeaker && (
          <ChatCircle
            size={18}
            weight="fill"
            className="text-[var(--accent)] animate-pulse"
          />
        )}
      </div>
    </div>
  );
}
