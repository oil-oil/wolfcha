import type { Alignment, GameState, Player } from "@/types/game";

type Continue = (state: GameState) => Promise<void>;

type ExecutionRuntime = {
  isCurrent: () => boolean;
  transferBadge: (state: GameState, player: Player, afterTransfer: Continue) => Promise<void>;
  handleHunter: (state: GameState, player: Player) => Promise<void>;
  checkWinner: (state: GameState) => Alignment | null;
  endGame: (state: GameState, winner: Alignment) => Promise<void>;
  proceedToNight: Continue;
};

/** Continue an already settled execution without replaying the vote or killing the speaker again. */
export function createExecutionLastWordsContinuation(seat: number, runtime: ExecutionRuntime): Continue {
  let started = false;
  let finished = false;

  return async (state) => {
    if (started || !runtime.isCurrent()) return;
    started = true;
    const executed = state.players.find((player) => player.seat === seat);

    const finish: Continue = async (nextState) => {
      if (finished || !runtime.isCurrent()) return;
      finished = true;

      if (executed?.role === "Hunter" && nextState.roleAbilities.hunterCanShoot) {
        await runtime.handleHunter(nextState, executed);
        return;
      }

      const winner = runtime.checkWinner(nextState);
      if (winner) {
        await runtime.endGame(nextState, winner);
        return;
      }

      await runtime.proceedToNight(nextState);
    };

    if (executed && state.badge.holderSeat === seat) {
      await runtime.transferBadge(state, executed, finish);
      return;
    }

    await finish(state);
  };
}

type ResumeLastWordsRuntime = {
  setHumanContinuation: (continueLastWords: Continue) => void;
  showHumanTurn: () => void;
  runAISpeech: (state: GameState, player: Player, options: { afterSpeech: Continue }) => Promise<void>;
};

/** Reattach the continuation lost on page reload to the same persisted speaker. */
export async function resumeExecutionLastWords(
  state: GameState,
  speaker: Player,
  continueLastWords: Continue,
  runtime: ResumeLastWordsRuntime,
): Promise<void> {
  if (speaker.isHuman) {
    runtime.setHumanContinuation(continueLastWords);
    runtime.showHumanTurn();
    return;
  }

  await runtime.runAISpeech(state, speaker, { afterSpeech: continueLastWords });
}
