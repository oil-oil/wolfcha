import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";

import { getTokenPayGatewayUrl, TOKENPAY_GATEWAY_URL } from "@/lib/tokenpay-config";
import { PROJECT_MODELS, type ModelRef } from "@/types/game";

const ORIGIN = "https://wolfcha.example.test";
const DATABASE_ORIGIN = "https://database.example.test";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const LEGACY_BASE_URL = "https://evil.example.test/v1";
const messages = [{ role: "user" as const, content: "返回测试结果" }];
const completion = {
  choices: [{ message: { role: "assistant", content: "测试结果" }, finish_reason: "stop" }],
};

type RecordedRequest = {
  url: URL;
  method: string;
  headers: Headers;
  body: Record<string, unknown>;
};

function streamResponse(): Response {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: "测试结果" } }] })}\n\ndata: [DONE]\n\n`,
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

test("上游网关固定、Key 校验鉴权与服务商模型配对（离线）", async (t) => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: DATABASE_ORIGIN,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: "test-publishable-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    TOKENDANCE_API_KEY: "test-project-tokendance-key",
    DASHSCOPE_API_KEY: "test-project-dashscope-key",
    ZENMUX_API_KEY: "test-project-zenmux-key",
    TOKENPAY_APP_URL: ORIGIN,
    TOKENDANCE_BASE_URL: undefined,
  };
  const originalEnv = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: RecordedRequest[] = [];
  const unexpectedRequests: string[] = [];
  const upstreamRequests = () => requests.filter(({ url }) => url.pathname.endsWith("/chat/completions"));

  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), ORIGIN);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    requests.push({ url, method, headers, body });

    if (url.origin === DATABASE_ORIGIN) {
      if (url.pathname === "/auth/v1/user") {
        if (headers.get("authorization") !== "Bearer test-user-token") {
          return Response.json({ message: "Invalid test token" }, { status: 401 });
        }
        return Response.json({ id: USER_ID });
      }
      if (url.pathname === "/rest/v1/demo_config") {
        return Response.json({ enabled: false, starts_at: null, expires_at: null });
      }
      if (url.pathname === "/rest/v1/game_sessions") {
        assert.equal(url.searchParams.get("user_id"), `eq.${USER_ID}`);
        assert.equal(url.searchParams.get("id"), `eq.${SESSION_ID}`);
        if (method === "GET") {
          assert.equal(url.searchParams.get("credit_authorized"), "eq.true");
          assert.equal(url.searchParams.get("used_custom_key"), "eq.false");
        }
        return Response.json([{ id: SESSION_ID }]);
      }
      if (url.pathname === "/rest/v1/rpc/record_game_session_ai_attempt") {
        return Response.json([{ event_id: body.p_event_id, replayed: false }]);
      }
    }

    const providerUrls = [
      `${TOKENPAY_GATEWAY_URL}/chat/completions`,
      `${getTokenPayGatewayUrl()}/chat/completions`,
      "https://zenmux.ai/api/v1/chat/completions",
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    ];
    if (providerUrls.includes(url.href)) {
      return body.stream ? streamResponse() : Response.json(completion);
    }
    if (url.origin === ORIGIN && url.pathname === "/api/chat") {
      if (Array.isArray(body.requests)) {
        return Response.json({ results: body.requests.map(() => ({ ok: true, data: completion })) });
      }
      return body.stream ? streamResponse() : Response.json(completion);
    }
    if (url.origin === ORIGIN && url.pathname === "/api/validate-key") {
      return Response.json({ valid: true });
    }

    unexpectedRequests.push(`${method} ${url.origin}${url.pathname}`);
    throw new Error("Unexpected fixture request");
  };

  try {
    const { POST: chat } = await import("@/app/api/chat/route");
    const { POST: voteBatch } = await import("@/app/api/vote-batch/route");
    const { POST: validateKey } = await import("@/app/api/validate-key/route");
    const llm = await import("@/lib/llm");
    const apiKeys = await import("@/lib/api-keys");
    const { supabase } = await import("@/lib/supabase");
    t.mock.method(supabase.auth, "getSession", async () => ({
      data: { session: { access_token: "test-user-token" } }, error: null,
    }));
    t.mock.method(console, "error", () => undefined);

    const values = new Map<string, string>();
    const localStorage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => { values.delete(key); },
      setItem: (key, value) => { values.set(key, value); },
    };
    const fakeWindow = Object.assign(new EventTarget(), { localStorage });
    Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });

    const request = (path: string, body?: unknown, headers: Record<string, string> = {}) => new NextRequest(
      `${ORIGIN}${path}`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-user-token",
          "Content-Type": "application/json",
          "X-Game-Session-Id": SESSION_ID,
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    const builtIn = PROJECT_MODELS.find((ref) => ref.provider === "tokendance")!;

    for (const mode of ["single", "stream", "batch"] as const) {
      await t.test(`chat ${mode}：旧地址头被忽略，使用默认网关`, async () => {
        requests.length = 0;
        const payload = { ...builtIn, messages, ...(mode === "stream" ? { stream: true } : {}) };
        const response = await chat(request("/api/chat", mode === "batch" ? { requests: [payload] } : payload, {
          "X-Tokendance-Base-Url": LEGACY_BASE_URL,
        }));
        assert.equal(response.status, 200);
        if (mode === "batch") {
          assert.deepEqual((await response.json()).results, [{ ok: true, data: completion }]);
        } else if (mode === "stream") {
          assert.match(await response.text(), /\[DONE\]/);
        } else {
          assert.deepEqual(await response.json(), completion);
        }
        const sent = upstreamRequests();
        assert.equal(sent.length, 1);
        assert.equal(sent[0].url.href, `${TOKENPAY_GATEWAY_URL}/chat/completions`);
        assert.equal(sent[0].headers.get("authorization"), "Bearer test-project-tokendance-key");
        assert.equal(sent[0].headers.has("X-Tokendance-Base-Url"), false);
      });
    }

    await t.test("vote-batch：不转发旧地址头，保留鉴权及用户 Key", async () => {
      requests.length = 0;
      const response = await voteBatch(request("/api/vote-batch", {
        requests: [{ voterId: "voter-fixture", ...builtIn, messages }],
      }, { "X-Tokendance-Base-Url": LEGACY_BASE_URL, "X-Tokendance-Api-Key": "test-user-key" }));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).results[0].voterId, "voter-fixture");
      const sent = requests.find(({ url }) => url.pathname === "/api/chat")!;
      assert.equal(sent.headers.has("X-Tokendance-Base-Url"), false);
      assert.equal(sent.headers.get("Authorization"), "Bearer test-user-token");
      assert.equal(sent.headers.get("X-Tokendance-Api-Key"), "test-user-key");
      assert.equal(sent.headers.get("X-Game-Session-Id"), SESSION_ID);
    });

    await t.test("validate-key：无登录令牌返回 401，fetch 零调用", async () => {
      const unauthenticatedHeaders: Record<string, string>[] = [{}, { "X-Guest-Id": "guest_fixture" }];
      for (const extraHeaders of unauthenticatedHeaders) {
        requests.length = 0;
        const response = await validateKey(new NextRequest(`${ORIGIN}/api/validate-key`, {
          method: "POST",
          headers: {
            "X-Tokendance-Api-Key": "test-user-key",
            "X-Tokendance-Base-Url": LEGACY_BASE_URL,
            ...extraHeaders,
          },
        }));
        assert.equal(response.status, 401);
        assert.equal(requests.length, 0);
      }
    });

    await t.test("validate-key：无效登录令牌返回 401，不调用模型", async () => {
      requests.length = 0;
      const response = await validateKey(request("/api/validate-key", undefined, {
        Authorization: "Bearer test-invalid-token",
        "X-Tokendance-Api-Key": "test-user-key",
      }));
      assert.equal(response.status, 401);
      assert.equal(upstreamRequests().length, 0);
      assert.ok(requests.every(({ url }) => url.pathname === "/auth/v1/user"));
    });

    await t.test("validate-key：已认证用户的 Key 使用固定默认网关", async () => {
      requests.length = 0;
      const response = await validateKey(request("/api/validate-key", undefined, {
        "X-Tokendance-Api-Key": "test-user-key",
        "X-Tokendance-Base-Url": LEGACY_BASE_URL,
      }));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { valid: true, results: [{ provider: "tokendance", valid: true }] });
      const sent = upstreamRequests();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].url.href, `${TOKENPAY_GATEWAY_URL}/chat/completions`);
      assert.equal(sent[0].headers.get("authorization"), "Bearer test-user-key");
      assert.equal(sent[0].headers.has("X-Tokendance-Base-Url"), false);
      assert.equal(requests[0].url.pathname, "/auth/v1/user");
    });

    await t.test("服务端配置的网关在 chat 与 validate-key 中一致生效", async () => {
      process.env.TOKENDANCE_BASE_URL = "https://gateway.example.test/v1/";
      try {
        for (const mode of ["single", "batch", "validation"] as const) {
          requests.length = 0;
          const payload = { ...builtIn, messages };
          const response = mode === "validation"
            ? await validateKey(request("/api/validate-key", undefined, {
              "X-Tokendance-Api-Key": "test-user-key", "X-Tokendance-Base-Url": LEGACY_BASE_URL,
            }))
            : await chat(request("/api/chat", mode === "batch" ? { requests: [payload] } : payload, {
              "X-Tokendance-Base-Url": LEGACY_BASE_URL,
            }));
          assert.equal(response.status, 200);
          const result = await response.json();
          if (mode === "batch") assert.equal(result.results[0].ok, true);
          if (mode === "validation") assert.equal(result.valid, true);
          assert.equal(upstreamRequests().length, 1);
          assert.equal(upstreamRequests()[0].url.href, "https://gateway.example.test/v1/chat/completions");
        }
      } finally {
        delete process.env.TOKENDANCE_BASE_URL;
      }
    });

    for (const mode of ["single", "batch"] as const) {
      await t.test(`chat ${mode}：项目模型必须匹配服务商，用户 Key 仍可调用其他配对`, async () => {
        const providers = ["zenmux", "dashscope", "tokendance"] as const;
        for (const ref of PROJECT_MODELS) {
          for (const provider of providers) {
            requests.length = 0;
            const payload = { model: ref.model, provider, messages };
            const response = await chat(request("/api/chat", mode === "batch" ? { requests: [payload] } : payload));
            const matched = provider === ref.provider;
            if (mode === "batch") {
              assert.equal(response.status, 200);
              const [result] = (await response.json()).results;
              assert.equal(result.ok, matched);
              if (!matched) assert.equal(result.status, 401);
            } else {
              assert.equal(response.status, matched ? 200 : 401);
              await response.json();
            }
            assert.equal(upstreamRequests().length, matched ? 1 : 0);
          }
        }
        requests.length = 0;
        const payload = { model: builtIn.model, provider: "dashscope", messages };
        const response = await chat(request("/api/chat", mode === "batch" ? { requests: [payload] } : payload, {
          "X-Dashscope-Api-Key": "test-user-dashscope-key",
        }));
        assert.equal(response.status, 200);
        const result = await response.json();
        if (mode === "batch") assert.equal(result.results[0].ok, true);
        assert.equal(upstreamRequests().length, 1);
        assert.equal(upstreamRequests()[0].headers.get("authorization"), "Bearer test-user-dashscope-key");
      });
    }

    for (const provider of ["tokendance", "dashscope"] as const) {
      await t.test(`自有 Key：同名模型优先选择已配置的 ${provider}`, () => {
        values.clear();
        apiKeys.setModelSource("custom");
        if (provider === "tokendance") apiKeys.setTokendanceApiKey("test-user-tokendance-key");
        else apiKeys.setDashscopeApiKey("test-user-dashscope-key");
        assert.deepEqual(llm.resolveRequestModelForSource("custom", "deepseek-v3.2"), {
          model: "deepseek-v3.2", provider,
        });
        assert.equal(llm.resolveApiKeySource("deepseek-v3.2"), "user");
      });
    }

    await t.test("自有 Key：无 Key 或均配置时保留原顺序，显式服务商优先", () => {
      values.clear();
      apiKeys.setModelSource("custom");
      assert.equal(llm.resolveRequestModelForSource("custom", "deepseek-v3.2").provider, "dashscope");
      apiKeys.setTokendanceApiKey("test-user-tokendance-key");
      assert.equal(llm.resolveRequestModelForSource("custom", "deepseek-v3.2", "dashscope").provider, "dashscope");
      apiKeys.setDashscopeApiKey("test-user-dashscope-key");
      assert.equal(llm.resolveRequestModelForSource("custom", "deepseek-v3.2").provider, "dashscope");
    });

    await t.test("内置及 TokenPay 来源不受本地服务商 Key 影响", () => {
      values.clear();
      apiKeys.setModelSource("custom");
      apiKeys.setTokendanceApiKey("test-user-tokendance-key");
      assert.deepEqual(llm.resolveRequestModelForSource("project", "deepseek-v3.2", "tokendance"), {
        model: "deepseek-v3.2", provider: "dashscope",
      });
      assert.deepEqual(llm.resolveRequestModelForSource("tokenpay", "deepseek-v3.2", "dashscope"), {
        model: builtIn.model, provider: builtIn.provider,
      });
    });

    await t.test("客户端 Key 校验携带登录凭据，不发送旧地址头", async () => {
      values.clear();
      apiKeys.setModelSource("custom");
      apiKeys.setTokendanceApiKey("test-user-tokendance-key");
      requests.length = 0;
      assert.deepEqual(await apiKeys.validateApiKeyBalance(), { valid: true });
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url.pathname, "/api/validate-key");
      assert.equal(requests[0].headers.get("Authorization"), "Bearer test-user-token");
      assert.equal(requests[0].headers.get("X-Tokendance-Api-Key"), "test-user-tokendance-key");
      assert.equal(requests[0].headers.has("X-Tokendance-Base-Url"), false);
    });

    await t.test("客户端普通、流式和批量请求使用已配置服务商，不发送旧地址头", async () => {
      values.clear();
      apiKeys.setModelSource("custom");
      apiKeys.setTokendanceApiKey("test-user-tokendance-key");
      requests.length = 0;
      const options = { model: "deepseek-v3.2", messages };
      assert.equal((await llm.generateCompletion(options)).content, "测试结果");
      assert.equal((await llm.generateCompletionBatch([options]))[0].ok, true);
      let speech = "";
      for await (const chunk of llm.generateCompletionStream(options)) speech += chunk;
      assert.equal(speech, "测试结果");
      assert.equal(requests.length, 3);
      for (const sent of requests) {
        assert.equal(sent.headers.has("X-Tokendance-Base-Url"), false);
        assert.equal(sent.headers.get("Authorization"), "Bearer test-user-token");
        assert.equal(sent.headers.get("X-Tokendance-Api-Key"), "test-user-tokendance-key");
        const payload = Array.isArray(sent.body.requests) ? sent.body.requests[0] as ModelRef : sent.body;
        assert.equal(payload.model, "deepseek-v3.2");
        assert.equal(payload.provider, "tokendance");
      }
    });

    await t.test("所有相关客户端入口均不再生成旧地址头", () => {
      for (const path of [
        "src/lib/llm.ts", "src/lib/api-keys.ts", "src/hooks/useCredits.ts",
        "src/lib/audio-manager.ts", "src/components/game/UserProfileModal.tsx",
      ]) {
        assert.doesNotMatch(readFileSync(path, "utf8"), /X-Tokendance-Base-Url|getTokendanceBaseUrl/i);
      }
    });

    assert.deepEqual(unexpectedRequests, [], "所有 fetch 都必须由 fixture 明确处理");
  } finally {
    t.mock.restoreAll();
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
