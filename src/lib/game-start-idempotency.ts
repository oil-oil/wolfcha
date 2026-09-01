import { generateUUID } from "@/lib/utils";
import { GAME_SESSION_RESUME_WINDOW_MS } from "@/lib/game-session-policy";

const STORAGE_KEY_PREFIX = "wolfcha_pending_game_starts_v1";
// 与已授权游戏会话的恢复窗口保持一致；响应丢失或角色生成失败后，
// 同一开局意图在 24 小时内始终复用原扣费会话。
const REQUEST_TTL_MS = GAME_SESSION_RESUME_WINDOW_MS;

export const GAME_START_PERSISTENCE_ERROR_CODE = "idempotency_storage_unavailable";

export class GameStartPersistenceError extends Error {
  readonly code = GAME_START_PERSISTENCE_ERROR_CODE;

  constructor() {
    super("Game start idempotency storage is unavailable");
    this.name = "GameStartPersistenceError";
  }
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type PendingGameStartRequest = {
  requestId: string;
  fingerprint: string;
  createdAt: number;
};

function getStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function requireStorage(storage: StorageLike | null): StorageLike {
  if (!storage) throw new GameStartPersistenceError();
  return storage;
}

function getStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function isPendingRequest(value: unknown): value is PendingGameStartRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<PendingGameStartRequest>;
  return (
    typeof request.requestId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.requestId) &&
    typeof request.fingerprint === "string" &&
    request.fingerprint.length > 0 &&
    typeof request.createdAt === "number" &&
    Number.isFinite(request.createdAt)
  );
}

function readPendingRequests(
  userId: string,
  now: number,
  storage: StorageLike | null,
): PendingGameStartRequest[] {
  const persistentStorage = requireStorage(storage);
  let raw: string | null;
  try {
    raw = persistentStorage.getItem(getStorageKey(userId));
  } catch {
    throw new GameStartPersistenceError();
  }

  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    // 内容损坏不等于存储不可用；能成功覆盖时可安全自愈。
    writePendingRequests(userId, [], persistentStorage);
    return [];
  }
  if (!Array.isArray(parsed) || parsed.some((request) => !isPendingRequest(request))) {
    writePendingRequests(userId, [], persistentStorage);
    return [];
  }
  const storageRequests = parsed as PendingGameStartRequest[];

  const latestByFingerprint = new Map<string, PendingGameStartRequest>();
  for (const request of storageRequests) {
    if (now - request.createdAt > REQUEST_TTL_MS) continue;
    const previous = latestByFingerprint.get(request.fingerprint);
    if (!previous || request.createdAt >= previous.createdAt) {
      latestByFingerprint.set(request.fingerprint, request);
    }
  }
  const fresh = [...latestByFingerprint.values()].sort(
    (left, right) => left.createdAt - right.createdAt,
  );
  return fresh;
}

function writePendingRequests(
  userId: string,
  requests: PendingGameStartRequest[],
  storage: StorageLike | null,
) {
  const persistentStorage = requireStorage(storage);
  try {
    if (requests.length === 0) {
      persistentStorage.removeItem(getStorageKey(userId));
    } else {
      persistentStorage.setItem(getStorageKey(userId), JSON.stringify(requests));
    }
  } catch {
    throw new GameStartPersistenceError();
  }
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortForStableJson(nested)]),
  );
}

export function buildGameStartIntentFingerprint(input: Record<string, unknown>): string {
  return JSON.stringify(sortForStableJson(input));
}

export function getOrCreateGameStartRequest(
  userId: string,
  fingerprint: string,
  options: { now?: number; storage?: StorageLike | null } = {},
): string {
  const now = options.now ?? Date.now();
  const storage = options.storage === undefined ? getStorage() : options.storage;
  const requests = readPendingRequests(userId, now, storage);
  const existing = requests.find((request) => request.fingerprint === fingerprint);
  if (existing) return existing.requestId;

  const next: PendingGameStartRequest = {
    requestId: generateUUID(),
    fingerprint,
    createdAt: now,
  };
  writePendingRequests(userId, [...requests, next], storage);
  return next.requestId;
}

export function hasPendingGameStartRequest(
  userId: string,
  fingerprint: string,
  options: { now?: number; storage?: StorageLike | null } = {},
): boolean {
  const now = options.now ?? Date.now();
  const storage = options.storage === undefined ? getStorage() : options.storage;
  return readPendingRequests(userId, now, storage).some(
    (request) => request.fingerprint === fingerprint,
  );
}

export function completeGameStartRequest(
  userId: string,
  requestId: string,
  options: { now?: number; storage?: StorageLike | null } = {},
): boolean {
  try {
    const now = options.now ?? Date.now();
    const storage = options.storage === undefined ? getStorage() : options.storage;
    const requests = readPendingRequests(userId, now, storage);
    writePendingRequests(
      userId,
      requests.filter((request) => request.requestId !== requestId),
      storage,
    );
    return true;
  } catch {
    // 扣费与开局已经成功时，清理失败不能反向中止正在运行的游戏。
    return false;
  }
}

export function shouldRetryGameStartRequest(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

type RetryOptions = {
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
};

const MAX_RETRY_DELAY_MS = 5_000;

function getRetryDelayMs(
  response: Response | null,
  attempt: number,
  random: () => number,
  now: () => number,
): number {
  if (response?.status === 429) {
    const retryAfter = response.headers.get("retry-after")?.trim();
    if (retryAfter) {
      const seconds = Number(retryAfter);
      const parsedDelay = Number.isFinite(seconds)
        ? seconds * 1_000
        : Date.parse(retryAfter) - now();
      if (Number.isFinite(parsedDelay) && parsedDelay >= 0) {
        return Math.min(parsedDelay, MAX_RETRY_DELAY_MS);
      }
    }
  }

  const baseDelay = 250 * 2 ** attempt;
  const jitter = Math.floor(random() * 250);
  return Math.min(baseDelay + jitter, MAX_RETRY_DELAY_MS);
}

export async function runGameStartRequestWithRetry(
  attemptRequest: () => Promise<Response>,
  maxAttempts = 2,
  options: RetryOptions = {},
): Promise<Response> {
  const attemptLimit = Math.max(1, maxAttempts);
  const sleep = options.sleep ?? ((delayMs) => new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  }));
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;

  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    let retryResponse: Response | null = null;
    try {
      const response = await attemptRequest();
      if (
        response.ok ||
        !shouldRetryGameStartRequest(response.status) ||
        attempt + 1 >= attemptLimit
      ) {
        return response;
      }
      retryResponse = response;
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (attempt + 1 >= attemptLimit) {
        throw error instanceof Error ? error : new Error("network_error");
      }
    }

    await sleep(getRetryDelayMs(retryResponse, attempt, random, now));
  }

  throw new Error("network_error");
}

export const GAME_START_REQUEST_TTL_MS = REQUEST_TTL_MS;
