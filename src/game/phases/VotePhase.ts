import type { GameState, Player } from "@/types/game";
import { GamePhase } from "../core/GamePhase";
import type { GameAction, GameContext, PromptResult, SystemPromptPart } from "../core/types";
import {
  buildGameContext,
  buildDifficultyDecisionHint,
  buildTodayTranscript,
  buildPlayerTodaySpeech,
  getRoleText,
  getWinCondition,
  getRoleKnowHow,
  buildSystemTextFromParts,
} from "@/lib/prompt-utils";
import { getI18n } from "@/i18n/translator";
import {
  addSystemMessage,
  checkWinCondition,
  generateAIVote,
  killPlayer,
  tallyVotes,
  transitionPhase,
} from "@/lib/game-master";
import { getSystemMessages, getUiText } from "@/lib/game-texts";
import { DELAY_CONFIG } from "@/lib/game-constants";
import { delay, type FlowToken } from "@/lib/game-flow-controller";
import { playNarrator } from "@/lib/narrator-audio-player";
import { getPlayerDiedKey } from "@/lib/narrator-voice";

type VotePhaseRuntime = {
  token: FlowToken;
  isRevote?: boolean;
  humanPlayer: Player | null;
  setGameState: (value: GameState | ((prev: GameState) => GameState)) => void;
  setDialogue: (speaker: string, text: string, isStreaming?: boolean) => void;
  setIsWaitingForAI: (waiting: boolean) => void;
  waitForUnpause: () => Promise<void>;
  isTokenValid: (token: FlowToken) => boolean;
  onVoteComplete: (state: GameState, result: { seat: number; count: number } | null) => Promise<void>;
  onGameEnd: (state: GameState, winner: "village" | "wolf") => Promise<void>;
  runAISpeech: (state: GameState, player: Player) => Promise<void>;
};

export class VotePhase extends GamePhase {
  async onEnter(context: GameContext): Promise<void> {
    const runtime = this.getRuntime(context);
    if (!runtime) return;

    const { t } = getI18n();
    const uiText = getUiText();
    const systemMessages = getSystemMessages();
    const speakerHost = t("speakers.host");
    const speakerHint = t("speakers.hint");

    const { humanPlayer, setDialogue, setGameState, setIsWaitingForAI, waitForUnpause, isTokenValid, token } = runtime;
    const isRevote = runtime.isRevote === true;

    let currentState = transitionPhase(context.state, "DAY_VOTE");
    currentState = {
      ...currentState,
      currentSpeakerSeat: null,
      nextSpeakerSeatOverride: null,
      votes: {},
      voteReasons: {},
      pkTargets: isRevote ? context.state.pkTargets : undefined,
      pkSource: isRevote ? "vote" : undefined,
    };
    currentState = addSystemMessage(currentState, systemMessages.voteStart);
    setDialogue(speakerHost, humanPlayer?.alive ? uiText.votePrompt : uiText.aiVoting, false);
    setGameState(currentState);

    await playNarrator("voteStart");
    await waitForUnpause();

    if (humanPlayer?.alive) {
      setDialogue(speakerHint, uiText.clickToVote, false);
    }

    // PK投票时，参与PK的人不能投票
    const pkTargets = currentState.pkSource === "vote" && Array.isArray(currentState.pkTargets) ? currentState.pkTargets : [];
    const aiPlayers = currentState.players.filter((p) => p.alive && !p.isHuman && !pkTargets.includes(p.seat));
    let tokenInvalidated = false;
    setIsWaitingForAI(true);
    try {
      for (const aiPlayer of aiPlayers) {
        if (!isTokenValid(token)) {
          tokenInvalidated = true;
          break;
        }
        const vote = await generateAIVote(currentState, aiPlayer);
        if (!isTokenValid(token)) {
          tokenInvalidated = true;
          break;
        }

        setGameState((prevState) => ({
          ...prevState,
          votes: { ...prevState.votes, [aiPlayer.playerId]: vote.seat },
          voteReasons: { ...(prevState.voteReasons || {}), [aiPlayer.playerId]: vote.reason },
        }));
        currentState = {
          ...currentState,
          votes: { ...currentState.votes, [aiPlayer.playerId]: vote.seat },
          voteReasons: { ...(currentState.voteReasons || {}), [aiPlayer.playerId]: vote.reason },
        };
      }
    } finally {
      setIsWaitingForAI(false);
    }
    if (tokenInvalidated) return;

    if (!humanPlayer?.alive) {
      await this.resolveVotes(currentState, runtime);
    }
  }

