import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

const originalFetch = globalThis.fetch;
let supabase: typeof import("@/lib/supabase").supabase;
let gameSessionTracker: typeof import("@/lib/game-session-tracker").gameSessionTracker;
let originalGetSession: typeof import("@/lib/supabase").supabase.auth.getSession;

async function loadTracker() {
  ({ supabase } = await import("@/lib/supabase"));
  ({ gameSessionTracker } = await import("@/lib/game-session-tracker"));
  originalGetSession = supabase.auth.getSession.bind(supabase.auth);
}

test.afterEach(() => {
  if (!gameSessionTracker) return;
  gameSessionTracker.reset();
  globalThis.fetch = originalFetch;
  supabase.auth.getSession = originalGetSession;
});

function installAuthenticatedSession() {
  supabase.auth.getSession = (async () => ({
    data: {
      session: {
        access_token: "test-access-token",
        user: { id: "user-1" },
      },
    },
    error: null,
  })) as typeof supabase.auth.getSession;
}

function installSessionApi(requests: Array<{ action: string; payload: Record<string, unknown> }>) {
  let createdCount = 0;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url === "/api/demo-config") {
      return new Response(JSON.stringify({ active: false }), { status: 200 });
    }

    const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    requests.push({ action: String(payload.action), payload });
    if (payload.action === "create") {
      createdCount += 1;
      return new Response(JSON.stringify({ success: true, sessionId: `session-${createdCount}` }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as typeof fetch;
}

test("生命周期状态按创建、运行、失败、放弃和完成写入，且更新不携带客户端 AI 统计", async () => {
  await loadTracker();
  installAuthenticatedSession();
  const requests: Array<{ action: string; payload: Record<string, unknown> }> = [];
  installSessionApi(requests);

  await gameSessionTracker.start({ playerCount: 10, usedCustomKey: false });
  await gameSessionTracker.markRunning();
  await gameSessionTracker.abandon();

  await gameSessionTracker.start({ playerCount: 10, usedCustomKey: false });
  await gameSessionTracker.markFailed();

  await gameSessionTracker.start({ playerCount: 10, usedCustomKey: false });
  await gameSessionTracker.end("wolf", true);

  const updates = requests.filter((request) => request.action === "update");
  assert.deepEqual(
    updates.map(({ payload }) => payload.lifecycleStatus),
    ["running", "abandoned", "failed", "completed"],
  );
  for (const { payload } of updates) {
    for (const field of [
      "aiCallsCount",
      "aiInputChars",
      "aiOutputChars",
      "aiPromptTokens",
      "aiCompletionTokens",
    ]) {
      assert.equal(field in payload, false, `update payload must not contain ${field}`);
    }
  }
});

test("reset 后不会为旧 session 继续写入，rehydrate 后可同步同一 session", async () => {
  await loadTracker();
  installAuthenticatedSession();
  const requests: Array<{ action: string; payload: Record<string, unknown> }> = [];
  installSessionApi(requests);

  await gameSessionTracker.start({ playerCount: 10, usedCustomKey: false });
  const oldSessionId = gameSessionTracker.getSessionId();
  assert.equal(oldSessionId, "session-1");

  gameSessionTracker.reset();
  await gameSessionTracker.syncProgressImmediate();
  assert.equal(requests.filter((request) => request.action === "update").length, 0);

  gameSessionTracker.rehydrate(oldSessionId, Date.now() - 1_000);
  await gameSessionTracker.syncProgressImmediate();
  const sync = requests.filter((request) => request.action === "update");
  assert.equal(sync.length, 1);
  assert.equal(sync[0]?.payload.sessionId, oldSessionId);
  assert.equal(sync[0]?.payload.lifecycleStatus, "running");
});

test("终态 API 失败时保留 tracker session，成功重试后才清理", async () => {
  await loadTracker();
  installAuthenticatedSession();
  let shouldFail = true;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url === "/api/demo-config") {
      return new Response(JSON.stringify({ active: false }), { status: 200 });
    }
    const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    if (payload.action === "create") {
      return new Response(JSON.stringify({ success: true, sessionId: "retry-session" }), { status: 200 });
    }
    if (shouldFail) return new Response(JSON.stringify({ error: "temporary" }), { status: 503 });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as typeof fetch;

  await gameSessionTracker.start({ playerCount: 10, usedCustomKey: false });
  await assert.rejects(
    gameSessionTracker.markFailed(),
    /Failed to update game session lifecycle/,
  );
  assert.equal(gameSessionTracker.getSessionId(), "retry-session");

  shouldFail = false;
  await gameSessionTracker.markFailed();
  assert.equal(gameSessionTracker.getSessionId(), null);
});
