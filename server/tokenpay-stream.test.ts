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
