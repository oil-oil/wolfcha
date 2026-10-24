import assert from "node:assert/strict";
import test from "node:test";
import {
  PENDING_MULTIPLAYER_SESSION_TTL_MS,
  clearPendingMultiplayerSession,
  readPendingMultiplayerSession,
  writePendingMultiplayerSession,
} from "../src/lib/multiplayer/pending-credit-session";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("reservation cache is isolated by room and user and clears only its own scope", () => {
  const storage = new MemoryStorage();
  const reservation = { sessionId: "session-a", roomId: "room-a", userId: "user-a", createdAt: 10_000 };
  writePendingMultiplayerSession(storage, reservation);

  assert.deepEqual(readPendingMultiplayerSession(storage, "room-a", "user-a", 11_000), { ...reservation, legacy: false });
  assert.equal(readPendingMultiplayerSession(storage, "room-b", "user-a", 11_000), null);
  assert.equal(readPendingMultiplayerSession(storage, "room-a", "user-b", 11_000), null);

  clearPendingMultiplayerSession(storage, "room-b", "user-a");
  assert.deepEqual(readPendingMultiplayerSession(storage, "room-a", "user-a", 11_000), { ...reservation, legacy: false });
});

test("legacy paid cache is tried once and migrated into the current scope", () => {
  const storage = new MemoryStorage();
  storage.setItem("wolfcha_pending_multiplayer_session", JSON.stringify({ sessionId: "old-paid", createdAt: 10_000 }));

  const migrated = readPendingMultiplayerSession(storage, "room-a", "user-a", 11_000);
  assert.deepEqual(migrated, {
    sessionId: "old-paid", roomId: "room-a", userId: "user-a", createdAt: 10_000, legacy: true,
  });
  assert.equal(storage.getItem("wolfcha_pending_multiplayer_session"), null);
  assert.equal(readPendingMultiplayerSession(storage, "room-b", "user-a", 12_000), null);
});

test("expired scoped cache is removed so the page requests a durable server reservation", () => {
  const storage = new MemoryStorage();
  const reservation = { sessionId: "pending", roomId: "room-a", userId: "user-a", createdAt: 10_000 };
  writePendingMultiplayerSession(storage, reservation);

  assert.equal(readPendingMultiplayerSession(storage, "room-a", "user-a", 10_000 + PENDING_MULTIPLAYER_SESSION_TTL_MS), null);
  assert.equal(readPendingMultiplayerSession(storage, "room-a", "user-a", 10_000 + PENDING_MULTIPLAYER_SESSION_TTL_MS + 1), null);
});
