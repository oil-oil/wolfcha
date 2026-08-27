import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { io as createClient, type Socket } from "socket.io-client";
import type { MultiplayerGameCommand, MultiplayerRoomAck, MultiplayerRoomView } from "@/types/multiplayer";
import { createMultiplayerServer } from "./index";
import { RoomCoordinator } from "./room-coordinator";
import { MemoryRoomStore } from "./room-store";
import { advanceMultiplayerGame } from "@/multiplayer/engine";

const TEST_TIMEOUT_MS = 5_000;

test("双玩家可在纯内存服务中创建、加入、开局、隔离身份并断线恢复", async () => {
  const coordinator = new RoomCoordinator({
    store: new MemoryRoomStore(),
    aiService: { async resolveAiTurns(state) { return advanceMultiplayerGame(state, { autoAi: true }); } },
  });
  const { httpServer, io } = createMultiplayerServer({
    coordinator,
    authenticateToken: async (token) => {
      if (token === "host-token") return { id: "host-user" };
      if (token === "friend-token") return { id: "friend-user" };
      return null;
    },
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const sockets: Socket[] = [];

  try {
    const rejected = createSocket(url, "invalid-token");
    sockets.push(rejected);
    const rejection = await waitForConnectError(rejected);
    assert.equal(rejection.message, "AUTH_REQUIRED");
    rejected.close();

    const host = createSocket(url, "host-token");
    const friend = createSocket(url, "friend-token");
    sockets.push(host, friend);
    await Promise.all([waitForConnect(host), waitForConnect(friend)]);

    const created = await emitAck(host, "room:create", {
      displayName: "房主",
      playerCount: 8,
      difficulty: "normal",
      locale: "zh",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const hostSawJoin = waitForView(host, (view) => view.members.length === 2);
    const joined = await emitAck(friend, "room:join", {
      code: created.view.room.code,
      displayName: "朋友",
    });
    assert.equal(joined.ok, true);
    if (!joined.ok) return;
    await hostSawJoin;

    const hostReady = await emitAck(host, "room:ready", {
      roomId: created.view.room.id,
      isReady: true,
      expectedVersion: joined.view.room.version,
    });
    assert.equal(hostReady.ok, true);
    if (!hostReady.ok) return;

    const friendReady = await emitAck(friend, "room:ready", {
      roomId: created.view.room.id,
      isReady: true,
      expectedVersion: hostReady.view.room.version,
    });
    assert.equal(friendReady.ok, true);
    if (!friendReady.ok) return;

    const friendSawStart = waitForView(friend, (view) => view.room.status === "in_game");
    const started = await emitAck(host, "room:start", {
      roomId: created.view.room.id,
      expectedVersion: friendReady.view.room.version,
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const friendStartedView = await friendSawStart;

    assert.equal(started.view.publicState.players.length, 8);
    assert.equal(started.view.publicState.players.filter((player) => player.kind === "ai").length, 6);
    assert.equal(started.view.publicState.players.every((player) => player.role === null && player.alignment === null), true);
    assert.ok(started.view.privateState.role);
    assert.ok(friendStartedView.privateState.role);

    const aggregate = await coordinator.store.getRoom(created.view.room.id);
    assert.ok(aggregate?.room.serverState);
    const hostServerRole = aggregate?.room.serverState?.players.find((player) => player.userId === "host-user")?.role;
    const friendServerRole = aggregate?.room.serverState?.players.find((player) => player.userId === "friend-user")?.role;
    assert.equal(started.view.privateState.role, hostServerRole);
    assert.equal(friendStartedView.privateState.role, friendServerRole);

    const hostSawOffline = waitForView(host, (view) =>
      view.members.some((member) => member.displayName === "朋友" && !member.isConnected)
    );
    friend.close();
    await hostSawOffline;

    const resumedFriend = createSocket(url, "friend-token");
    sockets.push(resumedFriend);
    await waitForConnect(resumedFriend);
    const resumed = await emitAck(resumedFriend, "room:resume", {
      roomIdOrCode: created.view.room.code,
    });
    assert.equal(resumed.ok, true);
    if (!resumed.ok) return;
    assert.equal(resumed.view.privateState.seat, friendStartedView.privateState.seat);
    assert.equal(resumed.view.privateState.role, friendStartedView.privateState.role);
    assert.equal(
      resumed.view.members.find((member) => member.userId === "friend-user")?.isConnected,
      true,
    );

    const finished = await driveGameToEnd(
      coordinator,
      created.view.room.id,
      new Map([
        ["host-user", host],
        ["friend-user", resumedFriend],
      ]),
    );
    assert.equal(finished.room.status, "finished");
    assert.equal(finished.publicState.phase, "GAME_END");
    assert.ok(finished.room.winner);
    assert.equal(finished.publicState.players.every((player) => player.role !== null), true);
  } finally {
    sockets.forEach((socket) => socket.close());
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
});

test("服务重启后无需客户端连接也会恢复已过期房间", async () => {
  const store = new MemoryRoomStore();
  const initial = new RoomCoordinator({ store, aiService: { async resolveAiTurns(state) { return advanceMultiplayerGame(state, { autoAi: true }); } } });
  const created = await initial.create("restart-host", { displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const ready = await initial.ready("restart-host", created.view.room.id, true, created.view.room.version);
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  const started = await initial.start("restart-host", created.view.room.id, ready.view.room.version);
  assert.equal(started.ok, true);
  if (!started.ok) return;

  const aggregate = await store.getRoom(created.view.room.id);
  assert.ok(aggregate?.room.serverState);
  if (!aggregate?.room.serverState) return;
  const expiredState = structuredClone(aggregate.room.serverState);
  expiredState.phase = "DAY_BADGE_SIGNUP";
  expiredState.badge!.signup = {};
  expiredState.submittedSeats = {};
  expiredState.turnKey = "1:DAY_BADGE_SIGNUP:all";
  expiredState.deadlineAt = new Date(Date.now() - 1_000).toISOString();
  expiredState.version = aggregate.room.version + 1;
  const persistedVersion = await store.transitionRoom(created.view.room.id, aggregate.room.version, {
    phase: expiredState.phase,
    serverState: expiredState,
  });
  assert.ok(persistedVersion);

  const recoveredCoordinator = new RoomCoordinator({ store, aiService: { async resolveAiTurns(state) { return advanceMultiplayerGame(state, { autoAi: true }); } } });
  const server = createMultiplayerServer({ coordinator: recoveredCoordinator, authenticateToken: async () => null });
  try {
    await server.recovery;
    await waitUntil(async () => {
      const current = await store.getRoom(created.view.room.id);
      return current?.members.find((member) => member.userId === "restart-host")?.role === "spectator";
    });
    const recovered = await store.getRoom(created.view.room.id);
    assert.equal(recovered?.members.find((member) => member.userId === "restart-host")?.role, "spectator");
    assert.equal(recovered?.room.serverState?.players.find((player) => player.displayName === "房主")?.kind, "ai");
    assert.ok((recovered?.room.version ?? 0) > (persistedVersion ?? 0));
  } finally {
    await new Promise<void>((resolve) => server.io.close(() => resolve()));
  }
});

async function waitUntil(predicate: () => Promise<boolean>, timeoutMs = TEST_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("等待条件超时");
}

function createSocket(url: string, token: string): Socket {
  return createClient(url, {
    auth: { token },
    autoConnect: true,
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
  });
}

async function driveGameToEnd(
  coordinator: RoomCoordinator,
  roomId: string,
  sockets: Map<string, Socket>,
): Promise<MultiplayerRoomView> {
  for (let turn = 0; turn < 800; turn += 1) {
    const aggregate = await coordinator.store.getRoom(roomId);
    assert.ok(aggregate?.room.serverState);
    if (aggregate.room.status === "finished") {
      const finished = await coordinator.viewFor(roomId, "host-user");
      assert.ok(finished);
      return finished;
    }
    const views = await coordinator.viewsFor(roomId, [...sockets.keys()]);
    const actorEntry = [...views.entries()].find(([, view]) => view.privateState.allowedActions.length > 0);
    assert.ok(actorEntry, `阶段 ${aggregate.room.phase} 没有可执行动作`);
    const [actorUserId, view] = actorEntry;
    const socket = sockets.get(actorUserId);
    assert.ok(socket);
    const actor = aggregate.room.serverState.players.find((player) => player.userId === actorUserId)!;
    const targets = view.privateState.eligibleTargets;
    const target =
      targets.find((seat) => {
        const candidate = aggregate.room.serverState?.players.find((player) => player.seat === seat);
        return actor.alignment === "wolf"
          ? candidate?.alignment === "village"
          : candidate?.alignment === "wolf";
      }) ?? targets[0] ?? null;
    const command = buildSocketCommand(view, actor.seat, target, turn);
    const ack = await emitAck(socket, "game:command", command);
    assert.equal(ack.ok, true);
  }
  throw new Error("整局游戏未在限定步数内结束");
}

function buildSocketCommand(
  view: MultiplayerRoomView,
  actorSeat: number,
  targetSeat: number | null,
  turn: number,
): MultiplayerGameCommand {
  const base = {
    commandId: `socket-full-${turn}`,
    roomId: view.room.id,
    expectedVersion: view.room.version,
  };
  const actions = view.privateState.allowedActions;
  const type = actions.includes("speech") ? "speech" : actions[0];
  switch (type) {
    case "guard": return { ...base, type, targetSeat };
    case "wolf": return { ...base, type, targetSeat };
    case "witch": return { ...base, type, save: false, poisonTargetSeat: null };
    case "seer": return { ...base, type, targetSeat: targetSeat as number };
    case "badge_signup": return { ...base, type, signup: actorSeat % 2 === 0 };
    case "speech": return { ...base, type, content: "这是一次通过 Socket 提交的完整回合发言。" };
    case "badge_vote": return { ...base, type, targetSeat: targetSeat as number };
    case "day_vote": return { ...base, type, targetSeat };
    case "hunter_shot": return { ...base, type, targetSeat };
    case "badge_transfer": return targetSeat === null
      ? { ...base, type, targetSeat: null, destroy: true }
      : { ...base, type, targetSeat };
    case "white_wolf_boom": return { ...base, type, targetSeat };
  }
}

function waitForConnect(socket: Socket): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return withTimeout(new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  }), "Socket 连接超时");
}

function waitForConnectError(socket: Socket): Promise<Error> {
  return withTimeout(new Promise<Error>((resolve) => {
    socket.once("connect_error", resolve);
  }), "未收到鉴权失败");
}

function waitForView(socket: Socket, predicate: (view: MultiplayerRoomView) => boolean): Promise<MultiplayerRoomView> {
  return withTimeout(new Promise<MultiplayerRoomView>((resolve) => {
    const listener = (view: MultiplayerRoomView) => {
      if (!predicate(view)) return;
      socket.off("room:view", listener);
      resolve(view);
    };
    socket.on("room:view", listener);
  }), "未收到预期房间状态");
}

function emitAck(socket: Socket, event: string, input: unknown): Promise<MultiplayerRoomAck> {
  return withTimeout(new Promise<MultiplayerRoomAck>((resolve) => {
    socket.emit(event, input, resolve);
  }), `${event} 响应超时`);
}

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), TEST_TIMEOUT_MS);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
