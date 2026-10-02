import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

import { fetchZenmux, ZENMUX_CHAT_COMPLETIONS_URL } from "@/lib/server-zenmux";
import { getProviderNetworkError } from "@/lib/provider-network-error";
import { ZENMUX_VALIDATION_MODEL } from "@/types/game";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

const proxyEnvNames = [
  "ZENMUX_PROXY_URL", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy",
];

async function withProxyEnv(values: Record<string, string>, run: () => Promise<void>) {
  const previous = new Map(proxyEnvNames.map((name) => [name, process.env[name]]));
  try {
    for (const name of proxyEnvNames) delete process.env[name];
    Object.assign(process.env, values);
    await run();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function createTestProxy() {
  const connections: Array<{ authority: string; authorization?: string }> = [];
  const server = createServer();
  server.on("connect", (request, socket) => {
    connections.push({ authority: request.url || "", authorization: request.headers.authorization });
    // Stop before TLS or the real provider request: no external call or Key is sent.
    socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, connections, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

async function attemptProxyConnection() {
  await assert.rejects(fetchZenmux({
    method: "POST",
    headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" },
    body: JSON.stringify({ model: ZENMUX_VALIDATION_MODEL, messages: [{ role: "user", content: "hi" }] }),
    signal: AbortSignal.timeout(3_000),
  }));
}

test("ZenMux 专用代理优先于通用代理，CONNECT 阶段不传出模型 Key", async () => {
  const proxy = await createTestProxy();
  const otherProxy = await createTestProxy();
  try {
    await withProxyEnv({ ZENMUX_PROXY_URL: proxy.url, HTTPS_PROXY: otherProxy.url }, attemptProxyConnection);
    assert.deepEqual(proxy.connections, [{ authority: "zenmux.ai:443", authorization: undefined }]);
    assert.equal(otherProxy.connections.length, 0);
  } finally {
    await Promise.all([proxy.close(), otherProxy.close()]);
  }
});

test("没有专用代理时使用标准 HTTPS_PROXY，并在配置变化后更新连接", async () => {
  const proxy = await createTestProxy();
  const nextProxy = await createTestProxy();
  try {
    await withProxyEnv({ HTTPS_PROXY: proxy.url }, attemptProxyConnection);
    await withProxyEnv({ https_proxy: nextProxy.url }, attemptProxyConnection);
    assert.equal(proxy.connections[0]?.authority, "zenmux.ai:443");
    assert.equal(nextProxy.connections[0]?.authority, "zenmux.ai:443");
  } finally {
    await Promise.all([proxy.close(), nextProxy.close()]);
  }
});

test("网络错误区分连接超时、DNS 失败及业务错误，且不泄漏原始错误", () => {
  const timeout = new TypeError("sensitive upstream details", {
    cause: Object.assign(new Error("connect timed out"), { code: "UND_ERR_CONNECT_TIMEOUT" }),
  });
  assert.equal(getProviderNetworkError(timeout)?.status, 504);
  assert.equal(getProviderNetworkError(new DOMException("expired", "AbortError"))?.code, "upstream_timeout");
  const dnsFailure = new TypeError("fetch failed", { cause: Object.assign(new Error("DNS"), { code: "ENOTFOUND" }) });
  assert.equal(getProviderNetworkError(dnsFailure)?.status, 502);
  const aggregate = new AggregateError([timeout, dnsFailure], "connection attempts failed");
  assert.equal(getProviderNetworkError(aggregate)?.status, 504);
  assert.doesNotMatch(JSON.stringify(getProviderNetworkError(timeout)), /sensitive upstream details/);
  assert.equal(getProviderNetworkError(new SyntaxError("invalid JSON")), null);
});

test("普通、流式及批量聊天复用代理，保留请求 Key 和输出", async (t) => {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const { POST } = await import("@/app/api/chat/route");
  const auth = t.mock.method(supabaseAdmin.auth, "getUser", async () => ({
    data: { user: { id: "test-user" } as User }, error: null,
  }));
  const originalFetch = globalThis.fetch;
  const seen: Array<{ key: string | null; dispatcher: unknown; body: Record<string, unknown> }> = [];
  const sse = 'data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n';
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, ZENMUX_CHAT_COMPLETIONS_URL);
      const body = JSON.parse(String(init?.body));
      seen.push({
        key: new Headers(init?.headers).get("Authorization"),
        dispatcher: (init as RequestInit & { dispatcher?: unknown }).dispatcher,
        body,
      });
      return body.stream
        ? new Response(sse, { headers: { "Content-Type": "text/event-stream" } })
        : Response.json({ choices: [{ message: { content: "OK" } }] });
    };
    const payload = { model: ZENMUX_VALIDATION_MODEL, messages: [{ role: "user", content: "test" }] };
    const request = (body: unknown) => new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { Authorization: "Bearer test-auth", "X-Zenmux-Api-Key": "test-custom-key", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await withProxyEnv({ ZENMUX_PROXY_URL: "http://127.0.0.1:7890" }, async () => {
      const normal = await POST(request(payload));
      assert.equal(normal.status, 200);
      assert.equal((await normal.json()).choices[0].message.content, "OK");
      const stream = await POST(request({ ...payload, stream: true }));
      assert.match(stream.headers.get("Content-Type") || "", /text\/event-stream/);
      assert.equal(await stream.text(), sse);
      const batch = await POST(request({ requests: [payload, payload] }));
      const results = (await batch.json()).results;
      assert.equal(results.length, 2);
      assert.ok(results.every((result: { ok: boolean; data: { choices: Array<{ message: { content: string } }> } }) =>
        result.ok && result.data.choices[0].message.content === "OK"));
    });
    assert.equal(seen.length, 4);
    assert.ok(seen.every((request) => request.key === "Bearer test-custom-key"));
    assert.ok(seen.every((request) => request.dispatcher === seen[0].dispatcher && !!request.dispatcher));
    assert.ok(seen.every((request) => request.body.model === ZENMUX_VALIDATION_MODEL));
  } finally {
    globalThis.fetch = originalFetch;
    auth.mock.restore();
  }
});

test("聊天连接超时返回 504，批量单项也保留具体错误", async (t) => {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const { POST } = await import("@/app/api/chat/route");
  const auth = t.mock.method(supabaseAdmin.auth, "getUser", async () => ({
    data: { user: { id: "test-user" } as User }, error: null,
  }));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new DOMException("expired", "AbortError"); };
    const payload = { model: ZENMUX_VALIDATION_MODEL, messages: [{ role: "user", content: "test" }] };
    const request = (body: unknown) => new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { Authorization: "Bearer test-auth", "X-Zenmux-Api-Key": "test-key", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await POST(request(payload));
    assert.equal(result.status, 504);
    const data = await result.json();
    assert.equal(data.code, "upstream_timeout");
    assert.match(data.error, /服务端网络及代理/);
    const batch = await POST(request({ requests: [payload] }));
    const item = (await batch.json()).results[0];
    assert.equal(item.status, 504);
    assert.equal(item.ok, false);
    assert.match(item.error, /服务端网络及代理/);
  } finally {
    globalThis.fetch = originalFetch;
    auth.mock.restore();
  }
});

test("Key 验证使用同一连接配置，并区分网络超时与无效 Key", async () => {
  const { POST } = await import("@/app/api/validate-key/route");
  const originalFetch = globalThis.fetch;
  try {
    const request = () => new NextRequest("http://localhost/api/validate-key", {
      method: "POST", headers: { "X-Zenmux-Api-Key": "test-key" },
    });
    globalThis.fetch = async (url, init) => {
      assert.equal(url, ZENMUX_CHAT_COMPLETIONS_URL);
      assert.ok((init as RequestInit & { dispatcher?: unknown }).dispatcher);
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-key");
      return Response.json({ choices: [{ message: { content: "OK" } }] });
    };
    assert.equal((await (await POST(request())).json()).valid, true);
    globalThis.fetch = async () => { throw new DOMException("expired", "AbortError"); };
    const network = await (await POST(request())).json();
    assert.equal(network.valid, false);
    assert.equal(network.errorCode, "timeout");
    assert.match(network.error, /服务端网络及代理/);
    globalThis.fetch = async () => new Response(null, { status: 401 });
    const invalidKey = await (await POST(request())).json();
    assert.equal(invalidKey.errorCode, "invalid_key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
