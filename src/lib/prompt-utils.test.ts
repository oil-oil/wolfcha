import assert from "node:assert/strict";
import test from "node:test";
import { setLocale } from "@/i18n/locale-store";
import type { ChatMessage, GameState, Player, Role } from "@/types/game";
import {
  buildPublicRoleConfiguration,
  buildTodayTranscript,
} from "./prompt-utils";

setLocale("zh");

const rolesBySeat: Role[] = [
  "Seer",
  "Werewolf",
  "Villager",
  "Werewolf",
  "Witch",
  "Hunter",
  "Villager",
  "Werewolf",
  "Villager",
];

const makePlayers = (): Player[] =>
  rolesBySeat.map((role, seat) => ({
    playerId: `p${seat}`,
    seat,
    displayName: `玩家${seat + 1}`,
    alive: true,
    role,
    alignment: role === "Werewolf" || role === "WhiteWolfKing" ? "wolf" : "village",
    isHuman: seat === 0,
  }));

const makeState = (messages: ChatMessage[] = []): GameState => ({
  gameId: "prompt-test",
  phase: "DAY_BADGE_SPEECH",
  day: 1,
  difficulty: "normal",
  players: makePlayers(),
  events: [],
  messages,
  currentSpeakerSeat: 0,
  daySpeechStartSeat: 7,
  speechDirection: "clockwise",
  badge: {
    holderSeat: null,
    candidates: [7, 8, 0, 2],
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
  dailySummaryVoteData: {},
  nightActions: {},
  roleAbilities: {
    witchHealUsed: false,
    witchPoisonUsed: false,
    hunterCanShoot: true,
    idiotRevealed: false,
    whiteWolfKingBoomUsed: false,
  },
  winner: null,
});

const message = (
  seat: number,
  content: string,
  phase: ChatMessage["phase"] = "DAY_BADGE_SPEECH",
  isLastWords = false
): ChatMessage => ({
  id: `m-${seat}-${content}`,
  playerId: `p${seat}`,
  playerName: `玩家${seat + 1}`,
  content,
  timestamp: Date.now(),
  day: 1,
  phase,
  isLastWords,
});

test("公开角色配置只包含人数板子，不包含座位身份", () => {
  const config = buildPublicRoleConfiguration(9);

  assert.match(config, /狼人 × 3/);
  assert.match(config, /预言家 × 1/);
  assert.match(config, /女巫 × 1/);
  assert.match(config, /猎人 × 1/);
  assert.doesNotMatch(config, /白狼王/);
  assert.doesNotMatch(config, /\d+号/);
  assert.doesNotMatch(config, /玩家\d+/);
});

test("当天玩家死亡后仍保留其已发生的发言，并保持遗言的真实顺序", () => {
  const state = makeState([
    message(7, "8号先发言"),
    message(8, "9号随后发言"),
    message(0, "我要验竞选了尚未发言的3号"),
    message(2, "3号之后才发言"),
    message(7, "8号最后发表遗言", "DAY_LAST_WORDS", true),
  ]);
  state.players[7] = { ...state.players[7], alive: false };

  const transcript = buildTodayTranscript(state);

  assert.match(transcript, /8号（已出局）: 8号先发言/);
  assert.ok(transcript.indexOf("8号先发言") < transcript.indexOf("9号随后发言"));
  assert.ok(transcript.indexOf("9号随后发言") < transcript.indexOf("我要验竞选了尚未发言的3号"));
  assert.ok(transcript.indexOf("我要验竞选了尚未发言的3号") < transcript.indexOf("3号之后才发言"));
  assert.ok(transcript.indexOf("3号之后才发言") < transcript.indexOf("8号最后发表遗言"));
});

test("行动者自己的发言仍保留在正式 Prompt 的原始时间位置", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "prompt-utils-test-key";
  await import("@/lib/game-master");
  const { DaySpeechPhase } = await import("@/game/phases/DaySpeechPhase");
  const state = makeState([
    message(7, "8号先发言"),
    message(8, "9号随后发言"),
    message(0, "我要验尚未发言的3号"),
    message(2, "3号之后才发言"),
  ]);
  state.phase = "DAY_SPEECH";
  state.badge.holderSeat = 0;
  const prompt = new DaySpeechPhase().getPrompt({ state }, state.players[0]);

  assert.ok(prompt.user.indexOf("8号先发言") < prompt.user.indexOf("9号随后发言"));
  assert.ok(prompt.user.indexOf("9号随后发言") < prompt.user.indexOf("我要验尚未发言的3号"));
  assert.ok(prompt.user.indexOf("我要验尚未发言的3号") < prompt.user.indexOf("3号之后才发言"));
  assert.match(prompt.user, /你的发言已作为1号保留在上方完整时间线的实际位置/);
});
