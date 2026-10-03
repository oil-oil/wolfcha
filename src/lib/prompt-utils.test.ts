import assert from "node:assert/strict";
import test from "node:test";
import { setLocale } from "@/i18n/locale-store";
import type { ChatMessage, GameState, Player, Role } from "@/types/game";
import {
  buildGameContext,
  buildPastDaysTranscript,
  buildPublicRoleConfiguration,
  buildTodayTranscript,
  isSpeechClaim,
  PAST_DAYS_EXCERPT_ENABLED,
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

  assert.match(transcript, /8号（当前已出局）: 8号先发言/);
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

// Copied verbatim from the 43 real claims in the design study; no runtime dry-runs dependency.
const realClaimSentences = [
  "我是3号苏婷，上警，本来想等前面几位说完再决定要不要亮身份——现在听完了，我直接说：我是预言家。",
  "我是4号赵凯，预言家。",
  "我是4号赵凯，预言家，警长，本轮最后一个发言。",
  "先亮身份——我是守卫，好人牌，不是坏人。",
  "我是7号王伟，警长，预言家。",
  "先接7号 王伟的话——你点我名，说我可能在身份定义上前后打架，那我这次就把身份定义说清楚：我认好人，不跳预言家，拿警徽靠逻辑不靠底牌。",
  "我是7号王伟，警长，预言家。",
  "先按流程把底牌亮出来：我是9号周杰，守卫。",
  "我是女巫。",
  "我是10号苏婷，猎人。",
  "前面几位的发言我都听完了，先说我的立场：我跳预言家。",
  "先亮底牌：我是猎人。",
  "我是预言家，9号李静，警徽我必须要。",
  "不是接不住，是我一个守卫没必要靠金水撑腰，先听完前面这一圈再动，稳一点。",
  "那就把话说完，我是10号赵博文，女巫。",
  "我是9号李静，预言家。",
  "先说5号徐峰和6号陈强冲我这张守卫牌——你们要我交代昨晚守了谁、为什么守。",
  "先说身份，我是预言家。",
  "先说一件事——我是预言家，昨晚查验结果：3号苏曼是好人，金水。",
  "还有一句我先放这——我猎人身份，跟前几天一个态度，你们别急着逼我亮牌，该开的时候我会开。",
  "我猎人这张牌，前两天亮了一半收回去，7号林婉、2号陈思远、3号苏曼都点过我这个动作。",
  "先说身份定位——我拿的是预言家牌。",
  "那个……我5号周彤说几句啊，我是猎人牌，真的，我先把身份拍了，省得后面有人拿我身份做文章。",
  "先说我自己的牌：我是预言家。",
  "我不藏着，我是猎人牌。",
  "我是8号周正，预言家。",
  "我5号李强，是预言家。",
  "先认账：我是猎人，被票出去我不亏，反正我还能带走一个人。",
  "首先，我是预言家。",
  "首先，把身份和我全部的查验交代清楚，一个都不留：我是预言家。",
  "先把最硬的一条放前面：我是女巫。",
  "最后一个发言，我先把最硬的信息给出来：我是预言家，第一晚查验了3号王强，结果是好人。",
  "我是10号周杰，女巫。",
  "我是预言家，第一夜验的是1号李娜，结果是好人。",
  "首先，我是3号陈强，猎人。",
  "警徽竞选我上警，身份是预言家。",
  "其实我上警是因为我有身份要报——我是预言家。",
  "先说一个信息点，我不绕：我是女巫，第一夜我用了解药，救的就是7号郑雅琪。",
  "先说一个我这边必须对清楚的信息，不绕弯子：我是女巫，第一夜的解药我用了，救的就是7号郑雅琪。",
  "我是预言家，第一夜查的是3号孙建国，结果好人，金水。",
  "我9号刘志国，猎人牌，今天我认这个出局，但我的话得说透。",
  "那个…轮到我，我是预言家也是警长，我先把三条查验一口气报清楚，一条不多一条不少。",
  "这三条是我女巫视角的实账，谁的对夜间描述跟这条对不上，可以直接点名。"
];

realClaimSentences.forEach((sentence, index) => {
  test(`声明识别：真实句子 ${index + 1}/43`, () => {
    assert.equal(isSpeechClaim(sentence), true, sentence);
  });
});

const claimVariants = [
  "我猎人身份", "我拿的是预言家牌", "预言家是我", "女巫这张牌在我这",
  "我认 2 号预言家", "我昨晚查验3号", "我验了3号", "我验的是3号",
  "我验出3号是狼", "我验到3号是狼", "我报3号查杀", "我给3号发金水",
  "我给 3 号金水", "我用了解药", "我救了3号", "我毒了3号", "我用了毒药",
  "我守了3号", "昨晚我守的是 3 号", "我守护3号", "我开枪带走3号",
  "解药我昨晚用了", "毒药我已经用了", "首夜查杀3号", "第 12 夜查验3号",
  "第十二夜毒了3号", "第六夜守护3号", "昨晚解药救了3号",
  "I'm the seer", "I’m the witch", "I am a guard", "I AM THE HUNTER", "I am the idiot",
  "I checked seat 3 last night", "I verified seat 3", "I saved seat 3", "I poisoned seat 3",
  "I guarded seat 3", "I protected seat 3", "I shot seat 3",
  `我${"啊".repeat(14)}白痴`, `猎人${"啊".repeat(6)}是我`,
  `我${"啊".repeat(16)}验到3号`, `首夜${"啊".repeat(10)}发金水`,
  `I am${" ".repeat(40)}seer`, `I${" ".repeat(40)}verified seat 3`,
];

claimVariants.forEach((sentence) => {
  test(`声明识别：变体 ${sentence}`, () => {
    assert.equal(isSpeechClaim(sentence), true, sentence);
  });
});

test("声明识别不命中纯客套话或跨句拼接", () => {
  for (const sentence of [
    "大家好，轮到我说几句。", "谢谢大家，我说完了。", "各位辛苦了，继续吧。",
    "Hello everyone, good luck!", "Thank you, I appreciate your time.", "I'm happy to be here.",
    "我说完了。预言家请继续。", "I am ready. The seer speaks next.",
  ]) assert.equal(isSpeechClaim(sentence), false, sentence);
});

for (const locale of ["zh", "en"] as const) {
  for (const isGenshinMode of [false, true]) {
    const mode = `${locale}/${isGenshinMode ? "原神" : "普通"}`;
    test(`往日摘录：${mode}保留声明、本人末两段与完整遗言，逐字可溯源`, () => {
      setLocale(locale);
      try {
        assert.equal(PAST_DAYS_EXCERPT_ENABLED, true);
        const text = locale === "zh" ? [
          "我先听听大家的意见。", "这一点还需要核对。", "今天我倾向投3号。",
          "先讨论这轮的逻辑。", "我是预言家，首夜查杀3号。", "中间这段只是重复分析。", "最终归票3号。",
          "我的遗言第一段。", "我的遗言第二段。", "我的遗言第三段。",
        ] : [
          "Let me hear everyone first.", "This still needs checking.", "My final vote is seat 3.",
          "Let's discuss the reasoning.", "I'm the seer. I checked seat 3: wolf.", "This is just repeated analysis.", "Vote seat 3 in the end.",
          "My first last-words paragraph.", "My second last-words paragraph.", "My third last-words paragraph.",
        ];
        const state = makeState([
          ...text.slice(0, 3).map((content) => message(0, content, "DAY_SPEECH")),
          ...text.slice(3, 7).map((content) => message(1, content, "DAY_SPEECH")),
          ...text.slice(7).map((content) => message(2, content, "DAY_LAST_WORDS", true)),
        ]);
        state.day = 2;
        state.phase = "DAY_SPEECH";
        state.isGenshinMode = isGenshinMode;
        state.players[1].alive = false;
        state.dailySummaries = { 1: ["SUMMARY_MUST_NOT_ENTER_HISTORY"] };
        state.dailySummaryFacts = { 1: [{ day: 1, fact: "FACT_MUST_NOT_ENTER_HISTORY", type: "claim", speakerSeat: 1 }] };
        const before = structuredClone(state);
        const history = buildPastDaysTranscript(state, state.players[0]);
        const full = buildPastDaysTranscript(state, state.players[0], false);
        const withoutViewer = buildPastDaysTranscript(state);

        for (const index of [1, 2, 4, 6, 7, 8, 9]) assert.ok(history.includes(text[index]), text[index]);
        for (const index of [0, 3, 5]) assert.ok(!history.includes(text[index]), text[index]);
        assert.ok(!withoutViewer.includes(text[1]));
        assert.ok(withoutViewer.includes(text[2]));
        for (const content of text) assert.ok(full.includes(content), content);
        assert.ok(history.indexOf(text[1]) < history.indexOf(text[4]));
        assert.ok(history.indexOf(text[6]) < history.indexOf(text[7]));

        const playerLines = history.split("\n").filter((line) => /^(?:【遗言】|【Last words】)?(?:\d+号|Seat \d+): /.test(line));
        assert.equal(playerLines.length, 7);
        for (const line of playerLines) {
          const content = line.slice(line.indexOf(": ") + 2);
          assert.ok(state.messages.some((m) => !m.isSystem && m.content.includes(content)), line);
        }
        assert.match(history, locale === "zh" ? /逐字摘录.*不要复述或猜测.*<vote_rounds>/ : /verbatim excerpts.*do not retell or guess.*<vote_rounds>/);
        assert.doesNotMatch(full, /逐字摘录|verbatim excerpts/);
        assert.doesNotMatch(history, /SUMMARY_MUST_NOT_ENTER_HISTORY|FACT_MUST_NOT_ENTER_HISTORY|其余内容已省略|可自行回忆|已出局|currently eliminated/);
        assert.equal(buildGameContext(state, state.players[0]).match(/<history>[\s\S]*?<\/history>/)?.[0], history);
        assert.equal(buildGameContext(state, state.players[0], { excerptPastDays: false }).match(/<history>[\s\S]*?<\/history>/)?.[0], full);
        assert.deepEqual(state, before);
      } finally { setLocale("zh"); }
    });

    test(`今天全文：${mode}第1天开关逐字相同，第2天只压缩往日`, () => {
      setLocale(locale);
      try {
        const today = locale === "zh"
          ? ["今日开场完整原话。", "今日中间完整原话。", "今日收尾完整原话。"]
          : ["Today's complete opening.", "Today's complete reasoning.", "Today's complete conclusion."];
        const state = makeState(today.map((content) => message(1, content, "DAY_SPEECH")));
        state.phase = "DAY_SPEECH";
        state.isGenshinMode = isGenshinMode;
        const player = state.players[0];
        const buildPromptContext = (excerptPastDays: boolean) =>
          `${buildGameContext(state, player, { excerptPastDays })}\n\n<today_transcript>\n${buildTodayTranscript(state)}\n</today_transcript>`;
        assert.equal(buildPastDaysTranscript(state, player, true), "");
        assert.equal(buildPastDaysTranscript(state, player, false), "");
        assert.equal(buildPromptContext(true), buildPromptContext(false));
        for (const excerpt of [true, false]) {
          for (const content of today) assert.ok(buildPromptContext(excerpt).includes(content));
        }

        state.day = 2;
        state.messages.forEach((m) => { m.day = 2; });
        const old = ["OLD_OPENING", "OLD_REASONING", "OLD_CONCLUSION"];
        state.messages.unshift(...old.map((content) => message(2, content, "DAY_SPEECH")));
        const fullToday = buildTodayTranscript(state);
        for (const excerpt of [true, false]) {
          const prompt = buildPromptContext(excerpt);
          assert.equal(prompt.split("<today_transcript>\n")[1], `${fullToday}\n</today_transcript>`);
          for (const content of today) assert.ok(prompt.includes(content));
          const history = buildPastDaysTranscript(state, player, excerpt);
          for (const content of today) assert.ok(!history.includes(content));
        }
        assert.ok(!buildPromptContext(true).includes(old[0]));
        assert.ok(buildPromptContext(false).includes(old[0]));
      } finally { setLocale("zh"); }
    });
  }
}

test("往日分组按连续玩家、日期、阶段与speechRound分开，保留主持人原有过滤和标题", () => {
  const chunk = (label: string, phase: ChatMessage["phase"], speechRound?: number, seat = 1, day = 1) =>
    ["开场", "收尾"].map((part) => ({ ...message(seat, `${label}-${part}`, phase), speechRound, day }));
  const system = (content: string): ChatMessage => ({ ...message(0, content), playerId: "system", isSystem: true });
  const state = makeState([
    ...chunk("警上", "DAY_BADGE_SPEECH", 0),
    ...chunk("其他玩家", "DAY_BADGE_SPEECH", 0, 2),
    ...chunk("同人再次", "DAY_BADGE_SPEECH", 0),
    system("天亮了"),
    ...chunk("被系统行隔开", "DAY_BADGE_SPEECH", 0),
    system("3号已由主持人宣布出局"),
    ...chunk("PK1", "DAY_PK_SPEECH", 1).map((m) => ({ ...m, pkSource: "badge" as const })),
    ...chunk("PK2", "DAY_PK_SPEECH", 2).map((m) => ({ ...m, pkSource: "badge" as const })),
    ...chunk("警下", "DAY_SPEECH", undefined),
    ...chunk("隔天", "DAY_SPEECH", undefined, 1, 2),
    system("[VOTE_RESULT]已有票型区块"),
  ]);
  state.day = 3;
  const history = buildPastDaysTranscript(state);
  const full = buildPastDaysTranscript(state, undefined, false);
  for (const label of ["警上", "其他玩家", "同人再次", "被系统行隔开", "PK1", "PK2", "警下", "隔天"]) {
    assert.ok(history.includes(`${label}-收尾`), label);
    assert.ok(!history.includes(`${label}-开场`), label);
  }
  assert.ok(history.includes("系统: 3号已由主持人宣布出局"));
  assert.doesNotMatch(history, /系统: 天亮了|VOTE_RESULT/);
  assert.match(history, /PK.*警徽.*第1轮/);
  assert.match(history, /PK.*警徽.*第2轮/);
  assert.deepEqual(history.split("\n").filter((line) => line.startsWith("【")), full.split("\n").filter((line) => line.startsWith("【")));
  const previousRound = state.messages.find((m) => m.content === "PK1-收尾")!;
  state.messages.push({ ...previousRound, id: "repeat-content", day: 2 });
  assert.equal(buildPastDaysTranscript(state).split("PK1-收尾").length - 1, 2);
});

test("旧消息缺少分组阶段时回退当天全文，其他天仍能摘录", () => {
  const state = makeState([
    { ...message(1, "旧存档开场"), phase: undefined },
    message(1, "旧存档收尾"),
    { ...message(2, "第二天开场", "DAY_SPEECH"), day: 2 },
    { ...message(2, "第二天收尾", "DAY_SPEECH"), day: 2 },
  ]);
  state.day = 3;
  const history = buildPastDaysTranscript(state);
  assert.ok(history.includes("旧存档开场"));
  assert.ok(history.includes("旧存档收尾"));
  assert.ok(!history.includes("第二天开场"));
  assert.ok(history.includes("第二天收尾"));
});
