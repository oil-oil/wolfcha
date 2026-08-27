import assert from "node:assert/strict";
import test from "node:test";
import { applyMultiplayerGameCommand, advanceMultiplayerGame, buildStartedRoomState, projectMultiplayerState } from "./engine";
import type { MultiplayerGameCommand, MultiplayerRoomMember, MultiplayerServerState } from "@/types/multiplayer";

const members: MultiplayerRoomMember[] = [
  {
    userId: "user-1",
    displayName: "玩家一",
    role: "host",
    seat: 0,
    isReady: true,
    isConnected: true,
  },
  {
    userId: "user-2",
    displayName: "玩家二",
    role: "player",
    seat: 1,
    isReady: true,
    isConnected: true,
  },
];

test("相同 seed 会产生相同的角色分配", () => {
  const first = buildStartedRoomState(members, 8, "room:1");
  const second = buildStartedRoomState(members, 8, "room:1");
  assert.deepEqual(first, second);
});

test("未结束时公共状态不会泄露任何角色", () => {
  const state = buildStartedRoomState(members, 8, "room:2");
  const view = projectMultiplayerState(state, "user-1", "in_game");
  assert.ok(view.privateState.role);
  assert.equal(view.publicState.players.every((player) => player.role === null), true);
});

test("夜间私密结果只投影给对应角色", () => {
  const state = buildStartedRoomState(members, 8, "night-private");
  const first = state.players.find((player) => player.userId === "user-1")!;
  const second = state.players.find((player) => player.userId === "user-2")!;
  first.role = "Witch";
  first.alignment = "village";
  second.role = "Villager";
  second.alignment = "village";
  state.phase = "NIGHT_WITCH_ACTION";
  state.nightActions = { wolfVotes: {}, wolfTarget: 3 };
  assert.equal(projectMultiplayerState(state, "user-1", "in_game").privateState.witchNightKill, 3);
  assert.equal(projectMultiplayerState(state, "user-2", "in_game").privateState.witchNightKill, null);
});

test("狼人只能在私密状态中看到狼队友", () => {
  const state = buildStartedRoomState(members, 8, "room:3");
  const human = state.players.find((player) => player.userId === "user-1");
  const teammate = state.players.find((player) => player.kind === "ai");
  assert.ok(human);
  assert.ok(teammate);
  human.role = "Werewolf";
  human.alignment = "wolf";
  teammate.role = "Werewolf";
  teammate.alignment = "wolf";
  const view = projectMultiplayerState(state, "user-1", "in_game");
  assert.equal(view.privateState.wolfTeammates.length >= 1, true);
  assert.equal(view.publicState.players.every((player) => player.alignment === null), true);
});

test("狼人不能选择自己或狼队友作为夜间刀口", () => {
  const state = buildStartedRoomState(members, 8, "wolf-friendly-fire");
  const actor = state.players.find((player) => player.userId === "user-1")!;
  const teammate = state.players.find((player) => player.seat !== actor.seat)!;
  actor.role = "Werewolf";
  actor.alignment = "wolf";
  teammate.role = "Werewolf";
  teammate.alignment = "wolf";
  state.phase = "NIGHT_WOLF_ACTION";
  state.nightActions = { wolfVotes: {} };

  const view = projectMultiplayerState(state, actor.userId!, "in_game");
  assert.equal(view.privateState.eligibleTargets.includes(actor.seat), false);
  assert.equal(view.privateState.eligibleTargets.includes(teammate.seat), false);
  for (const targetSeat of [actor.seat, teammate.seat]) {
    assert.throws(() => applyMultiplayerGameCommand(state, actor.userId!, {
      commandId: `friendly-fire:${targetSeat}`,
      roomId: state.roomId ?? "",
      expectedVersion: state.version ?? 0,
      type: "wolf",
      targetSeat,
    }), /INVALID_INPUT/);
  }
});

test("公共投影包含可供大厅直接渲染的阶段字段", () => {
  const state = buildStartedRoomState(members, 8, "projection");
  const view = projectMultiplayerState(state, "user-1", "in_game");
  assert.ok(Array.isArray(view.publicState.messages));
  assert.equal(view.publicState.currentSpeakerSeat, null);
  assert.ok(view.publicState.badge.voteProgress);
  assert.ok(view.publicState.voteProgress.resultCounts);
});

test("长局状态只保留固定消息与幂等 ID 窗口", () => {
  const state = buildStartedRoomState(members, 8, "bounded-history");
  state.messages = Array.from({ length: 300 }, (_, index) => ({
    id: `old:${index}`,
    playerId: null,
    playerName: "系统",
    content: `历史消息 ${index}`,
    day: 1,
    phase: "NIGHT_START" as const,
    isSystem: true,
  }));
  state.messageSequence = 300;
  state.processedCommandIds = Array.from({ length: 300 }, (_, index) => `command:${index}`);

  const next = advanceMultiplayerGame(state, { autoAi: false });

  assert.equal(next.messages?.length, 200);
  assert.equal(next.processedCommandIds?.length, 256);
  assert.equal(new Set(next.messages?.map((message) => message.id)).size, next.messages?.length);
  assert.equal(next.messages?.at(-1)?.id, "msg:300");
});

