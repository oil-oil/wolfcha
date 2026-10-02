"use client";

import { createContext, useContext } from "react";
import type { Player } from "@/types/game";
import { PlayerCardCompact } from "@/components/game/PlayerCardCompact";
import { MatchingAnimation } from "./MatchingAnimation";
import type { MatchingRoster } from "./matching-roster";
import type { MatchingSeatsProps } from "./MatchingSeats";
import styles from "./matching.module.css";

const GamePlayersContext = createContext<{ players: readonly Player[]; isMobile: boolean }>({ players: [], isMobile: false });

function GameMatchingSeats({ totalSeats, visible, arrivedSeats, onAvatarRef, onAvatarError }: MatchingSeatsProps) {
  const { players, isMobile } = useContext(GamePlayersContext);
  const half = Math.ceil(totalSeats / 2);
  const seats = Array.from({ length: totalSeats }, (_, seat) => seat);
  const renderPlayer = (seat: number) => {
    const player = players.find((entry) => entry.seat === seat);
    if (!player) return null;
    return <PlayerCardCompact
      key={player.playerId}
      player={player}
      facing={seat < half ? "right" : "left"}
      variant={isMobile ? "mobile" : "default"}
      className={`${isMobile ? "" : styles.seatCard} ${styles.gameSeatCard}`}
      skipEntranceAnimation
      entrance={{ arrived: arrivedSeats.includes(seat), onAvatarRef: (element) => onAvatarRef(seat, element), onAvatarError }}
      showRoleBadge={false}
      isSpeaking={false}
      canClick={false}
      isSelected={false}
      onClick={() => {}}
    />;
  };
  if (isMobile) {
    // Use the game's final player strip as the destination, avoiding a jump
    // from two columns to the strip when the entrance hands over to the game.
    return <div className={styles.gameMobileSeatLayout} data-visible={visible} aria-hidden={!visible} inert={!visible}>
      <div className="wc-mobile-player-bar">
        <div className="wc-mobile-player-bar__track">{seats.map(renderPlayer)}</div>
      </div>
    </div>;
  }
  return <div className={`${styles.seatLayout} ${styles.gameSeatLayout}`} data-visible={visible} aria-hidden={!visible} inert={!visible}>
    {[seats.slice(0, half), seats.slice(half)].map((column, side) => (
      <aside key={side} className={`${styles.seatColumn} ${styles.gameSeatColumn} ${side ? styles.rightColumn : styles.leftColumn} scrollbar-hide pt-2 pb-2 px-1 -mx-1`} aria-label={side ? "右侧玩家" : "左侧玩家"}>
        {column.map(renderPlayer)}
      </aside>
    ))}
  </div>;
}

export function GameMatchingEntrance({ roster, players, isMobile = false, onComplete, onError }: {
  roster: MatchingRoster;
  players: readonly Player[];
  isMobile?: boolean;
  onComplete: () => void;
  onError: (message: string) => void;
}) {
  return <GamePlayersContext.Provider value={{ players, isMobile }}>
    <MatchingAnimation roster={roster} SeatsComponent={GameMatchingSeats} onComplete={onComplete} onError={onError} />
  </GamePlayersContext.Provider>;
}
