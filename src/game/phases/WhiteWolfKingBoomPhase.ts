import type { Player } from "@/types/game";
import { GamePhase } from "../core/GamePhase";
import type { GameAction, GameContext, PromptResult, SystemPromptPart } from "../core/types";
import {
  buildGameContext,
  buildDifficultyDecisionHint,
  getRoleText,
  getWinCondition,
  buildSystemTextFromParts,
} from "@/lib/prompt-utils";
import { getI18n } from "@/i18n/translator";

export class WhiteWolfKingBoomPhase extends GamePhase {
  async onEnter(_context: GameContext): Promise<void> {
    return;
  }

  getPrompt(context: GameContext, player: Player): PromptResult {
    const { t } = getI18n();
    const state = context.state;
    const gameContext = buildGameContext(state, player);
    const difficultyHint = buildDifficultyDecisionHint(state.difficulty, player.role);
    const alivePlayers = state.players.filter(
      (p) => p.alive && p.playerId !== player.playerId
    );

    const cacheableContent = t("prompts.whiteWolfKingBoom.base", {
      seat: player.seat + 1,
      name: player.displayName,
      role: getRoleText(player.role),
      winCondition: getWinCondition("WhiteWolfKing"),
      difficultyHint,
    });
    const options = alivePlayers
      .map((p) => t("prompts.night.option", { seat: p.seat + 1, name: p.displayName }))
      .join(t("promptUtils.gameContext.listSeparator"));

    const dynamicContent = t("prompts.whiteWolfKingBoom.task", { options });
    const systemParts: SystemPromptPart[] = [
      { text: cacheableContent, cacheable: true, ttl: "1h" },
      { text: dynamicContent },
    ];
    const system = buildSystemTextFromParts(systemParts);

    const user = t("prompts.whiteWolfKingBoom.user", { context: gameContext });

    return { system, user, systemParts };
  }

  async handleAction(_context: GameContext, _action: GameAction): Promise<void> {
    return;
  }

  async onExit(_context: GameContext): Promise<void> {
    return;
  }
}