test("guard:null 记录提交并推进到下一夜阶段", () => {
  const state = buildStartedRoomState(members, 10, "guard");
  const guard = state.players.find((p) => p.role === "Guard" && p.kind === "human");
  if (!guard) return;
  let current = advanceMultiplayerGame(state, { autoAi: true });
  if (current.phase !== "NIGHT_GUARD_ACTION") return;
  current = applyMultiplayerGameCommand(current, guard.userId!, { commandId: "g1", roomId: current.roomId ?? "", expectedVersion: current.version ?? 0, type: "guard", targetSeat: null }, { autoAi: true });
  assert.notEqual(current.phase, "NIGHT_GUARD_ACTION");
});

test("重复 commandId 被拒绝", () => {
  const state = buildStartedRoomState(members, 8, "duplicate");
  const wolf = state.players.find((p) => p.kind === "human" && p.role === "Werewolf");
  if (!wolf) return;
  const next = applyMultiplayerGameCommand(advanceMultiplayerGame(state, { autoAi: true }), wolf.userId!, { commandId: "w1", roomId: state.roomId ?? "", expectedVersion: state.version ?? 0, type: "wolf", targetSeat: 2 }, { autoAi: true });
  assert.throws(() => applyMultiplayerGameCommand(next, wolf.userId!, { commandId: "w1", roomId: next.roomId ?? "", expectedVersion: next.version ?? 0, type: "wolf", targetSeat: 2 }));
});

test("只有当前发言者能提交发言", () => {
  const state = buildStartedRoomState(members, 8, "speaker");
  state.phase = "DAY_SPEECH";
  state.speechQueue = [0, 1];
  state.currentSpeakerSeat = 0;
  const first = projectMultiplayerState(state, "user-1", "in_game");
  const second = projectMultiplayerState(state, "user-2", "in_game");
  assert.equal(first.privateState.allowedActions.includes("speech"), true);
  assert.equal(second.privateState.allowedActions.includes("speech"), false);
});

test("公开发言与狼队票型不会暴露账户 ID", () => {
  const state = buildStartedRoomState(members, 8, "opaque-ids");
  state.roomId = "opaque-room";
  state.phase = "DAY_SPEECH";
  state.speechQueue = [0];
  state.currentSpeakerSeat = 0;
  const next = applyMultiplayerGameCommand(state, "user-1", {
    commandId: "opaque-speech",
    roomId: state.roomId,
    expectedVersion: state.version ?? 0,
    type: "speech",
    content: "公开发言不应携带账户标识。",
  });
  const view = projectMultiplayerState(next, "user-2", "in_game");
  assert.equal(JSON.stringify(view.publicState).includes("user-1"), false);
});

test("守护与解药同时落在刀口时按奶穿结算", () => {
  const state = buildStartedRoomState(members, 10, "milk");
  const target = state.players.find((player) => player.role === "Villager");
  assert.ok(target);
  // 绕过首日警徽隐藏窗口，单独验证夜间奶穿结算。
  state.day = 2;
  state.badge!.destroyed = true;
  state.phase = "NIGHT_RESOLVE";
  state.nightActions = {
    wolfVotes: {},
    wolfTarget: target.seat,
    guardTarget: target.seat,
    witchSave: true,
  };
  const next = advanceMultiplayerGame(state, { autoAi: true });
  assert.deepEqual(next.lastResult?.type, "night");
  assert.deepEqual(next.lastResult?.deaths, [{ seat: target.seat, reason: "milk" }]);
  assert.equal(next.players.find((player) => player.seat === target.seat)?.alive, false);
});

test("人类猎人完成开枪后不会卡在特殊阶段", () => {
  const state = buildStartedRoomState(members, 10, "hunter");
  const hunter = state.players.find((player) => player.userId === "user-1");
  const target = state.players.find((player) => player.seat !== hunter?.seat && player.alive);
  assert.ok(hunter);
  assert.ok(target);
  hunter.role = "Hunter";
  hunter.alignment = "village";
  hunter.alive = false;
  state.phase = "HUNTER_SHOOT";
  state.pendingTrigger = "hunter_shot";
  state.continuationPhase = "NIGHT_START";
  const next = applyMultiplayerGameCommand(state, "user-1", {
    commandId: "hunter-shot",
    roomId: state.roomId ?? "",
    expectedVersion: state.version ?? 0,
    type: "hunter_shot",
    targetSeat: target.seat,
  });
  assert.notEqual(next.phase, "HUNTER_SHOOT");
  assert.equal(next.players.find((player) => player.seat === target.seat)?.alive, false);
});

