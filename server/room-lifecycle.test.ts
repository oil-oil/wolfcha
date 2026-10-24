import assert from "node:assert/strict";
import test from "node:test";
import { RoomCoordinator } from "./room-coordinator";
import { MemoryRoomStore } from "./room-store";
import { MultiplayerAiUnavailableError } from "./ai-service";
import { takeOverMultiplayerPlayer } from "@/multiplayer/engine";

async function fixture(options: { human?: boolean; alive?: boolean; connected?: boolean; failing?: boolean } = {}) {
  const store = new MemoryRoomStore();
  let calls = 0;
  let now = new Date("2026-10-23T00:00:00Z");
  const coordinator = new RoomCoordinator({ store, now: () => now, aiService: {
    isAvailable: () => true,
    async resolveAiTurns(state) {
      calls += 1;
      if (options.failing) throw new MultiplayerAiUnavailableError("AI_RETRY_EXHAUSTED", { cause: new Error("AI_HTTP_503") });
      return state;
    },
  }});
  const created = await coordinator.create("human", { displayName: "真人", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.ok(created.ok); if (!created.ok) throw Error();
  const id = created.view.room.id;
  const ready = await coordinator.ready("human", id, true, 0); assert.ok(ready.ok); if (!ready.ok) throw Error();
  const started = await coordinator.start("human", id, ready.view.room.version); assert.ok(started.ok);
  const aggregate = await store.getRoom(id); assert.ok(aggregate?.room.serverState); if (!aggregate?.room.serverState) throw Error();
  let state = aggregate.room.serverState;
  state.phase = "DAY_BADGE_SIGNUP"; state.badge!.signup = {}; state.submittedSeats = {};
  state.turnKey = "human:signup"; state.deadlineAt = "2026-10-23T00:01:30Z";
  state.players.find(p => p.userId === "human")!.alive = options.alive ?? true;
  state.players.forEach(p => { if (p.userId !== "human") p.alive = true; });
  if (options.human === false) state = takeOverMultiplayerPlayer(state, "human", "timeout");
  state.version = aggregate.room.version + 1;
  if (options.human === false) {
    await store.applyTimeout(id, aggregate.room.version, "fixture-timeout", ["human"], { serverState: state, phase: state.phase }, { type: "turn_expired", payload: {} });
  } else {
    await store.transitionRoom(id, aggregate.room.version, { serverState: state, phase: state.phase });
  }
  if (options.connected === false) await store.setPresence(id, "human", false);
  return { coordinator, store, id, calls: () => calls, advanceClock: () => { now = new Date("2026-10-23T00:02:00Z"); } };
}

test("遗留全员托管房在模型请求前关闭，观战成员可以退出", async () => {
  const f = await fixture({ human: false });
  assert.equal(await f.coordinator.progressAi(f.id), true);
  assert.equal(f.calls(), 0);
  const after = await f.store.getRoom(f.id);
  assert.equal(after?.room.status, "closed");
  assert.equal(after?.room.serverState?.deadlineAt, null);
  const left = await f.coordinator.leave("human", f.id, 0);
  assert.equal(left.ok, true, "观战退出不因旧牌局版本被拒绝");
  assert.equal((await f.store.getRoom(f.id))?.members[0].isConnected, false);
  assert.equal((await f.coordinator.leave("outsider", f.id, 0)).ok, false);
});

test("仍保留真人席位时，已出局或暂时断线均不能自动关局", async () => {
  for (const options of [{ alive: false }, { connected: false }]) {
    const f = await fixture(options);
    await f.coordinator.progressAi(f.id);
    assert.equal(f.calls(), 1);
    assert.equal((await f.store.getRoom(f.id))?.room.status, "in_game");
  }
});

test("默认90秒超时使最后真人托管后直接关闭，不能继续调用AI", async () => {
  const f = await fixture(); f.advanceClock();
  const before = await f.store.getRoom(f.id); assert.ok(before?.room.serverState);
  assert.equal(await f.coordinator.expireTurn(f.id, before!.room.version, "human:signup"), true);
  const after = await f.store.getRoom(f.id);
  assert.equal(after?.room.status, "closed");
  assert.equal(after?.members[0].role, "spectator");
  await f.coordinator.progressAi(f.id);
  assert.equal(f.calls(), 0);
});

test("失败重试计数持久化，第三次后暂停且重建协调器不再调用", async () => {
  const f = await fixture({ failing: true });
  for (let i = 0; i < 3; i++) await assert.rejects(f.coordinator.progressAi(f.id), /AI_RETRY_EXHAUSTED/);
  assert.equal(f.calls(), 3);
  assert.equal(await f.coordinator.progressAi(f.id), false);
  assert.equal(f.calls(), 3);
  assert.equal(await f.coordinator.deadlineFor(f.id), null, "暂停不应继续超时托管真人");
  const view = await f.coordinator.viewFor(f.id, "human");
  assert.equal(view?.publicState.aiProgress?.status, "paused");
  let restartedCalls = 0;
  const restarted = new RoomCoordinator({ store: f.store, aiService: { async resolveAiTurns(s) { restartedCalls++; return s; } } });
  assert.equal(await restarted.progressAi(f.id), false);
  assert.equal(restartedCalls, 0);
  const unauthorized = await restarted.retryAi("outsider", f.id, view!.room.version);
  assert.equal(unauthorized.ok, false);
  const resumed = await restarted.retryAi("human", f.id, view!.room.version);
  assert.equal(resumed.ok, true);
  await restarted.progressAi(f.id);
  assert.equal(restartedCalls, 1);
});

test("八个客户端使用同一版本同时准备，按各自绝对状态更新而不相互冲突", async () => {
  const c = new RoomCoordinator({ store: new MemoryRoomStore() });
  const created = await c.create("p0", { displayName: "p0", playerCount: 8, difficulty: "normal", locale: "zh" }); assert.ok(created.ok);
  for (let i = 1; i < 8; i++) assert.ok((await c.join(`p${i}`, { code: created.view.room.code, displayName: `p${i}` })).ok);
  const before = await c.viewFor(created.view.room.id, "p0"); assert.ok(before);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => c.ready(`p${i}`, created.view.room.id, true, before.room.version)));
  assert.ok(results.every(r => r.ok));
  const after = await c.viewFor(created.view.room.id, "p0");
  assert.equal(after?.members.filter(m => m.isReady).length, 8);
  assert.equal(after?.room.version, before.room.version + 8);
  assert.equal((await c.ready("p0", created.view.room.id, true, before.room.version)).ok, true, "重复绝对状态幂等");
  assert.equal((await c.viewFor(created.view.room.id, "p0"))?.room.version, after?.room.version);
});
