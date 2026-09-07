import type { GameState, Player, Phase } from "@/types/game";

export type SystemPromptPart = {
  text: string;
  cacheable?: boolean;
  ttl?: "5m" | "1h";
};

export interface PromptResult {
  system: string;
  user: string;
  systemParts?: SystemPromptPart[];
}

export type GameAction =
  | { type: "START_NIGHT" }
  | { type: "CONTINUE_NIGHT_AFTER_GUARD" }
  | { type: "CONTINUE_NIGHT_AFTER_WOLF" }
  | { type: "CONTINUE_NIGHT_AFTER_WITCH" }
  | { type: "START_DAY_SPEECH_AFTER_BADGE"; options?: { skipAnnouncements?: boolean } }
  | { type: "ADVANCE_SPEAKER" }
  | { type: "RESOLVE_VOTES" }
  | { type: "RESUME_VOTES" }
  | { type: "VOTE"; targetSeat: number }
  | { type: "NIGHT_ACTION"; targetSeat: number; witchAction?: "save" | "poison" | "pass" }
  | { type: "CUSTOM"; payload: unknown };

export interface GameContext {
  state: GameState;
  phase?: Phase;
  actor?: Player;
  extras?: Record<string, unknown>;
}
