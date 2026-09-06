import type { GameState, Player } from "@/types/game";
import type { FlowToken } from "./game-flow-controller";

/** 队列、字幕、TTS 和历史提交共用同一个请求身份与有效性判断。 */
export interface SpeechRequest {
  id: string;
  isValid: () => boolean;
}

export function isSameSpeechTurn(origin: GameState, current: GameState, player: Player): boolean {
  return origin.gameId === current.gameId && origin.day === current.day &&
    origin.phase === current.phase && current.currentSpeakerSeat === player.seat &&
    origin.speechRoundStartMessageIndex === current.speechRoundStartMessageIndex &&
    origin.devMutationId === current.devMutationId && !current.winner;
}

export function createSpeechRequest(
  id: string, origin: GameState, player: Player, token: FlowToken,
  getState: () => GameState, ownsRequest: () => boolean,
): SpeechRequest {
  return { id, isValid: () => token.isValid() && ownsRequest() && isSameSpeechTurn(origin, getState(), player) };
}
