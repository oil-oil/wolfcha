import assert from "node:assert/strict";
import test from "node:test";
import { canRetryMultiplayerCommand, newestMultiplayerView, sendMultiplayerCommandWithRecovery } from "@/lib/multiplayer/room-state";
import type { MultiplayerGameCommand, MultiplayerRoomAck, MultiplayerRoomView } from "@/types/multiplayer";

function speechView(version = 7): MultiplayerRoomView {
  return {
    room: { id: "room", code: "ABC123", hostUserId: "human", status: "in_game", phase: "DAY_SPEECH", day: 1, winner: null, version, settings: { playerCount: 8, difficulty: "normal", locale: "zh" }, createdAt: "2026-10-12T00:00:00Z", startedAt: "2026-10-12T00:00:00Z" },
    currentUserId: "human", members: [],
    publicState: { phase: "DAY_SPEECH", day: 1, players: [], messages: [], currentSpeakerSeat: 0, badge: { holderSeat: null, candidates: [], signupSeats: [], voteProgress: { submitted: 0, total: 0 }, resultCounts: {}, destroyed: false }, voteProgress: { submitted: 0, total: 0, resultCounts: {} }, lastResult: null, winner: null, pendingDeaths: [], deadlineAt: "2026-10-12T00:02:00Z" },
    privateState: { seat: 0, role: "Hunter", alignment: "village", wolfTeammates: [], allowedActions: ["speech"], eligibleTargets: [], actionSubmitted: false, witchNightKill: null, witchHealAvailable: false, witchPoisonAvailable: false, seerHistory: [], wolfVotes: {} },
  };
}

const command: MultiplayerGameCommand = { type: "speech", roomId: "room", commandId: "same-speech-request", expectedVersion: 7, content: "发送这段中文发言" };
const conflict: MultiplayerRoomAck = { ok: false, error: { code: "ROOM_CONFLICT", message: "牌局状态已变化" } };

test("晚到的旧 ack 不能覆盖新广播，同版本仍接收连接状态", () => {
  const newer = speechView(9);
  newer.publicState.currentSpeakerSeat = 1;
  assert.equal(newestMultiplayerView(newer, speechView(7)), newer);
  assert.equal(newestMultiplayerView(speechView(7), newer), newer);
  const presence = structuredClone(newer);
  presence.members = [{ userId: "human", displayName: "真人", role: "host", seat: 0, isConnected: true, isReady: true }];
  assert.equal(newestMultiplayerView(newer, presence), presence);
});

test("同回合版本冲突自动同步并只重试一次，保留发言和请求 ID", () => {
  const sent: MultiplayerGameCommand[] = [];
  let resumed = 0;
  let received: MultiplayerRoomView | undefined;
  let result: MultiplayerRoomAck | undefined;
  const refreshed = speechView(8);
  sendMultiplayerCommandWithRecovery(command, speechView(), {
    send(input, callback) { sent.push(input); callback(sent.length === 1 ? conflict : { ok: true, view: speechView(9) }); },
    resume(id, callback) { assert.equal(id, "room"); resumed++; callback({ ok: true, view: refreshed }); },
    receive(view) { received = view; return view; },
    defer: (next) => next(), isActive: () => true,
  }, (ack) => { result = ack; });
  assert.equal(result?.ok, true);
  assert.equal(resumed, 1);
  assert.equal(received, refreshed);
  assert.deepEqual(sent, [command, { ...command, expectedVersion: 8 }]);
});

test("第二次冲突不能无限重试或生成新请求 ID", () => {
  let sends = 0;
  let resumes = 0;
  let result: MultiplayerRoomAck | undefined;
  sendMultiplayerCommandWithRecovery(command, speechView(), {
    send(input, callback) { sends++; assert.equal(input.commandId, command.commandId); callback(conflict); },
    resume(_id, callback) { resumes++; callback({ ok: true, view: speechView(8) }); },
    receive(view) { return view; }, defer: (next) => next(), isActive: () => true,
  }, (ack) => { result = ack; });
  assert.equal(sends, 2);
  assert.equal(resumes, 1);
  assert.equal(result, conflict);
});

