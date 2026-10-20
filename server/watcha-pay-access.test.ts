import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

test("正式权益查询：真实 502 样本、配置状态、协议错误和恢复（仅模拟查询）", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.WATCHA_PAY_API_KEY = "wpay_test_fixture";
  process.env.WATCHA_PAY_ENTITLEMENT_ID = "test-entitlement";
  process.env.WATCHA_PAY_BASE_URL = "https://pay.example.test";
  delete process.env.VERCEL_ENV;
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const logs: unknown[][] = [];
  let upstream = () => Response.json({
    error: { code: "provider_error", message: "支付渠道响应异常" },
  }, { status: 502, headers: { "X-Trace-Id": "9a2b29c26a4c34d70526a0506c429fca" } });
  let queries = 0;
  console.error = (...args) => { logs.push(args); };
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "database.example.test" && url.pathname === "/auth/v1/user") {
      return Response.json({ id: "test-user" });
    }
    assert.equal(url.hostname, "pay.example.test", "禁止访问真实服务");
    assert.equal(url.pathname, "/v1/entitlements/access", "查询不得触发扣费");
    queries++;
    return upstream();
  };
  try {
    const { GET } = await import("@/app/api/watcha-pay/access/route");
    const request = () => new NextRequest("https://wolfcha.test/api/watcha-pay/access", {
      headers: { Authorization: "Bearer test-user-token" },
    });
    const failed = await GET(request());
    assert.equal(failed.status, 502);
    assert.equal(failed.headers.get("cache-control"), "private, no-store");
    const body = await failed.json();
    assert.equal(body.code, "watcha_pay_unavailable");
    assert.equal(body.traceId, "9a2b29c26a4c34d70526a0506c429fca");
    assert.equal(body.remaining, undefined);
    assert.deepEqual(logs[0]?.[1], {
      code: "unavailable", upstreamStatus: 502, upstreamCode: "provider_error",
      traceId: "9a2b29c26a4c34d70526a0506c429fca", status: 502,
    });
    assert.equal(queries, 1, "错误响应不得自动重放查询");

    upstream = () => Response.json({
      access: "unavailable", reason: { code: "configuration_action_required" },
    });
    assert.equal((await GET(request())).status, 503);
    upstream = () => new Response("<html>broken response</html>", { status: 200 });
    assert.equal((await GET(request())).status, 502, "无效响应不能伪装成 HTTP 200");
    upstream = () => Response.json({ error: "invalid_key" }, { status: 401 });
    assert.equal((await GET(request())).status, 502, "上游凭据故障不等于用户未登录");
    upstream = () => Response.json({
      access: "unavailable", reason: { code: "unknown_reason" },
    });
    assert.equal((await GET(request())).status, 502);

    upstream = () => Response.json({
      access: "granted", entitlement: { type: "quota", remaining: 10 },
      purchase: { url: "https://render.alipay.com/nowpay/buy?p=fixture" },
    });
    const restored = await GET(request());
    assert.equal(restored.status, 200);
    assert.deepEqual(await restored.json(), {
      access: "granted", remaining: 10,
      purchaseUrl: "https://render.alipay.com/nowpay/buy?p=fixture",
    });
    const before = queries;
    assert.equal((await GET(new NextRequest("https://wolfcha.test/api/watcha-pay/access"))).status, 401);
    assert.equal(queries, before);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});
