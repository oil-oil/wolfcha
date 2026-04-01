import { describe, it, expect } from "vitest";

/**
 * Integration tests for the MiniMax direct LLM provider.
 *
 * These tests verify the end-to-end request construction and API contract
 * without making actual API calls (they validate the shape/logic).
 * Set MINIMAX_API_KEY env var to run live tests.
 */

const MINIMAX_CHAT_COMPLETIONS_URL = "https://api.minimax.io/v1/chat/completions";

function buildMinimaxRequest(options: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  apiKey: string;
}): { url: string; init: RequestInit } {
  const cappedTemperature = Math.min(
    Math.max(0.01, options.temperature ?? 0.7),
    1
  );

  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    temperature: cappedTemperature,
  };

  if (options.max_tokens !== undefined) {
    body.max_tokens = Math.max(16, Math.floor(options.max_tokens));
  }

  if (options.stream) {
    body.stream = true;
  }

  return {
    url: MINIMAX_CHAT_COMPLETIONS_URL,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  };
}

describe("MiniMax integration - request construction", () => {
  const apiKey = "test-api-key";

  it("constructs correct request for MiniMax-M2.7", () => {
    const { url, init } = buildMinimaxRequest({
      model: "MiniMax-M2.7",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 1,
      apiKey,
    });

    expect(url).toBe("https://api.minimax.io/v1/chat/completions");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-api-key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("MiniMax-M2.7");
    expect(body.temperature).toBe(1);
    expect(body.messages).toHaveLength(1);
  });

  it("constructs correct request for MiniMax-M2.7-highspeed", () => {
    const { init } = buildMinimaxRequest({
      model: "MiniMax-M2.7-highspeed",
      messages: [
        { role: "system", content: "You are a werewolf player." },
        { role: "user", content: "Who do you want to kill?" },
      ],
      temperature: 0.8,
      max_tokens: 500,
      apiKey,
    });

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("MiniMax-M2.7-highspeed");
    expect(body.temperature).toBe(0.8);
    expect(body.max_tokens).toBe(500);
    expect(body.messages).toHaveLength(2);
  });

  it("clamps temperature to (0.01, 1] range", () => {
    // Temperature = 0 should become 0.01
    const { init: init1 } = buildMinimaxRequest({
      model: "MiniMax-M2.7",
      messages: [{ role: "user", content: "test" }],
      temperature: 0,
      apiKey,
    });
    expect(JSON.parse(init1.body as string).temperature).toBe(0.01);

    // Temperature > 1 should become 1
    const { init: init2 } = buildMinimaxRequest({
      model: "MiniMax-M2.7",
      messages: [{ role: "user", content: "test" }],
      temperature: 2,
      apiKey,
    });
    expect(JSON.parse(init2.body as string).temperature).toBe(1);
  });

  it("sets stream=true when streaming is requested", () => {
    const { init } = buildMinimaxRequest({
      model: "MiniMax-M2.7",
      messages: [{ role: "user", content: "test" }],
      stream: true,
      apiKey,
    });

    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(true);
  });

  it("enforces minimum max_tokens of 16", () => {
    const { init } = buildMinimaxRequest({
      model: "MiniMax-M2.7",
      messages: [{ role: "user", content: "test" }],
      max_tokens: 5,
      apiKey,
    });

    const body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBe(16);
  });
});

describe("MiniMax integration - live API", () => {
  const apiKey = process.env.MINIMAX_API_KEY;

  it.skipIf(!apiKey)(
    "sends a chat completion request to MiniMax API",
    { timeout: 30000 },
    async () => {
      const { url, init } = buildMinimaxRequest({
        model: "MiniMax-M2.7-highspeed",
        messages: [{ role: "user", content: "Say 'hello' in one word." }],
        temperature: 0.5,
        max_tokens: 32,
        apiKey: apiKey!,
      });

      const response = await fetch(url, init);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.choices).toBeDefined();
      expect(data.choices.length).toBeGreaterThan(0);
      expect(data.choices[0].message.content).toBeTruthy();
    }
  );

  it.skipIf(!apiKey)(
    "handles streaming response from MiniMax API",
    { timeout: 30000 },
    async () => {
      const { url, init } = buildMinimaxRequest({
        model: "MiniMax-M2.7-highspeed",
        messages: [{ role: "user", content: "Count to 3." }],
        temperature: 0.5,
        max_tokens: 64,
        stream: true,
        apiKey: apiKey!,
      });

      const response = await fetch(url, init);
      expect(response.ok).toBe(true);
      expect(response.headers.get("content-type")).toContain("text/event-stream");

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      const decoder = new TextDecoder();
      let gotData = false;
      let chunks = 0;

      while (chunks < 50) {
        const { done, value } = await reader!.read();
        if (done) break;
        chunks++;
        const text = decoder.decode(value, { stream: true });
        if (text.includes("data:")) {
          gotData = true;
        }
      }

      expect(gotData).toBe(true);
    }
  );

  it.skipIf(!apiKey)(
    "rejects invalid API key with 401",
    { timeout: 15000 },
    async () => {
      const { url, init } = buildMinimaxRequest({
        model: "MiniMax-M2.7-highspeed",
        messages: [{ role: "user", content: "test" }],
        apiKey: "invalid-key-12345",
      });

      const response = await fetch(url, init);
      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    }
  );
});