test("AI 白狼王在劣势发言轮可以发动自爆并继续结算", () => {
  const state = buildStartedRoomState(members, 10, "ai-boom");
  const whiteWolf = state.players.find((player) => player.role === "WhiteWolfKing");
  const otherWolf = state.players.find((player) => player.role === "Werewolf");
  assert.ok(whiteWolf);
  assert.ok(otherWolf);
  whiteWolf.kind = "ai";
  whiteWolf.userId = null;
  otherWolf.alive = false;
  state.day = 2;
  state.phase = "DAY_SPEECH";
  state.speechQueue = [whiteWolf.seat];
  state.currentSpeakerSeat = whiteWolf.seat;
  const next = advanceMultiplayerGame(state, { autoAi: true });
  assert.equal(next.roleAbilities?.whiteWolfKingBoomUsed, true);
  assert.equal(next.players.find((player) => player.seat === whiteWolf.seat)?.alive, false);
  assert.notEqual(next.phase, "DAY_SPEECH");
});

test("两名真人与 AI 可从开局持续推进到 GAME_END", () => {
  let state = advanceMultiplayerGame(buildStartedRoomState(members, 10, "full-game"), { autoAi: true });
  state.roomId = "full-game-room";
  for (let turn = 0; turn < 800 && state.phase !== "GAME_END"; turn += 1) {
    const actor = state.players.find((player) => {
      if (!player.userId) return false;
      return projectMultiplayerState(state, player.userId, "in_game").privateState.allowedActions.length > 0;
    });
    assert.ok(actor, `阶段 ${state.phase} 没有可执行的人类动作且无法自动推进`);
    const view = projectMultiplayerState(state, actor.userId!, "in_game");
    const command = buildTestCommand(state, actor.userId!, view.privateState.allowedActions, view.privateState.eligibleTargets, turn);
    state = applyMultiplayerGameCommand(state, actor.userId!, command, { autoAi: true });
  }
  assert.equal(state.phase, "GAME_END");
  assert.ok(state.winner);
});

test("首日警徽报名期间不公开夜间死亡", () => {
  const state = buildStartedRoomState(members, 8, "badge-before-night-result");
  const target = state.players.find((player) => player.seat === 7)!;
  state.phase = "NIGHT_RESOLVE";
  state.nightActions = { wolfVotes: {}, wolfTarget: target.seat };

  const next = advanceMultiplayerGame(state, { autoAi: false });
  const view = projectMultiplayerState(next, "user-1", "in_game");

  assert.equal(next.phase, "DAY_BADGE_SIGNUP");
  assert.equal(next.players.find((player) => player.seat === target.seat)?.alive, true);
  assert.equal(next.pendingDeaths?.some((death) => death.seat === target.seat), true);
  assert.equal(view.publicState.players.find((player) => player.seat === target.seat)?.alive, true);
  assert.deepEqual(view.publicState.pendingDeaths, []);
  assert.equal(view.publicState.lastResult, null);
  assert.equal(view.publicState.messages.some((message) => message.content.includes("出局")), false);
});

test("首日警徽报名期间同样隐藏平安夜，竞选结束后再公布", () => {
  const state = buildStartedRoomState(members, 8, "badge-before-peaceful-night");
  state.phase = "NIGHT_RESOLVE";
  state.nightActions = { wolfVotes: {} };
  const signup = advanceMultiplayerGame(state, { autoAi: false });
  const hidden = projectMultiplayerState(signup, "user-1", "in_game").publicState;
  assert.equal(signup.phase, "DAY_BADGE_SIGNUP");
  assert.equal(hidden.lastResult, null);
  assert.equal(hidden.messages.some((message) => message.content.includes("平安夜")), false);

  signup.phase = "DAY_BADGE_ELECTION";
  signup.badge!.candidates = [0];
  signup.badge!.votes = Object.fromEntries(
    signup.players.filter((player) => player.seat !== 0).map((player) => [playerKeyForTest(player), 0]),
  );
  const revealed = advanceMultiplayerGame(signup, { autoAi: false });
  assert.match(projectMultiplayerState(revealed, "user-1", "in_game").publicState.lastResult ?? "", /平安夜/);
});

