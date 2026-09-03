import assert from "node:assert/strict";
import test from "node:test";
import { setLocale } from "@/i18n/locale-store";
import type { ChatMessage, GameState, Player, Role } from "@/types/game";
import {
  buildGameContext,
  buildPastDaysTranscript,
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
  assert.match(config, /狼人存活数达到好人存活数时狼人胜利/);
  assert.match(config, /未被主持人公开确认的出局身份，不能用于断言当前剩余某角色的确切数量/);
});

test("普通夜间出局只传死因未公开，公开技能死因才按主持人事件传入", () => {
  const state = makeState();
  state.phase = "DAY_SPEECH";
  state.players[4] = { ...state.players[4], alive: false };
  state.nightHistory = { 1: { deaths: [{ seat: 4, reason: "wolf" }] } };

  const unknownCauseContext = buildGameContext(state, state.players[2]);
  assert.match(unknownCauseContext, /\{seat: 5, name: 玩家5, day: 1, cause: 死因未公开\}/);
  assert.match(unknownCauseContext, /主持人已公开确认的身份事件】\n- 无/);
  assert.doesNotMatch(unknownCauseContext, /cause: 狼杀|cause: 毒杀/);

  state.players[5] = { ...state.players[5], alive: false };
  state.players[6] = { ...state.players[6], alive: false };
  state.dayHistory = { 1: { hunterShot: { hunterSeat: 5, targetSeat: 6 } } };
  const publicShotContext = buildGameContext(state, state.players[2]);
  assert.match(publicShotContext, /\{seat: 7, name: 玩家7, day: 1, cause: 猎人公开开枪\}/);
  assert.match(publicShotContext, /6号玩家6 已由主持人公开确认为猎人/);
});

test("狼人私密队伍按存活状态明确分组，且不包含村民", () => {
  const state = makeState();
  state.players[2] = { ...state.players[2], displayName: "村民玩家" };
  state.players[3] = { ...state.players[3], displayName: "死亡狼人", alive: false };

  const context = buildGameContext(state, state.players[1]);
  const wolfTeam = context.match(/<your_wolf_team>[\s\S]*?<\/your_wolf_team>/)?.[0];

  assert.ok(wolfTeam);
  assert.match(wolfTeam, /【存活狼队】2号玩家2、8号玩家8/);
  assert.match(wolfTeam, /【已出局狼队】4号死亡狼人/);
  assert.match(wolfTeam, /【狼人存活】2\/3/);
  assert.doesNotMatch(wolfTeam, /3号村民玩家/);
});

test("警徽竞选期间明确死亡结果未公布，不能从空死亡列表推断平安夜", () => {
  const state = makeState();
  state.nightHistory = { 1: { wolfTarget: 4, deaths: [] } };

  const context = buildGameContext(state, state.players[2], { excludePendingDeaths: true });

  assert.match(context, /<unannounced_night_result>/);
  assert.match(context, /主持人尚未公布昨夜死亡结果/);
  assert.match(context, /不能从当前死亡列表为空推断为平安夜/);
  assert.doesNotMatch(context, /平安夜说明/);
});

