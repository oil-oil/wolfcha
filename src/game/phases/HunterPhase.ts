import type { Player } from "@/types/game";
import { GamePhase } from "../core/GamePhase";
import type { GameAction, GameContext, PromptResult } from "../core/types";
import {
  buildGameContext,
  buildDifficultyDecisionHint,
  getRoleText,
  getWinCondition,
} from "@/lib/prompt-utils";

export class HunterPhase extends GamePhase {
  async onEnter(_context: GameContext): Promise<void> {
    return;
  }

  getPrompt(context: GameContext, player: Player): PromptResult {
    const state = context.state;
    const gameContext = buildGameContext(state, player);
    const difficultyHint = buildDifficultyDecisionHint(state.difficulty, player.role);
    const alivePlayers = state.players.filter(
      (p) => p.alive && p.playerId !== player.playerId
    );

    const system = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: 猎人（好人阵营）

${getWinCondition("Hunter")}

${difficultyHint}

【任务】
你已死亡，现在可以开枪带走一人。
本环节只需要给出座位数字或 pass，不要分析，不要角色扮演。

可选: ${alivePlayers.map((p) => `${p.seat + 1}号(${p.displayName})`).join(", ")}
`;

    const user = `${gameContext}

你要带走几号？

【格式】
只回复座位数字，如: 5
如果不想开枪，回复: pass
不要解释，不要输出多余文字，不要代码块`;

    return { system, user };
  }

  async handleAction(_context: GameContext, _action: GameAction): Promise<void> {
    return;
  }

  async onExit(_context: GameContext): Promise<void> {
    return;
  }
}