  getPrompt(context: GameContext, player: Player): PromptResult {
    const state = context.state;
    const gameContext = buildGameContext(state, player);
    const eligibleSeats =
      state.pkSource === "vote" && state.pkTargets && state.pkTargets.length > 0
        ? new Set(state.pkTargets)
        : null;
    const difficultyHint = buildDifficultyDecisionHint(state.difficulty, player.role);
    const alivePlayers = state.players.filter(
      (p) =>
        p.alive &&
        p.playerId !== player.playerId &&
        (!eligibleSeats || eligibleSeats.has(p.seat))
    );

    const todayTranscript = buildTodayTranscript(state, 10000);
    const selfSpeech = buildPlayerTodaySpeech(state, player, 2000);

    // Get role-specific strategy tips
    const roleKnowHow = getRoleKnowHow(player.role);

    const { t } = getI18n();
    const cacheableContent = t("prompts.vote.base", {
      seat: player.seat + 1,
      name: player.displayName,
      role: getRoleText(player.role),
      winCondition: getWinCondition(player.role),
      difficultyHint,
    });
    const dynamicContent = t("prompts.vote.task", {
      options: alivePlayers.map((p) => t("prompts.vote.option", { seat: p.seat + 1, name: p.displayName })).join(", "),
      roleHints: roleKnowHow,
    });
    const systemParts: SystemPromptPart[] = [
      { text: cacheableContent, cacheable: true, ttl: "1h" },
      { text: dynamicContent },
    ];
    const system = buildSystemTextFromParts(systemParts);

    const lastReason = state.lastVoteReasons?.[player.playerId];
    const user = t("prompts.vote.user", {
      gameContext,
      todayTranscript: todayTranscript || t("prompts.vote.userNoTranscript"),
      selfSpeech: selfSpeech || t("prompts.vote.userNoSelfSpeech"),
    });

    return { system, user, systemParts };
  }

  async handleAction(_context: GameContext, _action: GameAction): Promise<void> {
    if (_action.type !== "RESOLVE_VOTES") return;
    const runtime = this.getRuntime(_context);
    if (!runtime) return;
    await this.resolveVotes(_context.state, runtime);
  }

  async onExit(_context: GameContext): Promise<void> {
    return;
  }

  private getRuntime(context: GameContext): VotePhaseRuntime | null {
    const raw = context.extras as VotePhaseRuntime | undefined;
    if (!raw) return null;
    if (!raw.setGameState || !raw.setDialogue || !raw.waitForUnpause || !raw.isTokenValid) return null;
    return raw;
  }

  private getVoteCounts(state: GameState): Record<number, number> {
    const counts: Record<number, number> = {};
    const sheriffSeat = state.badge.holderSeat;
    const sheriffPlayer =
      sheriffSeat !== null ? state.players.find((p) => p.seat === sheriffSeat && p.alive) : null;
    const sheriffPlayerId = sheriffPlayer?.playerId;
    const aliveById = new Set(state.players.filter((p) => p.alive).map((p) => p.playerId));
    const aliveBySeat = new Set(state.players.filter((p) => p.alive).map((p) => p.seat));

    for (const [voterId, targetSeat] of Object.entries(state.votes)) {
      if (!aliveById.has(voterId)) continue;
      if (!aliveBySeat.has(targetSeat)) continue;
      const weight = voterId === sheriffPlayerId ? 1.5 : 1;
      counts[targetSeat] = (counts[targetSeat] || 0) + weight;
    }
    return counts;
  }

  private generateVoteDetails(
    votes: Record<string, number>,
    players: Player[],
    title: string,
    sheriffSeat: number | null
  ): string {
    const { t } = getI18n();
    const sheriffPlayer =
      sheriffSeat !== null ? players.find((p) => p.seat === sheriffSeat && p.alive) : null;
    const sheriffPlayerId = sheriffPlayer?.playerId;
    const aliveById = new Set(players.filter((p) => p.alive).map((p) => p.playerId));
    const aliveBySeat = new Set(players.filter((p) => p.alive).map((p) => p.seat));

    const voteGroups: Record<number, number[]> = {};
    Object.entries(votes).forEach(([playerId, targetSeat]) => {
      if (!aliveById.has(playerId)) return;
      if (!aliveBySeat.has(targetSeat)) return;
      const voter = players.find((p) => p.playerId === playerId);
      if (voter) {
        if (!voteGroups[targetSeat]) voteGroups[targetSeat] = [];
        voteGroups[targetSeat].push(voter.seat);
      }
    });

    const voteResults = Object.entries(voteGroups)
      .map(([targetSeat, voterSeats]) => {
        const target = players.find((p) => p.seat === Number(targetSeat));
        let voteCount = 0;
        voterSeats.forEach((voterSeat) => {
          const voter = players.find((p) => p.seat === voterSeat);
          if (voter) {
            voteCount += voter.playerId === sheriffPlayerId ? 1.5 : 1;
          }
        });
        return {
          targetSeat: Number(targetSeat),
          targetName: target?.displayName || t("devConsole.unknown"),
          voterSeats,
          voteCount,
        };
      })
      .sort((a, b) => b.voteCount - a.voteCount);

    return `[VOTE_RESULT]${JSON.stringify({ title, results: voteResults })}`;
  }

