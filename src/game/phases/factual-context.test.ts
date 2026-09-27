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

test("放逐投票提供不分角色的常识，并要求先写出私下分析再落票", async () => {
  const { VotePhase } = await import("./VotePhase");
  const state = makeState();
  state.phase = "DAY_VOTE";
  state.currentSpeakerSeat = null;
  const wolf = new VotePhase().getPrompt({ state }, state.players[0]);
  const villager = new VotePhase().getPrompt({ state }, state.players[3]);

  // 常识对所有身份一致，不按角色下发不同策略。
  const knowledge = (system: string) => system.match(/【狼人杀常识】[\s\S]*?(?=\n\n|$)/)?.[0];
  assert.match(wolf.system, /无人对跳时，这名玩家大概率是真预言家/);
  assert.equal(knowledge(wolf.system), knowledge(villager.system));
  // 只在心里核对不会改变结果，analysis 必须是排在 seat 之前的输出字段。
  assert.match(villager.user, /\{"analysis":"[^"]+","seat":\d+,"reason":"[^"]+"\}/);
  assert.match(villager.user, /analysis 不会公开/);
  assert.match(villager.user, /reason 写一句可以公开说出口的理由，不要包含你的私有身份信息/);
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
  assert.match(fullPrompt, /"seat":2,/);
  assert.doesNotMatch(fullPrompt, /"seat":3,/);
});

test("发言 Prompt 按身份和环节给出要完成的事，不指向具体座位", async () => {
  await import("@/lib/game-master");
  const { DaySpeechPhase } = await import("./DaySpeechPhase");
  const goalOf = (state: GameState, player: Player) =>
    new DaySpeechPhase().getPrompt({ state }, player).system.match(/【你这一轮要完成的事】[\s\S]*$/)?.[0] ?? "";

  const campaign = makeState();
  campaign.phase = "DAY_BADGE_SPEECH";
  campaign.badge.holderSeat = null;
  campaign.badge.candidates = [0, 3, 8];
  campaign.currentSpeakerSeat = 8;
  campaign.daySpeechStartSeat = 0;
  const seerCampaign = goalOf(campaign, campaign.players[8]);
  assert.match(seerCampaign, /表明预言家身份；报出【你的查验记录】里的每一条查验/);
  assert.doesNotMatch(seerCampaign, /\d+号/);
  assert.doesNotMatch(seerCampaign, /倾向把放逐票投给谁/);
  assert.match(goalOf(campaign, campaign.players[0]), /伪装成普通好人竞选；或者悍跳预言家/);
  assert.doesNotMatch(goalOf(campaign, campaign.players[3]), /你是预言家|狼人阵营/);

  const discussion = makeState();
  const villagerDiscussion = goalOf(discussion, discussion.players[3]);
  assert.match(villagerDiscussion, /你的判断只能来自公开记录/);
  // 目标段里的自我描述会被原样说出口并在全场扩散，村民目标不写“你是村民”。
  assert.doesNotMatch(villagerDiscussion, /你是村民/);
  assert.match(villagerDiscussion, /发言结束前说明你此刻倾向把放逐票投给谁/);

  const lastWords = makeState();
  lastWords.phase = "DAY_LAST_WORDS";
  lastWords.players[8].alive = false;
  lastWords.currentSpeakerSeat = 8;
  assert.match(goalOf(lastWords, lastWords.players[8]), /遗言是你最后一次传递信息的机会/);

  // “报全每一晚（包括昨夜新增的）”曾让预言家在只过了一夜时编造第二条查验；所有环节都必须以记录为准。
  discussion.players[8].alive = true;
  for (const goal of [seerCampaign, goalOf(discussion, discussion.players[8]), goalOf(lastWords, lastWords.players[8])]) {
    assert.match(goal, /【你的查验记录】/);
    assert.match(goal, /记录里(有几条就报几条|没有的不要补充)/);
    assert.doesNotMatch(goal, /昨夜新增/);
  }
});

test("守卫上晚守过的座位在输出前再重申一次", async () => {
  const { NightPhase } = await import("./NightPhase");
  const state = makeState();
  state.players[3].role = "Guard";
  state.phase = "NIGHT_GUARD_ACTION";
  state.day = 2;
  state.currentSpeakerSeat = null;

  const first = new NightPhase().getPrompt({ state }, state.players[3]);
  assert.doesNotMatch(first.user, /再次确认/);

  state.nightActions = { lastGuardTarget: 1 };
  const second = new NightPhase().getPrompt({ state }, state.players[3]);
  assert.match(second.system, /上晚保护了2号，今晚不能选/);
  assert.match(second.user, /再次确认：你上晚守护了2号，今晚不能选2号，只能从可选列表中选择。$/);
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
