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

    const todayTranscript = buildTodayTranscript(state, 9000);
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
      const spokenList = spokenPlayers.map((p) => `${p.seat + 1}号`).join("、");
      const unspokenList = unspokenPlayers.map((p) => `${p.seat + 1}号`).join("、");
      speakOrderHint = `你是第${speakOrder}/${totalSpeakers}个发言。已发言: ${spokenList || "无"}；未发言: ${unspokenList || "无"}。`;
    }

    const campaignRequirements = isBadgeSpeech
      ? `【竞选要求】给出上警理由（信息位、带队能力、对局势判断、站边等）。
必须给带队承诺或本轮关注点（如：今天先看谁、怎么归票、怎么处理对跳）。
${hasCandidateList
  ? `注意：仅有参与竞选的玩家会发言，未竞选玩家（${state.players
      .filter((p) => p.alive && !candidates.includes(p.seat))
      .map((p) => `${p.seat + 1}号`)
      .join("、")}）在本环节不会发言。`
  : "注意：候选人列表为空（异常），请只基于当前可见发言记录进行回应，不要臆测未发言者。"}`
      : isPkSpeech
        ? t("prompts.daySpeech.campaign.pk")
        : "";

    // Get role-specific strategy tips
    const roleKnowHow = getRoleKnowHow(player.role);

    const baseCacheable = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: ${getRoleText(player.role)}

【场景】
这是一个线上狼人杀游戏，玩家通过打字交流。

${getWinCondition(player.role)}

${roleKnowHow}

${persona}

${difficultyHint}`;
    const taskSection = `【任务】
${isLastWords ? "你已经出局，现在发表遗言。" : isCampaignSpeech ? "警徽竞选发言阶段，发表你的竞选发言。" : "白天讨论环节，发表你的看法。"}
${campaignRequirements ? `\n${campaignRequirements}` : ""}`;
    const guidelinesSection = isGenshinMode
      ? `【说话要求】
1. 只基于当前局势与规则做判断，不要编造人设背景或口头禅。
2. 发言简洁清晰，说明你这一轮的判断与行动意图。
3. 仅允许提及有效座位号：1号-${totalSeats}号（严禁出现@12、12号等超出范围的编号）。
4. **每条消息限制在40字以内**，避免在单条消息中说太多内容。

【严禁事项】
- 严禁讨论、分析、提及任何已出局玩家（查看【出局玩家】列表）
- 严禁回应或评价已出局玩家曾经说过的话
- 严禁推测已出局玩家的身份或动机
- 只能围绕当前存活玩家进行讨论

【输出格式】
返回 JSON 字符串数组，每个元素是一条消息气泡。
每条消息保持简短（不超过40字），分成2-4条自然的短句。
示例：
["我倾向先看3号的发言细节。", "今天我会把票集中在2号或3号。"]`
      : `【核心原则】
1. **沉浸式扮演**：你就是${player.displayName}，完全融入这个角色的性格和说话习惯。不要只是“模仿”风格，要思考“如果我是他，我现在会怎么想，怎么说”。
2. **性格鲜明**：如果你的设定是暴躁的，那就表现得不耐烦；如果是蠢萌的，那就表现得迷糊一点。不要因为是游戏就强行变身“逻辑大师”。
3. **局内优先**：发言以本局信息为主（发言、站边、投票、夜里结果），避免编剧情节或展开场外话题。
4. **自然对话**：像真人在群聊里打字一样说话。可以是断断续续的短句，可以有感叹、犹豫或情绪化的表达。不要写成“逻辑分析报告”。
5. **针对性互动**：仔细听前几个人的发言，对他们的观点、语气甚至态度做出反应。如果觉得某人好笑就笑，觉得某人胡扯就怼。

【严禁事项】
- 严禁讨论、分析、提及任何已出局玩家（查看【出局玩家】列表）
- 严禁回应或评价已出局玩家曾经说过的话
- 严禁推测已出局玩家的身份或动机
- 只能围绕当前存活玩家进行讨论

【说话指南】
- 允许口语化表达（如：呃、那个、我说...），但不要过度堆砌。
- 人设只体现在语气和措辞里，不要讲设定经历或个人剧情。
- 提到其他玩家时，建议使用"X号"（如"3号"），但在语境清晰时也可以用自然代词（"你"、"前面那个"）。
- 仅允许提及有效座位号：1号-${totalSeats}号（严禁出现@12、12号等超出范围的编号）。
- 严禁出现剧本括号动作（如：*推眼镜*），只输出语音/文字内容。
- 分成 2-5 条自然的消息气泡，长短不一，模拟打字节奏。

