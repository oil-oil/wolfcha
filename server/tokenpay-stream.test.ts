import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "test-publishable-key";

test("completion stream stops at the OpenAI DONE marker even if upstream stays open", async () => {
  const { supabase } = await import("@/lib/supabase");
  const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
  const originalFetch = globalThis.fetch;

  Object.defineProperty(supabase.auth, "getSession", {
    configurable: true,
    value: async () => ({
      data: { session: { access_token: "test-access-token" } },
      error: null,
    }),
  });

  globalThis.fetch = async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n',
          ),
        );
      },
    });
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    const { generateCompletionStream } = await import("@/lib/llm");
    const chunks: string[] = [];
    await Promise.race([
      (async () => {
        for await (const chunk of generateCompletionStream({
          model: "glm-5.3-flash",
          messages: [{ role: "user", content: "hello" }],
        })) {
          chunks.push(chunk);
        }
      })(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("stream did not stop at DONE")), 500);
      }),
    ]);
    assert.deepEqual(chunks, ["ok"]);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(supabase.auth, "getSession", {
      configurable: true,
      value: originalGetSession,
    });
  }
});

test("completion stream cancels upstream when the consumer exits early", async () => {
  const { supabase } = await import("@/lib/supabase");
  const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
  const originalFetch = globalThis.fetch;
  let cancelled = false;

  Object.defineProperty(supabase.auth, "getSession", {
    configurable: true,
    value: async () => ({
      data: { session: { access_token: "test-access-token" } },
      error: null,
    }),
  });

  globalThis.fetch = async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"first"}}]}\n\n',
          ),
        );
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    const { generateCompletionStream } = await import("@/lib/llm");
    for await (const chunk of generateCompletionStream({
      model: "glm-5.3-flash",
      messages: [{ role: "user", content: "hello" }],
    })) {
      assert.equal(chunk, "first");
      break;
    }
    assert.equal(cancelled, true);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(supabase.auth, "getSession", {
      configurable: true,
      value: originalGetSession,
    });
  }
});

test("completion stream flushes split UTF-8 and accepts a final DONE frame without newline", async () => {
  const { supabase } = await import("@/lib/supabase");
  const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
  const originalFetch = globalThis.fetch;

  Object.defineProperty(supabase.auth, "getSession", {
    configurable: true,
    value: async () => ({
      data: { session: { access_token: "test-access-token" } },
      error: null,
    }),
  });

  const encoded = new TextEncoder().encode(
    'data: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]',
  );
  const splitAt = encoded.indexOf(0xe5) + 1;
  globalThis.fetch = async () => new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, splitAt));
        controller.enqueue(encoded.slice(splitAt));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

  try {
    const { generateCompletionStream } = await import("@/lib/llm");
    const chunks: string[] = [];
    for await (const chunk of generateCompletionStream({
      model: "glm-5.3-flash",
      messages: [{ role: "user", content: "hello" }],
    })) {
      chunks.push(chunk);
    }
    assert.equal(chunks.join(""), "好");
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(supabase.auth, "getSession", {
      configurable: true,
      value: originalGetSession,
    });
  }
});

test("completion stream rejects EOF before the DONE marker", async () => {
  const { supabase } = await import("@/lib/supabase");
  const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
  const originalFetch = globalThis.fetch;

  Object.defineProperty(supabase.auth, "getSession", {
    configurable: true,
    value: async () => ({
      data: { session: { access_token: "test-access-token" } },
      error: null,
    }),
  });
  globalThis.fetch = async () => new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
        ));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

  try {
    const { generateCompletionStream } = await import("@/lib/llm");
    await assert.rejects(async () => {
      for await (const chunk of generateCompletionStream({
        model: "glm-5.3-flash",
        messages: [{ role: "user", content: "hello" }],
      })) {
        void chunk;
      }
    }, /\[DONE\] 前意外结束/);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(supabase.auth, "getSession", {
      configurable: true,
      value: originalGetSession,
    });
  }
});

test("completion stream rejects malformed complete SSE data frames", async () => {
  const { supabase } = await import("@/lib/supabase");
  const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
  const originalFetch = globalThis.fetch;

  Object.defineProperty(supabase.auth, "getSession", {
    configurable: true,
    value: async () => ({
      data: { session: { access_token: "test-access-token" } },
      error: null,
    }),
  });
  globalThis.fetch = async () => new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: {not-json}\n\ndata: [DONE]\n\n"));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

  try {
    const { generateCompletionStream } = await import("@/lib/llm");
    await assert.rejects(async () => {
      for await (const chunk of generateCompletionStream({
        model: "glm-5.3-flash",
        messages: [{ role: "user", content: "hello" }],
      })) {
        void chunk;
      }
    }, /无法解析的 SSE 数据帧/);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(supabase.auth, "getSession", {
      configurable: true,
      value: originalGetSession,
    });
  }
});

test("stream protocol quota errors are surfaced instead of silently retried", async () => {
  const { readStreamProtocolError } = await import("@/lib/llm");
  const error = readStreamProtocolError({
    error: {
      code: "insufficient_quota",
      message: "用户额度不足",
    },
  });
  assert.match(error ?? "", /\[QUOTA_EXHAUSTED\]/);
});

test("expired game sessions are not mislabeled as exhausted balances", async () => {
  const {
    isGameSessionExpiredMessage,
    isQuotaExhaustedMessage,
    readStreamProtocolError,
  } = await import("@/lib/llm");
  const error = readStreamProtocolError({
    error: {
      code: "game_session_expired",
      message: "Game session authorization expired",
    },
  });
  assert.equal(isGameSessionExpiredMessage(error ?? ""), true);
  assert.equal(isQuotaExhaustedMessage(error ?? ""), false);
});
