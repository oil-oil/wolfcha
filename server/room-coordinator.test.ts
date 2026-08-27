import assert from "node:assert/strict";
import test from "node:test";
import { MemoryRoomStore } from "./room-store";
import { RoomCoordinator } from "./room-coordinator";
import { advanceMultiplayerGame } from "@/multiplayer/engine";
import { MultiplayerAiUnavailableError, type MultiplayerAiService } from "./ai-service";

const testAiService: MultiplayerAiService = {
  async resolveAiTurns(state) {
    return advanceMultiplayerGame(state, { autoAi: true });
  },
};

test("房间操作按版本 CAS 串行，未准备玩家不能开局", async () => {
  const coordinator = new RoomCoordinator({ store: new MemoryRoomStore() });
  const created = await coordinator.create("u1", { displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const joined = await coordinator.join("u2", { code: created.view.room.code, displayName: "玩家" });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  const blocked = await coordinator.start("u1", created.view.room.id, joined.view.room.version);
  assert.equal(blocked.ok, false);
  if (blocked.ok) return;
  assert.equal(blocked.error.code, "ROOM_CONFLICT");
});

test("房间码唯一约束并发碰撞时透明重试创建", async () => {
  class OneCollisionStore extends MemoryRoomStore {
    attempts = 0;
    override async createRoom(...args: Parameters<MemoryRoomStore["createRoom"]>) {
      this.attempts += 1;
      if (this.attempts === 1) {
        throw { code: "23505", constraint: "multiplayer_rooms_code_key" };
      }
      return super.createRoom(...args);
    }
  }
  const store = new OneCollisionStore();
  const coordinator = new RoomCoordinator({ store });
  const created = await coordinator.create("u1", { displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  assert.equal(store.attempts, 2);
});

test("开局视图按用户投影且不广播服务端状态", async () => {
  const coordinator = new RoomCoordinator({ store: new MemoryRoomStore(), aiService: testAiService });
  const created = await coordinator.create("u1", { displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const ready = await coordinator.ready("u1", created.view.room.id, true, created.view.room.version);
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  const started = await coordinator.start("u1", created.view.room.id, ready.view.room.version);
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal(started.view.publicState.players.length, 8);
  assert.equal(
    started.view.publicState.players.filter((player) => player.kind === "human").length,
    1,
  );
  assert.equal(
    started.view.publicState.players.filter((player) => player.kind === "ai").length,
    7,
  );
  assert.equal(started.view.publicState.players.every((player) => player.role === null), true);
  assert.ok(started.view.privateState.role);
});

test("开局 ack 不同步等待 AI，progressAi 使用独立 CAS 推进", async () => {
  let aiCalls = 0;
  const store = new MemoryRoomStore();
  const coordinator = new RoomCoordinator({
    store,
    aiService: {
      async resolveAiTurns(state) {
        aiCalls += 1;
        return advanceMultiplayerGame(state, { autoAi: true });
      },
    },
  });
  const created = await coordinator.create("u1", { displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const ready = await coordinator.ready("u1", created.view.room.id, true, created.view.room.version);
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  const started = await coordinator.start("u1", created.view.room.id, ready.view.room.version);
  assert.equal(started.ok, true);
  assert.equal(aiCalls, 0);
  assert.equal(await coordinator.progressAi(created.view.room.id), true);
  assert.equal(aiCalls, 1);
});

test("模型请求期间不占用房间锁，过期 AI 结果不会覆盖真人动作", async () => {
  let releaseAi: (() => void) | undefined;
  let markAiStarted: (() => void) | undefined;
  const aiStarted = new Promise<void>((resolve) => { markAiStarted = resolve; });
  const aiGate = new Promise<void>((resolve) => { releaseAi = resolve; });
  const store = new MemoryRoomStore();
  const coordinator = new RoomCoordinator({
    store,
    aiService: {
      async resolveAiTurns(state) {
        markAiStarted?.();
        await aiGate;
        return advanceMultiplayerGame(state, { autoAi: true });
      },
    },
  });
  const created = await coordinator.create("u1", { displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const ready = await coordinator.ready("u1", created.view.room.id, true, created.view.room.version);
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  const started = await coordinator.start("u1", created.view.room.id, ready.view.room.version);
  assert.equal(started.ok, true);
  if (!started.ok) return;

  const aggregate = await store.getRoom(created.view.room.id);
  assert.ok(aggregate?.room.serverState);
  if (!aggregate?.room.serverState) return;
  const signupState = structuredClone(aggregate.room.serverState);
  signupState.phase = "DAY_BADGE_SIGNUP";
  signupState.version = aggregate.room.version + 1;
  signupState.submittedSeats = {};
  signupState.badge!.signup = {};
  signupState.turnKey = null;
  signupState.deadlineAt = null;
  const moved = await store.transitionRoom(created.view.room.id, aggregate.room.version, {
    phase: signupState.phase,
    serverState: signupState,
  });
  assert.ok(moved);

  const pendingAi = coordinator.progressAi(created.view.room.id);
  await aiStarted;
  const commandResult = await Promise.race([
    coordinator.command("u1", {
      type: "badge_signup",
      signup: true,
      commandId: "human-during-ai",
      roomId: created.view.room.id,
      expectedVersion: moved as number,
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("真人动作被模型请求阻塞")), 200)),
  ]);
  assert.equal(commandResult.ok, true);
  releaseAi?.();
  assert.equal(await pendingAi, true);

  const current = await store.getRoom(created.view.room.id);
  assert.equal(current?.room.serverState?.badge?.signup.u1, true);
  assert.equal(current?.room.version, (moved as number) + 1);
});

test("同一轮多人广播只读取一次房间聚合", async () => {
  class CountingStore extends MemoryRoomStore {
    reads = 0;
    override async getRoom(idOrCode: string) {
      this.reads += 1;
      return super.getRoom(idOrCode);
    }
  }
  const store = new CountingStore();
  const coordinator = new RoomCoordinator({ store });
  const created = await coordinator.create("u1", { displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  store.reads = 0;

  const views = await coordinator.viewsFor(created.view.room.id, ["u1", "u1", "u2"]);

  assert.equal(store.reads, 1);
  assert.equal(views.size, 2);
  assert.equal(views.get("u1")?.currentUserId, "u1");
});

test("房间视图不会向其他成员泄漏稳定账户 ID", async () => {
  const coordinator = new RoomCoordinator({ store: new MemoryRoomStore() });
  const created = await coordinator.create("host-account-id", { displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const joined = await coordinator.join("friend-account-id", { code: created.view.room.code, displayName: "朋友" });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  assert.equal(joined.view.currentUserId, "friend-account-id");
  assert.equal(joined.view.members.some((member) => member.userId === "host-account-id"), false);
  assert.notEqual(joined.view.room.hostUserId, "host-account-id");
  const hostView = await coordinator.viewFor(created.view.room.id, "host-account-id");
  assert.ok(hostView);
  assert.equal(hostView.room.hostUserId, "host-account-id");
  assert.equal(hostView.members.some((member) => member.userId === "friend-account-id"), false);
});

test("房主退出大厅后原子转移房主，退出者转为观战", async () => {
  const store = new MemoryRoomStore();
  const coordinator = new RoomCoordinator({ store });
  const created = await coordinator.create("u1", { displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const joined = await coordinator.join("u2", { code: created.view.room.code, displayName: "朋友" });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;

  const left = await coordinator.leave("u1", created.view.room.id, joined.view.room.version);
  assert.equal(left.ok, true);
  const aggregate = await store.getRoom(created.view.room.id);
  assert.equal(aggregate?.room.hostUserId, "u2");
  assert.equal(aggregate?.members.find((member) => member.userId === "u2")?.role, "host");
  assert.equal(aggregate?.members.find((member) => member.userId === "u1")?.role, "spectator");
});

test("真人操作超时后转为 AI 托管，牌局不会停在等待阶段", async () => {
  let now = new Date("2026-08-23T10:00:00.000Z");
  const store = new MemoryRoomStore();
  const coordinator = new RoomCoordinator({ store, aiService: testAiService, now: () => now, actionTimeoutMs: 1_000, speechTimeoutMs: 1_000 });
  const created = await coordinator.create("u1", { displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const ready = await coordinator.ready("u1", created.view.room.id, true, created.view.room.version);
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  const started = await coordinator.start("u1", created.view.room.id, ready.view.room.version);
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal(await coordinator.progressAi(created.view.room.id), true);
  const progressed = await coordinator.viewFor(created.view.room.id, "u1");
  assert.ok(progressed?.publicState.deadlineAt);
  const deadline = await coordinator.deadlineFor(created.view.room.id);
  assert.ok(deadline);
  if (!deadline) return;

  now = new Date("2026-08-23T10:00:02.000Z");
  assert.equal(await coordinator.expireTurn(created.view.room.id, deadline.version, deadline.turnKey), true);
  let aggregate = await store.getRoom(created.view.room.id);
  assert.equal(aggregate?.room.serverState?.players.find((player) => player.displayName === "房主")?.kind, "ai");
  assert.equal(await coordinator.progressAi(created.view.room.id), true);
  aggregate = await store.getRoom(created.view.room.id);
  assert.notEqual(aggregate?.room.phase, started.view.room.phase);
  const takenOver = aggregate?.members.find((member) => member.userId === "u1");
  assert.equal(takenOver?.role, "spectator");
  assert.equal(takenOver?.seat, null);
  assert.equal(takenOver?.isConnected, false);
  const resumed = await coordinator.resume("u1", created.view.room.id);
  assert.equal(resumed.ok, true);
  if (resumed.ok) {
    assert.equal(resumed.view.members.find((member) => member.userId === "u1")?.role, "spectator");
    assert.equal(resumed.view.members.find((member) => member.userId === "u1")?.seat, null);
    assert.notEqual(resumed.view.room.hostUserId, "u1");
    assert.equal(resumed.view.privateState.seat, null);
    assert.equal(resumed.view.privateState.role, null);
  }
});

test("AI provider 未配置时开局事务不落库，并释放已占用 session", async () => {
  const released: string[] = [];
  const coordinator = new RoomCoordinator({
    store: new MemoryRoomStore(),
    aiService: { isAvailable: () => false, async resolveAiTurns() { throw new MultiplayerAiUnavailableError(); } },
    authorizeGameSession: async () => true,
    releaseGameSession: async (_userId, sessionId) => { released.push(sessionId); },
  });
  const created = await coordinator.create("u1", { displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const ready = await coordinator.ready("u1", created.view.room.id, true, created.view.room.version);
  assert.equal(ready.ok, true);
  if (!ready.ok) return;

  const started = await coordinator.start("u1", created.view.room.id, ready.view.room.version, "session-1");
  assert.equal(started.ok, false);
  if (started.ok) return;
  assert.equal(started.error.code, "AI_UNAVAILABLE");
  assert.deepEqual(released, ["session-1"]);
  const aggregate = await coordinator.store.getRoom(created.view.room.id);
  assert.equal(aggregate?.room.status, "lobby");
  assert.equal(aggregate?.room.version, ready.view.room.version);
});

test("开局 RPC 已提交但响应丢失时读回成功状态，不误释放 session claim", async () => {
  class CommitThenFailStore extends MemoryRoomStore {
    override async transitionRoom(...args: Parameters<MemoryRoomStore["transitionRoom"]>) {
      const version = await super.transitionRoom(...args);
      if (args[2].status === "in_game") throw new Error("response_lost");
      return version;
    }
  }
  const released: string[] = [];
  const coordinator = new RoomCoordinator({
    store: new CommitThenFailStore(),
    aiService: testAiService,
    authorizeGameSession: async () => true,
    releaseGameSession: async (_userId, sessionId) => { released.push(sessionId); },
  });
  const created = await coordinator.create("u1", { displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const ready = await coordinator.ready("u1", created.view.room.id, true, created.view.room.version);
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  const started = await coordinator.start("u1", created.view.room.id, ready.view.room.version, "session-1");
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal(started.view.room.status, "in_game");
  assert.deepEqual(released, []);
});

test("支持原子开局的存储不会先做独立额度 claim", async () => {
  class AtomicStartStore extends MemoryRoomStore {
    atomicCalls = 0;
    async startRoomAtomically(
      roomId: string,
      expectedVersion: number,
      _sessionId: string | null | undefined,
      _userId: string,
      patch: Parameters<MemoryRoomStore["transitionRoom"]>[2],
    ) {
      this.atomicCalls += 1;
      const version = await this.transitionRoom(roomId, expectedVersion, patch);
      return version === null ? null : { version, authorized: true };
    }
  }
  const store = new AtomicStartStore();
  let separateClaimCalls = 0;
  const coordinator = new RoomCoordinator({
    store,
    aiService: testAiService,
    authorizeGameSession: async () => { separateClaimCalls += 1; return true; },
  });
  const created = await coordinator.create("u1", { displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const ready = await coordinator.ready("u1", created.view.room.id, true, created.view.room.version);
  assert.equal(ready.ok, true);
  if (!ready.ok) return;

  const started = await coordinator.start("u1", created.view.room.id, ready.view.room.version, "session-1");

  assert.equal(started.ok, true);
  assert.equal(store.atomicCalls, 1);
  assert.equal(separateClaimCalls, 0);
});

test("房主转移后最后真人离房仍按开局 claim owner 释放 session", async () => {
  const released: Array<{ userId: string; sessionId: string }> = [];
  const store = new MemoryRoomStore();
  const coordinator = new RoomCoordinator({
    store,
    aiService: testAiService,
    authorizeGameSession: async () => true,
    releaseGameSession: async (userId, sessionId) => { released.push({ userId, sessionId }); },
  });
  const created = await coordinator.create("u1", { displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const joined = await coordinator.join("u2", { code: created.view.room.code, displayName: "玩家" });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  const ready1 = await coordinator.ready("u1", created.view.room.id, true, joined.view.room.version);
  assert.equal(ready1.ok, true);
  if (!ready1.ok) return;
  const ready2 = await coordinator.ready("u2", created.view.room.id, true, ready1.view.room.version);
  assert.equal(ready2.ok, true);
  if (!ready2.ok) return;
  const started = await coordinator.start("u1", created.view.room.id, ready2.view.room.version, "session-1");
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal((await store.getRoom(created.view.room.id))?.room.gameSessionOwnerId, "u1");
  const hostLeft = await coordinator.leave("u1", created.view.room.id, started.view.room.version);
  assert.equal(hostLeft.ok, true);
  if (!hostLeft.ok) return;
  assert.deepEqual(released, []);
  const lastLeft = await coordinator.leave("u2", created.view.room.id, hostLeft.view.room.version);
  assert.equal(lastLeft.ok, true);
  assert.deepEqual(released, [{ userId: "u1", sessionId: "session-1" }]);
});

test("房间含 AI 但未配置模型服务时拒绝开局，不启用规则引擎假 AI", async () => {
  const coordinator = new RoomCoordinator({ store: new MemoryRoomStore() });
  const created = await coordinator.create("u1", { displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const ready = await coordinator.ready("u1", created.view.room.id, true, created.view.room.version);
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  const started = await coordinator.start("u1", created.view.room.id, ready.view.room.version);
  assert.equal(started.ok, false);
  if (started.ok) return;
  assert.equal(started.error.code, "AI_UNAVAILABLE");
  assert.equal((await coordinator.store.getRoom(created.view.room.id))?.room.status, "lobby");
});
