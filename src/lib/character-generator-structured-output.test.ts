import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "test-publishable-key";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

test("TokenPay 角色生成使用严格结构且每个阶段只调用一次", async () => {
  const { supabase } = await import("@/lib/supabase");
  const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const storage = new MemoryStorage();
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
      data: { session: { access_token: "test-access-token", user: { id: "user-1" } } },
      error: null,
    }),
  });

  const { setModelSource, setTokenPayConnected } = await import("@/lib/api-keys");
  setTokenPayConnected(true);
  setModelSource("tokenpay");

  let baseCalls = 0;
  let personaCalls = 0;
  const responseFormats: unknown[] = [];
  const validProfile = {
    displayName: "林川",
    gender: "male",
    age: 28,
    mbti: "ISTJ",
    basicInfo: "审计用角色",
  };
  const character = {
    displayName: "林川",
    persona: {
      voiceRules: ["语速平稳"],
      werewolfExperience: "偶尔参加朋友局",
      vocabularyStyle: "普通口语",
      reasoningStyle: "先听前后矛盾",
      speechLengthHabit: "通常简短",
      pressureStyle: "先解释",
      uncertaintyStyle: "明确保留意见",
      mistakePattern: "偶尔过度相信票型",
      wolfDeceptionStyle: "保持低调",
    },
    playerMind: {
      courage: "谨慎承担风险",
      memoryBias: "更记票型",
      suspicionThreshold: "两条矛盾后改站边",
      selfProtection: "先解释再反问",
      logicDepth: "能串联相邻发言",
      tablePresence: "关键时刻发言",
    },
  };

  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      stream?: boolean;
      response_format?: unknown;
    };
    responseFormats.push(body.response_format);
    if (!body.stream) {
      baseCalls += 1;
      return Response.json({
        choices: [{
          message: { role: "assistant", content: JSON.stringify({ profiles: [validProfile] }) },
          finish_reason: "stop",
        }],
      });
    }

    personaCalls += 1;
    const frame = JSON.stringify({
      choices: [{ delta: { content: JSON.stringify({ characters: [character] }) } }],
    });
    return new Response(`data: ${frame}\n\ndata: [DONE]\n\n`, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    const { generateCharacters } = await import("@/lib/character-generator");
    let baseProfileEmits = 0;
    let characterEmits = 0;
    const result = await generateCharacters(1, undefined, {
      onBaseProfiles: () => { baseProfileEmits += 1; },
      onCharacter: () => { characterEmits += 1; },
    });

    assert.equal(baseCalls, 1);
    assert.equal(personaCalls, 1);
    assert.equal(responseFormats.length, 2);
    for (const format of responseFormats) {
      assert.equal((format as { type?: string })?.type, "json_schema");
      assert.equal(
        (format as { json_schema?: { strict?: boolean } })?.json_schema?.strict,
        true,
      );
    }
    assert.equal(baseProfileEmits, 1);
    assert.equal(characterEmits, 1);
    assert.equal(result.length, 1);
    assert.equal(result[0].displayName, "林川");
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
