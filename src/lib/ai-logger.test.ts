import assert from "node:assert/strict";
import test from "node:test";
import type { AILogEntry } from "./ai-logger";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "ai-logger-test-key";

const getLogger = async () => (await import("./ai-logger")).aiLogger;

const makeEntry = (model: string): Omit<AILogEntry, "id" | "timestamp"> => ({
  type: "speech",
  request: {
    model,
    messages: [{ role: "user", content: "测试提示词" }],
    apiKeySource: "project",
  },
  response: {
    content: "测试回复",
    duration: 1,
  },
});

test("每次 log 都通知订阅者，取消订阅后不再通知", async () => {
  const aiLogger = await getLogger();
  const received: AILogEntry[] = [];
  const unsubscribe = aiLogger.subscribe((entry) => {
    received.push(entry);
  });

  try {
    const first = await aiLogger.log(makeEntry("model-1"));
    const second = await aiLogger.log(makeEntry("model-2"));

    assert.deepEqual(received, [first, second]);

    unsubscribe();
    await aiLogger.log(makeEntry("model-3"));
    assert.deepEqual(received, [first, second]);
  } finally {
    unsubscribe();
  }
});

test("单个订阅者抛错不会影响其他订阅者或 log", async () => {
  const aiLogger = await getLogger();
  const received: AILogEntry[] = [];
  const unsubscribeThrowing = aiLogger.subscribe(() => {
    throw new Error("订阅者故意抛错");
  });
  const unsubscribeReceiving = aiLogger.subscribe((entry) => {
    received.push(entry);
  });

  try {
    await assert.doesNotReject(() => aiLogger.log(makeEntry("model-4")));
    assert.equal(received.length, 1);
    assert.equal(received[0].request.model, "model-4");
  } finally {
    unsubscribeThrowing();
    unsubscribeReceiving();
  }
});
