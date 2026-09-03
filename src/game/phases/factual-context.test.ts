import assert from "node:assert/strict";
import test from "node:test";
import { setLocale } from "@/i18n/locale-store";
import type { ChatMessage, GameState, Player, Role } from "@/types/game";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "factual-context-test-key";
setLocale("zh");

const roles: Role[] = [
  "Werewolf",
  "Witch",
  "Werewolf",
  "Villager",
  "Villager",
  "Hunter",
  "Werewolf",
  "Villager",
  "Seer",
];

const makePlayers = (): Player[] =>
  roles.map((role, seat) => ({
    playerId: `p${seat}`,
    seat,
    displayName: `玩家${seat + 1}`,
    alive: true,
    role,
    alignment: role === "Werewolf" ? "wolf" : "village",
    isHuman: false,
  }));

const makeState = (): GameState => ({
  gameId: "factual-context-test",
  phase: "DAY_SPEECH",
  day: 1,
  difficulty: "normal",
  players: makePlayers(),
  events: [],
  messages: [],
  currentSpeakerSeat: 0,
  daySpeechStartSeat: 0,
  speechRoundStartMessageIndex: 0,
  speechDirection: "clockwise",
  badge: {
    holderSeat: 8,
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
  dailySummaryVoteData: {},
  dayHistory: {},
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

const lastWordsMessage = (player: Player, content: string): ChatMessage => ({
  id: "hunter-last-words",
  playerId: player.playerId,
  playerName: player.displayName,
  content,
  timestamp: Date.now(),
  day: 1,
  phase: "DAY_LAST_WORDS",
  isLastWords: true,
});

test("自由发言只声明当前阶段事实，不把警徽投票留到后续", async () => {
  await import("@/lib/game-master");
  const { DaySpeechPhase } = await import("./DaySpeechPhase");
  const state = makeState();
  const prompt = new DaySpeechPhase().getPrompt({ state }, state.players[0]);

  assert.match(prompt.user, /phase_code: DAY_SPEECH/);
  assert.match(prompt.system, /警徽竞选和警徽投票均已结束/);
  assert.match(prompt.system, /本轮发言结束后进行的是放逐投票，不是警徽投票/);
  assert.doesNotMatch(prompt.system, /支持\S+拿警徽|应该把警徽给/);
});

test("放逐投票明确区别于警徽投票，并移除角色策略引导", async () => {
  const { VotePhase } = await import("./VotePhase");
  const state = makeState();
  state.phase = "DAY_VOTE";
  state.currentSpeakerSeat = null;
  const prompt = new VotePhase().getPrompt({ state }, state.players[0]);
  const fullPrompt = `${prompt.system}\n${prompt.user}`;

  assert.match(fullPrompt, /phase_code: DAY_VOTE/);
  assert.match(fullPrompt, /白天放逐投票/);
  assert.match(fullPrompt, /不是警徽(?:选举|投票)/);
  assert.match(fullPrompt, /本次选择决定你投给谁出局/);
  assert.doesNotMatch(fullPrompt, /预言家.*通常应|好人阵营.*不能无视|狼人阵营.*伪装站边/);
  assert.doesNotMatch(fullPrompt, /投票前请先在心里核对/);
});

test("放逐投票示例座位始终来自当下可选目标", async () => {
  const { VotePhase } = await import("./VotePhase");
  const state = makeState();
  state.phase = "DAY_VOTE";
  state.players[2].alive = false;
  state.currentSpeakerSeat = null;
  const prompt = new VotePhase().getPrompt({ state }, state.players[0]);
  const fullPrompt = `${prompt.system}\n${prompt.user}`;

  assert.match(fullPrompt, /可选: 2号\(玩家2\)/);
  assert.match(fullPrompt, /\{"seat":2\}/);
  assert.doesNotMatch(fullPrompt, /\{"seat":3\}/);
});

test("放逐平票 PK 明确标记为放逐重投，不冒充警长竞选", async () => {
  await import("@/lib/game-master");
  const { DaySpeechPhase } = await import("./DaySpeechPhase");
  const state = makeState();
  state.phase = "DAY_PK_SPEECH";
  state.pkSource = "vote";
  state.pkTargets = [0, 2];
  state.currentSpeakerSeat = 0;
  state.daySpeechStartSeat = 0;
  const prompt = new DaySpeechPhase().getPrompt({ state }, state.players[0]);
  const fullPrompt = `${prompt.system}\n${prompt.user}`;

  assert.match(fullPrompt, /phase_code: DAY_PK_SPEECH/);
  assert.match(fullPrompt, /白天放逐投票平票后的 PK 发言/);
  assert.match(fullPrompt, /之后进行的是放逐重投，不是警徽投票/);
  assert.match(fullPrompt, /仅有本次 PK 玩家会发言/);
  assert.doesNotMatch(fullPrompt, /仅有参与竞选的玩家会发言/);
  assert.doesNotMatch(fullPrompt, /请完成警长竞选发言/);
});

test("警徽平票 PK 仍保持警徽重投语义", async () => {
  await import("@/lib/game-master");
  const { DaySpeechPhase } = await import("./DaySpeechPhase");
  const state = makeState();
  state.phase = "DAY_PK_SPEECH";
  state.pkSource = "badge";
  state.badge.candidates = [0, 2];
  state.currentSpeakerSeat = 0;
  state.daySpeechStartSeat = 0;
  const prompt = new DaySpeechPhase().getPrompt({ state }, state.players[0]);
  const fullPrompt = `${prompt.system}\n${prompt.user}`;

  assert.match(fullPrompt, /警徽投票平票后的 PK 发言/);
  assert.match(fullPrompt, /之后重新进行警徽投票/);
  assert.match(fullPrompt, /仅有本次 PK 玩家会发言/);
  assert.doesNotMatch(fullPrompt, /放逐重投/);
});

test("被放逐者遗言明确投票已完成，猎人不能把枪保留到未来", async () => {
  await import("@/lib/game-master");
  const { DaySpeechPhase } = await import("./DaySpeechPhase");
  const state = makeState();
  const hunter = state.players[5];
  hunter.alive = false;
  state.phase = "DAY_LAST_WORDS";
  state.currentSpeakerSeat = hunter.seat;
  state.daySpeechStartSeat = hunter.seat;
  state.dayHistory = { 1: { executed: { seat: hunter.seat, votes: 3 } } };
  const prompt = new DaySpeechPhase().getPrompt({ state }, hunter);

  assert.match(prompt.user, /phase_code: DAY_LAST_WORDS/);
  assert.match(prompt.system, /本日放逐投票已经完成/);
  assert.match(prompt.system, /不再进行本日讨论、归票或投票/);
  assert.match(prompt.system, /选择不开枪，本次开枪机会永久失效/);
  assert.match(prompt.system, /不能保留到之后的回合/);
});

test("猎人开枪 Prompt 只保留遗言原文，不从原文强制推断动作", async () => {
  const { HunterPhase } = await import("./HunterPhase");
  const state = makeState();
  const hunter = state.players[5];
  hunter.alive = false;
  state.phase = "HUNTER_SHOOT";
  state.currentSpeakerSeat = null;
  state.dayHistory = { 1: { executed: { seat: hunter.seat, votes: 3 } } };
  state.messages = [lastWordsMessage(hunter, "我先不开枪，留到明天再打3号")];
  const prompt = new HunterPhase().getPrompt({ state }, hunter);

  assert.match(prompt.system, /一次性猎人开枪窗口/);
  assert.match(prompt.system, /选择不开枪后，本次开枪机会永久失效/);
  assert.match(prompt.system, /已经发生的公开记录：你的遗言/);
  assert.match(prompt.system, /我先不开枪，留到明天再打3号/);
  assert.doesNotMatch(prompt.system, /请保持开枪决策|请执行你的决定|请保持一致/);
  assert.match(prompt.user, /\{"action":"pass"\}/);
});
