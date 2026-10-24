import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { resolveMultiplayerServerUrl } from "@/lib/multiplayer/socket";
import { createFixedWindowRateLimiter, createMultiplayerServer, installShutdownSignalHandlers, listenAfterRecovery, resolveCorsOrigin, resolveLocalTestUser, resolveRoomStore } from "./index";
import { RoomCoordinator } from "./room-coordinator";
import { MemoryRoomStore } from "./room-store";

test("CORS 开发环境允许本机局域网地址，生产环境保持显式白名单", () => {
  assert.deepEqual(
    resolveCorsOrigin("", "development", ["192.168.0.112"]),
    [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://192.168.0.112:3000",
    ],
  );
  assert.equal(
    resolveCorsOrigin("", "production", ["192.168.0.112"]),
    "http://localhost:3000",
  );
  assert.deepEqual(resolveCorsOrigin("https://a.example, https://b.example"), ["https://a.example", "https://b.example"]);
  assert.equal(resolveCorsOrigin(" https://a.example "), "https://a.example");
});

test("memory 模式强制使用内存房间且不依赖 Supabase 表", () => {
  assert.ok(resolveRoomStore("memory") instanceof MemoryRoomStore);
  assert.throws(() => resolveRoomStore("memory", "production"));
});

test("本地测试身份必须显式开启且生产环境永远禁用", () => {
  assert.deepEqual(resolveLocalTestUser("local-test:host-user", "true", "development"), { id: "host-user" });
  assert.equal(resolveLocalTestUser("local-test:host-user", "false", "development"), null);
  assert.equal(resolveLocalTestUser("local-test:host-user", "true", "production"), null);
  assert.equal(resolveLocalTestUser("invalid-token", "true", "development"), null);
});

test("房间入口限流状态会过期且总量有界", () => {
  let now = 0;
  const limiter = createFixedWindowRateLimiter(2, 1_000, 2, () => now);
  assert.equal(limiter.allow("u1"), true);
  assert.equal(limiter.allow("u1"), true);
  assert.equal(limiter.allow("u1"), false);
  assert.equal(limiter.allow("u2"), true);
  now = 1_001;
  assert.equal(limiter.allow("u3"), true);
  assert.ok(limiter.size() <= 2);
  assert.equal(limiter.allow("u1"), true);
});

test("局域网页面会把本地 Socket 地址改为当前主机", () => {
  assert.equal(
    resolveMultiplayerServerUrl(
      "http://localhost:3011",
      "192.168.0.112",
    ),
    "http://192.168.0.112:3011",
  );
  assert.equal(
    resolveMultiplayerServerUrl("https://game.example.com", "192.168.0.112"),
    "https://game.example.com",
  );
});

test("服务关闭会取消正在运行的 AI 推进且不再复活后台任务", async () => {
  let markStarted!: () => void;
  let markAborted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const aborted = new Promise<void>((resolve) => { markAborted = resolve; });
  class SlowCoordinator extends RoomCoordinator {
    override async activeRoomIds() { return ["slow-room"]; }
    override async deadlineFor() { return null; }
    override async purgeHistory() { return 0; }
    override async progressAi(_roomId: string, signal?: AbortSignal) {
      markStarted();
      return new Promise<boolean>((resolve) => {
        signal?.addEventListener("abort", () => {
          markAborted();
          resolve(false);
        }, { once: true });
      });
    }
  }

  const server = createMultiplayerServer({
    coordinator: new SlowCoordinator({ store: new MemoryRoomStore() }),
    authenticateToken: async () => null,
  });
  await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
  await server.recovery;
  await started;
  const firstShutdown = server.shutdown({ graceMs: 1_000 });
  const secondShutdown = server.shutdown({ graceMs: 1_000 });
  assert.equal(firstShutdown, secondShutdown);
  await firstShutdown;
  await aborted;
  assert.equal(server.isDisposed(), true);
});

