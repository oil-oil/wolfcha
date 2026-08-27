import assert from "node:assert/strict";
import test from "node:test";
import { MemoryRoomStore, SupabaseRoomStore, type RoomRecord } from "./room-store";

function memoryRoom(): RoomRecord {
  return {
    id: "room-1",
    code: "ABC123",
    hostUserId: "u1",
    status: "lobby",
    phase: "LOBBY",
    day: 1,
    winner: null,
    version: 0,
    settings: { playerCount: 8, difficulty: "normal", locale: "zh" },
    createdAt: "2026-08-02T00:00:00.000Z",
    startedAt: null,
    serverState: null,
  };
}

test("房间码只查询 code 列，不会传给 uuid 主键", async () => {
  const filters: Array<[string, string, unknown]> = [];
  const roomRow = {
    id: "123e4567-e89b-42d3-a456-426614174000",
    code: "ABC123",
    host_user_id: "u1",
    status: "lobby",
    phase: "LOBBY",
    day: 1,
    winner: null,
    version: 0,
    settings: { playerCount: 8, difficulty: "normal", locale: "zh" },
    created_at: "2026-08-02T00:00:00.000Z",
    started_at: null,
    server_state: null,
  };
  const client = {
    from(table: string) {
      const builder = {
        select() { return builder; },
        eq(column: string, value: unknown) { filters.push([table, column, value]); return builder; },
        maybeSingle() { return Promise.resolve({ data: roomRow, error: null }); },
        order() { return Promise.resolve({ data: [], error: null }); },
      };
      return builder;
    },
    rpc() { throw new Error("本测试不应调用 RPC"); },
  };

  const result = await new SupabaseRoomStore(client).getRoom("abc123");

  assert.equal(result?.room.code, "ABC123");
  assert.deepEqual(filters, [
    ["multiplayer_rooms", "code", "ABC123"],
    ["multiplayer_members", "room_id", roomRow.id],
  ]);
});

test("成员写入通过单个原子 RPC，过期版本返回冲突", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    from() { throw new Error("成员写入不应拆分为表操作"); },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: [], error: null };
    },
  };
  const store = new SupabaseRoomStore(client);
  const version = await store.saveMember("room-1", {
    userId: "u1",
    displayName: "玩家",
    role: "player",
    seat: 1,
    isReady: true,
    isConnected: true,
  }, 3, { type: "member_ready", payload: { userId: "u1" }, actorUserId: "u1" });

  assert.equal(version, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "upsert_multiplayer_member");
  assert.equal(calls[0].args.p_expected_version, 3);
});

test("Supabase 超时接管通过单个原子 RPC 写入成员和房间", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    from() { throw new Error("超时接管不应拆分为表操作"); },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: [{ version: 4, duplicate: false }], error: null };
    },
  };
  const store = new SupabaseRoomStore(client);
  const result = await store.applyTimeout("room-1", 3, "timeout:1", ["u1"], { status: "in_game" }, {
    type: "turn_expired", payload: {}, actorUserId: "u2",
  });
  assert.deepEqual(result, { version: 4, duplicate: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "takeover_multiplayer_timeout");
  assert.deepEqual(calls[0].args.p_timed_out_user_ids, ["u1"]);
});

test("Memory 命令成功推进版本并在重复 commandId 时幂等返回", async () => {
  const store = new MemoryRoomStore();
  await store.createRoom(memoryRoom(), {
    userId: "u1", displayName: "玩家", role: "host", seat: 0, isReady: false, isConnected: true,
  });

  const first = await store.applyCommand("room-1", 0, "cmd-1", "u1", { status: "in_game", phase: "DAY_START" }, {
    type: "game_started", payload: {}, actorUserId: "u1",
  });
  assert.deepEqual(first, { version: 1, duplicate: false });

  const duplicate = await store.applyCommand("room-1", 0, "cmd-1", "u1", { status: "finished" }, {
    type: "should_not_apply", payload: {}, actorUserId: "u1",
  });
  assert.deepEqual(duplicate, { version: 1, duplicate: true });
  assert.equal((await store.getRoom("room-1"))?.room.status, "in_game");
  assert.equal((await store.getRoom("room-1"))?.room.version, 1);
});

test("Memory 命令过期 version 无副作用且可用新 commandId 重试", async () => {
  const store = new MemoryRoomStore();
  await store.createRoom(memoryRoom(), {
    userId: "u1", displayName: "玩家", role: "host", seat: 0, isReady: false, isConnected: true,
  });

  const conflict = await store.applyCommand("room-1", 9, "cmd-stale", "u1", { phase: "DAY_START" }, {
    type: "stale", payload: {}, actorUserId: "u1",
  });
  assert.equal(conflict, null);
  assert.equal((await store.getRoom("room-1"))?.room.version, 0);

  const success = await store.applyCommand("room-1", 0, "cmd-fresh", "u1", { phase: "DAY_START" }, {
    type: "fresh", payload: {}, actorUserId: "u1",
  });
  assert.deepEqual(success, { version: 1, duplicate: false });
});

test("Memory 超时事务同时释放座位、转移房主且 timeout command 幂等", async () => {
  const store = new MemoryRoomStore();
  await store.createRoom(memoryRoom(), {
    userId: "u1", displayName: "房主", role: "host", seat: 0, isReady: true, isConnected: true,
  });
  await store.saveMember("room-1", {
    userId: "u2", displayName: "玩家", role: "player", seat: 1, isReady: true, isConnected: true,
  }, 0, { type: "member_joined", payload: {}, actorUserId: "u1" });

  const patch = { status: "in_game" as const, phase: "DAY_START" as const, day: 1, serverState: null };
  const first = await store.applyTimeout("room-1", 1, "timeout:t:1", ["u1"], patch, {
    type: "turn_expired", payload: {}, actorUserId: "u1",
  });
  assert.deepEqual(first, { version: 2, duplicate: false });
  const aggregate = await store.getRoom("room-1");
  assert.equal(aggregate?.room.version, 2);
  assert.equal(aggregate?.room.hostUserId, "u2");
  assert.deepEqual(aggregate?.members.find((member) => member.userId === "u1"), {
    userId: "u1", displayName: "房主", role: "spectator", seat: null, isReady: false, isConnected: false,
  });
  assert.equal(aggregate?.members.find((member) => member.userId === "u2")?.role, "host");

  const duplicate = await store.applyTimeout("room-1", 1, "timeout:t:1", ["u1"], patch, {
    type: "should_not_apply", payload: {}, actorUserId: "u1",
  });
  assert.deepEqual(duplicate, { version: 2, duplicate: true });
  assert.equal((await store.getRoom("room-1"))?.room.version, 2);
});