test("历史消息保持真实时间顺序，不把遗言通知提前到白天发言前", () => {
  const state = makeState([
    message(2, "3号警徽竞选发言"),
    {
      id: "badge-awarded",
      playerId: "system",
      playerName: "主持人",
      content: "警徽授予 1号 玩家1（2票）",
      timestamp: Date.now(),
      day: 1,
      phase: "DAY_BADGE_ELECTION",
      isSystem: true,
    },
    {
      id: "night-death-announced",
      playerId: "system",
      playerName: "主持人",
      content: "5号 玩家5 昨晚出局",
      timestamp: Date.now(),
      day: 1,
      phase: "DAY_BADGE_ELECTION",
      isSystem: true,
    },
    message(0, "1号白天自由发言", "DAY_SPEECH"),
    {
      id: "last-words-start",
      playerId: "system",
      playerName: "主持人",
      content: "请 3号 玩家3 发表遗言",
      timestamp: Date.now(),
      day: 1,
      phase: "DAY_LAST_WORDS",
      isSystem: true,
    },
    message(2, "3号最后发表遗言", "DAY_LAST_WORDS", true),
  ]);
  state.day = 2;
  state.players[4] = { ...state.players[4], alive: false };
  state.nightHistory = { 1: { deaths: [{ seat: 4, reason: "wolf" }] } };

  const history = buildPastDaysTranscript(state);

  assert.ok(history.indexOf("3号警徽竞选发言") < history.indexOf("警徽授予 1号"));
  assert.ok(history.indexOf("警徽授予 1号") < history.indexOf("5号 玩家5 昨晚出局"));
  assert.ok(history.indexOf("5号 玩家5 昨晚出局") < history.indexOf("1号白天自由发言"));
  assert.ok(history.indexOf("1号白天自由发言") < history.indexOf("请 3号 玩家3 发表遗言"));
  assert.ok(history.indexOf("请 3号 玩家3 发表遗言") < history.indexOf("3号最后发表遗言"));
  assert.doesNotMatch(history, /夜晚出局:/);
});

test("猎人公开开枪会结构化确认猎人身份，但不把目标身份当成查验结果", () => {
  const state = makeState();
  state.day = 3;
  state.phase = "DAY_SPEECH";
  state.players[5] = { ...state.players[5], alive: false };
  state.players[8] = { ...state.players[8], alive: false };
  state.nightHistory = {
    3: {
      deaths: [{ seat: 5, reason: "wolf" }],
      hunterShot: { hunterSeat: 5, targetSeat: 8 },
    },
  };

  const context = buildGameContext(state, state.players[2]);

  assert.match(context, /6号玩家6 已由主持人公开确认为猎人/);
  assert.match(context, /开枪不产生查验结果，也不公开 9号玩家9 的身份/);
  assert.match(context, /<today_deaths>[\s\S]*seat: 6, name: 玩家6[\s\S]*seat: 9, name: 玩家9[\s\S]*<\/today_deaths>/);
  assert.doesNotMatch(context, /9号玩家9 已由主持人公开确认为/);
});

test("历史弃票不会被格式化成不存在的 0 号玩家", () => {
  const state = makeState();
  state.day = 3;
  state.phase = "DAY_SPEECH";
  state.voteHistory = { 2: { p0: -1, p1: 4 } };
  state.dayHistory = { 2: { executed: { seat: 4, votes: 1 }, sheriffSeatAtVote: null } };

  const context = buildGameContext(state, state.players[2]);
  const votes = context.match(/<votes>[\s\S]*?<\/votes>/)?.[0] || "";

  assert.doesNotMatch(votes, /0号/);
  assert.match(votes, /5号玩家5: \{票数: 1, 投票者: \[2\]\}/);
});

