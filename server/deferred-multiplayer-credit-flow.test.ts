import assert from "node:assert/strict";
import test from "node:test";
import { advanceMultiplayerGame } from "@/multiplayer/engine";
import { MultiplayerAiUnavailableError } from "./ai-service";
import { RoomCoordinator } from "./room-coordinator";
import { MemoryRoomStore } from "./room-store";
import type { RoomEvent, RoomStatePatch } from "./room-store";

const aiService = {
  async resolveAiTurns(state: Parameters<typeof advanceMultiplayerGame>[0]) {
    return advanceMultiplayerGame(state, { autoAi: true });
  },
};

class DeferredCreditStore extends MemoryRoomStore {
  balance = 1;
  chargeCount = 0;
  failAfterCommit = false;

  async startRoomAtomically(
    roomId: string,
    expectedVersion: number,
    sessionId: string | null | undefined,
    userId: string,
    patch: RoomStatePatch,
    event: RoomEvent,
  ) {
    if (!sessionId || this.balance < 1) return { version: expectedVersion, authorized: false };
    void event;
    const version = await this.transitionRoom(roomId, expectedVersion, patch);
    if (version === null) return null;
    this.balance -= 1;
    this.chargeCount += 1;
    if (this.failAfterCommit) {
      this.failAfterCommit = false;
      throw new Error("response_lost_after_commit");
    }
    return { version, authorized: true };
  }
}

async function createReadyRoom(coordinator: RoomCoordinator) {
  const created = await coordinator.create("host", {
    displayName: "房主", playerCount: 8, difficulty: "normal", locale: "zh",
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("room_creation_failed");
  const ready = await coordinator.ready("host", created.view.room.id, true, created.view.room.version);
  assert.equal(ready.ok, true);
  if (!ready.ok) throw new Error("room_ready_failed");
  return { id: created.view.room.id, version: ready.view.room.version };
}

test("AI preflight 失败时 atomic start 未调用，余额保持不变", async () => {
  const store = new DeferredCreditStore();
  let startCalls = 0;
  const originalStart = store.startRoomAtomically.bind(store);
  store.startRoomAtomically = async (...args: Parameters<typeof store.startRoomAtomically>) => {
    startCalls += 1;
    return originalStart(...args);
  };
  const coordinator = new RoomCoordinator({
    store,
    aiService: {
      isAvailable: () => false,
      async resolveAiTurns() { throw new MultiplayerAiUnavailableError(); },
    },
  });
  const room = await createReadyRoom(coordinator);

  const result = await coordinator.start("host", room.id, room.version, "pending-session");

  assert.equal(result.ok, false);
  assert.equal(startCalls, 0);
  assert.equal(store.balance, 1);
  assert.equal(store.chargeCount, 0);
  assert.equal((await store.getRoom(room.id))?.room.status, "lobby");
});

test("start RPC 已扣费但响应丢失时恢复为成功，重试不会再扣", async () => {
  const store = new DeferredCreditStore();
  store.failAfterCommit = true;
  const coordinator = new RoomCoordinator({ store, aiService });
  const room = await createReadyRoom(coordinator);

  const recovered = await coordinator.start("host", room.id, room.version, "pending-session");
  assert.equal(recovered.ok, true);
  assert.equal(store.balance, 0);
  assert.equal(store.chargeCount, 1);
  if (!recovered.ok) return;

  const duplicate = await coordinator.start("host", room.id, room.version, "pending-session");
  assert.equal(duplicate.ok, false);
  assert.equal(store.balance, 0);
  assert.equal(store.chargeCount, 1);
});
