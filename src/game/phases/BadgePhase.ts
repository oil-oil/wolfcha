import type { Player } from "@/types/game";
import { GamePhase } from "../core/GamePhase";
import type { GameAction, GameContext, PromptResult, SystemPromptPart } from "../core/types";
import {
  buildDifficultyDecisionHint,
  buildGameContext,
  buildPersonaSection,
  buildTodayTranscript,
  getRoleText,
  getWinCondition,
  buildSystemTextFromParts,
} from "@/lib/prompt-utils";
import { getI18n } from "@/i18n/translator";

export class BadgePhase extends GamePhase {
  async onEnter(_context: GameContext): Promise<void> {
    return;
  }

  getPrompt(context: GameContext, player: Player): PromptResult {
    const state = context.state;
    if (state.phase === "DAY_BADGE_SIGNUP") {
      return this.buildBadgeSignupPrompt(state, player);
    }
    if (state.phase === "DAY_BADGE_ELECTION") {
      return this.buildBadgeElectionPrompt(state, player);
    }
    if (state.phase === "BADGE_TRANSFER") {
      return this.buildBadgeTransferPrompt(state, player);
    }
    return this.buildBadgeElectionPrompt(state, player);
  }

  async handleAction(_context: GameContext, _action: GameAction): Promise<void> {
    return;
  }

  async onExit(_context: GameContext): Promise<void> {
    return;
  }

  private buildBadgeElectionPrompt(state: GameContext["state"], player: Player): PromptResult {
    const { t } = getI18n();
    const candidates = Array.isArray(state.badge?.candidates) ? state.badge.candidates : [];
    const alivePlayers = state.players
      .filter((p) => p.alive && p.playerId !== player.playerId)
      .filter((p) => (candidates.length > 0 ? candidates.includes(p.seat) : true));
    const difficultyHint = buildDifficultyDecisionHint(state.difficulty, player.role);
    const wolfMates =
      player.role === "Werewolf"
        ? state.players
          .filter((p) => p.alive && p.role === "Werewolf" && p.playerId !== player.playerId)
          .map((p) => t("promptUtils.gameContext.seatLabel", { seat: p.seat + 1 }))
          .join(t("promptUtils.gameContext.listSeparator"))
        : "";

    const cacheableContent = t("prompts.badge.election.base", {
      seat: player.seat + 1,
      name: player.displayName,
      role: getRoleText(player.role),
      winCondition: getWinCondition(player.role),
      difficultyHint,
    });
    const dynamicContent = t("prompts.badge.election.task", {
      options: alivePlayers
        .map((p) => t("prompts.badge.option", { seat: p.seat + 1, name: p.displayName }))
        .join(t("promptUtils.gameContext.listSeparator")),
    });
    const systemParts: SystemPromptPart[] = [
      { text: cacheableContent, cacheable: true, ttl: "1h" },
      { text: dynamicContent },
    ];
    const system = buildSystemTextFromParts(systemParts);

    const recent = state.messages
      .slice(-6)
      .map((m) => `${m.playerName}: ${m.content}`)
      .join("\n");

    const liteContextLines = [
      t("prompts.badge.election.contextHeader", { day: state.day }),
      wolfMates ? t("prompts.badge.election.contextWolves", { list: wolfMates }) : "",
      recent ? t("prompts.badge.election.contextRecent", { text: recent }) : "",
    ].filter(Boolean);

    const user = t("prompts.badge.election.user", { context: liteContextLines.join("\n\n") });

    return { system, user, systemParts };
  }

  private buildBadgeSignupPrompt(state: GameContext["state"], player: Player): PromptResult {
    const context = buildGameContext(state, player);
    const difficultyHint = buildDifficultyDecisionHint(state.difficulty, player.role);
    const isGenshinMode = !!state.isGenshinMode;
    const persona = buildPersonaSection(player, isGenshinMode);
    const todayTranscript = buildTodayTranscript(state, 6000);

    const cacheableContent = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: ${getRoleText(player.role)}

${getWinCondition(player.role)}

${persona}

${difficultyHint}`;
    const dynamicContent = `【任务】
现在是警徽竞选报名环节。请根据当前局势决定是否报名竞选警长。
好人阵营：报名的收益是带队与控票，但也可能暴露目标。
狼人阵营：报名可以带节奏，但也更容易被针对。

【报名原则】如果没有重要信息可分享，或无法说服他人、难以带队，优先选择不报名（0）。

【输出格式】
只输出单个数字：1 表示报名，0 表示不报名
不要解释，不要输出多余文字，不要代码块`;
    const systemParts: SystemPromptPart[] = [
      { text: cacheableContent, cacheable: true, ttl: "1h" },
      { text: dynamicContent },
    ];
    const system = buildSystemTextFromParts(systemParts);

    const user = `${context}

${todayTranscript ? `【本日讨论记录】\n${todayTranscript}` : "【本日讨论记录】\n（无）"}

是否报名竞选警长？`;

    return { system, user, systemParts };
  }

  private buildBadgeTransferPrompt(state: GameContext["state"], player: Player): PromptResult {
    const { t } = getI18n();
    const context = buildGameContext(state, player);
    const difficultyHint = buildDifficultyDecisionHint(state.difficulty, player.role);
    const alivePlayers = state.players.filter(
      (p) => p.alive && p.playerId !== player.playerId
    );

    const roleHints =
      player.role === "Werewolf"
        ? t("prompts.badge.transfer.roleHintWerewolf")
        : t("prompts.badge.transfer.roleHintGood");

    const cacheableContent = t("prompts.badge.transfer.base", {
      seat: player.seat + 1,
      name: player.displayName,
      role: getRoleText(player.role),
      winCondition: getWinCondition(player.role),
      difficultyHint,
    });
    const dynamicContent = t("prompts.badge.transfer.task", {
      options: alivePlayers
        .map((p) => t("prompts.badge.option", { seat: p.seat + 1, name: p.displayName }))
        .join(t("promptUtils.gameContext.listSeparator")),
      roleHints,
    });
    const systemParts: SystemPromptPart[] = [
      { text: cacheableContent, cacheable: true, ttl: "1h" },
      { text: dynamicContent },
    ];
    const system = buildSystemTextFromParts(systemParts);

    const todayTranscript = buildTodayTranscript(state, 6000);

    const user = t("prompts.badge.transfer.user", {
      context,
      todayTranscript: todayTranscript || t("prompts.badge.transfer.noTranscript"),
    });

    return { system, user, systemParts };
  }
}