test("第二天起的阶段顺序不再错误包含警徽竞选", () => {
  const state = makeState();
  state.day = 2;
  state.phase = "DAY_SPEECH";

  const context = buildGameContext(state, state.players[2]);

  assert.match(context, /阶段顺序：夜晚（狼人刀人）→ 天亮公布死亡 → 自由发言 → 投票/);
  assert.match(context, /game_status: ongoing/);
  assert.doesNotMatch(context, /夜晚（狼人刀人）→ 警徽竞选 → 天亮公布死亡/);
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

test("发言顺序上下文只陈述本轮客观记录，不加入策略建议", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "prompt-utils-test-key";
  await import("@/lib/game-master");
  const { DaySpeechPhase } = await import("@/game/phases/DaySpeechPhase");
  const state = makeState([
    message(7, "8号先发言"),
    message(8, "9号随后发言"),
  ]);
  state.phase = "DAY_BADGE_SPEECH";
  state.currentSpeakerSeat = 0;
  state.daySpeechStartSeat = 7;
  state.speechRoundStartMessageIndex = 0;
  const prompt = new DaySpeechPhase().getPrompt({ state }, state.players[0]);
  const statusSection = prompt.user.match(/【发言顺序】\n([\s\S]*?)\n\n轮到你发言/)?.[1];

  assert.ok(statusSection);
  assert.match(statusSection, /本轮全部发言参与者（共4人，含已发言与尚未发言）：8号、9号、1号、3号/);
  assert.match(statusSection, /当前轮到：1号（第3\/4位）/);
  assert.match(statusSection, /已有公开发言记录：8号、9号/);
  assert.match(statusSection, /尚未轮到且没有公开发言记录：3号/);
  assert.doesNotMatch(statusSection, /可以|建议|应该|先抛|回应/);

  const fullPrompt = `${prompt.system}\n${prompt.user}`;
  assert.doesNotMatch(
    fullPrompt,
    /更想看谁|能不能带队|哪里站不住|想争取的东西|想达到什么效果|你可以坦诚|带节奏/
  );
});

test("与玩家有关的公开信息只陈述事实，不引导如何发言", async () => {
  const { buildPublicFactsForPlayer } = await import("./prompt-utils");
  const state = makeState([
    message(1, "我点名1号说一下"),
  ]);
  state.phase = "DAY_SPEECH";
  const facts = buildPublicFactsForPlayer(state, state.players[0]);

  assert.match(facts, /【与你有关的公开事实】/);
  assert.match(facts, /2号点名提到过你/);
  assert.doesNotMatch(facts, /可以|建议|应该|先抛|回应|想想|角度/);
});

test("警徽移交后仍按事件快照展示原竞选赢家和历史警长票权", () => {
  const state = makeState();
  state.day = 2;
  state.phase = "DAY_SPEECH";
  state.badge.holderSeat = 4;
  state.badge.history = { 1: { p4: 8 } };
  state.badge.electionWinners = { 1: 8 };
  state.voteHistory = {
    1: {
      p0: 2,
      p1: 8,
      p2: 8,
      p3: 8,
      p4: 8,
      p5: 8,
      p6: 2,
      p7: 8,
      p8: 2,
    },
  };
  state.dayHistory = {
    1: { executed: { seat: 8, votes: 6 }, sheriffSeatAtVote: 8 },
  };
  // 模拟旧错误摘要，事件快照必须优先于它。
  state.dailySummaryVoteData = {
    1: {
      sheriff_election: { winner: 4, votes: { 8: [4] } },
      execution_vote: { eliminated: 8, votes: { 8: [1, 2, 3, 4, 5, 7], 2: [0, 6, 8] } },
    },
  };

  const context = buildGameContext(state, state.players[0]);
  const votes = context.match(/<votes>[\s\S]*?<\/votes>/)?.[0] || "";

  assert.match(votes, /结果: 9号玩家9 当选警长/);
  assert.doesNotMatch(votes, /结果: 5号玩家5 当选警长/);
  assert.match(votes, /9号玩家9: \{票数: 6, 投票者: \[2,3,4,5,6,8\]\}/);
  assert.match(votes, /3号玩家3: \{票数: 3\.5, 投票者: \[1,7,9\]\}/);
});

test("旧存档缺少投票时警长快照时不使用当前警长伪造历史票数", () => {
  const state = makeState();
  state.day = 2;
  state.phase = "DAY_SPEECH";
  state.badge.holderSeat = 4;
  state.badge.history = { 1: { p4: 8 } };
  state.badge.electionWinners = undefined;
  state.voteHistory = {
    1: { p0: 2, p1: 8, p2: 8, p3: 8, p4: 8, p5: 8, p6: 2, p7: 8, p8: 2 },
  };
  state.dayHistory = { 1: { executed: { seat: 8, votes: 6 } } };

  const context = buildGameContext(state, state.players[0]);
  const votes = context.match(/<votes>[\s\S]*?<\/votes>/)?.[0] || "";
  const execution = votes.split("\nday_1:").at(-1) || "";

  assert.match(votes, /结果: 9号玩家9 当选警长/);
  assert.match(execution, /9号玩家9: \{投票者: \[2,3,4,5,6,8\]\}/);
  assert.match(execution, /3号玩家3: \{投票者: \[1,7,9\]\}/);
  assert.doesNotMatch(execution, /9号玩家9: \{票数:/);
  assert.doesNotMatch(execution, /3号玩家3: \{票数:/);
});
