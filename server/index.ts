/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import type { MultiplayerSocketData } from "@/types/multiplayer";
import { MemoryRoomStore, SupabaseRoomStore } from "./room-store";
import { RoomCoordinator } from "./room-coordinator";
import { MultiplayerAiUnavailableError, ServerMultiplayerAiService } from "./ai-service";

type SocketLike = any;
type IoLike = any;
type AuthenticatedUser = { id: string };
type AuthenticateToken = (token: string) => Promise<AuthenticatedUser | null>;
type ServerLogger = Pick<Console, "error" | "info" | "warn">;

type SignalTarget = {
  once(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  removeListener(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
};

export function createMultiplayerServer(options: {
  coordinator?: RoomCoordinator;
  io?: IoLike;
  authenticateToken?: AuthenticateToken;
  logger?: ServerLogger;
} = {}) {
  const httpServer = createServer((request, response) => {
    if (request.url === "/health") { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ ok: true, service: "wolfcha-game-server" })); return; }
    response.writeHead(404); response.end("Not Found");
  });
  const SocketServer = options.io ? null : require("socket.io").Server;
  const io: IoLike = options.io ?? new SocketServer(httpServer, { cors: { origin: resolveCorsOrigin(), credentials: true } });
  const coordinator = options.coordinator ?? createDefaultCoordinator();
  const logger = options.logger ?? console;
  const authenticateToken = options.authenticateToken ?? (async (token: string) => {
    const localTestUser = resolveLocalTestUser(token);
    if (localTestUser) return localTestUser;
    const { authenticateAccessToken } = require("@/lib/access-token-auth") as typeof import("@/lib/access-token-auth");
    return authenticateAccessToken(token);
  });

  io.use(async (socket: SocketLike, next: (error?: Error) => void) => {
    try {
      const token = String(socket.handshake?.auth?.token ?? "").trim();
      if (!token) return next(new Error("AUTH_REQUIRED"));
      const user = await authenticateToken(token);
      if (!user) return next(new Error("AUTH_REQUIRED"));
      socket.data = { userId: user.id, accessToken: token } satisfies MultiplayerSocketData;
      return next();
    } catch { return next(new Error("AUTH_REQUIRED")); }
  });

  const roomChannel = (roomId: string) => `room:${roomId}`;
  const enterLocks = new Map<string, Promise<void>>();
  const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const roomScheduleGenerations = new Map<string, number>();
  const aiRuns = new Map<string, Promise<void>>();
  const aiAbortControllers = new Map<string, AbortController>();
  const aiRequested = new Set<string>();
  const aiRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const roomEntryLimiter = createFixedWindowRateLimiter(12, 60_000, 4_096);
  const aiRetryMs = positiveInteger(process.env.GAME_SERVER_AI_RETRY_MS, 5_000);
  const historyRetentionDays = positiveInteger(process.env.GAME_SERVER_HISTORY_RETENTION_DAYS, 30);
  const historySweepMs = positiveInteger(process.env.GAME_SERVER_HISTORY_SWEEP_MS, 24 * 60 * 60 * 1_000);
  let historySweepTimer: ReturnType<typeof setInterval> | null = null;
  let historySweepRunning = false;
  let disposed = false;
  let shutdownPromise: Promise<void> | null = null;
  const dispose = () => {
    if (disposed) return false;
    disposed = true;
    aiAbortControllers.forEach((controller) => controller.abort());
    roomTimers.forEach(clearTimeout);
    aiRetryTimers.forEach(clearTimeout);
    if (historySweepTimer) clearInterval(historySweepTimer);
    roomTimers.clear();
    roomScheduleGenerations.clear();
    aiRetryTimers.clear();
    aiAbortControllers.clear();
    aiRuns.clear();
    aiRequested.clear();
    enterLocks.clear();
    historySweepTimer = null;
    return true;
  };
  const shutdown = (shutdownOptions: { graceMs?: number } = {}) => {
    dispose();
    if (shutdownPromise) return shutdownPromise;
    const graceMs = positiveInteger(String(shutdownOptions.graceMs ?? ""), 10_000);
    shutdownPromise = new Promise<void>((resolve) => {
      let finished = false;
      let graceTimer: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (graceTimer) clearTimeout(graceTimer);
        resolve();
      };
      const closeHttp = () => {
        if (!httpServer.listening) return finish();
        try {
          httpServer.close(() => finish());
        } catch {
          finish();
        }
      };
      graceTimer = setTimeout(() => {
        try { io.disconnectSockets?.(true); } catch { /* best effort */ }
        try { httpServer.closeAllConnections?.(); } catch { /* best effort */ }
        closeHttp();
        finish();
      }, graceMs);
      try {
        io.close(() => closeHttp());
      } catch {
        closeHttp();
      }
    });
    return shutdownPromise;
  };
  let enqueueAiProgress: (roomId: string) => void = () => undefined;
  const scheduleRoom = async (roomId: string) => {
    if (disposed) return;
    const generation = (roomScheduleGenerations.get(roomId) ?? 0) + 1;
    roomScheduleGenerations.set(roomId, generation);
    const previous = roomTimers.get(roomId);
    if (previous) clearTimeout(previous);
    roomTimers.delete(roomId);
    let deadline: Awaited<ReturnType<RoomCoordinator["deadlineFor"]>>;
    try {
      deadline = await coordinator.deadlineFor(roomId);
    } catch (cause) {
      if (disposed || roomScheduleGenerations.get(roomId) !== generation) return;
      logger.warn("[multiplayer] deadline lookup failed", cause);
      const retry = setTimeout(() => void scheduleRoom(roomId), 5_000);
      retry.unref?.();
      roomTimers.set(roomId, retry);
      return;
    }
    if (disposed || roomScheduleGenerations.get(roomId) !== generation) return;
    if (!deadline) {
      roomScheduleGenerations.delete(roomId);
      return;
    }
    const run = async () => {
      if (disposed || roomScheduleGenerations.get(roomId) !== generation) return;
      try {
        const advanced = await coordinator.expireTurn(roomId, deadline.version, deadline.turnKey);
        if (disposed) return;
        if (advanced) {
          await broadcast(roomId);
          enqueueAiProgress(roomId);
        }
        else if (roomScheduleGenerations.get(roomId) === generation) {
          await scheduleRoom(roomId);
        }
      } catch (cause) {
        if (disposed || roomScheduleGenerations.get(roomId) !== generation) return;
        logger.warn("[multiplayer] scheduled turn failed", cause);
        const retry = setTimeout(() => void scheduleRoom(roomId), 5_000);
        retry.unref?.();
        roomTimers.set(roomId, retry);
      }
    };
    const timer = setTimeout(() => void run(), Math.max(0, Date.parse(deadline.deadlineAt) - Date.now()));
    timer.unref?.();
    roomTimers.set(roomId, timer);
  };
  const broadcast = async (roomId: string) => {
    if (disposed) return;
    const sockets = await io.in(roomChannel(roomId)).fetchSockets();
    if (disposed) return;
    const views = await coordinator.viewsFor(roomId, sockets.map((socket: SocketLike) => socket.data.userId as string));
    if (disposed) return;
    for (const socket of sockets) {
      const view = views.get(socket.data.userId as string);
      if (view) socket.emit("room:view", view);
    }
    await scheduleRoom(roomId);
  };
  const scheduleAiRetry = (roomId: string) => {
    if (disposed) return;
    if (aiRetryTimers.has(roomId)) return;
    const timer = setTimeout(() => {
      aiRetryTimers.delete(roomId);
      enqueueAiProgress(roomId);
    }, aiRetryMs);
    timer.unref?.();
    aiRetryTimers.set(roomId, timer);
  };
  const drainAiProgress = (roomId: string) => {
    if (disposed) return;
    if (aiRuns.has(roomId) || aiRetryTimers.has(roomId)) return;
    aiRequested.delete(roomId);
    const abortController = new AbortController();
    aiAbortControllers.set(roomId, abortController);
    const run = (async () => {
      try {
        const changed = await coordinator.progressAi(roomId, abortController.signal);
        if (!disposed && !abortController.signal.aborted && changed) {
          await broadcast(roomId);
          // 一次模型事务通常已推进到真人输入；再次检查可覆盖并发提交的新状态。
          aiRequested.add(roomId);
        }
      } catch (cause) {
        if (disposed || abortController.signal.aborted) return;
        const reason = cause instanceof MultiplayerAiUnavailableError ? cause.message : cause;
        logger.warn("[multiplayer] background AI progress failed; retry scheduled", reason);
        scheduleAiRetry(roomId);
      }
    })();
    aiRuns.set(roomId, run);
    void run.finally(() => {
      if (aiAbortControllers.get(roomId) === abortController) aiAbortControllers.delete(roomId);
      if (aiRuns.get(roomId) === run) aiRuns.delete(roomId);
      if (!disposed && aiRequested.has(roomId) && !aiRetryTimers.has(roomId)) queueMicrotask(() => drainAiProgress(roomId));
    });
  };
  enqueueAiProgress = (roomId: string) => {
    if (disposed) return;
    aiRequested.add(roomId);
    queueMicrotask(() => drainAiProgress(roomId));
  };
  const recovery = coordinator.activeRoomIds()
    .then(async (roomIds) => {
      for (const roomId of roomIds) {
        await scheduleRoom(roomId);
        enqueueAiProgress(roomId);
      }
    })
    .catch((cause) => {
      logger.error("[multiplayer] active room recovery failed", cause);
      throw cause;
    });
  const sweepHistory = async () => {
    if (disposed || historySweepRunning) return;
    historySweepRunning = true;
    try {
      const deleted = await coordinator.purgeHistory(historyRetentionDays);
      if (deleted > 0) logger.info(`[multiplayer] purged ${deleted} expired rooms`);
    } catch (cause) {
      logger.warn("[multiplayer] history sweep failed", cause);
    } finally {
      historySweepRunning = false;
    }
  };
  void recovery
    .then(() => {
      if (disposed) return;
      void sweepHistory();
      historySweepTimer = setInterval(() => void sweepHistory(), historySweepMs);
      historySweepTimer.unref?.();
    })
    .catch(() => undefined);
  httpServer.once("close", dispose);
  const enterRoom = (socket: SocketLike, roomId: string) => {
    const previous = enterLocks.get(socket.id) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(async () => {
      const previousRoomId = socket.data.roomId as string | undefined;
      if (previousRoomId && previousRoomId !== roomId) {
        await socket.leave(roomChannel(previousRoomId));
        const previousSockets = await io.in(roomChannel(previousRoomId)).fetchSockets();
        const sameUserOnline = previousSockets.some((item: SocketLike) => item.data.userId === socket.data.userId);
        await coordinator.disconnect(socket.data.userId as string, previousRoomId, sameUserOnline);
        if (!sameUserOnline) await broadcast(previousRoomId);
      }
      await socket.join(roomChannel(roomId));
      socket.data.roomId = roomId;
    });
    enterLocks.set(socket.id, current);
    const cleanup = () => { if (enterLocks.get(socket.id) === current) enterLocks.delete(socket.id); };
    void current.then(cleanup, cleanup);
    return current;
  };
  const fail = (socket: SocketLike, callback: ((result: unknown) => void) | undefined, result: unknown) => { if (callback) callback(result); else socket.emit("room:error", (result as any).error); };
  const entryRateLimited = { ok: false, error: { code: "ROOM_CONFLICT", message: "进入房间操作过于频繁，请稍后再试" } };
  const serviceStopping = { ok: false, error: { code: "INTERNAL_ERROR", message: "多人服务正在关闭，请稍后重试" } };
  const acceptTask = (socket: SocketLike, callback: ((result: unknown) => void) | undefined) => {
    if (!disposed) return true;
    fail(socket, callback, serviceStopping);
    return false;
  };

  io.on("connection", (socket: SocketLike) => {
    if (disposed) {
      socket.disconnect?.(true);
      return;
    }
    const userId = () => socket.data.userId as string;
    socket.on("room:create", async (input: any, callback: any) => { if (!acceptTask(socket, callback)) return; if (!roomEntryLimiter.allow(userId())) return fail(socket, callback, entryRateLimited); try { const result = await coordinator.create(userId(), input); if (result.ok) { await enterRoom(socket, result.view.room.id); await broadcast(result.view.room.id); } fail(socket, callback, result); } catch { fail(socket, callback, { ok: false, error: { code: "INTERNAL_ERROR", message: "创建房间失败" } }); } });
    socket.on("room:join", async (input: any, callback: any) => { if (!acceptTask(socket, callback)) return; if (!roomEntryLimiter.allow(userId())) return fail(socket, callback, entryRateLimited); try { const result = await coordinator.join(userId(), input); if (result.ok) { await enterRoom(socket, result.view.room.id); await broadcast(result.view.room.id); if (result.view.room.status === "in_game") enqueueAiProgress(result.view.room.id); } fail(socket, callback, result); } catch { fail(socket, callback, { ok: false, error: { code: "INTERNAL_ERROR", message: "加入房间失败" } }); } });
    socket.on("room:resume", async (input: any, callback: any) => { if (!acceptTask(socket, callback)) return; if (!roomEntryLimiter.allow(userId())) return fail(socket, callback, entryRateLimited); try { const result = await coordinator.resume(userId(), input?.roomIdOrCode); if (result.ok) { await enterRoom(socket, result.view.room.id); await broadcast(result.view.room.id); if (result.view.room.status === "in_game") enqueueAiProgress(result.view.room.id); } fail(socket, callback, result); } catch { fail(socket, callback, { ok: false, error: { code: "INTERNAL_ERROR", message: "恢复房间失败" } }); } });
    socket.on("room:ready", async (input: any, callback: any) => { if (!acceptTask(socket, callback)) return; try { const result = await coordinator.ready(userId(), String(input?.roomId ?? ""), Boolean(input?.isReady), Number(input?.expectedVersion)); if (result.ok) await broadcast(result.view.room.id); fail(socket, callback, result); } catch { fail(socket, callback, { ok: false, error: { code: "INTERNAL_ERROR", message: "准备状态更新失败" } }); } });
    socket.on("room:start", async (input: any, callback: any) => { if (!acceptTask(socket, callback)) return; try { const result = await coordinator.start(userId(), String(input?.roomId ?? ""), Number(input?.expectedVersion), typeof input?.gameSessionId === "string" ? input.gameSessionId : null); if (result.ok) { await broadcast(result.view.room.id); enqueueAiProgress(result.view.room.id); } fail(socket, callback, result); } catch { fail(socket, callback, { ok: false, error: { code: "INTERNAL_ERROR", message: "开始游戏失败" } }); } });
    socket.on("room:leave", async (input: any, callback: any) => { if (!acceptTask(socket, callback)) return; try { const roomId = String(input?.roomId ?? ""); const result = await coordinator.leave(userId(), roomId, Number(input?.expectedVersion)); if (result.ok) { await socket.leave(roomChannel(roomId)); socket.data.roomId = undefined; await broadcast(roomId); if (result.view.room.status === "in_game") enqueueAiProgress(roomId); } fail(socket, callback, result); } catch { fail(socket, callback, { ok: false, error: { code: "INTERNAL_ERROR", message: "退出房间失败" } }); } });
    socket.on("room:close", async (input: any, callback: any) => { if (!acceptTask(socket, callback)) return; try { const result = await coordinator.close(userId(), String(input?.roomId ?? ""), Number(input?.expectedVersion)); if (result.ok) await broadcast(result.view.room.id); fail(socket, callback, result); } catch { fail(socket, callback, { ok: false, error: { code: "INTERNAL_ERROR", message: "关闭房间失败" } }); } });
    socket.on("game:command", async (input: any, callback: any) => { if (!acceptTask(socket, callback)) return; try { const result = await coordinator.command(userId(), input); if (result.ok) { await broadcast(result.view.room.id); enqueueAiProgress(result.view.room.id); } fail(socket, callback, result); } catch { fail(socket, callback, { ok: false, error: { code: "INTERNAL_ERROR", message: "游戏动作提交失败" } }); } });
    socket.on("disconnect", () => {
      const roomId = socket.data.roomId as string | undefined;
      if (!roomId || disposed) return;
      const disconnectedUserId = userId();
      void (async () => {
        const sockets = await io.in(roomChannel(roomId)).fetchSockets();
        if (disposed) return;
        const sameUserOnline = sockets.some((item: SocketLike) => item.id !== socket.id && item.data.userId === disconnectedUserId);
        await coordinator.disconnect(disconnectedUserId, roomId, sameUserOnline);
        if (!sameUserOnline) await broadcast(roomId);
      })().catch((cause) => {
        if (disposed) return;
        logger.error("[multiplayer] disconnect failed", { roomId, userId: disconnectedUserId, cause });
      });
    });
  });
  return { httpServer, io, coordinator, recovery, dispose, shutdown, isDisposed: () => disposed };
}

