import type { Player } from "@/types/game";
import type { GameAction, GameContext, PromptResult } from "./types";

export abstract class GamePhase {
  abstract onEnter(context: GameContext): Promise<void>;
  abstract getPrompt(context: GameContext, player: Player): PromptResult;
  abstract handleAction(context: GameContext, action: GameAction): Promise<void>;
  abstract onExit(context: GameContext): Promise<void>;
}
