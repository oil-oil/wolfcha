import type { GameState, Player } from "@/types/game";
import { GamePhase } from "../core/GamePhase";
import type { GameAction, GameContext, PromptResult, SystemPromptPart } from "../core/types";
import {
  buildGameContext,
  buildDifficultySpeechHint,
  buildPersonaSection,
  buildPlayerTodaySpeech,
  buildTodayTranscript,
  getRoleText,
  getWinCondition,
  getRoleKnowHow,
  buildSystemTextFromParts,
  getDayStartIndex,
} from "@/lib/prompt-utils";
import type { FlowToken } from "@/lib/game-flow-controller";
import {
  addSystemMessage,
  checkWinCondition,
  getNextAliveSeat,
  killPlayer,
  transitionPhase,
} from "@/lib/game-master";
import { getSystemMessages, getUiText } from "@/lib/game-texts";
import { getI18n } from "@/i18n/translator";
import { DELAY_CONFIG } from "@/lib/game-constants";
import { delay } from "@/lib/game-flow-controller";
import { playNarrator } from "@/lib/narrator-audio-player";
import { getPlayerDiedKey } from "@/lib/narrator-voice";

type DaySpeechRuntime = {
  token: FlowToken;
  setGameState: (value: GameState | ((prev: GameState) => GameState)) => void;
  setDialogue: (speaker: string, text: string, isStreaming?: boolean) => void;
  waitForUnpause: () => Promise<void>;
  runAISpeech: (state: GameState, player: Player) => Promise<void>;
  onBadgeTransfer: (state: GameState, sheriff: Player, afterTransfer: (s: GameState) => Promise<void>) => Promise<void>;
  onHunterDeath: (state: GameState, hunter: Player, diedAtNight: boolean) => Promise<void>;
  onGameEnd: (state: GameState, winner: "village" | "wolf") => Promise<void>;
  onStartVote: (state: GameState, token: FlowToken) => Promise<void>;
  onBadgeSpeechEnd: (state: GameState) => Promise<void>;
  onPkSpeechEnd: (state: GameState) => Promise<void>;
};

export class DaySpeechPhase extends GamePhase {
  private isMovingToNextSpeaker = false;

  private resolveSpeechDirection(state: GameState, startSeat: number | null): "clockwise" | "counterclockwise" {
    if (startSeat === null) return "clockwise";
    const sheriffSeat = state.badge.holderSeat;
    if (sheriffSeat === null) return "clockwise";

    const aliveSeats = state.players.filter((p) => p.alive).map((p) => p.seat).sort((a, b) => a - b);
    if (!aliveSeats.includes(startSeat) || !aliveSeats.includes(sheriffSeat)) return "clockwise";

    const total = aliveSeats.length;
    const startIndex = aliveSeats.indexOf(startSeat);
    const sheriffIndex = aliveSeats.indexOf(sheriffSeat);
    if (startIndex === sheriffIndex) return "clockwise";

    const clockwiseSteps = (sheriffIndex - startIndex + total) % total;
    const counterSteps = (startIndex - sheriffIndex + total) % total;
    return clockwiseSteps >= counterSteps ? "clockwise" : "counterclockwise";
  }

  async onEnter(_context: GameContext): Promise<void> {
    return;
  }

