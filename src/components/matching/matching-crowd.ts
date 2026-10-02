import { createMatchingPlayer, type MatchedPlayer, type MatchingPlayer } from "./matching-characters";

/** The original 48 Notionists figures, independent of this round's roster. */
export const MATCHING_CROWD_PLAYERS: readonly MatchingPlayer[] = Array.from({ length: 48 }, (_, index) => createMatchingPlayer({
  id: `wolfcha-crowd-${index + 1}`,
  name: "",
  avatarSeed: `wolfcha-match-${index + 1}`,
  gender: index % 2 ? "female" : "male",
}));

/** Give an existing identical figure its real identity, or add the exact new one. */
export function buildMatchingCrowd(
  participants: readonly MatchedPlayer[],
  appearances: readonly MatchingPlayer[] = MATCHING_CROWD_PLAYERS,
): MatchingPlayer[] {
  const remaining = [...participants];
  const usedIds = new Set(participants.map((player) => player.id));
  const crowd = appearances.map((appearance) => {
    const index = remaining.findIndex((player) => player.figureUrl === appearance.figureUrl);
    if (index >= 0) return remaining.splice(index, 1)[0];
    // Background figures cannot accidentally acquire a participant's identity.
    let id = appearance.id;
    let suffix = 0;
    while (usedIds.has(id)) id = `${appearance.id}-background-${++suffix}`;
    usedIds.add(id);
    return { ...appearance, id, seat: undefined };
  });
  return [...crowd, ...remaining.map((player) => ({ ...player, enterFromEdge: true }))];
}
