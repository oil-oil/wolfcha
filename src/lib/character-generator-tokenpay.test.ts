import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "test-publishable-key";

test("TokenPay 角色流已返回部分内容后中断也不会重新付费请求", async () => {
  const { supabase } = await import("@/lib/supabase");
  const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
  const mockWindow = {
    localStorage: storage,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: mockWindow });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(supabase.auth, "getSession", {
    configurable: true,
    value: async () => ({
      data: { session: { access_token: "test-access-token" } },
      error: null,
    }),
  });

  const { setModelSource, setTokenPayConnected } = await import("@/lib/api-keys");
  setTokenPayConnected(true);
  setModelSource("tokenpay");
  let baseCalls = 0;
  let streamCalls = 0;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { stream?: boolean };
    if (!body.stream) {
      baseCalls += 1;
      return Response.json({
        choices: [{
          message: {
            role: "assistant",
            content: JSON.stringify({
              profiles: [{
                displayName: "林川",
                gender: "male",
                age: 28,
                mbti: "ISTJ",
                basicInfo: "审计用角色",
              }],
            }),
          },
          finish_reason: "stop",
        }],
      });
    }

    streamCalls += 1;
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":"{\\"characters\\":["}}]}\n\n',
        ));
        controller.close();
      },
    }), { status: 200, headers: { "content-type": "text/event-stream" } });
  };

  try {
    const { generateCharacters } = await import("@/lib/character-generator");
    await assert.rejects(generateCharacters(1), /\[DONE\] 前意外结束/);
    assert.equal(baseCalls, 1);
    assert.equal(streamCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(supabase.auth, "getSession", {
      configurable: true,
      value: originalGetSession,
    });
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    if (originalLocalStorage === undefined) Reflect.deleteProperty(globalThis, "localStorage");
    else Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
  }
});