export function installShutdownSignalHandlers(
  server: Pick<ReturnType<typeof createMultiplayerServer>, "dispose" | "shutdown">,
  options: {
    signalTarget?: SignalTarget;
    graceMs?: number;
    logger?: ServerLogger;
    onComplete?: (signal: "SIGINT" | "SIGTERM") => void;
  } = {},
) {
  const signalTarget = options.signalTarget ?? process;
  const logger = options.logger ?? console;
  let handling = false;
  function onSigterm() { handle("SIGTERM"); }
  function onSigint() { handle("SIGINT"); }
  function uninstall() {
    signalTarget.removeListener("SIGTERM", onSigterm);
    signalTarget.removeListener("SIGINT", onSigint);
  }
  const handle = (signal: "SIGINT" | "SIGTERM") => {
    if (handling) return;
    handling = true;
    uninstall();
    server.dispose();
    void server.shutdown({ graceMs: options.graceMs }).then(
      () => options.onComplete?.(signal),
      (cause) => {
        logger.error(`[multiplayer] ${signal} shutdown failed`, cause);
        process.exitCode = 1;
      },
    );
  };
  signalTarget.once("SIGTERM", onSigterm);
  signalTarget.once("SIGINT", onSigint);
  return uninstall;
}

/** 生产环境使用显式白名单；开发环境同时允许本机的 localhost、回环和局域网地址。 */
export function resolveCorsOrigin(
  value = process.env.GAME_SERVER_CORS_ORIGIN,
  nodeEnv = process.env.NODE_ENV,
  localAddresses = Object.values(networkInterfaces())
    .flat()
    .filter((address) => address?.family === "IPv4" && !address.internal)
    .map((address) => address!.address),
): string | string[] {
  const configured = value?.trim();
  const origins = configured
    ? configured.split(",").map((origin) => origin.trim()).filter(Boolean)
    : nodeEnv === "production"
      ? ["http://localhost:3000"]
      : [
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          ...localAddresses.map((address) => `http://${address}:3000`),
        ];
  const uniqueOrigins = [...new Set(origins)];
  return uniqueOrigins.length === 1 ? uniqueOrigins[0] : uniqueOrigins;
}

