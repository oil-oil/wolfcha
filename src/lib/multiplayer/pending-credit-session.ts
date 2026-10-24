export interface PendingMultiplayerSession {
  sessionId: string;
  roomId: string;
  userId: string;
  createdAt: number;
  legacy?: boolean;
}

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PENDING_MULTIPLAYER_SESSION_TTL_MS = 4 * 60 * 60 * 1_000;
const LEGACY_KEY = "wolfcha_pending_multiplayer_session";
const SCOPED_KEY_PREFIX = `${LEGACY_KEY}:`;

type StoredSession = { sessionId?: unknown; roomId?: unknown; userId?: unknown; createdAt?: unknown; legacy?: unknown };

function scopedKey(roomId: string, userId: string): string {
  return `${SCOPED_KEY_PREFIX}${userId}:${roomId}`;
}

function isFresh(value: StoredSession | null, now: number): value is StoredSession & { sessionId: string; createdAt: number } {
  return Boolean(
    value &&
    typeof value.sessionId === "string" &&
    value.sessionId.length > 0 &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    now - value.createdAt >= 0 &&
    now - value.createdAt < PENDING_MULTIPLAYER_SESSION_TTL_MS,
  );
}

function parseStored(storage: SessionStorageLike, key: string): StoredSession | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "null");
    return typeof value === "object" && value !== null ? value as StoredSession : null;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function readPendingMultiplayerSession(
  storage: SessionStorageLike,
  roomId: string,
  userId: string,
  now = Date.now(),
): PendingMultiplayerSession | null {
  const key = scopedKey(roomId, userId);
  const scoped = parseStored(storage, key);
  if (scoped) {
    if (isFresh(scoped, now) && scoped.roomId === roomId && scoped.userId === userId) {
      return {
        sessionId: scoped.sessionId,
        roomId,
        userId,
        createdAt: scoped.createdAt,
        legacy: scoped.legacy === true,
      };
    }
    storage.removeItem(key);
  }

  // Older builds stored one unscoped paid session. Try it once through the
  // existing server authorization checks, then keep it isolated to this scope.
  const legacy = parseStored(storage, LEGACY_KEY);
  if (!isFresh(legacy, now) || legacy.roomId !== undefined || legacy.userId !== undefined) {
    if (legacy) storage.removeItem(LEGACY_KEY);
    return null;
  }
  const migrated: PendingMultiplayerSession = {
    sessionId: legacy.sessionId,
    roomId,
    userId,
    createdAt: legacy.createdAt,
    legacy: true,
  };
  storage.removeItem(LEGACY_KEY);
  storage.setItem(key, JSON.stringify(migrated));
  return migrated;
}

export function writePendingMultiplayerSession(storage: SessionStorageLike, session: PendingMultiplayerSession): void {
  storage.setItem(scopedKey(session.roomId, session.userId), JSON.stringify(session));
}

export function clearPendingMultiplayerSession(storage: SessionStorageLike, roomId: string, userId: string): void {
  storage.removeItem(scopedKey(roomId, userId));
}
