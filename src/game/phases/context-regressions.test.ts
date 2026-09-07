import assert from "node:assert/strict";
import test from "node:test";
import { createSinglePlayerContextAuditState } from "../../../scripts/single-player-context-audit";
import { setLocale } from "@/i18n/locale-store";
import { buildGameContext, buildPastDaysTranscript } from "@/lib/prompt-utils";
import { recordVoteRound } from "@/lib/vote-rounds";
import type { GameState, Phase } from "@/types/game";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "context-regression-key";
setLocale("zh");

function fresh(phase: Phase = "DAY_SPEECH"): GameState {
  const state = createSinglePlayerContextAuditState();
  return { ...state, phase, day: 1, messages: [], currentSpeakerSeat: 0,
    nightHistory: {}, dayHistory: {}, nightActions: {}, voteHistory: {},
    dailySummaries: {}, dailySummaryFacts: {}, dailySummaryVoteData: {},
    badge: { ...state.badge, candidates: [], holderSeat: null, history: {}, votes: {}, revoteCount: 0 },
    roleAbilities: { ...state.roleAbilities, witchHealUsed: false, witchPoisonUsed: false, idiotRevealed: false },
  };
}

const message = (state: GameState, content: string, phase: Phase, seat = 0, round?: number) => ({
  id: content, playerId: state.players[seat].playerId, playerName: state.players[seat].displayName,
  content, phase, day: state.day, timestamp: 1, speechRound: round,
});

const decisions: Phase[] = ["DAY_BADGE_SIGNUP", "DAY_BADGE_ELECTION", "BADGE_TRANSFER", "DAY_VOTE", "HUNTER_SHOOT", "WHITE_WOLF_KING_BOOM", "DAY_SPEECH", "DAY_LAST_WORDS", "DAY_PK_SPEECH"];
for (const phase of decisions) {
  test(`阶段矩阵：${phase} 必须包含已公开的当天证据`, async () => {
    await import("@/lib/game-master");
    const { PhaseManager } = await import("../core/PhaseManager");
    const state = fresh(phase);
    state.pkSource = "badge";
    state.badge.candidates = [0, 1];
    state.messages = [message(state, "唯一公开证据：3号曾承认没有查验结果", "DAY_BADGE_SPEECH", 2)];
    const role = phase === "HUNTER_SHOOT" ? "Hunter" : phase === "WHITE_WOLF_KING_BOOM" ? "WhiteWolfKing" : "Villager";
    const actor = state.players.find((p) => p.role === role)!;
    state.currentSpeakerSeat = actor.seat;
    const prompt = new PhaseManager().getPrompt(phase, { state }, actor)!;
    assert.match(prompt.user, /唯一公开证据：3号曾承认没有查验结果/);
  });
}

test("警徽 PK 临时切换为自爆提示词，仍不能提前得知刀口结果；公布后才可知", async () => {
  const { generateWhiteWolfKingBoomDecision } = await import("@/lib/game-master");
  const state = fresh("DAY_PK_SPEECH");
  state.pkSource = "badge";
  state.badge.candidates = [0, 1];
  state.nightHistory = { 1: { wolfTarget: 7, deaths: [{ seat: 7, reason: "wolf" }] } };
  const actor = state.players.find((p) => p.role === "WhiteWolfKing")!;
  let prompt = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input) === "/api/demo-config") return Response.json({ active: false, enabled: false });
    prompt = String(init?.body);
    return Response.json({ id: "test", choices: [{ message: { role: "assistant", content: '{"action":"pass"}' }, finish_reason: "stop" }] });
  };
  try {
    await generateWhiteWolfKingBoomDecision(state, actor);
    assert.match(prompt, /结果待天亮公布/);
    assert.doesNotMatch(prompt, /目标当晚出局/);
    assert.equal(state.nightHistory[1].resultsAnnounced, undefined);
    state.nightHistory[1].resultsAnnounced = true;
    await generateWhiteWolfKingBoomDecision(state, actor);
    assert.match(prompt, /目标当晚出局/);
  } finally { globalThis.fetch = originalFetch; }
});

