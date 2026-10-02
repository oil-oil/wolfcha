import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "test-publishable-key";

test("TokenPay 角色返回不完整 JSON 后不会重新付费请求", async () => {
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
  let personaCalls = 0;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      stream?: boolean;
      response_format?: { json_schema?: { name?: string } };
    };
    assert.notEqual(body.stream, true);
    if (body.response_format?.json_schema?.name === "base_profiles") {
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

    personaCalls += 1;
    return Response.json({
      choices: [{
        message: { role: "assistant", content: '{"characters":[' },
        finish_reason: "stop",
      }],
    });
  };

  try {
    const { generateCharacters } = await import("@/lib/character-generator");
    await assert.rejects(generateCharacters(1), /Character batch 0 returned invalid JSON/);
    assert.equal(baseCalls, 1);
    assert.equal(personaCalls, 1);
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
