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
