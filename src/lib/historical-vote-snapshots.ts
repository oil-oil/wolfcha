import type { GameState } from "@/types/game";

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

/**
 * 返回警徽竞选在事件发生时记录的赢家。
 * 旧存档没有快照时，只在票组存在唯一最高票时做确定性推断。
 */
export function resolveBadgeElectionWinner(
  state: GameState,
  day: number,
  voteGroups: Record<number, number[]>
): number | null | undefined {
  const snapshots = state.badge.electionWinners;
  if (snapshots && hasOwn(snapshots, day)) {
    return snapshots[day];
  }

  const entries = Object.entries(voteGroups);
  if (entries.length === 0) return undefined;
  const maxVotes = Math.max(...entries.map(([, voters]) => voters.length));
  const winners = entries
    .filter(([, voters]) => voters.length === maxVotes)
    .map(([seat]) => Number(seat));
  return winners.length === 1 ? winners[0] : null;
}

/**
 * 返回放逐投票发生时的警长座位。
 * undefined 表示旧存档未记录，调用方不得用当前警长反推历史。
 */
export function resolveSheriffSeatAtVote(
  state: GameState,
  day: number
): number | null | undefined {
  const history = state.dayHistory?.[day];
  if (!history || !hasOwn(history, "sheriffSeatAtVote")) return undefined;
  return history.sheriffSeatAtVote;
}
