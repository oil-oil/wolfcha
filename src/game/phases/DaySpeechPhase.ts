import type { GameState, Player } from "@/types/game";
import { GamePhase } from "../core/GamePhase";
import type { GameAction, GameContext, PromptResult, SystemPromptPart } from "../core/types";
import {
  buildGameContext,
  buildPersonaSection,
  buildPlayerTodaySpeech,
  buildTodayTranscript,
  getRoleText,
  getWinCondition,
  buildSystemTextFromParts,
  buildPublicFactsForPlayer,
} from "@/lib/prompt-utils";
import type { FlowToken } from "@/lib/game-flow-controller";
import {
  addSystemMessage,
  checkWinCondition,
  getNextAliveSeat,
  killPlayer,
  transitionPhase,
} from "@/lib/game-master";
import { getNextSpeechSeat, getSpeechRoundStatus } from "@/lib/speech-order";
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
  /** AI白狼王自爆决策：返回 true 表示已自爆（由调用方处理后续），false 表示不自爆 */
  onWhiteWolfKingBoomCheck: (state: GameState, wwk: Player) => Promise<boolean>;
};

export class DaySpeechPhase extends GamePhase {
  private isMovingToNextSpeaker = false;

  async onEnter(): Promise<void> {
    return;
  }

  getPrompt(context: GameContext, player: Player): PromptResult {
    const { t } = getI18n();
    const state = context.state;
    // 警长竞选发言(及警徽 PK)发生在夜间死亡正式公布之前，必须与 BadgePhase 的报名/竞选投票
    // 一样隐藏未公布的夜间结果（平安夜/今日死亡），否则会提前泄露"昨晚是否死人"。
    // 投票平票产生的 PK(pkSource==="vote")发生在死亡已公布之后，不需隐藏。
    const isPreAnnouncementCampaign =
      state.phase === "DAY_BADGE_SPEECH" ||
      (state.phase === "DAY_PK_SPEECH" && state.pkSource === "badge");
    const gameContext = buildGameContext(
      state,
      player,
      isPreAnnouncementCampaign ? { excludePendingDeaths: true } : undefined
    );
    const isGenshinMode = !!state.isGenshinMode;
    const persona = buildPersonaSection(player, isGenshinMode);

    const todayTranscript = buildTodayTranscript(state);
    const selfSpeech = buildPlayerTodaySpeech(state, player);
    const selfSpeechContext = selfSpeech
      ? t("promptUtils.gameContext.selfSpeechIncludedInTimeline", { seat: player.seat + 1 })
      : "";

    const isLastWords = state.phase === "DAY_LAST_WORDS";
    const isBadgeSpeech = state.phase === "DAY_BADGE_SPEECH";
    const isPkSpeech = state.phase === "DAY_PK_SPEECH";
    const isCampaignSpeech = isBadgeSpeech || isPkSpeech;

    // Define valid speakers for this phase (campaign-only speakers)
    const candidates =
      isBadgeSpeech && Array.isArray(state.badge?.candidates) ? state.badge.candidates : [];

    const hasCandidateList = isBadgeSpeech && candidates.length > 0;

    const speechRound = getSpeechRoundStatus(state, player.seat);
    const formatSeatList = (seats: number[]) =>
      seats
        .map((seat) => t("ui.seatNumber", { seat: seat + 1 }))
        .join(t("common.listSeparator")) || t("common.none");
    const speakOrder = speechRound.currentPosition;
    const totalSpeakers = speechRound.totalSpeakers;
    const speakOrderHint = t("prompts.daySpeech.speakOrder.status", {
      orderList: formatSeatList(speechRound.orderedSeats),
      currentSeat: t("ui.seatNumber", { seat: player.seat + 1 }),
      speakOrder,
      totalSpeakers,
      spokenList: formatSeatList(
        speechRound.spokenSeats.filter((seat) => seat !== player.seat)
      ),
      passedList: formatSeatList(speechRound.passedWithoutSpeechSeats),
      unspokenList: formatSeatList(speechRound.yetToSpeakSeats),
    });

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

    const publicFactsForPlayer = buildPublicFactsForPlayer(state, player);

    const baseCacheable = t("prompts.daySpeech.base", {
      seat: player.seat + 1,
      name: player.displayName,
      role: getRoleText(player.role),
      winCondition: getWinCondition(player.role),
      persona,
    });
    const wasVotedOut = isLastWords && state.dayHistory?.[state.day]?.executed?.seat === player.seat;
    const taskLine = isLastWords
      ? t(
        player.role === "Hunter" && wasVotedOut
          ? "prompts.daySpeech.task.lastWordsVotedOutHunter"
          : wasVotedOut
            ? "prompts.daySpeech.task.lastWordsVotedOut"
            : "prompts.daySpeech.task.lastWords",
        { seat: player.seat + 1, name: player.displayName }
      )
      : isCampaignSpeech 
        ? t("prompts.daySpeech.task.campaign") 
        : t("prompts.daySpeech.task.dayDiscussion");
    
    const taskSection = t("prompts.daySpeech.task.section", { taskLine, campaignRequirements: campaignRequirements ? "\n" + campaignRequirements : "" });
    const guidelinesSection = isGenshinMode
      ? t("prompts.daySpeech.guidelines.genshin")
      : t("prompts.daySpeech.guidelines.default");
    const systemParts: SystemPromptPart[] = [
      { text: baseCacheable, cacheable: true, ttl: "1h" },
      { text: taskSection },
      ...(publicFactsForPlayer ? [{ text: publicFactsForPlayer }] : []),
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
      selfSpeech: selfSpeechContext || t("prompts.daySpeech.userNoSelfSpeech"),
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

  async onExit(): Promise<void> {
    return;
  }

  private getRuntime(context: GameContext): DaySpeechRuntime | null {
    const raw = context.extras as DaySpeechRuntime | undefined;
    if (!raw) return null;
    if (!raw.setGameState || !raw.setDialogue || !raw.waitForUnpause) return null;
    if (!raw.runAISpeech || !raw.onBadgeTransfer || !raw.onHunterDeath || !raw.onGameEnd) return null;
    if (!raw.onStartVote || !raw.onBadgeSpeechEnd || !raw.onPkSpeechEnd) return null;
    // 提供默认的空实现以保持向后兼容
    if (!raw.onWhiteWolfKingBoomCheck) {
      raw.onWhiteWolfKingBoomCheck = async () => false;
    }
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
        const sameTargetAsWolf =
          pendingWolfVictim !== undefined && pendingPoisonVictim === pendingWolfVictim;

        if (sameTargetAsWolf) {
          const overlappedVictim = currentState.players.find((p) => p.seat === pendingPoisonVictim);
          if (overlappedVictim?.role === "Hunter") {
            currentState = {
              ...currentState,
              roleAbilities: { ...currentState.roleAbilities, hunterCanShoot: false },
            };
          }
        } else {
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
              systemMessages.playerKilled(poisonVictim.seat + 1, poisonVictim.displayName)
            );
            runtime.setDialogue(
              speakerHost,
              systemMessages.playerKilled(poisonVictim.seat + 1, poisonVictim.displayName),
              false
            );
            runtime.setGameState(currentState);

            const poisonDiedKey = getPlayerDiedKey(poisonVictim.seat);
            if (poisonDiedKey) await playNarrator(poisonDiedKey);

            await delay(DELAY_CONFIG.LONG);
            await runtime.waitForUnpause();
          }
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
        const speechDirection = "clockwise" as const;
        
        // 判断警徽是否移交成功
        const newSheriffSeat = speechState.badge.holderSeat;
        const isNewSheriffAlive = newSheriffSeat !== null && 
          alivePlayers.some((p) => p.seat === newSheriffSeat);
        
        let startSeat: number | null;
        if (isNewSheriffAlive) {
          // 警徽移交成功：从新警长下一位开始，新警长最后发言
          startSeat = getNextAliveSeat(speechState, newSheriffSeat, true, speechDirection);
        } else {
          // 警徽撕毁：从死者下一位开始
          startSeat = getNextAliveSeat(speechState, deadSheriff.seat, false, speechDirection);
        }
        
        const firstSpeaker =
          startSeat !== null ? alivePlayers.find((p) => p.seat === startSeat) || null : null;
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
    const speechDirection = "clockwise" as const;
    const sheriffSeat = speechState.badge.holderSeat;
    const isSheriffAlive =
      typeof sheriffSeat === "number" && alivePlayers.some((p) => p.seat === sheriffSeat);

    // 确定发言起始位置
    let startSeat: number | null;
    if (isSheriffAlive) {
      // 有警长存活：从警长下一位开始，警长最后发言
      startSeat = getNextAliveSeat(speechState, sheriffSeat, true, speechDirection);
    } else if (wolfVictim) {
      // 无警长但有死者：从死者下一位开始
      startSeat = getNextAliveSeat(speechState, wolfVictim.seat, false, speechDirection);
    } else {
      // 无警长无死者（和平夜）：从最小座位号开始
      const aliveSeats = alivePlayers.map((p) => p.seat).sort((a, b) => a - b);
      startSeat = aliveSeats[0] ?? null;
    }
    
    const firstSpeaker =
      startSeat !== null ? alivePlayers.find((p) => p.seat === startSeat) || null : null;
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
      // AI白狼王自爆决策：发言结束后检查是否自爆
      if (state.phase === "DAY_SPEECH" || state.phase === "DAY_PK_SPEECH") {
        const currentSpeaker = state.players.find((p) => p.seat === state.currentSpeakerSeat);
        if (
          currentSpeaker &&
          !currentSpeaker.isHuman &&
          currentSpeaker.role === "WhiteWolfKing" &&
          currentSpeaker.alive &&
          !state.roleAbilities.whiteWolfKingBoomUsed
        ) {
          const boomed = await runtime.onWhiteWolfKingBoomCheck(state, currentSpeaker);
          if (boomed) return; // 自爆已处理，不再继续发言流程
        }
      }

      // 实际推进与 Prompt 共用同一个本轮顺序和发言记录来源。
      const nextSeat = getNextSpeechSeat(state);

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
