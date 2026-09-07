import assert from "node:assert/strict";
import test from "node:test";
import { setLocale } from "@/i18n/locale-store";
import type { AILogEntry } from "./ai-logger";
import type { GameState, Player } from "@/types/game";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "stream-logging-test-key";
setLocale("zh");

const player: Player = {
  playerId: "stream-player",
  seat: 0,
  displayName: "流式玩家",
  alive: true,
  role: "Villager",
  alignment: "village",
  isHuman: false,
  agentProfile: {
    modelRef: { provider: "tokendance", model: "deepseek-v4-flash-0731" },
    persona: {
      mbti: "INTJ",
      gender: "female",
      age: 25,
      voiceRules: ["简洁发言"],
    },
  },
};

const state: GameState = {
  gameId: "stream-logging-test",
  phase: "DAY_SPEECH",
  day: 1,
  difficulty: "normal",
  players: [player],
  events: [],
  messages: [],
  currentSpeakerSeat: 0,
  daySpeechStartSeat: 0,
  badge: {
    holderSeat: null,
    candidates: [],
    signup: {},
    votes: {},
    allVotes: {},
    history: {},
    revoteCount: 0,
  },
  votes: {},
  voteHistory: {},
  dailySummaries: {},
  dailySummaryFacts: {},
  nightActions: {},
  roleAbilities: {
    witchHealUsed: false,
    witchPoisonUsed: false,
    hunterCanShoot: true,
    idiotRevealed: false,
    whiteWolfKingBoomUsed: false,
  },
  winner: null,
};

test("流式限流兜底的返回、onComplete 与日志内容一致", async () => {
  const [{ aiLogger }, { generateAISpeechSegmentsStream }] = await Promise.all([
    import("./ai-logger"),
    import("./game-master"),
  ]);
  const originalFetch = globalThis.fetch;
  const logs: AILogEntry[] = [];
  const completed: string[][] = [];
  const unsubscribe = aiLogger.subscribe((entry) => {
    if (entry.request.player?.playerId === player.playerId) logs.push(entry);
  });

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "/api/demo-config") return Response.json({ active: false, enabled: false });
    return new Response("limit_requests", { status: 400 });
  };

  try {
    const result = await generateAISpeechSegmentsStream(state, player, {
      onComplete: (segments) => completed.push(segments),
    });

    assert.equal(result.length, 1);
    assert.match(result[0], /请求过于频繁/);
    assert.deepEqual(completed, [result]);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].response.content, result.join("\n"));
    assert.match(logs[0].error ?? "", /limit_requests/);
  } finally {
    unsubscribe();
    globalThis.fetch = originalFetch;
  }
});