export function resolveRoomStore(
  value = process.env.GAME_SERVER_STORE,
  nodeEnv = process.env.NODE_ENV,
) {
  if (value === "memory") {
    if (nodeEnv === "production") throw new Error("生产环境禁止使用内存房间存储");
    return new MemoryRoomStore();
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseRoomStore();
  }
  if (nodeEnv === "production") throw new Error("生产环境缺少 Supabase 多人存储配置");
  return new MemoryRoomStore();
}

function createDefaultCoordinator(): RoomCoordinator {
  const store = resolveRoomStore();
  const requiresCredit =
    process.env.NODE_ENV === "production" ||
    store instanceof SupabaseRoomStore ||
    process.env.GAME_SERVER_REQUIRE_CREDIT === "true";
  return new RoomCoordinator({
    store,
    aiService: new ServerMultiplayerAiService(),
    actionTimeoutMs: positiveInteger(process.env.GAME_SERVER_ACTION_TIMEOUT_MS, 90_000),
    speechTimeoutMs: positiveInteger(process.env.GAME_SERVER_SPEECH_TIMEOUT_MS, 120_000),
    authorizeGameSession: requiresCredit
      ? async (userId, sessionId, roomId) => {
          const { claimAuthorizedGameSession } = await import("@/lib/api-auth");
          return claimAuthorizedGameSession(userId, sessionId, roomId);
        }
      : undefined,
    completeGameSession: requiresCredit
      ? async (sessionId, winner, day) => {
          const { supabaseAdmin } = await import("@/lib/supabase-admin");
          const { error } = await supabaseAdmin
            .from("game_sessions")
            .update({
              completed: true,
              winner: winner === "village" ? "villager" : "wolf",
              rounds_played: day,
              ended_at: new Date().toISOString(),
              last_activity_at: new Date().toISOString(),
            } as never)
            .eq("id", sessionId)
            .eq("completed", false);
          if (error) throw error;
        }
      : undefined,
    releaseGameSession: requiresCredit
      ? async (userId, sessionId, roomId) => {
          const { releaseAuthorizedGameSessionClaim } = await import("@/lib/api-auth");
          await releaseAuthorizedGameSessionClaim(userId, sessionId, roomId);
        }
      : undefined,
  });
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createFixedWindowRateLimiter(
  limit: number,
  windowMs: number,
  maxEntries: number,
  now: () => number = Date.now,
) {
  const entries = new Map<string, { count: number; resetAt: number }>();
  return {
    allow(key: string): boolean {
      const timestamp = now();
      if (entries.size >= maxEntries) {
        for (const [entryKey, value] of entries) {
          if (value.resetAt <= timestamp) entries.delete(entryKey);
        }
      }
      const current = entries.get(key);
      if (!current || current.resetAt <= timestamp) {
        if (!current && entries.size >= maxEntries) entries.delete(entries.keys().next().value as string);
        entries.set(key, { count: 1, resetAt: timestamp + windowMs });
        return true;
      }
      if (current.count >= limit) return false;
      current.count += 1;
      return true;
    },
    size: () => entries.size,
  };
}

export async function listenAfterRecovery(
  server: Pick<ReturnType<typeof createMultiplayerServer>, "httpServer" | "recovery" | "isDisposed">,
  port: number,
  onListening: () => void,
): Promise<boolean> {
  await server.recovery;
  if (server.isDisposed()) return false;
  server.httpServer.listen(port, onListening);
  return true;
}

export function resolveLocalTestUser(
  token: string,
  enabled = process.env.GAME_SERVER_TEST_AUTH,
  nodeEnv = process.env.NODE_ENV,
): AuthenticatedUser | null {
  if (enabled !== "true" || nodeEnv === "production") return null;
  const match = /^local-test:([a-z0-9][a-z0-9-]{0,47})$/i.exec(token);
  return match ? { id: match[1] } : null;
}

if (require.main === module) {
  const server = createMultiplayerServer();
  installShutdownSignalHandlers(server);
  const port = Number(process.env.GAME_SERVER_PORT ?? 3011);
  void listenAfterRecovery(server, port, () => console.log(`[wolfcha-game-server] listening on :${port}`))
    .catch((cause) => {
      console.error("[wolfcha-game-server] startup recovery failed", cause);
      process.exitCode = 1;
      void server.shutdown();
    });
}
