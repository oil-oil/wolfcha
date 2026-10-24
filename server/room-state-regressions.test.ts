import assert from "node:assert/strict";
import test from "node:test";
import { advanceMultiplayerGame } from "@/multiplayer/engine";
import { MemoryRoomStore, type RoomAggregate } from "./room-store";
import { RoomCoordinator } from "./room-coordinator";

// PostgreSQL JSONB preserves content, but does not preserve object key order.
function jsonbRoundTrip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonbRoundTrip);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, jsonbRoundTrip(item)]));
  }
  return value;
}

async function speechRoom(store: MemoryRoomStore) {
  const coordinator = new RoomCoordinator({
    store,
    aiService: { async resolveAiTurns(state) { return advanceMultiplayerGame(state, { autoAi: false }); } },
  });
  const created = await coordinator.create("speaker", { displayName: "发言玩家", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.ok(created.ok);
  const ready = await coordinator.ready("speaker", created.view.room.id, true, created.view.room.version);
  assert.ok(ready.ok);
  const started = await coordinator.start("speaker", created.view.room.id, ready.view.room.version);
  assert.ok(started.ok);
  const aggregate = await store.getRoom(created.view.room.id);
  assert.ok(aggregate?.room.serverState);
  const state = structuredClone(aggregate.room.serverState);
  state.phase = "DAY_SPEECH";
  state.currentSpeakerSeat = 0;
  state.speechQueue = state.players.map((player) => player.seat);
  state.submittedSeats = {};
  state.turnKey = "1:DAY_SPEECH:0";
  state.deadlineAt = new Date(Date.now() + 120_000).toISOString();
  state.version = aggregate.room.version + 1;
  await store.transitionRoom(aggregate.room.id, aggregate.room.version, { phase: state.phase, serverState: state });
  const view = await coordinator.viewFor(created.view.room.id, "speaker");
  assert.ok(view);
  assert.ok(view.privateState.allowedActions.includes("speech"));
  return { coordinator, view };
}

test("JSONB 字段顺序改变时等待真人发言不能空转推进版本", async () => {
  class JsonbStore extends MemoryRoomStore {
    override async getRoom(id: string): Promise<RoomAggregate | null> {
      return jsonbRoundTrip(await super.getRoom(id)) as RoomAggregate | null;
    }
  }
  const store = new JsonbStore();
  const { coordinator, view } = await speechRoom(store);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal(await coordinator.progressAi(view.room.id), false);
  }
  const after = await coordinator.viewFor(view.room.id, "speaker");
  assert.equal(after?.room.version, view.room.version);
  assert.equal(after?.publicState.deadlineAt, view.publicState.deadlineAt);
});

test("进行中的房间再次加入只恢复连接，不能使发言版本失配", async () => {
  const store = new MemoryRoomStore();
  const { coordinator, view } = await speechRoom(store);
  await coordinator.disconnect("speaker", view.room.id, false);
  const joined = await coordinator.join("speaker", { code: view.room.code, displayName: "重新加入" });
  assert.ok(joined.ok);
  assert.equal(joined.view.room.version, view.room.version);
  assert.equal(joined.view.members.find((member) => member.userId === "speaker")?.isConnected, true);
  const sent = await coordinator.command("speaker", {
    type: "speech", content: "重新加入后发送的发言", commandId: "rejoined-speech", roomId: view.room.id, expectedVersion: joined.view.room.version,
  });
  assert.ok(sent.ok);
  assert.equal(sent.view.publicState.messages.filter((message) => message.content === "重新加入后发送的发言").length, 1);
});

test("旧存档内部版本失配时仍以房间 CAS 校验，发言只提交一次", async () => {
  const store = new MemoryRoomStore();
  const { coordinator, view } = await speechRoom(store);
  const aggregate = await store.getRoom(view.room.id);
  assert.ok(aggregate);
  const bumped = await store.saveMember(view.room.id, aggregate.members[0], view.room.version, { type: "member_rejoined", payload: {}, actorUserId: "speaker" });
  assert.ok(bumped);
  const command = { type: "speech" as const, content: "旧存档恢复后发言", commandId: "legacy-speech", roomId: view.room.id, expectedVersion: bumped };
  const stale = await coordinator.command("speaker", { ...command, expectedVersion: view.room.version });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.error.code, "ROOM_CONFLICT");
  const sent = await coordinator.command("speaker", command);
  assert.ok(sent.ok);
  const repeated = await coordinator.command("speaker", command);
  assert.ok(repeated.ok);
  assert.equal(repeated.view.room.version, sent.view.room.version);
  assert.equal(repeated.view.publicState.messages.filter((message) => message.content === command.content).length, 1);
});