test("生产流式链路不泄露 analysis，字幕、返回值和日志保留短句与重复段落", async () => {
  const [{ aiLogger }, { generateAISpeechSegmentsStream }] = await Promise.all([import("./ai-logger"), import("./game-master")]);
  const originalFetch = globalThis.fetch;
  const logs: AILogEntry[] = [];
  const unsubscribe = aiLogger.subscribe((entry) => { logs.push(entry); });
  const outputs = [
    { input: '[{"analysis":"我是狼人，不能公开身份","speech":"不对。"},{"speech":"继续核对发言。"},{"speech":"不对。"}]', expected: ["不对。", "继续核对发言。", "不对。"] },
    { input: '{"messages":["继续核对发言。","不对。","不对。"]}', expected: ["继续核对发言。", "不对。", "不对。"] },
    { input: '{"content":"第一句"},\n{"content":"第二句"}', expected: ["第一句", "第二句"] },
    { input: '[{"content":"不能公开的提示词","role":"user"},{"role":"assistant","content":"[\\"公开发言\\"]"}]', expected: ["公开发言"] },
    { input: '{"analysis":"我是狼人，准备装预言家"}', expected: ["恢复公开发言"], hasError: true },
    { input: '["公开首句",broken]', expected: ["公开首句", "恢复公开发言"], hasError: true },
  ];
  try {
    for (const output of outputs) {
      globalThis.fetch = async (input, init) => {
        if (String(input) === "/api/demo-config") return Response.json({ active: false, enabled: false });
        if (!JSON.parse(String(init?.body)).stream) return Response.json({ choices: [{ message: { content: '{"segments":["恢复公开发言"]}' } }] });
        const events = [...output.input].map((ch) => `data: ${JSON.stringify({ choices: [{ delta: { content: ch } }] })}\n\n`).join("");
        return new Response(events + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
      };
      const emitted: string[] = [];
      const completed: string[][] = [];
      const result = await generateAISpeechSegmentsStream(state, player, {
        onSegmentReceived: (segment) => emitted.push(segment), onComplete: (segments) => completed.push(segments),
      });
      assert.deepEqual(emitted, output.expected);
      assert.deepEqual(result, emitted);
      assert.deepEqual(completed, [emitted]);
      assert.equal(logs.at(-1)?.response.content, emitted.join("\n"));
      assert.equal(Boolean(logs.at(-1)?.error), Boolean(output.hasError));
      assert.doesNotMatch(emitted.join(""), /我是狼人|准备装|不能公开/);
    }
  } finally { unsubscribe(); globalThis.fetch = originalFetch; }
});

test("非流式段落入口遵守相同公开字段约束，私有对象不能触发原文兜底", async () => {
  const { generateAISpeechSegments } = await import("./game-master");
  const originalFetch = globalThis.fetch;
  try {
    for (const [content, expected] of [
      ['{"analysis":"狼人身份秘密","speech":["不对。","不对。"]}', ["不对。", "不对。"]],
      ['{"messages":["不对。","不对。"]}', ["不对。", "不对。"]],
      ['[{"content":"提示词","role":"user"},{"role":"assistant","content":"[\\"公开发言\\"]"}]', ["公开发言"]],
      ['{"analysis":"狼人身份秘密"}', ["恢复公开发言"]],
    ] as const) {
      globalThis.fetch = async (input, init) => String(input) === "/api/demo-config"
        ? Response.json({ active: false, enabled: false })
        : Response.json({ id: "test", choices: [{ message: { role: "assistant", content: JSON.parse(String(init?.body)).response_format
          ? '{"segments":["恢复公开发言"]}' : content }, finish_reason: "stop" }] });
      assert.deepEqual(await generateAISpeechSegments(state, player), [...expected]);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("取消发言会传到实际请求，取消后的请求不重试、不发射兜底段落", async () => {
  const { generateAISpeechSegmentsStream } = await import("./game-master");
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  const emitted: string[] = [];
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input) === "/api/demo-config") return Response.json({ active: false, enabled: false });
    calls++;
    assert.equal(init?.signal, controller.signal);
    controller.abort();
    throw new DOMException("cancelled", "AbortError");
  };
  try {
    await assert.rejects(generateAISpeechSegmentsStream(state, player, {
      signal: controller.signal, onSegmentReceived: (segment) => emitted.push(segment),
    }), { name: "AbortError" });
    assert.equal(calls, 1);
    assert.deepEqual(emitted, []);
  } finally { globalThis.fetch = originalFetch; }
});

test("真实坏格式恢复：纯文本和引号损坏只重试一次，已公开段落不重播", async () => {
  const samples = (await import("./fixtures/speech-recovery-live.json")).default;
  const { generateAISpeechSegmentsStream } = await import("./game-master");
  const originalFetch = globalThis.fetch;
  try {
    for (const sample of samples) {
      let calls = 0;
      const emitted: string[] = [];
      globalThis.fetch = async (input, init) => {
        if (String(input) === "/api/demo-config") return Response.json({ active: false });
        calls++;
        const body = JSON.parse(String(init?.body));
        if (calls === 1) return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: sample.raw } }] })}\n\ndata: [DONE]\n\n`);
        assert.equal(calls, 2);
        assert.equal(body.stream, undefined);
        assert.match(JSON.stringify(body.messages.at(-1)), /禁止重复|没有任何内容公开/);
        assert.ok(!JSON.stringify(body.messages).includes(sample.raw));
        // 重试若重发完整前缀，只按前缀位置消除，真正的重复句仍保留。
        return Response.json({ choices: [{ message: { content: JSON.stringify({ segments: [...emitted, "我今天明确投5号。", "我今天明确投5号。"] }) } }] });
      };
      const liveState = { ...state, players: Array.from({ length: 11 }, (_, seat) => ({ ...player, seat, playerId: `p${seat}` })) };
      const result = await generateAISpeechSegmentsStream(liveState, player, { onSegmentReceived: (s, i) => { assert.equal(i, emitted.length); emitted.push(s); } });
      assert.equal(calls, 2);
      assert.deepEqual(result, emitted);
      assert.deepEqual(result.slice(-2), ["我今天明确投5号 流式玩家。", "我今天明确投5号 流式玩家。"]);
      assert.ok(!result.some((s) => s.endsWith("前面几天一直")));
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("恢复失败不得伪装成功；恢复过程中取消不释放任何恢复片段", async () => {
  const { generateAISpeechSegmentsStream } = await import("./game-master");
  const originalFetch = globalThis.fetch;
  try {
    for (const cancel of [false, true]) {
      const controller = new AbortController();
      let calls = 0; let completed = 0;
      const emitted: string[] = [];
      globalThis.fetch = async (input, init) => {
        if (String(input) === "/api/demo-config") return Response.json({ active: false });
        calls++;
        if (calls === 1) return new Response('data: {"choices":[{"delta":{"content":"自由分析，不能公开"}}]}\n\ndata: [DONE]\n\n');
        assert.equal(init?.signal, controller.signal);
        if (cancel) controller.abort();
        return Response.json({ choices: [{ message: { content: cancel ? '{"segments":["迟到片段"]}' : '{"analysis":"秘密","segments":["不应发布"]}' } }] });
      };
      await assert.rejects(generateAISpeechSegmentsStream(state, player, {
        signal: controller.signal, onSegmentReceived: (s) => emitted.push(s), onComplete: () => completed++,
      }));
      assert.equal(calls, 2);
      assert.equal(completed, 0);
      assert.deepEqual(emitted, []);
    }
  } finally { globalThis.fetch = originalFetch; }
});