test("发言者、阶段、夜次或截止时间变化后不能把旧发言提交到新回合", () => {
  const before = speechView();
  const changes: Array<(view: MultiplayerRoomView) => void> = [
    (view) => { view.publicState.currentSpeakerSeat = 1; },
    (view) => { view.publicState.phase = "DAY_LAST_WORDS"; },
    (view) => { view.publicState.day = 2; },
    (view) => { view.publicState.deadlineAt = "2026-10-12T00:03:00Z"; },
    (view) => { view.privateState.allowedActions = []; },
    (view) => { view.privateState.actionSubmitted = true; },
    (view) => { view.room.status = "finished"; },
    (view) => { view.room.id = "other-room"; },
    (view) => { view.currentUserId = "other-human"; },
    (view) => { view.privateState.seat = null; },
  ];
  for (const change of changes) {
    const after = speechView(8);
    change(after);
    assert.equal(canRetryMultiplayerCommand(before, after, command), false);
  }
  assert.equal(canRetryMultiplayerCommand(before, speechView(8), { ...command, expectedVersion: 6 }), false);
  const changed = speechView(8);
  changed.publicState.currentSpeakerSeat = 1;
  let sends = 0;
  let result: MultiplayerRoomAck | undefined;
  sendMultiplayerCommandWithRecovery(command, before, {
    send(_input, callback) { sends++; callback(conflict); },
    resume(_id, callback) { callback({ ok: true, view: changed }); },
    receive(view) { return view; }, defer: (next) => next(), isActive: () => true,
  }, (ack) => { result = ack; });
  assert.equal(sends, 1);
  assert.equal(result?.ok, false);
});

test("目标失去资格不能自动重投，业务错误也不能自动重试", () => {
  const before = speechView();
  before.privateState.allowedActions = ["day_vote"];
  before.privateState.eligibleTargets = [1, 2];
  const after = structuredClone(before);
  after.room.version = 8;
  after.privateState.eligibleTargets = [2];
  const vote: MultiplayerGameCommand = { type: "day_vote", roomId: "room", commandId: "vote", expectedVersion: 7, targetSeat: 1 };
  assert.equal(canRetryMultiplayerCommand(before, after, vote), false);
  let resumes = 0;
  const forbidden: MultiplayerRoomAck = { ok: false, error: { code: "FORBIDDEN", message: "不能发言" } };
  let result: MultiplayerRoomAck | undefined;
  sendMultiplayerCommandWithRecovery(command, speechView(), {
    send(_input, callback) { callback(forbidden); },
    resume() { resumes++; }, receive(view) { return view; }, defer: (next) => next(), isActive: () => true,
  }, (ack) => { result = ack; });
  assert.equal(result, forbidden);
  assert.equal(resumes, 0);
});

test("请求断线结束后，晚到的恢复结果不能继续提交", () => {
  let active = true;
  let resumeAck: ((ack: MultiplayerRoomAck) => void) | undefined;
  let sends = 0;
  let receives = 0;
  sendMultiplayerCommandWithRecovery(command, speechView(), {
    send(_input, callback) { sends++; callback(conflict); },
    resume(_id, callback) { resumeAck = callback; },
    receive(view) { receives++; return view; }, defer: (next) => next(), isActive: () => active,
  }, () => { throw new Error("请求已由断线处理结束"); });
  active = false;
  resumeAck?.({ ok: true, view: speechView(8) });
  assert.equal(sends, 1);
  assert.equal(receives, 0);
});

test("重试等待期间断线不再同步或提交，等待有界", () => {
  let active = true;
  let deferred: (() => void) | undefined;
  let sends = 0;
  let resumes = 0;
  let delayMs = 0;
  sendMultiplayerCommandWithRecovery(command, speechView(), {
    send(_input, callback) { sends++; callback(conflict); },
    resume() { resumes++; },
    receive(view) { return view; }, isActive: () => active,
    defer(next, delay) { deferred = next; delayMs = delay; },
  }, () => { throw new Error("断线后的请求不得继续"); });
  assert.ok(delayMs >= 50 && delayMs <= 600);
  assert.equal(resumes, 0);
  active = false;
  deferred?.();
  assert.equal(sends, 1);
  assert.equal(resumes, 0);
});

test("新广播已换发言人时，晚到的旧恢复视图不能重放发言", () => {
  const broadcast = speechView(9);
  broadcast.publicState.currentSpeakerSeat = 1;
  let sends = 0;
  let result: MultiplayerRoomAck | undefined;
  sendMultiplayerCommandWithRecovery(command, speechView(), {
    send(_input, callback) { sends++; callback(conflict); },
    resume(_id, callback) { callback({ ok: true, view: speechView(8) }); },
    receive(view) { return newestMultiplayerView(broadcast, view); },
    isActive: () => true, defer: (next) => next(),
  }, (ack) => { result = ack; });
  assert.equal(sends, 1);
  assert.ok(result && !result.ok);
  assert.equal(result.error.code, "ROOM_CONFLICT");
});

test("自动重试的 ACK 晚于断线也不能恢复已结束的请求", () => {
  let active = true;
  let sends = 0;
  let retryAck: ((ack: MultiplayerRoomAck) => void) | undefined;
  sendMultiplayerCommandWithRecovery(command, speechView(), {
    send(_input, callback) { if (++sends === 1) callback(conflict); else retryAck = callback; },
    resume(_id, callback) { callback({ ok: true, view: speechView(8) }); },
    receive(view) { return view; }, isActive: () => active, defer: (next) => next(),
  }, () => { throw new Error("迟到 ACK 不得结算已经断线的请求"); });
  assert.equal(sends, 2);
  active = false;
  retryAck?.({ ok: true, view: speechView(9) });
});
