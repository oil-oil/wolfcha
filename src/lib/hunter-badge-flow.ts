import type { GameState, Player } from "@/types/game";

type BadgeTransfer = (
  state: GameState,
  sheriff: Player,
  continuation: (nextState: GameState) => Promise<void>
) => Promise<void>;

export async function continueAfterHunterShotWithBadgeTransfer(
  state: GameState,
  transferBadge: BadgeTransfer,
  continuation: (nextState: GameState) => Promise<void>
): Promise<void> {
  const sheriffSeat = state.badge.holderSeat;
  const deadSheriff = sheriffSeat === null
    ? undefined
    : state.players.find((player) => player.seat === sheriffSeat && !player.alive);

  if (deadSheriff) {
    await transferBadge(state, deadSheriff, continuation);
    return;
  }

  await continuation(state);
}
