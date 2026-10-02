import assert from "node:assert/strict";
import test from "node:test";
import fixture from "./fixtures/character-batch-zenmux.json";
import type { AILogEntry } from "./ai-logger";
import type { BaseProfile, GeneratedCharacter } from "./character-generator";

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

type GenerationRequest = {
  stream?: boolean;
  messages: Array<{ content: string }>;
  response_format?: {
    type?: string;
    json_schema?: {
      name?: string;
      strict?: boolean;
      schema?: {
        properties?: {
          characters?: { items?: { properties?: { displayName?: { enum?: string[] } } } };
        };
      };
    };
  };
};

const profiles = fixture.profiles as BaseProfile[];
const completeContent = fixture.completeResponse.choices[0].message.content;
const completeCharacters = () => JSON.parse(completeContent).characters as GeneratedCharacter[];

function completion(content: string, finishReason = "stop") {
  return Response.json({
    ...fixture.completeResponse,
    choices: [{ message: { role: "assistant", content }, finish_reason: finishReason }],
  });
}

async function runGeneration(
  respond: (request: GenerationRequest) => Response | Promise<Response>,
  baseProfiles = profiles,
) {
  const { supabase } = await import("@/lib/supabase");
  const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: storage,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => true,
    },
  });
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
  const { setLocale } = await import("@/i18n/locale-store");
  setLocale("zh");
  const { aiLogger } = await import("./ai-logger");
  const logs: AILogEntry[] = [];
  const unsubscribe = aiLogger.subscribe((entry) => { logs.push(entry); });
  const requests: GenerationRequest[] = [];
  const emissions: Array<{ index: number; character: GeneratedCharacter }> = [];
  let baseProfileEmits = 0;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as GenerationRequest;
    requests.push(body);
    if (body.response_format?.json_schema?.name === "base_profiles") {
      return completion(JSON.stringify({ profiles: baseProfiles }));
    }
    assert.equal(body.response_format?.json_schema?.name, "character_batch");
    return respond(body);
  };

  try {
    const { generateCharacters } = await import("@/lib/character-generator");
    let characters: GeneratedCharacter[] | undefined;
    let error: unknown;
    try {
      characters = await generateCharacters(baseProfiles.length, undefined, {
        onBaseProfiles: () => { baseProfileEmits += 1; },
        onCharacter: (index, character) => { emissions.push({ index, character }); },
      });
    } catch (caught) {
      error = caught;
    }
    return { characters, error, requests, emissions, logs, baseProfileEmits };
  } finally {
    unsubscribe();
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
}

test("真实 ZenMux SSE 提前 DONE 样本改用完整响应后生成有效角色，TokenPay 每个阶段只调用一次", async () => {
  const frames = fixture.failedStream.split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)));
  const partialContent = frames.map((frame) => frame.choices[0].delta.content ?? "").join("");
  assert.equal(partialContent.length, 145);
  assert.throws(() => JSON.parse(partialContent));
  assert.ok(fixture.failedStream.includes("data: [DONE]"));
  assert.ok(frames.every((frame) => frame.choices[0].finish_reason === null));

  const result = await runGeneration((request) => request.stream
    ? new Response(fixture.failedStream, { headers: { "content-type": "text/event-stream" } })
    : Response.json(fixture.completeResponse));
  assert.equal(result.error, undefined);
  assert.equal(result.requests.length, 2);
  for (const request of result.requests) {
    assert.notEqual(request.stream, true);
    assert.equal(request.response_format?.type, "json_schema");
    assert.equal(request.response_format?.json_schema?.strict, true);
  }
  assert.equal(result.baseProfileEmits, 1);
  assert.deepEqual(result.emissions.map(({ index }) => index), [0, 1, 2]);
  assert.deepEqual(result.characters?.map((character) => character.displayName), profiles.map((p) => p.displayName));
  for (const [index, character] of result.characters!.entries()) {
    assert.equal(character.persona.age, profiles[index].age);
    assert.equal(character.persona.basicInfo, profiles[index].basicInfo);
    assert.deepEqual(character.playerMind, completeCharacters()[index].playerMind);
  }
  assert.equal(result.logs[0].response.raw, completeContent);
  assert.equal(result.logs[0].response.finishReason, "stop");
  assert.equal(JSON.parse(result.logs[0].response.rawResponse!).id, fixture.completeResponse.id);
});

test("角色字段顺序、数组顺序及字符串内引号和花括号不影响完整解析", async () => {
  const characters = completeCharacters().map((character) => ({
    playerMind: character.playerMind,
    persona: { ...character.persona, vocabularyStyle: '说“先核对 {票型}”，也会引用 "矛盾"。' },
    displayName: character.displayName,
  })).reverse();
  const result = await runGeneration(() => completion(JSON.stringify({ characters })));
  assert.equal(result.error, undefined);
  assert.deepEqual(result.characters?.map((character) => character.displayName), profiles.map((p) => p.displayName));
  assert.equal(result.characters?.[0].persona.vocabularyStyle, characters[0].persona.vocabularyStyle);
});