test("SIGTERM 使用同一关闭路径且不会真的终止测试进程", async () => {
  const signalTarget = new EventEmitter();
  const mockIo = createMockIo();
  const server = createMultiplayerServer({
    io: mockIo.io,
    coordinator: new RoomCoordinator({ store: new MemoryRoomStore() }),
    authenticateToken: async () => null,
  });
  let completedSignal: "SIGINT" | "SIGTERM" | null = null;
  const completed = new Promise<void>((resolve) => {
    installShutdownSignalHandlers(server, {
      signalTarget,
      graceMs: 100,
      onComplete: (signal) => {
        completedSignal = signal;
        resolve();
      },
    });
  });
  const connectedSocket = createMockSocket("connected-socket", "connected-user", "connected-room");
  mockIo.connect(connectedSocket.socket);

  signalTarget.emit("SIGTERM");
  assert.equal(server.isDisposed(), true);
  let rejectedTask: unknown = null;
  connectedSocket.trigger("room:create", {}, (result: unknown) => { rejectedTask = result; });
  assert.deepEqual(rejectedTask, {
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "多人服务正在关闭，请稍后重试" },
  });
  const lateSocket = createMockSocket("late-socket", "late-user", "late-room");
  mockIo.connect(lateSocket.socket);
  assert.equal(lateSocket.disconnected(), true);
  await completed;
  assert.equal(completedSignal, "SIGTERM");
  assert.equal(mockIo.closeCalls(), 1);
});

test("恢复期间收到终止信号后不会重新开始监听", async () => {
  let finishRecovery!: () => void;
  const recovery = new Promise<void>((resolve) => { finishRecovery = resolve; });
  let listenCalls = 0;
  const server = {
    recovery,
    isDisposed: () => true,
    httpServer: { listen: () => { listenCalls += 1; } },
  } as unknown as Parameters<typeof listenAfterRecovery>[0];
  const listening = listenAfterRecovery(server, 3011, () => undefined);
  finishRecovery();
  assert.equal(await listening, false);
  assert.equal(listenCalls, 0);
});

test("SIGINT 同样先 dispose 再执行幂等 shutdown", async () => {
  const signalTarget = new EventEmitter();
  const calls: string[] = [];
  let markComplete!: () => void;
  const completed = new Promise<void>((resolve) => { markComplete = resolve; });
  installShutdownSignalHandlers({
    dispose: () => { calls.push("dispose"); return true; },
    shutdown: async () => { calls.push("shutdown"); },
  }, {
    signalTarget,
    onComplete: () => markComplete(),
  });

  signalTarget.emit("SIGINT");
  assert.deepEqual(calls, ["dispose", "shutdown"]);
  await completed;
});

test("同步 Socket close 回调不会触发关闭计时器初始化竞态", async () => {
  const mockIo = createMockIo();
  const server = createMultiplayerServer({
    io: mockIo.io,
    coordinator: new RoomCoordinator({ store: new MemoryRoomStore() }),
    authenticateToken: async () => null,
  });
  await server.shutdown({ graceMs: 100 });
  assert.equal(server.isDisposed(), true);
  assert.equal(mockIo.closeCalls(), 1);
});

test("disconnect 异步失败会记录房间上下文且不会产生未处理 rejection", async () => {
  let rejectDisconnect!: (cause: unknown) => void;
  let markDisconnectStarted!: () => void;
  const disconnectStarted = new Promise<void>((resolve) => { markDisconnectStarted = resolve; });
  class ThrowingCoordinator extends RoomCoordinator {
    override async activeRoomIds() { return []; }
    override async purgeHistory() { return 0; }
    override async disconnect() {
      markDisconnectStarted();
      return new Promise<void>((_resolve, reject) => { rejectDisconnect = reject; });
    }
  }
  const errors: unknown[][] = [];
  let markLogged!: () => void;
  const logged = new Promise<void>((resolve) => { markLogged = resolve; });
  const mockIo = createMockIo();
  const server = createMultiplayerServer({
    io: mockIo.io,
    coordinator: new ThrowingCoordinator({ store: new MemoryRoomStore() }),
    authenticateToken: async () => null,
    logger: {
      error: (...args: unknown[]) => { errors.push(args); markLogged(); },
      info: () => undefined,
      warn: () => undefined,
    },
  });
  const mockSocket = createMockSocket("socket-1", "user-1", "room-1");
  mockIo.connect(mockSocket.socket);
  let unhandled: unknown = null;
  const onUnhandled = (cause: unknown) => { unhandled = cause; };
  process.on("unhandledRejection", onUnhandled);
  try {
    mockSocket.trigger("disconnect");
    await disconnectStarted;
    rejectDisconnect(new Error("database unavailable"));
    await logged;
    await new Promise<void>((resolve) => setImmediate(resolve));
  } finally {
    process.removeListener("unhandledRejection", onUnhandled);
    await server.shutdown({ graceMs: 100 });
  }

  assert.equal(unhandled, null);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.[0], "[multiplayer] disconnect failed");
  assert.deepEqual(
    Object.fromEntries(Object.entries(errors[0]?.[1] as Record<string, unknown>).filter(([key]) => key !== "cause")),
    { roomId: "room-1", userId: "user-1" },
  );
});

