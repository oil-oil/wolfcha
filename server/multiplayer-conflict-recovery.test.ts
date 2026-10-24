import assert from "node:assert/strict";
import test from "node:test";
import { newestMultiplayerView, sendMultiplayerCommandWithRecovery } from "@/lib/multiplayer/room-state";
import type { MultiplayerGameCommand, MultiplayerRoomAck, MultiplayerRoomView } from "@/types/multiplayer";
import { MemoryRoomStore } from "./room-store";
import { RoomCoordinator } from "./room-coordinator";

/** A directed phase fixture, not a full-game or external-model test. */
async function eightHumanVote() {
  const store = new MemoryRoomStore();
  const coordinator = new RoomCoordinator({ store, aiService: { async resolveAiTurns() { throw new Error("本定向夹具禁止调用模型"); } } });
  const created = await coordinator.create("human-0", { displayName: "玩家0", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.ok(created.ok);
  const { id, code } = created.view.room;
  for (let seat = 1; seat < 8; seat++) {
    assert.ok((await coordinator.join(`human-${seat}`, { code, displayName: `玩家${seat}` })).ok);
  }
  for (let seat = 0; seat < 8; seat++) {
    const view = await coordinator.viewFor(id, `human-${seat}`);
    assert.ok(view);
    assert.ok((await coordinator.ready(`human-${seat}`, id, true, view.room.version)).ok);
  }
  const ready = await coordinator.viewFor(id, "human-0");
  assert.ok(ready);
  assert.ok((await coordinator.start("human-0", id, ready.room.version)).ok);
  const aggregate = await store.getRoom(id);
  assert.ok(aggregate?.room.serverState);
  const state = structuredClone(aggregate.room.serverState);
  state.phase = "DAY_VOTE";
  state.currentSpeakerSeat = null;
  state.votes = {};
  state.submittedSeats = {};
  state.turnKey = "1:DAY_VOTE:all";
  state.deadlineAt = new Date(Date.now() + 90_000).toISOString();
  state.version = aggregate.room.version + 1;
  assert.ok(await store.transitionRoom(id, aggregate.room.version, { phase: state.phase, serverState: state }));
  const views = await Promise.all(Array.from({ length: 8 }, (_, seat) => coordinator.viewFor(id, `human-${seat}`)));
  assert.ok(views.every((view) => view?.privateState.allowedActions.includes("day_vote")));
  return { store, coordinator, id, views: views as MultiplayerRoomView[] };
}

test("八人同版本投票的一次自动恢复错开读取，保留服务端 CAS 和请求幂等", async (t) => {
  const { store, coordinator, id, views } = await eightHumanVote();
  let conflicts = 0;
  const attempts = Array<number>(8).fill(0);
  const commands: MultiplayerGameCommand[] = [];
  const requestLedger: Array<{ seat: number; commandId: string; expectedVersion: number; result: string }> = [];
  const results = await Promise.all(views.map((before, seat) => new Promise<MultiplayerRoomAck>((resolve, reject) => {
    const targetSeat = seat === 7 ? 6 : 7;
    assert.ok(before.privateState.eligibleTargets.includes(targetSeat));
    const command: MultiplayerGameCommand = { type: "day_vote", commandId: `parallel-vote-${seat}`, roomId: id, expectedVersion: before.room.version, targetSeat };
    commands.push(command);
    let latest = before;
    sendMultiplayerCommandWithRecovery(command, before, {
      send(input, callback) {
        attempts[seat]++;
        assert.equal(input.commandId, command.commandId);
        assert.equal(input.type, "day_vote");
        void coordinator.command(`human-${seat}`, input).then((ack) => {
          if (!ack.ok && ack.error.code === "ROOM_CONFLICT") conflicts++;
          requestLedger.push({ seat, commandId: input.commandId, expectedVersion: input.expectedVersion, result: ack.ok ? "OK" : ack.error.code });
          setTimeout(() => callback(ack), 10);
        }, reject);
      },
      resume(roomId, callback) {
        void coordinator.viewFor(roomId, `human-${seat}`).then((view) => {
          assert.ok(view);
          setTimeout(() => callback({ ok: true, view }), 10);
        }, reject);
      },
      receive(view) { latest = newestMultiplayerView(latest, view); return latest; },
      isActive: () => true,
    }, resolve);
  })));
  const final = await store.getRoom(id);
  assert.ok(final?.room.serverState);
  t.diagnostic(JSON.stringify({ scenario: "directed-eight-human-vote", successfulPlayers: results.filter((ack) => ack.ok).length, negativeAcks: conflicts, attempts, persistedVotes: Object.keys(final.room.serverState.votes ?? {}).length, requestLedger }));
  assert.equal(results.filter((ack) => ack.ok).length, 8, "合法同回合投票不应因同步重试再次相撞而要求玩家重投");
  assert.ok(conflicts >= 7, "首轮旧版本必须继续被 CAS 拒绝，不能以禁保护换取零错误");
  assert.ok(attempts.every((count) => count <= 2), "每个动作至多一次自动重试");
  assert.equal(Object.keys(final.room.serverState.votes ?? {}).length, 8);
  assert.equal(commands.filter((command) => final.room.serverState?.processedCommandIds?.includes(command.commandId)).length, 8);
  const version = final.room.version;
  // Simulate an ACK lost after commit, including a phase change: same ID succeeds exactly once.
  const repeated = await coordinator.command("human-0", commands[0]);
  assert.ok(repeated.ok);
  assert.equal(repeated.view.room.version, version);
  const stale = await coordinator.command("human-0", { ...commands[0], commandId: "new-id-with-old-version" });
  assert.ok(!stale.ok);
  assert.equal(stale.error.code, "ROOM_CONFLICT");
});

test("恢复 ACK 晚于新广播时不能向旧版本重发", async () => {
  const { views } = await eightHumanVote();
  const before = views[0];
  const command: MultiplayerGameCommand = { type: "day_vote", commandId: "late-resume-ack", roomId: before.room.id, expectedVersion: before.room.version, targetSeat: 7 };
  const refreshed = structuredClone(before);
  refreshed.room.version++;
  const broadcast = structuredClone(refreshed);
  broadcast.room.version++;
  const sent: MultiplayerGameCommand[] = [];
  let result: MultiplayerRoomAck | undefined;
  sendMultiplayerCommandWithRecovery(command, before, {
    send(input, callback) {
      sent.push(input);
      callback(sent.length === 1 ? { ok: false, error: { code: "ROOM_CONFLICT", message: "stale" } } : { ok: true, view: broadcast });
    },
    resume(_id, callback) { callback({ ok: true, view: refreshed }); },
    receive(view) { return newestMultiplayerView(broadcast, view); },
    isActive: () => true,
  }, (ack) => { result = ack; });
  // Production uses a bounded timer; allow it to run instead of asserting synchronously.
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(result?.ok);
  assert.equal(sent[1].expectedVersion, broadcast.room.version);
});
