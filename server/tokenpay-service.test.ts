import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
process.env.TOKENPAY_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");

test("TokenPay secrets use authenticated encryption and reject a different key", async () => {
  const { decryptTokenPaySecret, encryptTokenPaySecret } = await import("@/lib/tokenpay");
  const originalKey = process.env.TOKENPAY_ENCRYPTION_KEY;
  const encrypted = encryptTokenPaySecret("td-secret-key");

  assert.notEqual(encrypted, "td-secret-key");
  assert.equal(decryptTokenPaySecret(encrypted), "td-secret-key");

  process.env.TOKENPAY_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
  assert.throws(() => decryptTokenPaySecret(encrypted));
  process.env.TOKENPAY_ENCRYPTION_KEY = originalKey;
});

test("TokenPay payment session normalization accepts only official status URLs", async () => {
  const { normalizeTokenPayPaymentSession } = await import("@/lib/tokenpay");
  const valid = normalizeTokenPayPaymentSession({
    session: {
      id: "session_123",
      amount: 10,
      status: "pending",
      payment_url: "https://pay.example.com/checkout/123",
      status_url:
        "https://tokendance.space/portal/api/v1/payment/sessions/session_123",
      expired_at: 1_786_500_000,
      created_at: 1_786_499_400,
    },
  });

  assert.equal(valid?.id, "session_123");
  assert.equal(valid?.paidAt, undefined);
  assert.equal(valid?.amount, 10);

  assert.equal(
    normalizeTokenPayPaymentSession({
      session: {
        id: "session_123",
        amount: 10,
        status: "pending",
        payment_url: "https://pay.example.com/checkout/123",
        status_url: "https://evil.example.com/portal/api/v1/payment/sessions/session_123",
        expired_at: 1_786_500_000,
        created_at: 1_786_499_400,
      },
    }),
    null,
  );
});

test("TokenPay balance normalization accepts an overdrawn available balance", async () => {
  const { normalizeTokenPayBalance } = await import("@/lib/tokenpay");

  assert.deepEqual(
    normalizeTokenPayBalance({
      balance: {
        credits: 58_000_000,
        credits_used: 58_162_811,
        balance: -162_811,
      },
    }),
    {
      creditsMicro: 58_000_000,
      creditsUsedMicro: 58_162_811,
      availableMicro: -162_811,
    },
  );

  assert.equal(
    normalizeTokenPayBalance({
      balance: { credits: -1, credits_used: 0, balance: -1 },
    }),
    null,
  );
});

test("TokenPay App URL is normalized consistently for every caller", async () => {
  const { getTokenPayAppUrl } = await import("@/lib/tokenpay-config");
  const original = process.env.TOKENPAY_APP_URL;
  process.env.TOKENPAY_APP_URL = "https://wolf-cha.com/";
  assert.equal(getTokenPayAppUrl(), "https://wolf-cha.com");
  if (original === undefined) delete process.env.TOKENPAY_APP_URL;
  else process.env.TOKENPAY_APP_URL = original;
});

test("TokenPay code exchange retries server failures but not invalid codes", async () => {
  const { exchangeTokenPayAuthorizationCode } = await import("@/lib/tokenpay");
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  try {
    globalThis.fetch = async () => {
      attempts += 1;
      return attempts === 1
        ? new Response(null, { status: 503 })
        : new Response(JSON.stringify({ key: "td-recovered-key" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
    };
    assert.equal(
      await exchangeTokenPayAuthorizationCode("code", "verifier"),
      "td-recovered-key",
    );
    assert.equal(attempts, 2);

    attempts = 0;
    globalThis.fetch = async () => {
      attempts += 1;
      return new Response(null, { status: 403 });
    };
    await assert.rejects(() => exchangeTokenPayAuthorizationCode("bad", "verifier"));
    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