  getPrompt(context: GameContext, player: Player): PromptResult {
    const { t } = getI18n();
    const state = context.state;
    const gameContext = buildGameContext(state, player);
    const isGenshinMode = !!state.isGenshinMode;
    const persona = buildPersonaSection(player, isGenshinMode);
    const difficultyHint = buildDifficultySpeechHint(state.difficulty);
    const totalSeats = state.players.length;

    const todayTranscript = buildTodayTranscript(state, 2000);
    const selfSpeech = buildPlayerTodaySpeech(state, player, 1400);

    const todaySpeakers = new Set<string>();
    const dayStartIndex = getDayStartIndex(state);

    for (let i = dayStartIndex; i < state.messages.length; i++) {
      const m = state.messages[i];
      if (!m.isSystem && m.playerId && m.playerId !== player.playerId) {
        todaySpeakers.add(m.playerId);
      }
    }

    const isLastWords = state.phase === "DAY_LAST_WORDS";
    const isBadgeSpeech = state.phase === "DAY_BADGE_SPEECH";
    const isPkSpeech = state.phase === "DAY_PK_SPEECH";
    const isCampaignSpeech = isBadgeSpeech || isPkSpeech;

    // Define valid speakers for this phase (campaign-only speakers)
    const candidates =
      isBadgeSpeech && Array.isArray(state.badge?.candidates) ? state.badge.candidates : [];
    const pkTargets = isPkSpeech && Array.isArray(state.pkTargets) ? state.pkTargets : [];

    const hasCandidateList = isBadgeSpeech && candidates.length > 0;

    const validSpeakers = state.players.filter(p => {
        if (!p.alive) return false;
        // If candidates list is unexpectedly empty, fallback to alive players to avoid division by zero.
        if (isBadgeSpeech) return hasCandidateList ? candidates.includes(p.seat) : true;
        if (isPkSpeech) return pkTargets.includes(p.seat);
        return true;
    });

    const totalSpeakers = validSpeakers.length;
    
    // Recalculate speak order based on valid speakers only
    const spokenPlayers = validSpeakers.filter(
      (p) => todaySpeakers.has(p.playerId) && p.playerId !== player.playerId
    );
    const unspokenPlayers = validSpeakers.filter(
      (p) => !todaySpeakers.has(p.playerId) && p.playerId !== player.playerId
    );

    const speakOrder = spokenPlayers.length + 1;
    const isFirstSpeaker = speakOrder === 1;
    const isLastSpeaker = speakOrder === totalSpeakers;

    let speakOrderHint = "";
    if (isFirstSpeaker) {
      speakOrderHint = t("prompts.daySpeech.speakOrder.first");
    } else if (isLastSpeaker) {
      speakOrderHint = t("prompts.daySpeech.speakOrder.last", { speakOrder, totalSpeakers });
    } else {
      const spokenList = spokenPlayers.map((p) => t("ui.seatNumber", { seat: p.seat + 1 })).join(t("common.listSeparator"));
      const unspokenList = unspokenPlayers.map((p) => t("ui.seatNumber", { seat: p.seat + 1 })).join(t("common.listSeparator"));
      speakOrderHint = t("prompts.daySpeech.speakOrder.middle", { speakOrder, totalSpeakers, spokenList: spokenList || t("common.none"), unspokenList: unspokenList || t("common.none") });
    }

    const nonCandidateList = state.players
      .filter((p) => p.alive && !candidates.includes(p.seat))
      .map((p) => t("ui.seatNumber", { seat: p.seat + 1 }))
      .join(t("common.listSeparator"));
    const campaignRequirements = isBadgeSpeech
      ? t("prompts.daySpeech.campaign.badge") + "\n" + (hasCandidateList
        ? t("prompts.daySpeech.campaign.candidateNote", { list: nonCandidateList })
        : t("prompts.daySpeech.campaign.emptyCandidateNote"))
      : isPkSpeech
        ? t("prompts.daySpeech.campaign.pk")
        : "";

    // Get role-specific strategy tips
    const roleKnowHow = getRoleKnowHow(player.role);

    const baseCacheable = t("prompts.daySpeech.base", {
      seat: player.seat + 1,
      name: player.displayName,
      role: getRoleText(player.role),
      winCondition: getWinCondition(player.role),
      persona,
      difficultyHint,
    });
    const taskLine = isLastWords 
      ? t("prompts.daySpeech.task.lastWords", { seat: player.seat + 1, name: player.displayName }) 
      : isCampaignSpeech 
        ? t("prompts.daySpeech.task.campaign") 
        : t("prompts.daySpeech.task.dayDiscussion");
    const taskSection = t("prompts.daySpeech.task.section", { taskLine, campaignRequirements: campaignRequirements ? "\n" + campaignRequirements : "" });
    const roleHintLine = player.role === "Werewolf" ? t("prompts.daySpeech.roleHints.werewolf") : player.role === "Seer" ? t("prompts.daySpeech.roleHints.seer") : "";
    const guidelinesSection = isGenshinMode
      ? t("prompts.daySpeech.guidelines.genshin")
      : t("prompts.daySpeech.guidelines.default", { playerName: player.displayName, roleHintLine });
    const systemParts: SystemPromptPart[] = [
      { text: baseCacheable, cacheable: true, ttl: "1h" },
      { text: taskSection },
      { text: roleKnowHow },
      { text: guidelinesSection, cacheable: true, ttl: "1h" },
    ];
    const system = buildSystemTextFromParts(systemParts);

    const phaseHint = isBadgeSpeech
      ? t("prompts.daySpeech.phaseHint.badge")
      : isPkSpeech
        ? t("prompts.daySpeech.phaseHint.pk")
        : "";
    const phaseHintSection = phaseHint ? t("prompts.daySpeech.phaseSection", { phaseHint }) : "";

    const user = t("prompts.daySpeech.user", {
      gameContext,
      todayTranscript: todayTranscript || t("prompts.daySpeech.userNoTranscript", { speakOrder }),
      selfSpeech: selfSpeech || t("prompts.daySpeech.userNoSelfSpeech"),
      phaseHintSection,
      speakOrderHint,
    });

    return { system, user, systemParts };
  }