  private async resolveVotes(state: GameState, runtime: VotePhaseRuntime): Promise<void> {
    const { t } = getI18n();
    const uiText = getUiText();
    const systemMessages = getSystemMessages();
    const speakerHost = t("speakers.host");
    const speakerHint = t("speakers.hint");

    let currentState = transitionPhase(state, "DAY_RESOLVE");

    const currentVotes = { ...state.votes };
    const newHistory = { ...state.voteHistory, [state.day]: currentVotes };
    currentState = { ...currentState, voteHistory: newHistory };

    runtime.setGameState(currentState);
    await runtime.waitForUnpause();

    const result = tallyVotes(currentState);

    const prevDayRecord = (currentState.dayHistory || {})[currentState.day] || {};
    if (result) {
      currentState = {
        ...currentState,
        dayHistory: {
          ...(currentState.dayHistory || {}),
          [currentState.day]: { ...prevDayRecord, executed: { seat: result.seat, votes: result.count }, voteTie: false },
        },
      };
    } else {
      currentState = {
        ...currentState,
        dayHistory: {
          ...(currentState.dayHistory || {}),
          [currentState.day]: { ...prevDayRecord, executed: undefined, voteTie: true },
        },
      };
    }

    runtime.setGameState(currentState);

    const voteDetailMessage = this.generateVoteDetails(
      currentVotes,
      currentState.players,
      t("votePhase.voteDetailTitle"),
      currentState.badge.holderSeat
    );
    currentState = addSystemMessage(currentState, voteDetailMessage);

    if (result) {
      const executed = currentState.players.find((p) => p.seat === result.seat);
      currentState = addSystemMessage(
        currentState,
        systemMessages.playerExecuted(result.seat + 1, executed?.displayName || "", result.count)
      );
      runtime.setDialogue(
        speakerHost,
        systemMessages.playerExecuted(result.seat + 1, executed?.displayName || "", result.count),
        false
      );

      const diedKey = getPlayerDiedKey(result.seat);
      if (diedKey) await playNarrator(diedKey);

      currentState = {
        ...currentState,
        pkTargets: undefined,
        pkSource: undefined,
      };
    } else {
      const voteCounts = this.getVoteCounts(currentState);
      const maxVotes = Math.max(0, ...Object.values(voteCounts));
      const topSeats = Object.entries(voteCounts)
        .filter(([, c]) => c === maxVotes)
        .map(([s]) => Number(s));

      if (topSeats.length > 1 && currentState.pkSource !== "vote") {
        const pkState = {
          ...currentState,
          pkTargets: topSeats,
          pkSource: "vote" as const,
        };
        let nextState = transitionPhase(pkState, "DAY_PK_SPEECH");
        const firstSeat = topSeats[0] ?? null;
        nextState = {
          ...nextState,
          currentSpeakerSeat: firstSeat,
          daySpeechStartSeat: firstSeat,
        };
        nextState = addSystemMessage(nextState, t("votePhase.tiePk"));
        runtime.setGameState(nextState);
        runtime.setDialogue(speakerHost, t("votePhase.tiePk"), false);

        await delay(DELAY_CONFIG.DIALOGUE);
        await runtime.waitForUnpause();

        const firstSpeaker = nextState.players.find((p) => p.seat === firstSeat);
        if (firstSpeaker && !firstSpeaker.isHuman) {
          await runtime.runAISpeech(nextState, firstSpeaker);
        } else if (firstSpeaker?.isHuman) {
          runtime.setDialogue(speakerHint, uiText.yourTurn, false);
        }
        return;
      }

      currentState = {
        ...currentState,
        pkTargets: undefined,
        pkSource: undefined,
      };
      currentState = addSystemMessage(currentState, systemMessages.voteTie);
      runtime.setDialogue(speakerHost, systemMessages.voteTie, false);
    }

    runtime.setGameState(currentState);

    const executed =
      result ? currentState.players.find((p) => p.seat === result.seat) : null;
    if (result && executed?.role === "Hunter" && currentState.roleAbilities.hunterCanShoot) {
      // Defer win check until after hunter shoot resolves.
      await runtime.onVoteComplete(currentState, result);
      return;
    }

    const winner = checkWinCondition(currentState);
    if (winner) {
      await runtime.onGameEnd(currentState, winner);
      return;
    }

    await runtime.onVoteComplete(currentState, result);
  }
}
