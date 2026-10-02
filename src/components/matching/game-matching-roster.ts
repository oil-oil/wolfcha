import type { Player } from "@/types/game";
import { parseMatchingRoster, type MatchingRoster } from "./matching-roster";

/** The game's assigned identity and appearance; no roles or private reasoning. */
export function createGameMatchingRoster(roundId: string, players: readonly Player[]): MatchingRoster {
  return parseMatchingRoster({
    roundId,
    playerCount: players.length,
    participants: players.map((player) => ({
      playerId: player.playerId,
      seat: player.seat,
      displayName: player.displayName,
      avatarSeed: player.avatarSeed ?? player.playerId,
      gender: player.agentProfile?.persona.gender,
    })),
  });
}
