import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage, GameState, Phase, Player } from "@/types/game";
import {
  getNextSpeechSeat,
  getSpeechPhaseOrder,
  getSpeechRoundStatus,
  getSpeakingOrder,
} from "./speech-order";

const makePlayers = (count = 9, humanSeat = 5): Player[] =>
  Array.from({ length: count }, (_, seat) => ({
    playerId: `p${seat}`,
    seat,
    displayName: `玩家${seat + 1}`,
    alive: true,
    role: "Villager" as const,
    alignment: "village" as const,
    isHuman: seat === humanSeat,
  }));

const makeMessage = (
  seat: number,
  phase: Phase,
  content: string,
  isSystem = false
): ChatMessage => ({
  id: `${phase}-${seat}-${content}`,
  playerId: isSystem ? "system" : `p${seat}`,
  playerName: isSystem ? "系统" : `玩家${seat + 1}`,
  content,
  timestamp: Date.now(),
  day: 1,
  phase,
  isSystem,
});

const makeState = (overrides: Partial<GameState> = {}): GameState => ({
  gameId: "speech-order-test",
  phase: "DAY_SPEECH",
  day: 1,
  difficulty: "normal",
  players: makePlayers(),
  events: [],
  messages: [],
  currentSpeakerSeat: 7,
  daySpeechStartSeat: 7,
  speechRoundStartMessageIndex: 0,
  speechDirection: "clockwise",
  badge: {
    holderSeat: 0,
    candidates: [],
    signup: {},
    votes: {},
    allVotes: {},
    history: {},
    revoteCount: 0,
  },
  votes: {},
  voteHistory: {},
  dailySummaries: {},
  dailySummaryFacts: {},
  nightActions: {},
  roleAbilities: {
    witchHealUsed: false,
    witchPoisonUsed: false,
    hunterCanShoot: true,
    idiotRevealed: false,
    whiteWolfKingBoomUsed: false,
  },
  winner: null,
  ...overrides,
});

test("普通讨论顺序支持随机人类座位、顺逆时针和警长末置", () => {
  const state = makeState();

  assert.deepEqual(getSpeakingOrder(state, 7, true, "clockwise"), [7, 8, 1, 2, 3, 4, 5, 6, 0]);
  assert.deepEqual(getSpeakingOrder(state, 7, true, "counterclockwise"), [7, 6, 5, 4, 3, 2, 1, 8, 0]);
  assert.equal(state.players.find((player) => player.isHuman)?.seat, 5);
});

test("警上 8、9、1、3 顺序会把已有记录和尚未发言者明确分开", () => {
  const messages = [
    makeMessage(0, "DAY_BADGE_SPEECH", "警上发言开始", true),
    makeMessage(7, "DAY_BADGE_SPEECH", "8号先发言"),
    makeMessage(8, "DAY_BADGE_SPEECH", "9号随后发言"),
  ];
  const state = makeState({
    phase: "DAY_BADGE_SPEECH",
    messages,
    speechRoundStartMessageIndex: 0,
    currentSpeakerSeat: 0,
    daySpeechStartSeat: 7,
    badge: {
      ...makeState().badge,
      candidates: [7, 8, 0, 2],
    },
  });

  const status = getSpeechRoundStatus(state, 0);
  assert.deepEqual(status.orderedSeats, [7, 8, 0, 2]);
  assert.deepEqual(status.spokenSeats, [7, 8]);
  assert.deepEqual(status.passedWithoutSpeechSeats, []);
  assert.deepEqual(status.yetToSpeakSeats, [2]);
  assert.equal(status.currentPosition, 3);
  assert.equal(getNextSpeechSeat(state), 2);
});

test("同一天再次进入 PK 时不会把上一轮 PK 发言算进当前轮", () => {
  const messages = [
    makeMessage(0, "DAY_PK_SPEECH", "第一轮PK开始", true),
    makeMessage(1, "DAY_PK_SPEECH", "2号第一轮发言"),
    makeMessage(3, "DAY_PK_SPEECH", "4号第一轮发言"),
    makeMessage(0, "DAY_SPEECH", "普通讨论开始", true),
    makeMessage(0, "DAY_PK_SPEECH", "第二轮PK开始", true),
  ];
  const state = makeState({
    phase: "DAY_PK_SPEECH",
    messages,
    speechRoundStartMessageIndex: 4,
    pkTargets: [2, 5],
    daySpeechStartSeat: 2,
    currentSpeakerSeat: 2,
  });

  const status = getSpeechRoundStatus(state, 2);
  assert.deepEqual(getSpeechPhaseOrder(state), [2, 5]);
  assert.deepEqual(status.spokenSeats, []);
  assert.deepEqual(status.yetToSpeakSeats, [5]);
  assert.equal(getNextSpeechSeat(state), 5);
});

test("顺序已过但没有消息记录的座位会单独标记为过麦，不会伪装成已发言", () => {
  const state = makeState({
    currentSpeakerSeat: 2,
    daySpeechStartSeat: 7,
    messages: [
      makeMessage(7, "DAY_SPEECH", "8号正常发言"),
      makeMessage(1, "DAY_SPEECH", "2号正常发言"),
    ],
  });

  const status = getSpeechRoundStatus(state, 2);
  assert.deepEqual(status.spokenSeats, [7, 1]);
  assert.deepEqual(status.passedWithoutSpeechSeats, [8]);
  assert.deepEqual(status.yetToSpeakSeats, [3, 4, 5, 6, 0]);
  assert.equal(getNextSpeechSeat(state), 3);
});

test("每个随机人类座位都只按座位顺序推进一次且不会回绕重复发言", () => {
  for (let humanSeat = 0; humanSeat < 9; humanSeat++) {
    let state = makeState({
      players: makePlayers(9, humanSeat),
      currentSpeakerSeat: 7,
      daySpeechStartSeat: 7,
      messages: [],
      speechRoundStartMessageIndex: 0,
    });
    const expectedOrder = [7, 8, 1, 2, 3, 4, 5, 6, 0];
    const visited: number[] = [];

    while (state.currentSpeakerSeat !== null) {
      const currentSeat = state.currentSpeakerSeat;
      visited.push(currentSeat);
      state = {
        ...state,
        messages: [
          ...state.messages,
          makeMessage(currentSeat, "DAY_SPEECH", `${currentSeat + 1}号本轮发言`),
        ],
      };
      state = { ...state, currentSpeakerSeat: getNextSpeechSeat(state) };
    }

    assert.deepEqual(visited, expectedOrder);
    assert.equal(visited.filter((seat) => seat === humanSeat).length, 1);
  }
});