  async handleAction(_context: GameContext, _action: GameAction): Promise<void> {
    const runtime = this.getRuntime(_context);
    if (!runtime) return;

    if (_action.type === "START_DAY_SPEECH_AFTER_BADGE") {
      await this.startDaySpeechAfterBadge(_context.state, runtime, _action.options);
      return;
    }
    if (_action.type === "ADVANCE_SPEAKER") {
      await this.advanceSpeaker(_context.state, runtime);
    }
  }

  async onExit(_context: GameContext): Promise<void> {
    return;
  }

  private getRuntime(context: GameContext): DaySpeechRuntime | null {
    const raw = context.extras as DaySpeechRuntime | undefined;
    if (!raw) return null;
    if (!raw.setGameState || !raw.setDialogue || !raw.waitForUnpause) return null;
    if (!raw.runAISpeech || !raw.onBadgeTransfer || !raw.onHunterDeath || !raw.onGameEnd) return null;
    if (!raw.onStartVote || !raw.onBadgeSpeechEnd || !raw.onPkSpeechEnd) return null;
    return raw;
  }

  private async startDaySpeechAfterBadge(
    state: GameState,
    runtime: DaySpeechRuntime,
    options?: { skipAnnouncements?: boolean }
  ): Promise<void> {
    const { t } = getI18n();
    const systemMessages = getSystemMessages();
    const uiText = getUiText();
    const speakerHost = t("speakers.host");
    const speakerHint = t("speakers.hint");
    let currentState = state;
    const skipAnnouncements = options?.skipAnnouncements === true;

    const { pendingWolfVictim, pendingPoisonVictim } = currentState.nightActions;
    let hasDeaths = false;
    let wolfVictim: Player | undefined;
    let poisonVictim: Player | undefined;

    if (!skipAnnouncements) {
      if (pendingWolfVictim !== undefined) {
        hasDeaths = true;
        currentState = killPlayer(currentState, pendingWolfVictim);
        wolfVictim = currentState.players.find((p) => p.seat === pendingWolfVictim);
        if (wolfVictim) {
          currentState = addSystemMessage(
            currentState,
            systemMessages.playerKilled(wolfVictim.seat + 1, wolfVictim.displayName)
          );
          runtime.setDialogue(
            speakerHost,
            systemMessages.playerKilled(wolfVictim.seat + 1, wolfVictim.displayName),
            false
          );
          runtime.setGameState(currentState);

          const diedKey = getPlayerDiedKey(wolfVictim.seat);
          if (diedKey) await playNarrator(diedKey);

          await delay(DELAY_CONFIG.LONG);
          await runtime.waitForUnpause();
        }
      }

      if (pendingPoisonVictim !== undefined) {
        hasDeaths = true;
        currentState = killPlayer(currentState, pendingPoisonVictim);
        poisonVictim = currentState.players.find((p) => p.seat === pendingPoisonVictim);
        if (poisonVictim) {
          if (poisonVictim.role === "Hunter") {
            currentState = {
              ...currentState,
              roleAbilities: { ...currentState.roleAbilities, hunterCanShoot: false },
            };
          }
          currentState = addSystemMessage(
            currentState,
            systemMessages.playerPoisoned(poisonVictim.seat + 1, poisonVictim.displayName)
          );
          runtime.setDialogue(
            speakerHost,
            systemMessages.playerPoisoned(poisonVictim.seat + 1, poisonVictim.displayName),
            false
          );
          runtime.setGameState(currentState);

          const poisonDiedKey = getPlayerDiedKey(poisonVictim.seat);
          if (poisonDiedKey) await playNarrator(poisonDiedKey);

          await delay(DELAY_CONFIG.LONG);
          await runtime.waitForUnpause();
        }
      }

      if (!hasDeaths) {
        currentState = addSystemMessage(currentState, systemMessages.peacefulNight);
        runtime.setDialogue(speakerHost, systemMessages.peacefulNight, false);
        runtime.setGameState(currentState);

        await playNarrator("peacefulNight");

        await delay(DELAY_CONFIG.NIGHT_RESOLVE);
        await runtime.waitForUnpause();
      }
    }

    currentState = {
      ...currentState,
      nightActions: {
        ...currentState.nightActions,
        pendingWolfVictim: undefined,
        pendingPoisonVictim: undefined,
      },
    };
    runtime.setGameState(currentState);

    const currentSheriffSeat = currentState.badge.holderSeat;
    const sheriffPlayer =
      currentSheriffSeat !== null ? currentState.players.find((p) => p.seat === currentSheriffSeat) : null;
    const deadSheriff = sheriffPlayer && !sheriffPlayer.alive ? sheriffPlayer : null;

    const resolveStartSeat = (speechState: GameState, options?: { preferSheriff?: boolean }): number | null => {
      const aliveSeats = speechState.players
        .filter((p) => p.alive)
        .map((p) => p.seat)
        .sort((a, b) => a - b);
      if (aliveSeats.length === 0) return null;

      const preferSheriff = options?.preferSheriff !== false;
      if (preferSheriff) {
        const sheriffSeat = speechState.badge.holderSeat;
        if (typeof sheriffSeat === "number" && aliveSeats.includes(sheriffSeat)) {
          return sheriffSeat;
        }
      }
      return aliveSeats[0];
    };

    if (deadSheriff) {
      await runtime.onBadgeTransfer(currentState, deadSheriff, async (afterTransferState) => {
        if (wolfVictim?.role === "Hunter" && afterTransferState.roleAbilities.hunterCanShoot) {
          await runtime.onHunterDeath(afterTransferState, wolfVictim, true);
          return;
        }

        const winnerAfterTransfer = checkWinCondition(afterTransferState);
        if (winnerAfterTransfer) {
          await runtime.onGameEnd(afterTransferState, winnerAfterTransfer);
          return;
        }

        let speechState = transitionPhase(afterTransferState, "DAY_SPEECH");
        speechState = addSystemMessage(speechState, systemMessages.dayDiscussion);

        await playNarrator("discussionStart");

        const alivePlayers = speechState.players.filter((p) => p.alive);
        const startSeat = resolveStartSeat(speechState, { preferSheriff: false });
        const firstSpeaker =
          startSeat !== null ? alivePlayers.find((p) => p.seat === startSeat) || null : null;
        const speechDirection: "clockwise" = "clockwise";
        speechState = {
          ...speechState,
          daySpeechStartSeat: startSeat,
          currentSpeakerSeat: firstSpeaker?.seat ?? null,
          speechDirection,
        };

        runtime.setDialogue(speakerHost, uiText.speechOrder, false);
        runtime.setGameState(speechState);

        await delay(1500);
        await runtime.waitForUnpause();

        if (firstSpeaker && !firstSpeaker.isHuman) {
          await runtime.runAISpeech(speechState, firstSpeaker);
        } else if (firstSpeaker?.isHuman) {
          runtime.setDialogue(speakerHint, uiText.yourTurn, false);
        }
      });
      return;
    }

    if (wolfVictim?.role === "Hunter" && currentState.roleAbilities.hunterCanShoot) {
      await runtime.onHunterDeath(currentState, wolfVictim, true);
      return;
    }

    const winner = checkWinCondition(currentState);
    if (winner) {
      await runtime.onGameEnd(currentState, winner);
      return;
    }

    let speechState = transitionPhase(currentState, "DAY_SPEECH");
    speechState = addSystemMessage(speechState, systemMessages.dayDiscussion);

    await playNarrator("discussionStart");

    const alivePlayers = speechState.players.filter((p) => p.alive);
    const startSeat = resolveStartSeat(speechState);
    const firstSpeaker =
      startSeat !== null ? alivePlayers.find((p) => p.seat === startSeat) || null : null;
    const speechDirection: "clockwise" = "clockwise";
    speechState = {
      ...speechState,
      daySpeechStartSeat: startSeat,
      currentSpeakerSeat: firstSpeaker?.seat ?? null,
      speechDirection,
    };

    runtime.setDialogue(speakerHost, uiText.speechOrder, false);
    runtime.setGameState(speechState);

    await delay(1500);
    await runtime.waitForUnpause();

    if (firstSpeaker && !firstSpeaker.isHuman) {
      await runtime.runAISpeech(speechState, firstSpeaker);
    } else if (firstSpeaker?.isHuman) {
      runtime.setDialogue(speakerHint, uiText.yourTurn, false);
    }
  }

