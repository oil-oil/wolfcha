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
    const candidates = Array.isArray(state.badge?.candidates) ? state.badge.candidates : [];
    const alivePlayers = state.players
      .filter((p) => p.alive && p.playerId !== player.playerId)
      .filter((p) => (candidates.length > 0 ? candidates.includes(p.seat) : true));
    const difficultyHint = buildDifficultyDecisionHint(state.difficulty, player.role);
    const wolfMates =
      player.role === "Werewolf"
        ? state.players
          .filter((p) => p.alive && p.role === "Werewolf" && p.playerId !== player.playerId)
          .map((p) => `${p.seat + 1}号`)
          .join("、")
        : "";

    const cacheableContent = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: ${getRoleText(player.role)}

${getWinCondition(player.role)}

${difficultyHint}`;
    const dynamicContent = `【任务】
现在进行警徽评选。选择一名玩家获得警徽。
好人阵营：优先选择你认为更可信、更有领导力、发言更清晰的玩家。
狼人阵营：优先选择狼队友或你认为容易掌控、能带偏节奏的玩家。
本环节只需要给出座位数字，不要分析，不要角色扮演。

可选: ${alivePlayers.map((p) => `${p.seat + 1}号(${p.displayName})`).join(", ")}
`;
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
      `第${state.day}天 警徽评选`,
      wolfMates ? `狼队友: ${wolfMates}` : "",
      recent ? `最近发言(节选):\n${recent}` : "",
    ].filter(Boolean);

    const user = `${liteContextLines.join("\n\n")}\n\n你把警徽投给几号？\n\n【格式】\n只回复座位数字，如: 3\n不要解释，不要输出多余文字，不要代码块`;

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
    const context = buildGameContext(state, player);
    const difficultyHint = buildDifficultyDecisionHint(state.difficulty, player.role);
    const alivePlayers = state.players.filter(
      (p) => p.alive && p.playerId !== player.playerId
    );

    const roleHints =
      player.role === "Werewolf"
        ? "提示：考虑移交给狼队友或者看起来可信的好人，或者撕毁警徽"
        : "提示：移交给你认为最可信的好人玩家，或者撕毁警徽";

    const cacheableContent = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: ${getRoleText(player.role)}

${getWinCondition(player.role)}

${difficultyHint}`;
    const dynamicContent = `【任务】
你已经出局，需要将警徽移交给一名存活的玩家或选择撕毁警徽。
如果你选择移交，请选择你认为最值得信任的玩家继承警徽。
如果你选择撕毁警徽，请回复"0"。

可选: ${alivePlayers.map((p) => `${p.seat + 1}号(${p.displayName})`).join(", ")}，或回复"0"撕毁警徽

${roleHints}

【格式】
只回复座位数字，如: 3
不要解释，不要输出多余文字，不要代码块`;
    const systemParts: SystemPromptPart[] = [
      { text: cacheableContent, cacheable: true, ttl: "1h" },
      { text: dynamicContent },
    ];
    const system = buildSystemTextFromParts(systemParts);

    const todayTranscript = buildTodayTranscript(state, 6000);

    const user = `${context}

${todayTranscript ? `【本日讨论记录】\n${todayTranscript}` : "【本日讨论记录】\n（无）"}

你把警徽移交给几号？（回复"0"表示撕毁警徽）`;

    return { system, user, systemParts };
  }
}
