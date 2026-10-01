import assert from "node:assert/strict";
import test from "node:test";

const SUPABASE_URL = "https://redeem-database.example.test";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const CODE_ID = "33333333-3333-4333-8333-333333333333";
const CODE = "REDEEM-FIXTURE";
const CREDITS_GRANTED = 5;

type Fixture = {
  codeExists: boolean;
  codeRedeemed: boolean;
  redeemedBy: string | null;
  credits: number;
  conflictsRemaining: number;
  claimConflict: boolean;
  readError: boolean;
  updateError: boolean;
  rollbackError: boolean;
  changeOwnerBeforeRollback: boolean;
};

type RecordedRequest = {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Record<string, unknown>;
};

function defaultFixture(): Fixture {
  return {
    codeExists: true,
    codeRedeemed: false,
    redeemedBy: null,
    credits: 8,
    conflictsRemaining: 0,
    claimConflict: false,
    readError: false,
    updateError: false,
    rollbackError: false,
    changeOwnerBeforeRollback: false,
  };
}

function noRows(): Response {
  return Response.json({
    code: "PGRST116",
    details: "The result contains 0 rows",
    message: "Cannot coerce the result to a single JSON object",
  }, { status: 406 });
}

function databaseError(): Response {
  return Response.json({
    code: "fixture_error",
    message: "sensitive backend detail must not be logged",
  }, { status: 500 });
}

