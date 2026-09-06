import type { GameState, VoteRound } from "@/types/game";

/** 只追加已结算的公开轮次，进行中的投票不能进入其他投票者的上下文。 */
export function recordVoteRound(state: GameState, round: Omit<VoteRound, "id" | "day">): GameState {
  const id = `${state.gameId}:${state.day}:${round.kind}:${round.round}`;
  if (state.voteRounds?.some((item) => item.id === id)) return state;
  return { ...state, voteRounds: [...(state.voteRounds || []), {
    ...round, id, day: state.day, votes: { ...round.votes }, candidates: [...round.candidates],
  }] };
}
