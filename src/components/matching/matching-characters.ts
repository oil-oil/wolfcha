import { buildSimpleAvatarUrl, getAvatarBgColor, type AvatarFacing } from "@/lib/avatar-config";
import type { Gender } from "@/lib/character-generator";

/** Public appearance only; matching never needs a player's role. */
export interface MatchingPlayer {
  id: string;
  name: string;
  avatarUrl: string;
  figureUrl: string;
  backgroundColor: string;
  /** When supplied, this is the game's seat, never assigned by the animation. */
  seat?: number;
  /** A game-assigned avatar absent from the base crowd enters from an edge. */
  enterFromEdge?: boolean;
}

export interface MatchedPlayer extends MatchingPlayer {
  seat: number;
  facing: AvatarFacing;
}

export function createMatchingPlayer({
  id,
  name,
  avatarSeed = id,
  gender,
}: {
  id: string;
  name: string;
  avatarSeed?: string;
  gender?: Gender;
}): MatchingPlayer {
  const avatarUrl = buildSimpleAvatarUrl(avatarSeed, { gender });
  // Only the backdrop changes. Preserve every seeded face/body option from
  // the game card, and use this exact image in both the crowd and the seat.
  const figureUrl = new URL(avatarUrl);
  figureUrl.searchParams.set("backgroundColor", "transparent");
  return {
    id, name, avatarUrl, figureUrl: figureUrl.toString(),
    backgroundColor: `#${getAvatarBgColor(avatarSeed)}`,
  };
}
