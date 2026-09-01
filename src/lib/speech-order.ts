import type { ChatMessage, GameState, SpeechDirection } from "@/types/game";

const SPEECH_PHASES = new Set([
  "DAY_BADGE_SPEECH",
  "DAY_PK_SPEECH",
  "DAY_SPEECH",
  "DAY_LAST_WORDS",
]);

export type SpeechRoundStatus = {
  orderedSeats: number[];
  currentSeat: number | null;
  currentPosition: number;
  totalSpeakers: number;
  spokenSeats: number[];
  passedWithoutSpeechSeats: number[];
  yetToSpeakSeats: number[];
};

const uniqueSeats = (seats: number[]): number[] => [...new Set(seats)];

const rotateFromSeat = (
  seats: number[],
  startSeat: number | null,
  direction: SpeechDirection
): number[] => {
  if (seats.length === 0) return [];

  const ordered = [...seats].sort((a, b) => a - b);
  if (direction === "counterclockwise") ordered.reverse();

  const startIndex = startSeat === null ? -1 : ordered.indexOf(startSeat);
  if (startIndex < 0) return ordered;
  return [...ordered.slice(startIndex), ...ordered.slice(0, startIndex)];
};

/**
 * 生成普通白天讨论的完整座位顺序。警长存活时固定最后发言。
 */
export function getSpeakingOrder(
  state: GameState,
  startSeat: number,
  sheriffLast = true,
  direction: SpeechDirection = state.speechDirection ?? "clockwise"
): number[] {
  const aliveSeats = state.players
    .filter((player) => player.alive)
    .map((player) => player.seat);
  const sheriffSeat = state.badge.holderSeat;
  const order = rotateFromSeat(aliveSeats, startSeat, direction);

  if (!sheriffLast || sheriffSeat === null || !order.includes(sheriffSeat)) {
    return order;
  }

  return [...order.filter((seat) => seat !== sheriffSeat), sheriffSeat];
}

/**
 * 当前发言阶段的权威顺序。实际推进和 AI Prompt 必须共同使用这里的结果。
 */
export function getSpeechPhaseOrder(state: GameState): number[] {
  const startSeat = state.daySpeechStartSeat ?? state.currentSpeakerSeat;

  if (state.phase === "DAY_LAST_WORDS") {
    return state.currentSpeakerSeat === null ? [] : [state.currentSpeakerSeat];
  }

  if (state.phase === "DAY_PK_SPEECH") {
    const aliveSeats = new Set(
      state.players.filter((player) => player.alive).map((player) => player.seat)
    );
    const targets = uniqueSeats(state.pkTargets ?? []).filter((seat) => aliveSeats.has(seat));
    if (targets.length === 0 || startSeat === null) return targets;
    const startIndex = targets.indexOf(startSeat);
    return startIndex < 0
      ? targets
      : [...targets.slice(startIndex), ...targets.slice(0, startIndex)];
  }

  if (state.phase === "DAY_BADGE_SPEECH") {
    const aliveSeats = new Set(
      state.players.filter((player) => player.alive).map((player) => player.seat)
    );
    const candidateSeats = uniqueSeats(state.badge.candidates).filter((seat) => aliveSeats.has(seat));
    return rotateFromSeat(candidateSeats, startSeat, "clockwise");
  }

  if (state.phase === "DAY_SPEECH") {
    const aliveSeats = state.players.filter((player) => player.alive).map((player) => player.seat);
    if (aliveSeats.length === 0) return [];
    const effectiveStartSeat = startSeat ?? Math.min(...aliveSeats);
    const sheriffSeat = state.badge.holderSeat;
    const sheriffIsAlive =
      sheriffSeat !== null && aliveSeats.includes(sheriffSeat);
    return getSpeakingOrder(
      state,
      effectiveStartSeat,
      sheriffIsAlive,
      state.speechDirection ?? "clockwise"
    );
  }

  return [];
}

export function getCurrentSpeechRoundMessages(state: GameState): ChatMessage[] {
  if (!SPEECH_PHASES.has(state.phase)) return [];

  const configuredStart = state.speechRoundStartMessageIndex;
  if (
    typeof configuredStart === "number" &&
    Number.isInteger(configuredStart) &&
    configuredStart >= 0 &&
    configuredStart <= state.messages.length
  ) {
    return state.messages
      .slice(configuredStart)
      .filter(
        (message) =>
          !message.isSystem &&
          message.day === state.day &&
          message.phase === state.phase
      );
  }

  // 兼容旧存档：取当前阶段在当天最后一个连续消息块，避免混入更早的 PK 轮次。
  let lastMatchingIndex = -1;
  for (let index = state.messages.length - 1; index >= 0; index--) {
    const message = state.messages[index];
    if (message.day === state.day && message.phase === state.phase) {
      lastMatchingIndex = index;
      break;
    }
  }
  if (lastMatchingIndex < 0) return [];

  let blockStart = lastMatchingIndex;
  while (blockStart > 0) {
    const previous = state.messages[blockStart - 1];
    if (previous.day !== state.day || previous.phase !== state.phase) break;
    blockStart -= 1;
  }

  return state.messages
    .slice(blockStart, lastMatchingIndex + 1)
    .filter((message) => !message.isSystem);
}

const getSpokenSeats = (state: GameState, orderedSeats: number[]): number[] => {
  const validSeats = new Set(orderedSeats);
  const playerSeatById = new Map(state.players.map((player) => [player.playerId, player.seat]));
  const spokenSeats: number[] = [];
  const seen = new Set<number>();

  getCurrentSpeechRoundMessages(state).forEach((message) => {
    const seat = playerSeatById.get(message.playerId);
    if (seat === undefined || !validSeats.has(seat) || seen.has(seat)) return;
    seen.add(seat);
    spokenSeats.push(seat);
  });

  return spokenSeats;
};

export function getSpeechRoundStatus(
  state: GameState,
  currentSeat: number | null = state.currentSpeakerSeat
): SpeechRoundStatus {
  const orderedSeats = getSpeechPhaseOrder(state);
  const spokenSeats = getSpokenSeats(state, orderedSeats);
  const spokenSet = new Set(spokenSeats);
  const currentIndex = currentSeat === null ? -1 : orderedSeats.indexOf(currentSeat);
  const beforeCurrent = currentIndex < 0 ? [] : orderedSeats.slice(0, currentIndex);
  const afterCurrent = currentIndex < 0 ? orderedSeats : orderedSeats.slice(currentIndex + 1);

  return {
    orderedSeats,
    currentSeat,
    currentPosition: currentIndex >= 0 ? currentIndex + 1 : Math.min(spokenSeats.length + 1, orderedSeats.length),
    totalSpeakers: orderedSeats.length,
    spokenSeats,
    passedWithoutSpeechSeats: beforeCurrent.filter((seat) => !spokenSet.has(seat)),
    yetToSpeakSeats: afterCurrent.filter((seat) => !spokenSet.has(seat)),
  };
}

/**
 * 返回当前发言者之后、尚未产生本轮发言记录的下一座；不回绕到已过麦座位。
 */
export function getNextSpeechSeat(state: GameState): number | null {
  const status = getSpeechRoundStatus(state);
  const { orderedSeats, currentSeat } = status;
  if (orderedSeats.length === 0) return null;

  const spokenSet = new Set(status.spokenSeats);
  const currentIndex = currentSeat === null ? -1 : orderedSeats.indexOf(currentSeat);
  for (let index = currentIndex + 1; index < orderedSeats.length; index++) {
    const seat = orderedSeats[index];
    if (!spokenSet.has(seat)) return seat;
  }
  return null;
}