test("警徽竞选结束后才公布并处理首日夜间死亡", () => {
  const state = buildStartedRoomState(members, 8, "badge-after-night-result");
  const target = state.players.find((player) => player.seat === 7)!;
  state.phase = "DAY_BADGE_ELECTION";
  state.day = 1;
  state.badge!.candidates = [0];
  state.badge!.votes = Object.fromEntries(
    state.players.filter((player) => player.seat !== 0).map((player) => [playerKeyForTest(player), 0]),
  );
  state.pendingDeaths = [{ seat: target.seat, reason: "wolf" }];

  const next = advanceMultiplayerGame(state, { autoAi: false });
  const view = projectMultiplayerState(next, "user-1", "in_game");

  assert.equal(next.phase, "DAY_SPEECH");
  assert.equal(next.players.find((player) => player.seat === target.seat)?.alive, false);
  assert.deepEqual(next.pendingDeaths, []);
  assert.match(view.publicState.lastResult ?? "", /昨夜出局/);
  assert.equal(view.publicState.pendingDeaths.length, 0);
  assert.equal(view.publicState.messages.some((message) => message.content.includes("昨夜") && message.content.includes("出局")), true);
});

test("普通白天有警长时从警长下一位按环形较短方向发言且警长最后", () => {
  const state = buildStartedRoomState(members, 8, "speech-order-with-sheriff");
  state.day = 2;
  state.phase = "DAY_START";
  state.badge!.holderSeat = 2;
  const next = advanceMultiplayerGame(state, { autoAi: false });

  // 与单机 DaySpeechPhase 的环形距离判定保持一致，警长最后。
  assert.deepEqual(next.speechQueue, [3, 4, 5, 6, 7, 0, 1, 2]);
  assert.equal(new Set(next.speechQueue).size, next.speechQueue.length);
});

test("普通白天无警长时从夜间死者下一位开始，竞选顺序稳定且不重复", () => {
  const state = buildStartedRoomState(members, 8, "speech-order-without-sheriff");
  state.day = 2;
  state.phase = "DAY_START";
  state.badge!.holderSeat = null;
  state.badge!.destroyed = true;
  const victim = state.players.find((player) => player.alignment === "village")!;
  victim.alive = false;
  state.lastResult = { type: "night", day: 2, deaths: [{ seat: victim.seat, reason: "wolf" }] };
  const next = advanceMultiplayerGame(state, { autoAi: false });
  const expectedFirst = state.players
    .filter((player) => player.alive && player.seat > victim.seat)
    .sort((left, right) => left.seat - right.seat)[0]?.seat ??
    state.players.filter((player) => player.alive).sort((left, right) => left.seat - right.seat)[0]?.seat;
  assert.equal(next.speechQueue?.[0], expectedFirst);

  const campaign = buildStartedRoomState(members, 8, "stable-campaign-order");
  campaign.phase = "DAY_BADGE_SIGNUP";
  campaign.badge!.signup = Object.fromEntries(
    campaign.players.map((player) => [playerKeyForTest(player), player.seat === 1 || player.seat === 5]),
  );
  const campaignNext = advanceMultiplayerGame(campaign, { autoAi: false });
  assert.deepEqual(campaignNext.speechQueue, [1, 5]);
  assert.equal(new Set(campaignNext.speechQueue).size, campaignNext.speechQueue.length);
});

function playerKeyForTest(player: MultiplayerServerState["players"][number]): string {
  return player.userId ?? player.displayName;
}

function buildTestCommand(
  state: MultiplayerServerState,
  actorUserId: string,
  actions: MultiplayerGameCommand["type"][],
  targets: number[],
  turn: number,
): MultiplayerGameCommand {
  const base = {
    commandId: `full-${turn}`,
    roomId: state.roomId ?? "",
    expectedVersion: state.version ?? 0,
  };
  const type = actions.includes("speech") ? "speech" : actions[0];
  const actor = state.players.find((player) => player.userId === actorUserId)!;
  const strategicTarget =
    targets.find((seat) => {
      const target = state.players.find((player) => player.seat === seat);
      return actor.alignment === "wolf" ? target?.alignment === "village" : target?.alignment === "wolf";
    }) ?? targets[0] ?? null;
  switch (type) {
    case "guard": return { ...base, type, targetSeat: strategicTarget };
    case "wolf": return { ...base, type, targetSeat: strategicTarget };
    case "witch": return { ...base, type, save: false, poisonTargetSeat: null };
    case "seer": return { ...base, type, targetSeat: strategicTarget as number };
    case "badge_signup": return { ...base, type, signup: actor.seat % 2 === 0 };
    case "speech": return { ...base, type, content: "我会结合公开发言和票型继续判断。" };
    case "badge_vote": return { ...base, type, targetSeat: strategicTarget as number };
    case "day_vote": return { ...base, type, targetSeat: strategicTarget };
    case "hunter_shot": return { ...base, type, targetSeat: strategicTarget };
    case "badge_transfer": return strategicTarget === null
      ? { ...base, type, targetSeat: null, destroy: true }
      : { ...base, type, targetSeat: strategicTarget };
    case "white_wolf_boom": return { ...base, type, targetSeat: strategicTarget };
  }
}