test("关闭期间 disconnect 的预期失败会被安静吸收", async () => {
  let rejectDisconnect!: (cause: unknown) => void;
  let markDisconnectStarted!: () => void;
  const disconnectStarted = new Promise<void>((resolve) => { markDisconnectStarted = resolve; });
  class ClosingCoordinator extends RoomCoordinator {
    override async activeRoomIds() { return []; }
    override async purgeHistory() { return 0; }
    override async disconnect() {
      markDisconnectStarted();
      return new Promise<void>((_resolve, reject) => { rejectDisconnect = reject; });
    }
  }
  const errors: unknown[][] = [];
  const mockIo = createMockIo();
  const server = createMultiplayerServer({
    io: mockIo.io,
    coordinator: new ClosingCoordinator({ store: new MemoryRoomStore() }),
    authenticateToken: async () => null,
    logger: {
      error: (...args: unknown[]) => { errors.push(args); },
      info: () => undefined,
      warn: () => undefined,
    },
  });
  const mockSocket = createMockSocket("socket-2", "user-2", "room-2");
  mockIo.connect(mockSocket.socket);
  let unhandled: unknown = null;
  const onUnhandled = (cause: unknown) => { unhandled = cause; };
  process.on("unhandledRejection", onUnhandled);
  try {
    mockSocket.trigger("disconnect");
    await disconnectStarted;
    server.dispose();
    rejectDisconnect(new Error("transport closed"));
    await new Promise<void>((resolve) => setImmediate(resolve));
  } finally {
    process.removeListener("unhandledRejection", onUnhandled);
    await server.shutdown({ graceMs: 100 });
  }
  assert.equal(unhandled, null);
  assert.deepEqual(errors, []);
});

function createMockIo() {
  let connectionHandler: ((socket: unknown) => void) | null = null;
  let closeCount = 0;
  const io = {
    use: () => undefined,
    on: (event: string, handler: (socket: unknown) => void) => {
      if (event === "connection") connectionHandler = handler;
    },
    in: () => ({ fetchSockets: async () => [] }),
    close: (callback: () => void) => {
      closeCount += 1;
      callback();
    },
    disconnectSockets: () => undefined,
  };
  return {
    io,
    connect: (socket: unknown) => {
      assert.ok(connectionHandler);
      connectionHandler(socket);
    },
    closeCalls: () => closeCount,
  };
}

function createMockSocket(id: string, userId: string, roomId: string) {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  let isDisconnected = false;
  const socket = {
    id,
    data: { userId, roomId },
    on: (event: string, handler: (...args: unknown[]) => void) => { handlers.set(event, handler); },
    emit: () => undefined,
    disconnect: () => { isDisconnected = true; },
    join: async () => undefined,
    leave: async () => undefined,
  };
  return {
    socket,
    trigger: (event: string, ...args: unknown[]) => {
      const handler = handlers.get(event);
      assert.ok(handler);
      handler(...args);
    },
    disconnected: () => isDisconnected,
  };
}

test("最后真人离房会取消该房正在执行的AI请求，其他服务不受牵连", async () => {
  let markStarted!: () => void, markAborted!: () => void;
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const aborted = new Promise<void>(resolve => { markAborted = resolve; });
  const coordinator = new RoomCoordinator({ store: new MemoryRoomStore(), aiService: {
    isAvailable: () => true,
    async resolveAiTurns(state, _difficulty, signal) {
      markStarted();
      await new Promise<void>(resolve => { signal?.addEventListener("abort", () => { markAborted(); resolve(); }, { once: true }); });
      return state;
    },
  }});
  const created = await coordinator.create("last-human", { displayName: "最后真人", playerCount: 8, difficulty: "normal", locale: "zh" }); assert.ok(created.ok);
  const ready = await coordinator.ready("last-human", created.view.room.id, true, 0); assert.ok(ready.ok);
  const game = await coordinator.start("last-human", created.view.room.id, ready.view.room.version); assert.ok(game.ok);
  const mock = createMockIo();
  const server = createMultiplayerServer({ io: mock.io, coordinator, authenticateToken: async () => null });
  try {
    await server.recovery; await started;
    const socket = createMockSocket("last-socket", "last-human", game.view.room.id); mock.connect(socket.socket);
    const ack = await new Promise<unknown>(resolve => socket.trigger("room:leave", { roomId: game.view.room.id, expectedVersion: game.view.room.version }, resolve));
    assert.ok((ack as { ok: boolean }).ok);
    await aborted;
    assert.equal((await coordinator.viewFor(game.view.room.id, "last-human"))?.room.status, "closed");
    assert.equal(server.isDisposed(), false, "只取消房间任务，不关闭整个服务");
  } finally { await server.shutdown({ graceMs: 100 }); }
});