test("兑换码：假 PostgREST 验证条件加积分与失败补偿", async (t) => {
  const originalEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

  let fixture = defaultFixture();
  const requests: RecordedRequest[] = [];
  const consoleErrors: string[] = [];
  const unexpectedRequests: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;

  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    requests.push({ method, path: url.pathname, query: url.searchParams, body });
    assert.equal(url.origin, SUPABASE_URL, "必须拦截请求，禁止访问真实服务");

    if (url.pathname === "/auth/v1/user" && method === "GET") {
      return Response.json({ id: USER_ID, aud: "authenticated", app_metadata: {}, user_metadata: {} });
    }

    if (url.pathname === "/rest/v1/redemption_codes") {
      if (method === "GET") {
        assert.equal(url.searchParams.get("code"), `eq.${CODE}`);
        return Response.json(fixture.codeExists ? [{
          id: CODE_ID,
          credits_amount: CREDITS_GRANTED,
          is_redeemed: fixture.codeRedeemed,
        }] : []);
      }
      if (method === "PATCH") {
        assert.equal(url.searchParams.get("id"), `eq.${CODE_ID}`);
        assert.equal(url.searchParams.get("select"), "id");
        if (body.is_redeemed === true) {
          assert.equal(url.searchParams.get("is_redeemed"), "eq.false");
          assert.equal(body.redeemed_by, USER_ID);
          assert.equal(typeof body.redeemed_at, "string");
          if (fixture.claimConflict) {
            fixture.codeRedeemed = true;
            fixture.redeemedBy = OTHER_USER_ID;
            return noRows();
          }
          fixture.codeRedeemed = true;
          fixture.redeemedBy = USER_ID;
          return Response.json({ id: CODE_ID });
        }
        assert.deepEqual(body, { is_redeemed: false, redeemed_by: null, redeemed_at: null });
        assert.equal(url.searchParams.get("redeemed_by"), `eq.${USER_ID}`);
        if (fixture.rollbackError) return databaseError();
        if (fixture.redeemedBy !== USER_ID) return noRows();
        fixture.codeRedeemed = false;
        fixture.redeemedBy = null;
        return Response.json({ id: CODE_ID });
      }
    }

    if (url.pathname === "/rest/v1/user_credits") {
      assert.equal(url.searchParams.get("id"), `eq.${USER_ID}`);
      if (method === "GET") {
        return fixture.readError ? databaseError() : Response.json({ credits: fixture.credits });
      }
      if (method === "PATCH") {
        assert.equal(url.searchParams.get("select"), "credits");
        assert.equal(typeof body.updated_at, "string");
        if (fixture.updateError) {
          if (fixture.changeOwnerBeforeRollback) fixture.redeemedBy = OTHER_USER_ID;
          return databaseError();
        }
        if (fixture.conflictsRemaining > 0) {
          fixture.conflictsRemaining -= 1;
          fixture.credits -= 1; // 模拟读余额后，开局原子扣掉一积分。
        }
        if (url.searchParams.get("credits") !== `eq.${fixture.credits}`) return noRows();
        assert.equal(body.credits, fixture.credits + CREDITS_GRANTED);
        fixture.credits = body.credits as number;
        return Response.json({ credits: fixture.credits });
      }
    }

    if (url.pathname === "/rest/v1/redemption_records" && method === "POST") {
      assert.deepEqual(body, { user_id: USER_ID, code: CODE, credits_granted: CREDITS_GRANTED });
      return new Response(null, { status: 201 });
    }

    unexpectedRequests.push(`${method} ${url.pathname}`);
    throw new Error("未模拟的请求");
  };
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map((arg) => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" "));
  };

  const reset = (overrides: Partial<Fixture> = {}) => {
    fixture = { ...defaultFixture(), ...overrides };
    requests.length = 0;
    consoleErrors.length = 0;
    unexpectedRequests.length = 0;
  };
  const creditUpdates = () => requests.filter((r) => r.path === "/rest/v1/user_credits" && r.method === "PATCH");
  const rollbacks = () => requests.filter((r) => r.path === "/rest/v1/redemption_codes" && r.body.is_redeemed === false);
  const assertNoRecord = () => assert.equal(requests.some((r) => r.path === "/rest/v1/redemption_records"), false);

  try {
    const { POST } = await import("@/app/api/credits/redeem/route");
    const redeem = async () => {
      const response = await POST(new Request("https://wolfcha.example.test/api/credits/redeem", {
        method: "POST",
        headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
        body: JSON.stringify({ code: ` ${CODE} ` }),
      }));
      assert.deepEqual(unexpectedRequests, []);
      return { status: response.status, body: await response.json() };
    };

    await t.test("成功：加积分后记录兑换，响应字段不变", async () => {
      reset();
      assert.deepEqual(await redeem(), {
        status: 200,
        body: { success: true, credits: 13, creditsGranted: CREDITS_GRANTED },
      });
      assert.equal(fixture.codeRedeemed, true);
      assert.equal(fixture.redeemedBy, USER_ID);
      assert.equal(creditUpdates().length, 1);
      assert.equal(creditUpdates()[0].query.get("credits"), "eq.8");
      assert.equal(requests.at(-1)?.path, "/rest/v1/redemption_records");
      assert.equal(rollbacks().length, 0);
    });

    await t.test("无效码：保持 invalid_code / 400，不写积分", async () => {
      reset({ codeExists: false });
      assert.deepEqual(await redeem(), { status: 400, body: { error: "invalid_code" } });
      assert.equal(requests.some((r) => r.method === "PATCH"), false);
      assertNoRecord();
    });

    await t.test("已兑换：保持 already_redeemed / 400，不写积分", async () => {
      reset({ codeRedeemed: true, redeemedBy: OTHER_USER_ID });
      assert.deepEqual(await redeem(), { status: 400, body: { error: "already_redeemed" } });
      assert.equal(requests.some((r) => r.method === "PATCH"), false);
      assertNoRecord();
    });

    await t.test("抢兑冲突：未认领成功，不加积分也不恢复别人的兑换码", async () => {
      reset({ claimConflict: true });
      assert.deepEqual(await redeem(), { status: 400, body: { error: "already_redeemed" } });
      assert.equal(creditUpdates().length, 0);
      assert.equal(rollbacks().length, 0);
      assert.equal(fixture.redeemedBy, OTHER_USER_ID);
      assertNoRecord();
    });

    await t.test("积分冲突：重读再加，保留并发开局扣减", async () => {
      reset({ conflictsRemaining: 1 });
      assert.deepEqual(await redeem(), {
        status: 200,
        body: { success: true, credits: 12, creditsGranted: CREDITS_GRANTED },
      });
      assert.equal(fixture.credits, 8 - 1 + CREDITS_GRANTED);
      assert.deepEqual(creditUpdates().map((r) => r.query.get("credits")), ["eq.8", "eq.7"]);
      assert.deepEqual(creditUpdates().map((r) => r.body.credits), [13, 12]);
      assert.equal(requests.filter((r) => r.path === "/rest/v1/user_credits" && r.method === "GET").length, 2);
      assert.equal(rollbacks().length, 0);
    });

    await t.test("积分写入失败：恢复当前用户兑换码，不记成功记录", async () => {
      reset({ updateError: true });
      assert.deepEqual(await redeem(), { status: 500, body: { error: "Failed to update credits" } });
      assert.equal(fixture.credits, 8);
      assert.equal(fixture.codeRedeemed, false);
      assert.equal(fixture.redeemedBy, null);
      assert.equal(creditUpdates().length, 1);
      assert.equal(rollbacks().length, 1);
      assert.deepEqual(consoleErrors, []);
      assertNoRecord();
    });

    await t.test("积分读取失败：保持原错误响应并恢复兑换码", async () => {
      reset({ readError: true });
      assert.deepEqual(await redeem(), { status: 500, body: { error: "Failed to read credits" } });
      assert.equal(fixture.codeRedeemed, false);
      assert.equal(creditUpdates().length, 0);
      assert.equal(rollbacks().length, 1);
      assertNoRecord();
    });

    await t.test("持续冲突：仅重试五次，随后恢复兑换码", async () => {
      reset({ conflictsRemaining: 5 });
      assert.deepEqual(await redeem(), { status: 500, body: { error: "Failed to update credits" } });
      assert.equal(creditUpdates().length, 5);
      assert.equal(fixture.credits, 3);
      assert.equal(fixture.codeRedeemed, false);
      assert.equal(rollbacks().length, 1);
      assertNoRecord();
    });

    await t.test("恢复失败：明确记录错误且不记录后端敏感详情或密钥", async () => {
      reset({ updateError: true, rollbackError: true });
      assert.deepEqual(await redeem(), { status: 500, body: { error: "Failed to update credits" } });
      assert.equal(fixture.codeRedeemed, true);
      assert.equal(rollbacks().length, 1);
      assert.equal(consoleErrors.length, 1);
      assert.match(consoleErrors[0], /Failed to restore redemption code after credit grant failure/);
      assert.doesNotMatch(consoleErrors[0], /sensitive backend detail|test-service-role-key|test-user-token/);
      assertNoRecord();
    });

    await t.test("恢复有用户归属条件：不改动当前不属于本人的码，记录未命中", async () => {
      reset({ updateError: true, changeOwnerBeforeRollback: true });
      assert.deepEqual(await redeem(), { status: 500, body: { error: "Failed to update credits" } });
      assert.equal(rollbacks()[0].query.get("redeemed_by"), `eq.${USER_ID}`);
      assert.equal(fixture.codeRedeemed, true);
      assert.equal(fixture.redeemedBy, OTHER_USER_ID);
      assert.equal(consoleErrors.length, 1);
      assert.match(consoleErrors[0], /Failed to restore redemption code/);
      assertNoRecord();
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (originalEnv.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.url;
    if (originalEnv.serviceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.serviceRoleKey;
  }
});
