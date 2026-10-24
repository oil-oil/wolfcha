import assert from "node:assert/strict";
import test from "node:test";
import { MemoryRoomStore } from "./room-store";
import { RoomCoordinator } from "./room-coordinator";
import { advanceMultiplayerGame } from "@/multiplayer/engine";
import type { MultiplayerAiService } from "./ai-service";

const createRoom = async (coordinator: RoomCoordinator, playerCount = 8) => {
  const created = await coordinator.create("host", { displayName: "房主", playerCount, difficulty: "normal", locale: "zh" });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("room creation failed");
  return created.view;
};

test("大厅退出的成员重入空席后成为未准备玩家，且不会夺回已转移的房主", async () => {
  const store = new MemoryRoomStore();
  const coordinator = new RoomCoordinator({ store });
  const room = await createRoom(coordinator);
  const joined = await coordinator.join("next-host", { code: room.room.code, displayName: "新房主" });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;

  const left = await coordinator.leave("host", room.room.id, joined.view.room.version);
  assert.equal(left.ok, true);
  if (!left.ok) return;
  const beforeRejoin = await store.getRoom(room.room.id);
  assert.equal(beforeRejoin?.room.hostUserId, "next-host");
  assert.equal(beforeRejoin?.members.find((member) => member.userId === "host")?.role, "spectator");

  const rejoined = await coordinator.join("host", { code: room.room.code, displayName: "房主回来" });
  assert.equal(rejoined.ok, true);
  if (!rejoined.ok) return;
  const member = rejoined.view.members.find((item) => item.userId === "host");
  assert.equal(member?.role, "player");
  assert.equal(member?.seat, 0);
  assert.equal(member?.isReady, false);
  assert.equal(member?.isConnected, true);
  const afterRejoin = await store.getRoom(room.room.id);
  assert.equal(afterRejoin?.room.hostUserId, "next-host");
  assert.equal(rejoined.view.privateState.seat, 0);
});

test("大厅 spectator 从邀请链接恢复时也重新入座且不恢复原房主", async () => {
  const store = new MemoryRoomStore();
  const coordinator = new RoomCoordinator({ store });
  const room = await createRoom(coordinator);
  const joined = await coordinator.join("next-host", { code: room.room.code, displayName: "新房主" });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  const left = await coordinator.leave("host", room.room.id, joined.view.room.version);
  assert.equal(left.ok, true);
  if (!left.ok) return;

  const resumed = await coordinator.resume("host", room.room.code);
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  const member = resumed.view.members.find((item) => item.userId === "host");
  const aggregate = await store.getRoom(room.room.id);
  assert.equal(member?.role, "player");
  assert.equal(member?.seat, 0);
  assert.equal(member?.isReady, false);
  assert.equal(resumed.view.privateState.seat, 0);
  assert.equal(aggregate?.room.hostUserId, "next-host");
});

test("大厅并发重复重入通过 CAS 收敛到同一席位", async () => {
  const store = new MemoryRoomStore();
  const first = new RoomCoordinator({ store });
  const second = new RoomCoordinator({ store });
  const room = await createRoom(first);
  const joined = await first.join("returning", { code: room.room.code, displayName: "旧名" });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  const left = await first.leave("returning", room.room.id, joined.view.room.version);
  assert.equal(left.ok, true);
  if (!left.ok) return;

  const results = await Promise.all([
    first.join("returning", { code: room.room.code, displayName: "重入者" }),
    second.join("returning", { code: room.room.code, displayName: "重入者" }),
  ]);
  assert.equal(results.every((result) => result.ok), true);
  assert.equal(results[0].ok && results[1].ok ? results[0].view.room.version : -1, results[0].ok && results[1].ok ? results[1].view.room.version : -2);
  const aggregate = await store.getRoom(room.room.id);
  assert.equal(aggregate?.room.version, left.view.room.version + 1);
  const member = aggregate?.members.find((item) => item.userId === "returning");
  assert.equal(member?.role, "player");
  assert.equal(member?.seat, 1);
  assert.equal(member?.isReady, false);
  assert.equal(aggregate?.members.filter((item) => item.seat === 1 && item.role !== "spectator").length, 1);
});

