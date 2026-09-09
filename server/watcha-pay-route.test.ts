import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

test("正式扣费路由：并发、重复开局、授权写入失败恢复及余额不足（全部模拟，无真实扣费）", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.WATCHA_PAY_API_KEY = "wpay_test_fixture";
  process.env.WATCHA_PAY_ENTITLEMENT_ID = "test-entitlement";
  process.env.WATCHA_PAY_BASE_URL = "https://pay.example.test";
  delete process.env.VERCEL_ENV;
  const userId = randomUUID();
  const sessions = new Map<string, Record<string, unknown>>();
  const chargedKeys = new Set<string>();
  let quota = 10;
  let failAuthorization = false;
  let consumeCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const headers = new Headers(init?.headers);
    const rows = (values: unknown[]) => Response.json(headers.get("accept")?.includes("vnd.pgrst.object") ? values[0] ?? null : values);
    if (url.hostname === "pay.example.test") {
      if (url.pathname.endsWith("/access")) return Response.json({ access: "granted", entitlement: { type: "quota", remaining: quota } });
      assert.equal(url.pathname, "/v1/entitlements/consume");
      assert.equal(body.user_id, userId);
      assert.equal(body.amount, 1);
      consumeCalls++;
      if (!chargedKeys.has(body.idempotency_key)) {
        if (quota === 0) return Response.json({ error: "insufficient_quota" }, { status: 409 });
        quota--;
        chargedKeys.add(body.idempotency_key);
      }
      return Response.json({ consumed: 1, entitlement: { type: "quota", remaining: quota } });
    }
    assert.equal(url.hostname, "database.example.test", "禁止访问任何真实服务");
    if (url.pathname === "/auth/v1/user") return Response.json({ id: userId });
    if (url.pathname.endsWith("/demo_config")) return rows([{ enabled: false, starts_at: null, expires_at: null }]);
    if (url.pathname.endsWith("/user_credits")) return rows([{ credits: 0 }]);
    if (url.pathname.endsWith("/rpc/consume_credit_for_authorized_game_session_v2")) return Response.json({ code: "P0001", message: "insufficient_credits" }, { status: 400 });
    if (url.pathname.endsWith("/game_session_events")) return new Response(null, { status: 201 });
    if (url.pathname.endsWith("/game_sessions")) {
      const key = url.searchParams.get("start_request_id")?.replace(/^eq\./, "");
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const found = key ? sessions.get(key) : [...sessions.values()].find(s => s.id === id);
      if (method === "GET") return rows(found ? [found] : []);
      if (method === "POST") {
        if (sessions.has(body.start_request_id)) return Response.json({ code: "23505" }, { status: 409 });
        const row = { id: randomUUID(), lifecycle_status: "starting", ...body };
        sessions.set(body.start_request_id, row);
        return Response.json(row);
      }
      if (method === "PATCH") {
        if (failAuthorization && body.credit_authorized) return Response.json({ code: "test_failure" }, { status: 500 });
        if (found) Object.assign(found, body);
        return rows(found ? [found] : []);
      }
      if (method === "DELETE") {
        if (found && !found.credit_authorized) sessions.delete(String(found.start_request_id));
        return new Response(null, { status: 204 });
      }
    }
    throw new Error(`未模拟的请求：${method} ${url.pathname}`);
  };
  try {
    const { POST } = await import("@/app/api/credits/consume/route");
    const request = (key: string, playerCount = 10) => new Request("https://wolfcha.test/api/credits/consume", {
      method: "POST", headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ createSession: true, playerCount }),
    });
    const key = randomUUID();
    const concurrent = await Promise.all([POST(request(key)), POST(request(key))]);
    assert.deepEqual(concurrent.map(r => r.status), [200, 200]);
    assert.equal(chargedKeys.size, 1);
    assert.equal(sessions.size, 1);
    const beforeReplay = consumeCalls;
    assert.equal((await POST(request(key))).status, 200);
    assert.equal(consumeCalls, beforeReplay, "已授权重放不能再调用扣费接口");
    assert.equal((await POST(request(key, 12))).status, 409);
    sessions.get(key)!.completed = true;
    assert.equal((await POST(request(key))).status, 409, "已结束对局不能重复启动");

    const recoveryKey = randomUUID();
    failAuthorization = true;
    assert.equal((await POST(request(recoveryKey))).status, 503);
    assert.equal(chargedKeys.size, 2);
    assert.equal(sessions.get(recoveryKey)?.credit_authorized, false);
    failAuthorization = false;
    assert.equal((await POST(request(recoveryKey))).status, 200);
    assert.equal(chargedKeys.size, 2, "恢复必须复用同一个平台幂等键");
    assert.equal(sessions.get(recoveryKey)?.credit_authorized, true);

    quota = 0;
    const rejectedKey = randomUUID();
    assert.equal((await POST(request(rejectedKey))).status, 402);
    assert.equal(sessions.has(rejectedKey), false);
    assert.equal(chargedKeys.size, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
