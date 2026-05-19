import type { Player } from "@/types/game";
import { GamePhase } from "../core/GamePhase";
import type { GameContext, PromptResult, SystemPromptPart } from "../core/types";
import {
  buildGameContext,
  buildPersonaSection,
  buildTodayTranscript,
  getRoleText,
  getWinCondition,
  buildSystemTextFromParts,
} from "@/lib/prompt-utils";
import { getI18n } from "@/i18n/translator";

export class BadgePhase extends GamePhase {
  async onEnter(): Promise<void> {
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

  async handleAction(): Promise<void> {
    return;
  }

  async onExit(): Promise<void> {
    return;
  }

  private buildBadgeElectionPrompt(state: GameContext["state"], player: Player): PromptResult {
    const { t } = getI18n();
    const candidates = Array.isArray(state.badge?.candidates) ? state.badge.candidates : [];
    const candidateSet = new Set(candidates);
    const alivePlayers = state.players
      .filter((p) => p.alive && p.playerId !== player.playerId)
      .filter((p) => (candidates.length > 0 ? candidates.includes(p.seat) : true));
    const context = buildGameContext(state, player, { excludePendingDeaths: true });

    const cacheableContent = t("prompts.badge.election.base", {
      seat: player.seat + 1,
      name: player.displayName,
      role: getRoleText(player.role),
      winCondition: getWinCondition(player.role),
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

    const seatByPlayerId = new Map(state.players.map((p) => [p.playerId, p.seat] as const));
    const badgeSpeechText = state.messages
      .filter((m) => m.day === state.day)
      .filter((m) => !m.isSystem)
      .filter((m) => m.phase === "DAY_BADGE_SPEECH" || m.phase === "DAY_PK_SPEECH")
      .filter((m) => {
        if (candidateSet.size === 0) return true;
        const seat = seatByPlayerId.get(m.playerId);
        return typeof seat === "number" && candidateSet.has(seat);
      })
      .map((m) => `${m.playerName}: ${m.content}`)
      .join("\n");

    const liteContextLines = [
      context,
      t("prompts.badge.election.contextHeader", { day: state.day }),
      badgeSpeechText ? t("prompts.badge.election.contextRecent", { text: badgeSpeechText }) : "",
    ].filter(Boolean);

    const user = t("prompts.badge.election.user", { context: liteContextLines.join("\n\n") });

    return { system, user, systemParts };
  }

  private buildBadgeSignupPrompt(state: GameContext["state"], player: Player): PromptResult {
    // excludePendingDeaths: true - 警长竞选时夜间死亡还未公布，AI不应知道是否平安夜
    const context = buildGameContext(state, player, { excludePendingDeaths: true });
    const isGenshinMode = !!state.isGenshinMode;
    const persona = buildPersonaSection(player, isGenshinMode);
    const todayTranscript = buildTodayTranscript(state);

    const { t } = getI18n();
    
    const cacheableContent = t("prompts.badge.signup.base", {
      seat: player.seat + 1,
      name: player.displayName,
      role: getRoleText(player.role),
      winCondition: getWinCondition(player.role),
      persona,
    });
    const dynamicContent = t("prompts.badge.signup.task");
    const systemParts: SystemPromptPart[] = [
      { text: cacheableContent, cacheable: true, ttl: "1h" },
      { text: dynamicContent },
    ];
    const system = buildSystemTextFromParts(systemParts);

    const user = t("prompts.badge.signup.user", {
      context,
      todayTranscript: todayTranscript || t("prompts.badge.signup.noTranscript"),
    });

    return { system, user, systemParts };
  }

  private buildBadgeTransferPrompt(state: GameContext["state"], player: Player): PromptResult {
    const { t } = getI18n();
    const context = buildGameContext(state, player);
    const alivePlayers = state.players.filter(
      (p) => p.alive && p.playerId !== player.playerId
    );

    const cacheableContent = t("prompts.badge.transfer.base", {
      seat: player.seat + 1,
      name: player.displayName,
      role: getRoleText(player.role),
      winCondition: getWinCondition(player.role),
    });
    const dynamicContent = t("prompts.badge.transfer.task", {
      options: alivePlayers
        .map((p) => t("prompts.badge.option", { seat: p.seat + 1, name: p.displayName }))
        .join(t("promptUtils.gameContext.listSeparator")),
    });
    const systemParts: SystemPromptPart[] = [
      { text: cacheableContent, cacheable: true, ttl: "1h" },
      { text: dynamicContent },
    ];
    const system = buildSystemTextFromParts(systemParts);

    const todayTranscript = buildTodayTranscript(state);

    const user = t("prompts.badge.transfer.user", {
      context,
      todayTranscript: todayTranscript || t("prompts.badge.transfer.noTranscript"),
    });

    return { system, user, systemParts };
  }
}