【输出格式】
返回 JSON 字符串数组，每个元素是一条消息气泡。
示例：
["哎不是...", "3号你这逻辑也太牵强了吧？", "我感觉你就像是在硬找茬，真的。"]`;
    const systemParts: SystemPromptPart[] = [
      { text: baseCacheable, cacheable: true, ttl: "1h" },
      { text: taskSection },
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
        const sheriffSeat = speechState.badge.holderSeat;
        const nonSheriffPlayers =
          sheriffSeat !== null ? alivePlayers.filter((p) => p.seat !== sheriffSeat) : alivePlayers;
        const startSeat =
          nonSheriffPlayers.length > 0
            ? nonSheriffPlayers[Math.floor(Math.random() * nonSheriffPlayers.length)].seat
            : alivePlayers.length > 0
              ? alivePlayers[0].seat
              : null;
        const firstSpeaker =
          startSeat !== null ? alivePlayers.find((p) => p.seat === startSeat) || null : null;
        const speechDirection = this.resolveSpeechDirection(speechState, startSeat);
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
    const sheriffSeat = speechState.badge.holderSeat;
    const nonSheriffPlayers =
      sheriffSeat !== null ? alivePlayers.filter((p) => p.seat !== sheriffSeat) : alivePlayers;
    const startSeat =
      nonSheriffPlayers.length > 0
        ? nonSheriffPlayers[Math.floor(Math.random() * nonSheriffPlayers.length)].seat
        : alivePlayers.length > 0
          ? alivePlayers[0].seat
          : null;
    const firstSpeaker =
      startSeat !== null ? alivePlayers.find((p) => p.seat === startSeat) || null : null;
    const speechDirection = this.resolveSpeechDirection(speechState, startSeat);
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

      const sheriffSeat = state.badge.holderSeat;
      const isSheriffAlive =
        sheriffSeat !== null && state.players.some((p) => p.seat === sheriffSeat && p.alive);
      const isDaySpeech = state.phase === "DAY_SPEECH";

      let nextSeat: number | null;
      if (state.phase === "DAY_PK_SPEECH") {
        nextSeat = getNextPkSeat();
      } else if (state.phase === "DAY_BADGE_SPEECH") {
        nextSeat = getNextCandidateSeat();
      } else if (isDaySpeech && isSheriffAlive) {
        const direction = state.speechDirection ?? "clockwise";
        nextSeat = getNextAliveSeat(state, state.currentSpeakerSeat ?? -1, true, direction);
      } else {
        const direction = state.speechDirection ?? "clockwise";
        nextSeat = getNextAliveSeat(state, state.currentSpeakerSeat ?? -1, false, direction);
      }

      const startSeat = state.daySpeechStartSeat;
      const sheriffHasSpoken = state.currentSpeakerSeat === sheriffSeat;

      if (isDaySpeech && sheriffHasSpoken) {
        await runtime.onStartVote(state, runtime.token);
        return;
      }

      if (nextSeat === null) {
        if (state.phase === "DAY_PK_SPEECH") {
          await runtime.onPkSpeechEnd(state);
          return;
        }
        if (state.phase === "DAY_BADGE_SPEECH") {
          await runtime.onBadgeSpeechEnd(state);
          return;
        }
        if (isDaySpeech && isSheriffAlive && !sheriffHasSpoken) {
          const currentState = { ...state, currentSpeakerSeat: sheriffSeat };
          runtime.setGameState(currentState);
          const sheriffPlayer = currentState.players.find((p) => p.seat === sheriffSeat);
          if (sheriffPlayer && !sheriffPlayer.isHuman) {
            await runtime.runAISpeech(currentState, sheriffPlayer);
          } else if (sheriffPlayer?.isHuman) {
            runtime.setDialogue(speakerHint, uiText.yourTurn, false);
          }
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
        if (isDaySpeech && isSheriffAlive && !sheriffHasSpoken) {
          const currentState = { ...state, currentSpeakerSeat: sheriffSeat };
          runtime.setGameState(currentState);
          const sheriffPlayer = currentState.players.find((p) => p.seat === sheriffSeat);
          if (sheriffPlayer && !sheriffPlayer.isHuman) {
            await runtime.runAISpeech(currentState, sheriffPlayer);
          } else if (sheriffPlayer?.isHuman) {
            runtime.setDialogue(speakerHint, uiText.yourTurn, false);
          }
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
