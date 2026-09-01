import assert from "node:assert/strict";
import test from "node:test";
import { setLocale } from "@/i18n/locale-store";
import type { GameState, Player } from "@/types/game";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "badge-signup-test-key";

setLocale("zh");

const makePlayer = (
  playerId: string,
  seat: number,
  role: Player["role"]
): Player => ({
  playerId,
  seat,
  displayName: `玩家${seat + 1}`,
  alive: true,
  role,
  alignment: role === "Werewolf" || role === "WhiteWolfKing" ? "wolf" : "village",
  isHuman: false,
});

const makeState = (players: Player[]): GameState => {
  return {
    gameId: "badge-signup-test",
    phase: "DAY_BADGE_SIGNUP",
    day: 1,
    difficulty: "normal",
    players,
    events: [],
    messages: [],
    currentSpeakerSeat: null,
    daySpeechStartSeat: null,
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
    nightActions: {
      seerHistory: [{ targetSeat: 1, isWolf: true, day: 1 }],
      lastGuardTarget: 0,
    },
    roleAbilities: {
      witchHealUsed: false,
      witchPoisonUsed: false,
      hunterCanShoot: true,
      idiotRevealed: false,
      whiteWolfKingBoomUsed: false,
    },
    winner: null,
  };
};

const requestText = (request: { messages: Array<{ content: string | unknown[] }> }): string =>
  request.messages
    .map((message) => {
      if (typeof message.content === "string") return message.content;
      return message.content
        .map((part) => {
          if (typeof part === "object" && part !== null && "text" in part) {
            return String((part as { text: unknown }).text);
          }
          return "";
        })
        .join("\n");
    })
    .join("\n");

test("警徽报名批处理为每个玩家建立独立 Prompt，并按返回顺序映射结果", async () => {
  const { generateAIBadgeSignupBatch } = await import("./game-master");
  const players = [
    makePlayer("seer", 0, "Seer"),
    makePlayer("guard", 1, "Guard"),
  ];
  const state = makeState(players);
  const originalFetch = globalThis.fetch;
  let requestBody: { requests: Array<{ messages: Array<{ content: string | unknown[] }> }> } | undefined;

  globalThis.fetch = async (_input, init) => {
    if (!init?.body) {
      return new Response(JSON.stringify({ active: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const body = JSON.parse(String(init.body)) as {
      requests: Array<{ messages: Array<{ content: string | unknown[] }> }>;
    };
    requestBody = body;
    return new Response(JSON.stringify({
      results: body.requests.map((_, index) => ({
        ok: true,
        data: {
          id: `badge-${index}`,
          choices: [{
            message: { role: "assistant", content: index === 0 ? "1" : "0" },
            finish_reason: "stop",
          }],
        },
      })),
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const result = await generateAIBadgeSignupBatch(state, players);

    const requests = requestBody?.requests;
    assert.ok(requests);
    assert.equal(requests.length, players.length);
    assert.deepEqual(result, { seer: true, guard: false });

    const seerPrompt = requestText(requests[0]);
    const guardPrompt = requestText(requests[1]);
    assert.match(seerPrompt, /<your_seer_checks>/);
    assert.doesNotMatch(seerPrompt, /<your_guard_info>/);
    assert.match(guardPrompt, /<your_guard_info>/);
    assert.doesNotMatch(guardPrompt, /<your_seer_checks>/);
    assert.match(seerPrompt, /警徽竞选报名环节/);
    assert.match(guardPrompt, /警徽竞选报名环节/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("警徽报名单个响应非法或失败时只将对应玩家判为不上警", async () => {
  const { generateAIBadgeSignupBatch } = await import("./game-master");
  const players = [
    makePlayer("p1", 0, "Villager"),
    makePlayer("p2", 1, "Villager"),
    makePlayer("p3", 2, "Villager"),
  ];
  const state = makeState(players);
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(JSON.stringify({
    results: [
      {
        ok: true,
        data: {
          id: "badge-0",
          choices: [{ message: { role: "assistant", content: "1" }, finish_reason: "stop" }],
        },
      },
      {
        ok: true,
        data: {
          id: "badge-1",
          choices: [{ message: { role: "assistant", content: "maybe" }, finish_reason: "stop" }],
        },
      },
      { ok: false, error: "player request failed" },
    ],
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const result = await generateAIBadgeSignupBatch(state, players);
    assert.deepEqual(result, { p1: true, p2: false, p3: false });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