  private async advanceSpeaker(state: GameState, runtime: DaySpeechRuntime): Promise<void> {
    const { t } = getI18n();
    const uiText = getUiText();
    const speakerHint = t("speakers.hint");
    if (this.isMovingToNextSpeaker) return;
    this.isMovingToNextSpeaker = true;

    try {
      const getNextPkSeat = (): number | null => {
        const pkTargets = state.pkTargets || [];
        if (pkTargets.length === 0) return null;
        const currentSeat = state.currentSpeakerSeat ?? -1;
        const currentIndex = pkTargets.indexOf(currentSeat);
        const nextIndex = currentIndex + 1;
        if (currentIndex === -1) return pkTargets[0] ?? null;
        if (nextIndex >= pkTargets.length) return null;
        return pkTargets[nextIndex];
      };

      const getNextCandidateSeat = (): number | null => {
        const candidates = state.badge.candidates || [];
        const aliveCandidateSeats = candidates.filter((seat) =>
          state.players.some((p) => p.seat === seat && p.alive)
        );
        if (aliveCandidateSeats.length === 0) return null;

        const total = state.players.length;
        let cursor = (state.currentSpeakerSeat ?? -1) + 1;
        for (let step = 0; step < total; step++) {
          const seat = ((cursor + step) % total + total) % total;
          if (aliveCandidateSeats.includes(seat)) return seat;
        }
        return null;
      };

      const isDaySpeech = state.phase === "DAY_SPEECH";

      let nextSeat: number | null;
      if (state.phase === "DAY_PK_SPEECH") {
        nextSeat = getNextPkSeat();
      } else if (state.phase === "DAY_BADGE_SPEECH") {
        nextSeat = getNextCandidateSeat();
      } else {
        const direction = state.speechDirection ?? "clockwise";
        const sheriffSeat = state.badge.holderSeat;
        const isSheriffAlive = typeof sheriffSeat === "number" && state.players.some((p) => p.seat === sheriffSeat && p.alive);

        if (isDaySpeech && isSheriffAlive) {
          nextSeat = getNextAliveSeat(state, state.currentSpeakerSeat ?? -1, true, direction);
          // If we're about to loop back to the start, schedule sheriff as the final speaker.
          if (nextSeat !== null && nextSeat === state.daySpeechStartSeat && state.currentSpeakerSeat !== sheriffSeat) {
            nextSeat = sheriffSeat;
          }
        } else {
          nextSeat = getNextAliveSeat(state, state.currentSpeakerSeat ?? -1, false, direction);
        }
      }

      const startSeat = state.daySpeechStartSeat;

      if (nextSeat === null) {
        if (state.phase === "DAY_PK_SPEECH") {
          await runtime.onPkSpeechEnd(state);
          return;
        }
        if (state.phase === "DAY_BADGE_SPEECH") {
          await runtime.onBadgeSpeechEnd(state);
          return;
        }
        await runtime.onStartVote(state, runtime.token);
        return;
      }

      if (startSeat !== null && nextSeat === startSeat) {
        if (state.phase === "DAY_PK_SPEECH") {
          await runtime.onPkSpeechEnd(state);
          return;
        }
        if (state.phase === "DAY_BADGE_SPEECH") {
          await runtime.onBadgeSpeechEnd(state);
          return;
        }
        await runtime.onStartVote(state, runtime.token);
        return;
      }

      const currentState = { ...state, currentSpeakerSeat: nextSeat };
      runtime.setGameState(currentState);

      const nextPlayer = currentState.players.find((p) => p.seat === nextSeat);
      if (nextPlayer && !nextPlayer.isHuman) {
        await runtime.runAISpeech(currentState, nextPlayer);
      } else if (nextPlayer?.isHuman) {
        runtime.setDialogue(speakerHint, uiText.yourTurn, false);
      }
    } finally {
      this.isMovingToNextSpeaker = false;
    }
  }
}
