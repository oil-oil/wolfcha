import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "test-publishable-key";

test("TokenPay 启动同步使用当前会话并自动恢复一次瞬时失败", async () => {
  const { supabase } = await import("@/lib/supabase");
  const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const mockWindow = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: mockWindow });

  let sessionReads = 0;
  Object.defineProperty(supabase.auth, "getSession", {
    configurable: true,
    value: async () => {
      sessionReads += 1;
      return {
        data: {
          session: {
            access_token: `fresh-token-${sessionReads}`,
            user: { id: "user-1" },
          },
        },
        error: null,
      };
    },
  });

  const authorizationHeaders: string[] = [];
  let requests = 0;
  globalThis.fetch = async (_input, init) => {
    requests += 1;
    authorizationHeaders.push(new Headers(init?.headers).get("Authorization") ?? "");
    if (requests === 1) {
      return Response.json({ error: "temporary" }, { status: 503 });
    }
    return Response.json({ connected: true, status: "connected" });
  };

  try {
    const { loadTokenPayConnectionWithRetry } = await import("@/lib/tokenpay-client");
    const connection = await loadTokenPayConnectionWithRetry("user-1");
    assert.deepEqual(connection, { connected: true, status: "connected" });
    assert.equal(requests, 2);
    assert.equal(sessionReads, 2);
    assert.deepEqual(authorizationHeaders, ["Bearer fresh-token-1", "Bearer fresh-token-2"]);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(supabase.auth, "getSession", {
      configurable: true,
      value: originalGetSession,
    });
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});