test("守卫保留每夜路线，结果按当夜公开结算判断，普通村民看不到守护记录", () => {
  const state = fresh(); state.day = 3;
  const guard = state.players.find((p) => p.role === "Guard")!;
  state.nightHistory = { 1: { guardTarget: 0, deaths: [] }, 2: { guardTarget: 1, deaths: [] }, 3: { guardTarget: 2, deaths: [{ seat: 2, reason: "poison" }], resultsAnnounced: false } };
  state.nightActions.lastGuardTarget = 2;
  state.players[0].alive = false;
  const privateInfo = buildGameContext(state, guard).split("</your_guard_info>")[0];
  assert.match(privateInfo, /第1夜 → 1号.*守护目标当夜未出局/);
  assert.match(privateInfo, /第2夜 → 2号.*守护目标当夜未出局/);
  assert.match(privateInfo, /第3夜 → 3号.*待天亮公布/);
  assert.match(privateInfo, /不能连续守护 3号/);
  assert.doesNotMatch(buildGameContext(state, state.players.find((p) => p.role === "Villager")!), /<your_guard_info>/);
});

test("实战回归：守护目标存活，但其他人死亡，不能把目标生存写成全场平安夜", () => {
  const state = fresh(); state.day = 2;
  const guard = state.players.find((p) => p.role === "Guard")!;
  state.nightHistory = { 1: { guardTarget: guard.seat, deaths: [], resultsAnnounced: true },
    2: { guardTarget: 0, deaths: [{ seat: 2, reason: "wolf" }], resultsAnnounced: true } };
  const context = buildGameContext(state, guard).split("</your_guard_info>")[0];
  assert.match(context, /全场第1夜：无人出局（平安夜）/);
  assert.match(context, /第2夜 → 1号.*守护目标当夜未出局；全场第2夜：3号出局，并非平安夜/);
  assert.doesNotMatch(context, /当晚平安无事|守护成功/);
  assert.match(context, /不能证明守护生效/);
  state.nightHistory[2].resultsAnnounced = false;
  const hidden = buildGameContext(state, guard).split("</your_guard_info>")[0];
  assert.match(hidden, /第2夜 → 1号.*待天亮公布/);
  assert.doesNotMatch(hidden, /全场第2夜|3号出局/);
  state.nightHistory[2] = { guardTarget: 0, resultsAnnounced: true };
  assert.match(buildGameContext(state, guard), /当夜结算记录缺失，不能判断目标生死或是否平安夜/);
});

test("跨日记录保留警上、PK轮次、警下和遗言标签，不把现在的死亡状态套入过往发言", () => {
  const state = fresh();
  state.messages = [
    message(state, "警上承诺", "DAY_BADGE_SPEECH", 0, 0),
    { ...message(state, "第一次PK", "DAY_PK_SPEECH", 0, 1), pkSource: "badge" as const },
    message(state, "警下改口", "DAY_SPEECH", 0, 2),
    { ...message(state, "第二次PK", "DAY_PK_SPEECH", 0, 3), pkSource: "vote" as const },
    message(state, "遗言证据", "DAY_LAST_WORDS", 0, 4),
  ];
  state.day = 2; state.players[0].alive = false;
  const transcript = buildPastDaysTranscript(state);
  assert.match(transcript, /警徽竞选发言/);
  assert.match(transcript, /PK.*警徽.*第1轮/);
  assert.match(transcript, /PK.*放逐.*第2轮/);
  assert.match(transcript, /遗言/);
  assert.doesNotMatch(transcript, /已出局/);
  assert.ok(transcript.indexOf("警上承诺") < transcript.indexOf("警下改口"));
});