test("房间满时观战成员重入返回 ROOM_FULL 且成员与房间版本不变", async () => {
  const store = new MemoryRoomStore();
  const coordinator = new RoomCoordinator({ store });
  const room = await createRoom(coordinator);
  let version = room.room.version;
  for (let index = 1; index < 8; index += 1) {
    const joined = await coordinator.join(`player-${index}`, { code: room.room.code, displayName: `玩家${index}` });
    assert.equal(joined.ok, true);
    if (!joined.ok) return;
    version = joined.view.room.version;
  }
  const left = await coordinator.leave("player-1", room.room.id, version);
  assert.equal(left.ok, true);
  if (!left.ok) return;
  const replacement = await coordinator.join("replacement", { code: room.room.code, displayName: "补位玩家" });
  assert.equal(replacement.ok, true);
  if (!replacement.ok) return;
  const before = await store.getRoom(room.room.id);
  const spectatorBefore = before?.members.find((member) => member.userId === "player-1");

  const rejected = await coordinator.resume("player-1", room.room.id);
  assert.equal(rejected.ok, false);
  if (rejected.ok) return;
  assert.equal(rejected.error.code, "ROOM_FULL");
  const after = await store.getRoom(room.room.id);
  assert.equal(after?.room.version, before?.room.version);
  assert.deepEqual(after?.members.find((member) => member.userId === "player-1"), spectatorBefore);

  const rejectedByJoin = await coordinator.join("player-1", { code: room.room.code, displayName: "尝试重入" });
  assert.equal(rejectedByJoin.ok, false);
  if (rejectedByJoin.ok) return;
  assert.equal(rejectedByJoin.error.code, "ROOM_FULL");
  assert.equal((await store.getRoom(room.room.id))?.room.version, before?.room.version);
});

test("已托管玩家在进行中通过房间码重入只恢复 presence，不恢复控制权或改版本/截止时间", async () => {
  let now = new Date("2026-08-23T10:00:00.000Z");
  const store = new MemoryRoomStore();
  const aiService: MultiplayerAiService = {
    async resolveAiTurns(state) {
      return advanceMultiplayerGame(state, { autoAi: true });
    },
  };
  const coordinator = new RoomCoordinator({ store, aiService, now: () => now, actionTimeoutMs: 1_000, speechTimeoutMs: 1_000 });
  const room = await createRoom(coordinator);
  const ready = await coordinator.ready("host", room.room.id, true, room.room.version);
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  const started = await coordinator.start("host", room.room.id, ready.view.room.version);
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal(await coordinator.progressAi(room.room.id), true);
  const deadline = await coordinator.deadlineFor(room.room.id);
  assert.ok(deadline);
  if (!deadline) return;

  now = new Date(Date.parse(deadline.deadlineAt) + 1_000);
  assert.equal(await coordinator.expireTurn(room.room.id, deadline.version, deadline.turnKey), true);
  const before = await store.getRoom(room.room.id);
  assert.equal(before?.members.find((member) => member.userId === "host")?.role, "spectator");
  assert.equal(before?.room.serverState?.players.find((player) => player.displayName === "房主")?.kind, "ai");
  const beforeVersion = before?.room.version;
  const beforeDeadline = before?.room.serverState?.deadlineAt;
  const beforeState = before?.room.serverState;

  const rejoined = await coordinator.join("host", { code: room.room.code, displayName: "房主重连" });
  assert.equal(rejoined.ok, true);
  if (!rejoined.ok) return;
  const member = rejoined.view.members.find((item) => item.userId === "host");
  assert.equal(member?.role, "spectator");
  assert.equal(member?.seat, null);
  assert.equal(member?.isConnected, true);
  assert.equal(rejoined.view.privateState.seat, null);
  assert.equal(rejoined.view.privateState.role, null);

  const resumed = await coordinator.resume("host", room.room.id);
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  assert.equal(resumed.view.members.find((item) => item.userId === "host")?.role, "spectator");
  assert.equal(resumed.view.members.find((item) => item.userId === "host")?.seat, null);
  assert.equal(resumed.view.privateState.seat, null);

  const after = await store.getRoom(room.room.id);
  assert.equal(after?.room.version, beforeVersion);
  assert.equal(after?.room.serverState?.deadlineAt, beforeDeadline);
  assert.deepEqual(after?.room.serverState, beforeState);
  assert.equal(after?.members.find((item) => item.userId === "host")?.role, "spectator");
  assert.equal(after?.members.find((item) => item.userId === "host")?.seat, null);
});
