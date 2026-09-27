import assert from "node:assert/strict";
import test from "node:test";
import { setLocale } from "@/i18n/locale-store";
import type { ChatMessage, GameState, Player } from "@/types/game";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "structured-output-test-key";
setLocale("zh");

const completionResponse = (content: string) => Response.json({
  id: "structured-output-test",
  choices: [{
    message: { role: "assistant", content },
    finish_reason: "stop",
  }],
});

const requestUrl = (input: string | URL | Request): string =>
  typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

const makePlayer = (playerId: string, seat: number, model: string): Player => ({
  playerId,
  seat,
  displayName: `玩家${seat + 1}`,
  alive: true,
  role: "Villager",
  alignment: "village",
  isHuman: false,
  agentProfile: {
    modelRef: { provider: "tokendance", model },
    persona: {
      mbti: "INTJ",
      gender: "female",
      age: 25,
      voiceRules: ["简洁发言"],
    },
  },
});

test("不支持严格 Schema 的玩家模型降级为 json_object，非法动作只调用一次", async () => {
  const { createInitialGameState, generateAIVote, AI_VOTE_ABSTAIN } = await import("./game-master");
  const voter = makePlayer("voter", 0, "qwen3-max");
  const target = makePlayer("target", 1, "qwen3-max");
  const state: GameState = {
    ...createInitialGameState(),
    phase: "DAY_VOTE",
    day: 1,
    players: [voter, target],
  };
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<{
    response_format?: { type?: string };
    messages?: Array<{ role?: string; content?: string | unknown[] }>;
  }> = [];

  globalThis.fetch = async (input, init) => {
    if (requestUrl(input) === "/api/demo-config") {
      return Response.json({ active: false, enabled: false });
    }
    requestBodies.push(JSON.parse(String(init?.body)));
    return completionResponse("not-json");
  };

  try {
    const result = await generateAIVote(state, voter);
    assert.equal(requestBodies.length, 1);
    assert.equal(requestBodies[0].response_format?.type, "json_object");
    assert.equal(result.seat, AI_VOTE_ABSTAIN);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("放逐投票的严格 Schema 把私下分析排在座位之前，且分析不进入返回值", async () => {
  const { createInitialGameState, generateAIVote } = await import("./game-master");
  const voter = makePlayer("voter", 0, "deepseek-v4.1-flash");
  const target = makePlayer("target", 1, "deepseek-v4.1-flash");
  const state: GameState = {
    ...createInitialGameState(),
    phase: "DAY_VOTE",
    day: 1,
    players: [voter, target],
  };
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<{
    response_format?: { json_schema?: { schema?: { properties?: Record<string, unknown>; required?: string[] } } };
  }> = [];

  globalThis.fetch = async (input, init) => {
    if (requestUrl(input) === "/api/demo-config") {
      return Response.json({ active: false, enabled: false });
    }
    requestBodies.push(JSON.parse(String(init?.body)));
    return completionResponse('{"analysis":"我是村民，2号跳了预言家且无人对跳。","seat":2,"reason":"发言前后对不上"}');
  };

  try {
    const result = await generateAIVote(state, voter);
    const schema = requestBodies[0].response_format?.json_schema?.schema;
    assert.deepEqual(Object.keys(schema?.properties ?? {}), ["analysis", "seat", "reason"]);
    assert.deepEqual(schema?.required, ["analysis", "seat", "reason"]);
    assert.deepEqual(result, { seat: 1, reason: "发言前后对不上" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("投票与夜间行动声明决策用途，发言不声明", async () => {
  const gm = await import("./game-master");
  const { PLAYER_MODELS } = await import("@/types/game");
  const model = PLAYER_MODELS[0].model;
  const players = [makePlayer("a", 0, model), makePlayer("b", 1, model), makePlayer("c", 2, model)];
  players[0].role = "Seer";
  players[0].agentProfile!.modelRef = PLAYER_MODELS[0];
  const state: GameState = { ...gm.createInitialGameState(), phase: "DAY_VOTE", day: 1, players };
  const originalFetch = globalThis.fetch;
  const bodies: Array<{ reasoning_profile?: string; reasoning?: { enabled?: boolean; effort?: string } }> = [];
  let reply = '{"analysis":"x","seat":2,"reason":"y"}';
  globalThis.fetch = async (input, init) => {
    if (requestUrl(input) === "/api/demo-config") {
      return Response.json({ active: false, enabled: false });
    }
    bodies.push(JSON.parse(String(init?.body)));
    return completionResponse(reply);
  };

  try {
    await gm.generateAIVote(state, players[0]);
    reply = '{"seat":2}';
    await gm.generateSeerAction({ ...state, phase: "NIGHT_SEER_ACTION" }, players[0]);
    reply = '["公开发言。"]';
    await gm.generateAISpeechSegments({ ...state, phase: "DAY_SPEECH", currentSpeakerSeat: 0, daySpeechStartSeat: 0 }, players[0]);

    assert.deepEqual(bodies.map((body) => body.reasoning_profile), ["decision", "decision", undefined]);
    assert.deepEqual(bodies[0].reasoning, { enabled: true, effort: "low" });
    assert.deepEqual(bodies[2].reasoning, { enabled: false });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("空日总结不会保存原始 JSON，也不会触发第二次模型调用", async () => {
  const [{ createInitialGameState, generateDailySummary }, { getI18n }] = await Promise.all([
    import("./game-master"),
    import("@/i18n/translator"),
  ]);
  const state = createInitialGameState();
  state.phase = "DAY_RESOLVE";
  state.day = 1;
  const { t } = getI18n();
  state.messages = [{
    id: "day-break",
    playerId: "system",
    playerName: t("speakers.system"),
    timestamp: Date.now(),
    day: 1,
    phase: "DAY_START",
    isSystem: true,
    content: t("system.dayBreak"),
  } satisfies ChatMessage];

  const originalFetch = globalThis.fetch;
  const requestBodies: Array<{
    response_format?: { type?: string };
    messages?: Array<{ role?: string; content?: string | unknown[] }>;
  }> = [];
  globalThis.fetch = async (input, init) => {
    if (requestUrl(input) === "/api/demo-config") {
      return Response.json({ active: false, enabled: false });
    }
    requestBodies.push(JSON.parse(String(init?.body)));
    return completionResponse('{"bullets":[]}');
  };

  try {
    const result = await generateDailySummary(state);
    assert.equal(requestBodies.length, 1);
    assert.equal(requestBodies[0].response_format?.type, "json_schema");
    const systemPrompt = requestBodies[0].messages?.find((message) => message.role === "system")?.content;
    assert.equal(typeof systemPrompt, "string");
    assert.match(String(systemPrompt), /当天未竞选就只写‘当天无警长竞选’/);
    assert.match(String(systemPrompt), /死因未公开/);
    assert.deepEqual(result.bullets, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("通用 JSON 解析失败时不静默重放付费请求", async () => {
  const { generateJSON } = await import("./llm");
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    if (requestUrl(input) === "/api/demo-config") {
      return Response.json({ active: false, enabled: false });
    }
    calls += 1;
    return completionResponse("not-json");
  };

  try {
    await assert.rejects(() => generateJSON({
      model: "deepseek-v4-flash-0731",
      messages: [{ role: "user", content: "return json" }],
    }));
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