test("结算免死白痴：中间态与最终态都不记录处决，公开票型标为免死", async () => {
  await import("@/lib/game-master");
  const { VotePhase } = await import("./VotePhase");
  const state = fresh("DAY_VOTE");
  const idiot = state.players.find((p) => p.role === "Idiot")!;
  state.votes = Object.fromEntries(state.players.filter((p) => p !== idiot).map((p) => [p.playerId, idiot.seat]));
  const snapshots: GameState[] = [];
  await new VotePhase().handleAction({ state, extras: {
    token: { value: 1, isValid: () => true }, humanPlayer: null,
    setGameState: (next: GameState) => snapshots.push(next), setDialogue: () => {}, setIsWaitingForAI: () => {},
    waitForUnpause: async () => {}, isTokenValid: () => true,
    onVoteComplete: async (next: GameState) => snapshots.push(next), onGameEnd: async () => {}, runAISpeech: async () => {},
  } }, { type: "RESOLVE_VOTES" });
  const end = snapshots.at(-1)!;
  assert.ok(snapshots.every((s) => !s.dayHistory?.[1]?.executed));
  assert.equal(end.players[idiot.seat].alive, true);
  assert.equal(end.roleAbilities.idiotRevealed, true);
  assert.equal(end.voteRounds?.[0].outcome, "idiot-revealed");
  assert.match(buildGameContext(end, end.players[0]), /白痴翻牌免死/);
  const legacy = { ...end, voteRounds: undefined, dayHistory: { 1: { executed: { seat: idiot.seat, votes: 9 }, idiotRevealed: { seat: idiot.seat } } } };
  assert.match(buildGameContext(legacy, legacy.players[0]), /白痴翻牌免死/);
  assert.doesNotMatch(buildGameContext(legacy, legacy.players[0]), /<today_deaths>/);
});

test("投票快照独立保留警徽与放逐各轮、候选人和当时警长，不能被后续修改覆盖", () => {
  let state = fresh();
  const voters = { [state.players[0].playerId]: 1, [state.players[2].playerId]: -1 };
  for (const kind of ["badge", "execution"] as const) {
    state = recordVoteRound(state, { kind, round: 1, candidates: [1, 2], votes: voters, sheriffSeat: kind === "execution" ? 0 : null, winnerSeat: null, outcome: "tie" });
    state = recordVoteRound(state, { kind, round: 2, candidates: [1], votes: { [state.players[0].playerId]: 1 }, sheriffSeat: null, winnerSeat: 1, outcome: kind === "badge" ? "elected" : "executed" });
  }
  voters[state.players[0].playerId] = 9;
  state.badge.holderSeat = 5;
  assert.equal(state.voteRounds?.length, 4);
  assert.equal(state.voteRounds![0].votes[state.players[0].playerId], 1);
  const duplicate = recordVoteRound(state, { ...state.voteRounds![0], votes: {} });
  assert.equal(duplicate.voteRounds!.length, 4);
  const context = buildGameContext(state, state.players[0]);
  assert.match(context, /警徽选举 第1轮/); assert.match(context, /警徽选举 第2轮/);
  assert.match(context, /放逐投票 第1轮/); assert.match(context, /放逐投票 第2轮/);
  assert.match(context, /1.5/); assert.doesNotMatch(context, /(?<!\d)0号/);
});

test("历史提交以段落 ID 幂等，不能吞掉同文的不同段落或下一轮的发言", async () => {
  const { addPlayerMessage } = await import("@/lib/game-master");
  let state = fresh(); const player = state.players[0];
  state = addPlayerMessage(state, player.playerId, "不对。", { id: "request-a:0" });
  state = addPlayerMessage(state, player.playerId, "不对。", { id: "request-a:0" });
  state = addPlayerMessage(state, player.playerId, "不对。", { id: "request-a:1" });
  state = addPlayerMessage(state, player.playerId, "不对。", { id: "request-b:0" });
  assert.equal(state.messages.length, 3);
});

test("真实放逐结算经过平票 PK 后仍保留第一轮和第二轮票型", async () => {
  await import("@/lib/game-master");
  const { VotePhase } = await import("./VotePhase");
  const state = fresh("DAY_VOTE");
  // 四人参与有效票，其余弃票：第一轮 2:2。
  state.votes = Object.fromEntries(state.players.map((p, index) => [p.playerId, index < 2 ? 4 : index < 4 ? 5 : -1]));
  let current = state;
  const runtime = {
    token: { value: 1, isValid: () => true }, humanPlayer: null,
    setGameState: (next: GameState) => { current = next; }, setDialogue: () => {}, setIsWaitingForAI: () => {},
    waitForUnpause: async () => {}, isTokenValid: () => true,
    onVoteComplete: async (next: GameState) => { current = next; }, onGameEnd: async () => {}, runAISpeech: async () => {},
  };
  const phase = new VotePhase();
  await phase.handleAction({ state, extras: runtime }, { type: "RESOLVE_VOTES" });
  assert.equal(current.phase, "DAY_PK_SPEECH");
  assert.equal(current.voteRounds?.[0].outcome, "tie");
  const firstVotes = { ...current.voteRounds![0].votes };
  current = { ...current, phase: "DAY_VOTE", votes: Object.fromEntries(state.players.map((p, index) => [p.playerId, index < 3 ? 4 : index === 3 ? 5 : -1])) };
  await phase.handleAction({ state: current, extras: runtime }, { type: "RESOLVE_VOTES" });
  assert.equal(current.voteRounds?.length, 2);
  assert.deepEqual(current.voteRounds![0].votes, firstVotes);
  assert.equal(current.voteRounds![1].round, 2);
  assert.equal(current.voteRounds![1].winnerSeat, 4);
});