test("自动失败重试有持久上限，日志保留房间和安全错误码", async () => {
  const retryBefore = process.env.GAME_SERVER_AI_RETRY_MS;
  process.env.GAME_SERVER_AI_RETRY_MS = "5";
  let calls = 0;
  const logs: unknown[][] = [];
  const coordinator = new RoomCoordinator({ store: new MemoryRoomStore(), aiService: {
    isAvailable: () => true,
    async resolveAiTurns() { calls++; throw new Error("AI_RETRY_EXHAUSTED", { cause: new Error("AI_HTTP_503") }); },
  }});
  const created = await coordinator.create("human", { displayName: "真人", playerCount: 8, difficulty: "normal", locale: "zh" }); assert.ok(created.ok);
  const ready = await coordinator.ready("human", created.view.room.id, true, 0); assert.ok(ready.ok);
  const game = await coordinator.start("human", created.view.room.id, ready.view.room.version); assert.ok(game.ok);
  const server = createMultiplayerServer({ io: createMockIo().io, coordinator, authenticateToken: async () => null, logger: { info: () => {}, error: (...args) => logs.push(args), warn: (...args) => logs.push(args) } });
  try {
    await server.recovery;
    for (let i = 0; i < 100 && calls < 3; i++) await new Promise(resolve => setTimeout(resolve, 5));
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(calls, 3);
    assert.equal((await coordinator.viewFor(game.view.room.id, "human"))?.publicState.aiProgress?.status, "paused");
    assert.equal(logs.length, 3);
    const last = logs.at(-1)?.[1] as { roomId: string; causeCode: string; retryScheduled: boolean };
    assert.equal(last.roomId, game.view.room.id); assert.equal(last.causeCode, "AI_HTTP_503"); assert.equal(last.retryScheduled, false);
  } finally { await server.shutdown({ graceMs: 100 }); if (retryBefore === undefined) delete process.env.GAME_SERVER_AI_RETRY_MS; else process.env.GAME_SERVER_AI_RETRY_MS = retryBefore; }
});

test("失败checkpoint无法写入时停止本房请求，不因重新连接再次调用模型", async () => {
  const previous = process.env.GAME_SERVER_AI_RETRY_MS; process.env.GAME_SERVER_AI_RETRY_MS = "5";
  class BrokenCheckpointStore extends MemoryRoomStore {
    override async transitionRoom(...args: [...Parameters<MemoryRoomStore["transitionRoom"]>, event?: { type: string }]) {
      if (args[3]?.type === "ai_progress_failed") throw Error("storage unavailable");
      return super.transitionRoom(args[0], args[1], args[2]);
    }
  }
  let calls = 0;
  const c = new RoomCoordinator({ store: new BrokenCheckpointStore(), aiService: { isAvailable: () => true, async resolveAiTurns() { calls++; throw Error("AI_HTTP_503"); } } });
  const created = await c.create("human", { displayName: "真人", playerCount: 8, difficulty: "normal", locale: "zh" }); assert.ok(created.ok);
  const ready = await c.ready("human", created.view.room.id, true, 0); assert.ok(ready.ok);
  const game = await c.start("human", created.view.room.id, ready.view.room.version); assert.ok(game.ok);
  const mock = createMockIo(), logs: unknown[][] = [];
  const server = createMultiplayerServer({ io: mock.io, coordinator: c, authenticateToken: async () => null, logger: { info: () => {}, warn: (...a) => logs.push(a), error: (...a) => logs.push(a) } });
  try {
    await server.recovery;
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(calls, 1);
    const s = createMockSocket("reconnect", "human", game.view.room.id); mock.connect(s.socket);
    await new Promise(resolve => s.trigger("room:resume", { roomIdOrCode: game.view.room.id }, resolve));
    await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(calls, 1);
    assert.equal((logs[0]?.[1] as { code: string }).code, "AI_FAILURE_CHECKPOINT_FAILED");
  } finally { await server.shutdown({ graceMs: 100 }); if (previous === undefined) delete process.env.GAME_SERVER_AI_RETRY_MS; else process.env.GAME_SERVER_AI_RETRY_MS = previous; }
});
