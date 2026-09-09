import assert from "node:assert/strict";
import test from "node:test";

const watchedEnv = [
  "WATCHA_PAY_API_KEY",
  "WATCHA_PAY_ENTITLEMENT_ID",
  "WATCHA_PAY_BASE_URL",
  "WATCHA_PAY_RETURN_URL",
  "VERCEL_ENV",
] as const;

function setConfiguredEnv(): void {
  delete process.env.VERCEL_ENV;
  process.env.WATCHA_PAY_API_KEY = "test-watcha-key";
  process.env.WATCHA_PAY_ENTITLEMENT_ID = "wolfcha-entitlement";
  process.env.WATCHA_PAY_BASE_URL = "https://pay.example.test";
}

test("正式支付宝 Scheme 与二维码可解析，危险协议及伪装地址被拒绝", async () => {
  const originalEnv = Object.fromEntries(watchedEnv.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  try {
    setConfiguredEnv();
    const { getWatchaPayAccess, WatchaPayError } = await loadWatchaPay();
    const good = "alipays://platformapi/startapp?appId=2021006180624128&page=pages/order/index?purchaseLinkId=example";
    let purchaseUrl = good;
    globalThis.fetch = async () => Response.json({
      access: "purchase_required", entitlement: { type: "quota", remaining: 0 },
      purchase: { url: purchaseUrl, qr_code_url: "https://mobilecodec.alipay.com/show.htm?code=test" },
    });
    assert.equal((await getWatchaPayAccess("readiness")).purchaseUrl, good);
    for (const value of ["javascript:alert(1)", "http://unsafe.test", "alipays://evil/startapp?appId=2021006180624128&page=test", "alipays://platformapi/other?appId=2021006180624128&page=test", "alipays://platformapi/startapp?appId=bad&page=test", "https://user:password@alipay.com/"]) {
      purchaseUrl = value;
      await assert.rejects(() => getWatchaPayAccess("readiness"), (e: unknown) => e instanceof WatchaPayError && e.code === "invalid_response");
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of watchedEnv) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  }
});

test("正式部署禁止沙箱密钥和 localhost 回跳，测试环境不受限制", async () => {
  const originalEnv = Object.fromEntries(watchedEnv.map(name => [name, process.env[name]]));
  try {
    setConfiguredEnv();
    const { isWatchaPayConfigured, getWatchaPayReturnUrl } = await loadWatchaPay();
    process.env.VERCEL_ENV = "production";
    assert.equal(isWatchaPayConfigured(), false);
    process.env.WATCHA_PAY_API_KEY = "wpay_live_fixture";
    assert.equal(isWatchaPayConfigured(), true);
    process.env.WATCHA_PAY_RETURN_URL = "http://localhost:3000/?payment=watcha-pay";
    assert.throws(() => getWatchaPayReturnUrl(), /Production return/);
    delete process.env.VERCEL_ENV;
    assert.equal(getWatchaPayReturnUrl(), "http://localhost:3000/?payment=watcha-pay");
  } finally {
    for (const name of watchedEnv) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  }
});

async function loadWatchaPay() {
  return import("@/lib/watcha-pay");
}

test("Watcha Pay access and consume requests accept valid responses", async () => {
  const originalEnv = Object.fromEntries(
    watchedEnv.map((name) => [name, process.env[name]]),
  );
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  try {
    setConfiguredEnv();
    globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), init: init ?? {} });
      return requests.length === 1
        ? new Response(
            JSON.stringify({
              access: "purchase_required",
              entitlement: { type: "quota", remaining: 0 },
              purchase: {
                url: "https://pay.watcha.cn/purchase/123",
                qr_code_url: "https://pay.watcha.cn/qr/123",
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          )
        : new Response(
            JSON.stringify({
              consumed: 2,
              entitlement: { type: "quota", remaining: 8 },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
    };

    const { consumeWatchaPayQuota, getWatchaPayAccess } = await loadWatchaPay();
    assert.deepEqual(await getWatchaPayAccess("user-1", "https://wolfcha.test/return"), {
      access: "purchase_required",
      remaining: 0,
      purchaseUrl: "https://pay.watcha.cn/purchase/123",
      qrCodeUrl: "https://pay.watcha.cn/qr/123",
    });
    assert.deepEqual(await consumeWatchaPayQuota("user-1", 2, "request-1"), {
      consumed: 2,
      remaining: 8,
    });

    assert.equal(requests[0].url, "https://pay.example.test/v1/entitlements/access");
    assert.equal(requests[0].init.cache, "no-store");
    assert.equal(
      (requests[0].init.headers as Record<string, string>).Authorization,
      "Bearer test-watcha-key",
    );
    assert.deepEqual(JSON.parse(String(requests[0].init.body)), {
      entitlement_id: "wolfcha-entitlement",
      user_id: "user-1",
      return_url: "https://wolfcha.test/return",
    });
    assert.equal(requests[0].init.signal instanceof AbortSignal, true);
    assert.deepEqual(JSON.parse(String(requests[1].init.body)), {
      entitlement_id: "wolfcha-entitlement",
      user_id: "user-1",
      amount: 2,
      idempotency_key: "request-1",
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of watchedEnv) {
      const value = originalEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("Watcha Pay rejects malformed access responses and unsafe purchase URLs", async () => {
  const originalEnv = Object.fromEntries(
    watchedEnv.map((name) => [name, process.env[name]]),
  );
  const originalFetch = globalThis.fetch;
  try {
    setConfiguredEnv();
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          access: "granted",
          entitlement: { type: "quota", remaining: 1.5 },
          purchase: { url: "http://pay.watcha.cn/purchase/123" },
        }),
        { status: 200 },
      );

    const { WatchaPayError, getWatchaPayAccess } = await loadWatchaPay();
    await assert.rejects(
      () => getWatchaPayAccess("user-1"),
      (error: unknown) =>
        error instanceof WatchaPayError && error.code === "invalid_response",
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of watchedEnv) {
      const value = originalEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("Watcha Pay maps consume 409 to insufficient_quota", async () => {
  const originalEnv = Object.fromEntries(
    watchedEnv.map((name) => [name, process.env[name]]),
  );
  const originalFetch = globalThis.fetch;
  try {
    setConfiguredEnv();
    globalThis.fetch = async () => new Response(null, { status: 409 });
    const { WatchaPayError, consumeWatchaPayQuota } = await loadWatchaPay();

    await assert.rejects(
      () => consumeWatchaPayQuota("user-1", 1, "request-2"),
      (error: unknown) =>
        error instanceof WatchaPayError &&
        error.code === "insufficient_quota" &&
        error.status === 409,
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of watchedEnv) {
      const value = originalEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("Watcha Pay maps temporary upstream failures to unavailable", async () => {
  const originalEnv = Object.fromEntries(
    watchedEnv.map((name) => [name, process.env[name]]),
  );
  const originalFetch = globalThis.fetch;
  try {
    setConfiguredEnv();
    globalThis.fetch = async () => new Response(null, { status: 503 });
    const { WatchaPayError, getWatchaPayAccess } = await loadWatchaPay();

    await assert.rejects(
      () => getWatchaPayAccess("user-1"),
      (error: unknown) =>
        error instanceof WatchaPayError &&
        error.code === "unavailable" &&
        error.status === 503,
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of watchedEnv) {
      const value = originalEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("Watcha Pay rejects a non-HTTPS base URL", async () => {
  const originalEnv = Object.fromEntries(
    watchedEnv.map((name) => [name, process.env[name]]),
  );
  try {
    setConfiguredEnv();
    process.env.WATCHA_PAY_BASE_URL = "http://pay.example.test";
    const { WatchaPayError, getWatchaPayAccess, isWatchaPayConfigured } =
      await loadWatchaPay();

    assert.equal(isWatchaPayConfigured(), false);
    await assert.rejects(
      () => getWatchaPayAccess("user-1"),
      (error: unknown) =>
        error instanceof WatchaPayError &&
        error.code === "misconfigured" &&
        error.message.includes("HTTPS"),
    );
  } finally {
    for (const name of watchedEnv) {
      const value = originalEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("Watcha Pay reports missing configuration clearly", async () => {
  const originalEnv = Object.fromEntries(
    watchedEnv.map((name) => [name, process.env[name]]),
  );
  try {
    delete process.env.WATCHA_PAY_API_KEY;
    delete process.env.WATCHA_PAY_ENTITLEMENT_ID;
    delete process.env.WATCHA_PAY_BASE_URL;
    const { WatchaPayError, getWatchaPayAccess, isWatchaPayConfigured } =
      await loadWatchaPay();

    assert.equal(isWatchaPayConfigured(), false);
    await assert.rejects(
      () => getWatchaPayAccess("user-1"),
      (error: unknown) =>
        error instanceof WatchaPayError &&
        error.code === "misconfigured" &&
        error.message.includes("WATCHA_PAY_API_KEY"),
    );
  } finally {
    for (const name of watchedEnv) {
      const value = originalEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("Watcha Pay return URL only comes from trusted server configuration", async () => {
  const originalEnv = Object.fromEntries(
    watchedEnv.map((name) => [name, process.env[name]]),
  );
  try {
    process.env.WATCHA_PAY_RETURN_URL = "https://wolf-cha.com/payment-complete";
    const { getWatchaPayReturnUrl } = await loadWatchaPay();
    assert.equal(
      getWatchaPayReturnUrl(),
      "https://wolf-cha.com/payment-complete",
    );

    process.env.WATCHA_PAY_RETURN_URL = "http://attacker.example/return";
    assert.throws(() => getWatchaPayReturnUrl(), /HTTPS/);
  } finally {
    for (const name of watchedEnv) {
      const value = originalEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