test("开发回滚清掉未来轮次和夜间公开标记，避免未来信息留在提示词", async () => {
  await import("@/lib/game-master");
  const { applyBackwardJump } = await import("@/lib/SmartJumpManager");
  let state = fresh("DAY_RESOLVE");
  state.nightHistory = { 1: { resultsAnnounced: true, deaths: [] } };
  state = recordVoteRound(state, { kind: "badge", round: 1, candidates: [0], votes: {}, sheriffSeat: null, winnerSeat: 0, outcome: "elected" });
  state = recordVoteRound(state, { kind: "execution", round: 1, candidates: [0], votes: {}, sheriffSeat: 0, winnerSeat: null, outcome: "tie" });
  const result = applyBackwardJump(state, { day: 1, phase: "DAY_BADGE_SIGNUP" }, {
    direction: "backward", crossDay: false, missingTasks: [], playersToRevive: [], abilitiesToRestore: [], daysToClean: [],
  });
  assert.deepEqual(result.voteRounds, []);
  assert.equal(result.nightHistory?.[1].resultsAnnounced, false);
});

test("实战事实账本区分累计平安夜和连续平安夜，个人票型不能混淆警徽与放逐", async () => {
  const { buildDecisionGrounding } = await import("@/lib/prompt-utils");
  const state = fresh(); state.day = 5;
  const actor = state.players[0];
  state.nightHistory = { 1: { deaths: [] }, 2: { deaths: [] }, 3: { deaths: [{ seat: 0, reason: "wolf" }] }, 4: { deaths: [{ seat: 7, reason: "wolf" }] }, 5: { deaths: [], resultsAnnounced: false } };
  state.voteRounds = [
    { id: "badge-1", kind: "badge", day: 1, round: 1, candidates: [0, 7, 9], votes: {}, sheriffSeat: null, winnerSeat: 7, outcome: "elected" },
    { id: "execution-1", kind: "execution", day: 1, round: 1, candidates: [8], votes: { [actor.playerId]: 8 }, sheriffSeat: 7, winnerSeat: 8, outcome: "executed" },
  ];
  const context = buildDecisionGrounding(state, actor);
  assert.match(context, /第3夜：1号出局，不是平安夜/);
  assert.match(context, /第4夜：8号出局，不是平安夜/);
  assert.match(context, /第5夜：结果尚未公布/);
  assert.match(context, /本人第1天警徽选举第1轮：作为候选人没有投票资格/);
  assert.match(context, /本人第1天放逐第1轮：投给9号/);
  state.nightHistory[5].resultsAnnounced = true;
  assert.match(buildDecisionGrounding(state, actor), /第5夜：无人出局（平安夜）/);
});

test("最后发言者得到明确收尾约束，投票输入末尾保留本人的完整公开结论", async () => {
  await import("@/lib/game-master");
  const { PhaseManager } = await import("../core/PhaseManager");
  const state = fresh(); state.badge.holderSeat = 0; state.daySpeechStartSeat = 1;
  const actor = state.players[0];
  state.messages = [message(state, "我今天不投6号，我的最终选择是10号。", "DAY_SPEECH")];
  const manager = new PhaseManager();
  assert.match(manager.getPrompt("DAY_SPEECH", { state }, actor)!.user, /你是本轮最后发言者/);
  state.phase = "DAY_VOTE";
  const vote = manager.getPrompt("DAY_VOTE", { state }, actor)!.user;
  assert.match(vote.split("<my_public_position>")[1], /我今天不投6号，我的最终选择是10号/);
  assert.match(vote, /没有新证据就延续自己的公开结论/);
});
