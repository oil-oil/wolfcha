"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { PlayerAvatarPlaceholder } from "@/components/game/PlayerAvatarPlaceholder";
import { getAvatarScaleX } from "@/lib/avatar-config";
import type { MatchedPlayer } from "./matching-characters";
import styles from "./matching.module.css";

export interface MatchingSeatsProps {
  players: readonly MatchedPlayer[];
  totalSeats: number;
  visible: boolean;
  arrivedSeats: readonly number[];
  onAvatarRef: (seat: number, element: HTMLDivElement | null) => void;
  onAvatarError?: () => void;
}

export function MatchingSeats({ players, totalSeats, visible, arrivedSeats, onAvatarRef, onAvatarError }: MatchingSeatsProps) {
  const t = useTranslations();
  const half = Math.ceil(totalSeats / 2);
  const seats = Array.from({ length: totalSeats }, (_, seat) => seat);
  return (
    <div
      className={styles.seatLayout}
      data-visible={visible}
      aria-hidden={!visible}
    >
      {[seats.slice(0, half), seats.slice(half)].map((column, side) => (
        <aside key={side} className={`${styles.seatColumn} ${side ? styles.rightColumn : styles.leftColumn} scrollbar-hide pt-2 pb-2 px-1 -mx-1`} aria-label={side ? "右侧玩家" : "左侧玩家"}>
          {column.map((seat) => {
            const player = players.find((player) => player.seat === seat);
            const arrived = arrivedSeats.includes(seat);
            return (
              <div key={seat} className={`${styles.seatCard} wc-player-card ${arrived ? "bg-[var(--bg-card)]/80 backdrop-blur-sm" : "wc-player-card--loading"}`} data-seat={seat} data-ready={arrived} data-player-id={player?.id}>
                {!arrived && <div className="absolute inset-0 overflow-hidden rounded-lg z-0"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" /><div className="absolute inset-0 bg-[var(--bg-card)] opacity-50" /></div>}
                <div
                  ref={(element) => onAvatarRef(seat, element)}
                  className={`${styles.seatAvatar} wc-player-card__avatar`}
                  data-avatar-seat={seat}
                  data-player-id={player?.id}
                  data-avatar-source={player?.avatarUrl}
                  data-avatar-facing={player?.facing}
                >
                  <div className={styles.avatarPlaceholder} aria-hidden="true"><PlayerAvatarPlaceholder /></div>
                  {/* The exact transparent image painted by the crowd. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {player && <img
                    className={styles.avatarImage}
                    src={player.figureUrl}
                    crossOrigin="anonymous"
                    onError={onAvatarError}
                    style={{ backgroundColor: player.backgroundColor, transform: `scaleX(${getAvatarScaleX(player.facing)})` }}
                    alt={`${seat + 1} 号玩家 ${player.name}`}
                    draggable={false}
                  />}
                </div>
                <div className="wc-player-card__info relative z-10">
                  <div className="flex items-center gap-1.5 mb-0.5"><span className={`wc-seat-badge bg-black/10 text-[var(--text-secondary)] ${arrived ? "" : "opacity-50"}`}>{seat + 1}</span></div>
                  <div className="wc-player-card__name relative h-5" title={arrived ? player?.name : undefined}>
                    <div className={`${styles.nameSkeleton} h-full flex items-center`} aria-hidden="true"><div className="h-2 w-16 bg-[var(--text-secondary)]/10 rounded-full animate-pulse" /></div>
                    <span className={`${styles.seatName} block truncate font-medium text-[var(--text-primary)]`}>{player?.name}</span>
                  </div>
                  <div className="wc-player-card__meta min-h-[1.25rem] space-y-0.5">
                    {!arrived && <motion.div className="text-[var(--text-muted)] text-xs flex items-center gap-1" animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}><span className="w-1.5 h-1.5 rounded-full bg-[var(--color-gold)]/60" />{t("playerCard.joining")}</motion.div>}
                  </div>
                </div>
              </div>
            );
          })}
        </aside>
      ))}
    </div>
  );
}
