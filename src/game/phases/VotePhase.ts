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
import {
  addSystemMessage,
  checkWinCondition,
  generateAIVote,
  killPlayer,
  tallyVotes,
  transitionPhase,
} from "@/lib/game-master";
import { SYSTEM_MESSAGES, UI_TEXT } from "@/lib/game-texts";
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
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.voteStart);
    setDialogue("主持人", humanPlayer?.alive ? UI_TEXT.votePrompt : UI_TEXT.aiVoting, false);
    setGameState(currentState);

    await playNarrator("voteStart");
    await waitForUnpause();

    if (humanPlayer?.alive) {
      setDialogue("提示", UI_TEXT.clickToVote, false);
    }

    const aiPlayers = currentState.players.filter((p) => p.alive && !p.isHuman);
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

    const todayTranscript = buildTodayTranscript(state, 9000);
    const selfSpeech = buildPlayerTodaySpeech(state, player, 1200);

    // Get role-specific strategy tips
    const roleKnowHow = getRoleKnowHow(player.role);

    const cacheableContent = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: ${getRoleText(player.role)}

${getWinCondition(player.role)}

${roleKnowHow}

${difficultyHint}`;
    const dynamicContent = `【任务】
投票环节，选择一名玩家处决，并说明理由。
尽量与自己本日发言保持一致。
理由要求：中文，10-25字，指出关键依据，不要角色扮演。

【严禁事项】
- 严禁投票给已出局玩家
- 严禁在理由中提及任何已出局玩家
- 只能基于存活玩家的行为进行判断

可选: ${alivePlayers.map((p) => `${p.seat + 1}号(${p.displayName})`).join(", ")}
`;
    const systemParts: SystemPromptPart[] = [
      { text: cacheableContent, cacheable: true, ttl: "1h" },
      { text: dynamicContent },
    ];
    const system = buildSystemTextFromParts(systemParts);

    const lastReason = state.lastVoteReasons?.[player.playerId];
    const user = `${gameContext}

${todayTranscript ? `【本日讨论记录】\n${todayTranscript}` : "【本日讨论记录】\n（无）"}

${selfSpeech ? `【你本日发言汇总】\n"${selfSpeech}"` : "【你本日发言汇总】\n（你今天没有发言）"}

${lastReason ? `【你上一轮投票理由】\n${lastReason}` : "【你上一轮投票理由】\n（无）"}

你投几号？

【格式】
返回JSON，如 {"seat": 3, "reason": "理由（10-25字）"}
不要解释，不要输出多余文字，不要代码块`;

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
          targetName: target?.displayName || "未知",
          voterSeats,
          voteCount,
        };
      })
      .sort((a, b) => b.voteCount - a.voteCount);

    return `[VOTE_RESULT]${JSON.stringify({ title, results: voteResults })}`;
  }

  private async resolveVotes(state: GameState, runtime: VotePhaseRuntime): Promise<void> {
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

    const voteDetailMessage = this.generateVoteDetails(currentVotes, currentState.players, "投票详情", currentState.badge.holderSeat);
    currentState = addSystemMessage(currentState, voteDetailMessage);

    if (result) {
      currentState = killPlayer(currentState, result.seat);
      const executed = currentState.players.find((p) => p.seat === result.seat);
      currentState = addSystemMessage(
        currentState,
        SYSTEM_MESSAGES.playerExecuted(result.seat + 1, executed?.displayName || "", result.count)
      );
      runtime.setDialogue(
        "主持人",
        SYSTEM_MESSAGES.playerExecuted(result.seat + 1, executed?.displayName || "", result.count),
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
        nextState = addSystemMessage(nextState, "放逐平票，进入PK发言");
        runtime.setGameState(nextState);
        runtime.setDialogue("主持人", "放逐平票，进入PK发言", false);

        await delay(DELAY_CONFIG.DIALOGUE);
        await runtime.waitForUnpause();

        const firstSpeaker = nextState.players.find((p) => p.seat === firstSeat);
        if (firstSpeaker && !firstSpeaker.isHuman) {
          await runtime.runAISpeech(nextState, firstSpeaker);
        } else if (firstSpeaker?.isHuman) {
          runtime.setDialogue("提示", UI_TEXT.yourTurn, false);
        }
        return;
      }

      currentState = {
        ...currentState,
        pkTargets: undefined,
        pkSource: undefined,
      };
      currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.voteTie);
      runtime.setDialogue("主持人", SYSTEM_MESSAGES.voteTie, false);
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
