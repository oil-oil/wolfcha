import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGameStartIntentFingerprint,
  completeGameStartRequest,
  GAME_START_REQUEST_TTL_MS,
  getOrCreateGameStartRequest,
  hasPendingGameStartRequest,
  runGameStartRequestWithRetry,
} from "@/lib/game-start-idempotency";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

class WriteFailingStorage extends MemoryStorage {
  override setItem() {
    throw new Error("quota_exceeded");
  }

  override removeItem() {
    throw new Error("quota_exceeded");
  }
}

test("相同用户和开局意图会复用同一个请求 ID", () => {
  const storage = new MemoryStorage();
  const fingerprint = buildGameStartIntentFingerprint({ playerCount: 10, source: "project" });
  const first = getOrCreateGameStartRequest("user-1", fingerprint, { now: 1_000, storage });
  const second = getOrCreateGameStartRequest("user-1", fingerprint, { now: 2_000, storage });

  assert.equal(second, first);
});

test("完成开局后，下次相同配置会生成新的请求 ID", () => {
  const storage = new MemoryStorage();
  const fingerprint = buildGameStartIntentFingerprint({ playerCount: 10, source: "project" });
  const first = getOrCreateGameStartRequest("user-2", fingerprint, { now: 1_000, storage });
  assert.equal(hasPendingGameStartRequest("user-2", fingerprint, { now: 1_500, storage }), true);
  completeGameStartRequest("user-2", first, { now: 2_000, storage });
  assert.equal(hasPendingGameStartRequest("user-2", fingerprint, { now: 2_500, storage }), false);
  const next = getOrCreateGameStartRequest("user-2", fingerprint, { now: 3_000, storage });

  assert.notEqual(next, first);
});

test("超时窗口结束后不会复用陈旧请求 ID", () => {
  const storage = new MemoryStorage();
  const fingerprint = buildGameStartIntentFingerprint({ playerCount: 10, source: "project" });
  const first = getOrCreateGameStartRequest("user-3", fingerprint, { now: 1_000, storage });
  const next = getOrCreateGameStartRequest("user-3", fingerprint, {
    now: 1_000 + GAME_START_REQUEST_TTL_MS + 1,
    storage,
  });

  assert.notEqual(next, first);
});

test("不同开局配置和不同用户不会共享请求 ID", () => {
  const storage = new MemoryStorage();
  const project = buildGameStartIntentFingerprint({ playerCount: 10, source: "project" });
  const tokenPay = buildGameStartIntentFingerprint({ playerCount: 10, source: "tokenpay" });

  const projectId = getOrCreateGameStartRequest("user-4", project, { now: 1_000, storage });
  const tokenPayId = getOrCreateGameStartRequest("user-4", tokenPay, { now: 1_000, storage });
  const otherUserId = getOrCreateGameStartRequest("user-5", project, { now: 1_000, storage });

  assert.notEqual(tokenPayId, projectId);
  assert.notEqual(otherUserId, projectId);
});

test("24 小时内不会因未完成意图超过八个而丢失最早请求 ID", () => {
  const storage = new MemoryStorage();
  const firstFingerprint = buildGameStartIntentFingerprint({ playerCount: 6, sequence: 0 });
  const firstId = getOrCreateGameStartRequest("user-many", firstFingerprint, {
    now: 1_000,
    storage,
  });

  for (let sequence = 1; sequence < 10; sequence += 1) {
    getOrCreateGameStartRequest(
      "user-many",
      buildGameStartIntentFingerprint({ playerCount: 6 + sequence, sequence }),
      { now: 1_000 + sequence, storage },
    );
  }

  assert.equal(
    getOrCreateGameStartRequest("user-many", firstFingerprint, { now: 2_000, storage }),
    firstId,
  );
});

test("localStorage 写失败后，同页重试仍以内存中的请求 ID 为准", () => {
  const storage = new WriteFailingStorage();
  const fingerprint = buildGameStartIntentFingerprint({ playerCount: 10, source: "project" });
  const first = getOrCreateGameStartRequest("user-write-fail", fingerprint, {
    now: 1_000,
    storage,
  });
  const second = getOrCreateGameStartRequest("user-write-fail", fingerprint, {
    now: 2_000,
    storage,
  });

  assert.equal(second, first);
});

test("意图指纹不受对象字段顺序影响", () => {
  assert.equal(
    buildGameStartIntentFingerprint({ source: "project", config: { difficulty: "normal", players: 10 } }),
    buildGameStartIntentFingerprint({ config: { players: 10, difficulty: "normal" }, source: "project" }),
  );
});

test("网络异常后会使用同一个逻辑请求自动重试一次", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const response = await runGameStartRequestWithRetry(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("connection_lost");
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }, 2, {
    random: () => 0,
    sleep: async (delayMs) => { delays.push(delayMs); },
  });

  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [250]);
});

test("服务端瞬时错误会重试，确定的客户端错误不会重试", async () => {
  let transientAttempts = 0;
  const recovered = await runGameStartRequestWithRetry(async () => {
    transientAttempts += 1;
    return new Response(null, { status: transientAttempts === 1 ? 503 : 200 });
  }, 2, { random: () => 0, sleep: async () => undefined });
  assert.equal(recovered.status, 200);
  assert.equal(transientAttempts, 2);

  let invalidAttempts = 0;
  const invalid = await runGameStartRequestWithRetry(async () => {
    invalidAttempts += 1;
    return new Response(null, { status: 400 });
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalidAttempts, 1);
});

test("429 重试遵守有上限的 Retry-After", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const response = await runGameStartRequestWithRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response(null, { status: 429, headers: { "Retry-After": "30" } });
    }
    return new Response(null, { status: 200 });
  }, 2, {
    sleep: async (delayMs) => { delays.push(delayMs); },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(delays, [5_000]);
});
