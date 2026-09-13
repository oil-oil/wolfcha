import assert from "node:assert/strict";
import test from "node:test";

test("旧 Stripe 下单接口停用后不再发起支付或鉴权请求", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    assert.fail("退役的下单接口不应访问任何外部服务");
  };
  try {
    const { POST } = await import("@/app/api/stripe/payment-link/route");
    const response = await POST();
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const payload = await response.json();
    assert.equal(payload.code, "payment_method_retired");
    assert.equal(payload.url, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