test("角色 JSON 示例正确转义名字里的引号", async () => {
  const renamedProfiles = profiles.map((profile, index) => ({
    ...profile,
    displayName: index === 0 ? '林"川' : profile.displayName,
  }));
  const characters = completeCharacters().map((character, index) => ({
    ...character,
    displayName: renamedProfiles[index].displayName,
  }));
  const result = await runGeneration(() => completion(JSON.stringify({ characters })), renamedProfiles);
  assert.equal(result.error, undefined);
  assert.ok(result.requests[1].messages[0].content.includes('"displayName": "林\\"川"'));
  assert.equal(result.characters?.[0].displayName, '林"川');
});

test("允许完整 JSON 的 markdown 封套", async () => {
  const result = await runGeneration(() => completion(`\`\`\`json\n${completeContent}\n\`\`\``));
  assert.equal(result.error, undefined);
  assert.equal(result.characters?.length, 3);
});

for (const [name, invalidContent] of [
  ["截断 JSON", completeContent.slice(0, 145)],
  ["人物完整但外层 JSON 未闭合", completeContent.slice(0, -1)],
  ["完整 JSON 后夹杂额外文本", `${completeContent}\n以下是人物说明`],
] as const) {
  test(`${name}不发布角色，保留原始响应且不重新付费`, async () => {
    const result = await runGeneration(() => completion(invalidContent));
    assert.match(String(result.error), /Character batch 0 returned invalid JSON/);
    assert.equal(result.emissions.length, 0);
    assert.equal(result.requests.length, 2);
    assert.equal(result.logs.length, 1);
    assert.match(result.logs[0].error!, /invalid JSON/);
    assert.equal(result.logs[0].response.raw, invalidContent);
    assert.equal(JSON.parse(result.logs[0].response.rawResponse!).choices[0].message.content, invalidContent);
  });
}

for (const field of ["persona", "playerMind"] as const) {
  test(`其中一人缺少 ${field} 必填字段时整批不发布`, async () => {
    const characters = completeCharacters();
    if (field === "persona") characters[1].persona.wolfDeceptionStyle = "";
    else characters[1].playerMind!.logicDepth = "";
    const result = await runGeneration(() => completion(JSON.stringify({ characters })));
    assert.match(String(result.error), /invalid schema/);
    assert.equal(result.emissions.length, 0);
    assert.equal(result.requests.length, 2);
    assert.match(result.logs[0].error!, /invalid schema/);
  });
}

test("批次角色重名不能误配给其他座位", async () => {
  const characters = completeCharacters();
  characters[1].displayName = characters[0].displayName;
  const result = await runGeneration(() => completion(JSON.stringify({ characters })));
  assert.match(String(result.error), /invalid schema/);
  assert.equal(result.emissions.length, 0);
});

for (const finishReason of ["length", "content_filter"]) {
  test(`finish_reason=${finishReason} 即使 JSON 可解析也不发布角色`, async () => {
    const result = await runGeneration(() => completion(completeContent, finishReason));
    assert.match(String(result.error), new RegExp(`finish_reason=${finishReason}`));
    assert.equal(result.emissions.length, 0);
    assert.equal(result.requests.length, 2);
    assert.equal(result.logs[0].response.finishReason, finishReason);
    assert.equal(result.logs[0].response.raw, completeContent);
  });
}

test("六人仍按三人并行生成，晚返回的前一批按原座位回调", async () => {
  const allProfiles = [...profiles, ...profiles.map((profile) => ({
    ...profile,
    displayName: `${profile.displayName}二`,
  }))];
  const allCharacters = [...completeCharacters(), ...completeCharacters().map((character) => ({
    ...character,
    displayName: `${character.displayName}二`,
  }))];
  let activeRequests = 0;
  let peakRequests = 0;
  let releaseFirst: (() => void) | undefined;
  const firstBatchReady = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const result = await runGeneration(async (request) => {
    const names = request.response_format?.json_schema?.schema?.properties?.characters?.items?.properties?.displayName?.enum;
    assert.equal(names?.length, 3);
    activeRequests += 1;
    peakRequests = Math.max(peakRequests, activeRequests);
    if (names![0] === profiles[0].displayName) await firstBatchReady;
    else queueMicrotask(() => releaseFirst!());
    activeRequests -= 1;
    return completion(JSON.stringify({ characters: allCharacters.filter((character) => names!.includes(character.displayName)) }));
  }, allProfiles);
  assert.equal(result.error, undefined);
  assert.equal(peakRequests, 2);
  assert.equal(result.requests.length, 3);
  assert.deepEqual(result.emissions.map(({ index }) => index), [3, 4, 5, 0, 1, 2]);
  assert.deepEqual(result.characters?.map((character) => character.displayName), allProfiles.map((p) => p.displayName));
});
