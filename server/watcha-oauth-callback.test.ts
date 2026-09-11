import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

const SUPABASE_URL = "https://database.example.test";
const ORIGIN = "https://wolfcha.example.test";
const WATCHA_USER_ID = 24680;
const NEW_USER_ID = "11111111-1111-4111-8111-111111111111";
const EXISTING_USER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333";

type CreateMode = "new" | "email_exists" | "user_already_exists" | "other";

type Fixture = {
  watchaUserId: number;
  createMode: CreateMode;
  createdUserId: string;
  link: {
    error?: { code?: string; message?: string; status?: number };
    token?: string;
    userId?: string;
    email?: string;
  };
  updateError?: { code?: string; message?: string; status?: number };
  creditsError?: { code?: string; message?: string; status?: number };
};

type RecordedRequest = {
  host: string;
  method: string;
  path: string;
  query: string;
  body: Record<string, unknown>;
  headers: Headers;
};

function watchaEmail(userId: number): string {
  return `watcha_${userId}@watcha.oauth.local`;
}

function defaultFixture(): Fixture {
  return {
    watchaUserId: WATCHA_USER_ID,
    createMode: "new",
    createdUserId: NEW_USER_ID,
    link: { token: "hashed-token-safe", userId: NEW_USER_ID, email: watchaEmail(WATCHA_USER_ID) },
  };
}

function parseBody(init?: RequestInit): Record<string, unknown> {
  if (!init?.body) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(init.body));
  } catch {
    return {};
  }
  if (Array.isArray(parsed)) return (parsed[0] ?? {}) as Record<string, unknown>;
  return parsed as Record<string, unknown>;
}

function errorResponse(error: { code?: string; message?: string; status?: number }, status = 500): Response {
  return Response.json(
    {
      code: error.code ?? "test_error",
      error_code: error.code ?? "test_error",
      message: error.message ?? "fixture error message must not be logged",
    },
    { status: error.status ?? status }
  );
}

function assertStateCookieCleared(response: Response): void {
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /watcha_oauth_state=/);
  assert.match(setCookie.toLowerCase(), /max-age=0|expires=thu, 01 jan 1970/);
}

function assertAuthFailedRedirect(response: Response): void {
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.origin, ORIGIN);
  assert.equal(location.pathname, "/");
  assert.equal(location.searchParams.get("watcha_error"), "auth_failed");
}

function assertVerifyRedirect(response: Response, token?: string): void {
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.origin, SUPABASE_URL);
  assert.equal(location.pathname, "/auth/v1/verify");
  assert.equal(location.searchParams.get("watcha_error"), null);
  if (token) assert.equal(location.searchParams.get("token"), token);
}

test("观猹 OAuth 回调：关联、初始化、校验与安全回归", async (t) => {
  // 所有 fixture 环境变量先就绪，再动态导入会读取 Supabase client 的生产模块。
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.NEXT_PUBLIC_WATCHA_CLIENT_ID = "watcha-client-fixture";
  process.env.WATCHA_CLIENT_SECRET = "watcha-secret-fixture";

  let fixture = defaultFixture();
  const requests: RecordedRequest[] = [];
  const creditRows = new Map<string, number>();
  const referralCodes = new Map<string, string>();
  const resetCredits = () => {
    creditRows.clear();
    referralCodes.clear();
  };
  const consoleErrors: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;

  globalThis.fetch = async (input, init) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const body = parseBody(init);

    if (url.hostname === "watcha.cn") {
      requests.push({ host: url.hostname, method, path: url.pathname, query: url.search, body, headers });
      if (url.pathname === "/oauth/api/token") {
        return Response.json({
          access_token: "watcha-access-token",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "watcha-refresh-token",
          scope: "read",
        });
      }
      if (url.pathname === "/oauth/api/userinfo") {
        assert.equal(url.searchParams.get("access_token"), "watcha-access-token");
        return Response.json({
          statusCode: 200,
          data: {
            user_id: fixture.watchaUserId,
            nickname: "观猹测试用户",
            avatar_url: "https://images.example.test/avatar.png",
          },
        });
      }
      throw new Error(`未模拟的观猹请求：${method} ${url.pathname}`);
    }

    assert.equal(url.hostname, "database.example.test", `禁止访问真实域名：${url.hostname}`);
    requests.push({ host: url.hostname, method, path: url.pathname, query: url.search, body, headers });

    if (url.pathname === "/auth/v1/admin/users" && method === "POST") {
      const email = body.email;
      if (fixture.createMode === "new") {
        return Response.json({
          id: fixture.createdUserId,
          email,
          user_metadata: body.user_metadata,
        });
      }
      return errorResponse(
        fixture.createMode === "other"
          ? { code: "unexpected_create_failure", message: "sensitive create error" }
          : { code: fixture.createMode, message: "sensitive duplicate error", status: 422 },
        fixture.createMode === "other" ? 500 : 422
      );
    }

    if (url.pathname === "/auth/v1/admin/users" && method === "GET") {
      throw new Error("listUsers must never be called by the callback");
    }

    if (url.pathname === "/auth/v1/admin/generate_link" && method === "POST") {
      if (fixture.link.error) return errorResponse(fixture.link.error, fixture.link.error.status ?? 500);
      return Response.json({
        action_link: `${ORIGIN}/auth/callback`,
        email_otp: "otp-fixture",
        hashed_token: fixture.link.token,
        verification_type: "magiclink",
        redirect_to: ORIGIN,
        id: fixture.link.userId,
        email: fixture.link.email,
      });
    }

    if (url.pathname.startsWith("/auth/v1/admin/users/") && method === "PUT") {
      if (fixture.updateError) return errorResponse(fixture.updateError, fixture.updateError.status ?? 500);
      return Response.json({ id: url.pathname.split("/").pop(), email: body.email });
    }

    if (url.pathname === "/rest/v1/user_credits" && method === "POST") {
      if (fixture.creditsError) return errorResponse(fixture.creditsError, fixture.creditsError.status ?? 500);
      const referralCode = String(body.referral_code ?? "");
      if (!/^[0-9A-F]{16}$/.test(referralCode)) {
        return errorResponse({ code: "23502", message: "user_credits.referral_code is required" }, 400);
      }
      const id = String(body.id);
      if (!creditRows.has(id)) {
        creditRows.set(id, Number(body.credits));
        referralCodes.set(id, referralCode);
      }
      return Response.json([]);
    }

    throw new Error(`未模拟的 Supabase 请求：${method} ${url.pathname}`);
  };
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };

  try {
    const { GET } = await import("@/app/api/auth/watcha/callback/route");

    const invoke = async (options: { state?: string; cookieState?: string } = {}) => {
      const state = options.state ?? "state-fixture";
      const cookieState = options.cookieState ?? state;
      const request = new NextRequest(
        `${ORIGIN}/api/auth/watcha/callback?code=oauth-code&state=${encodeURIComponent(state)}`,
        { headers: { cookie: `watcha_oauth_state=${encodeURIComponent(cookieState)}` } }
      );
      return GET(request);
    };

    await t.test("email_exists 老用户直接使用 generateLink 用户，不调用 listUsers，并幂等补齐积分", async () => {
      for (const createMode of ["email_exists", "user_already_exists"] as const) {
        fixture = {
          ...defaultFixture(),
          createMode,
          createdUserId: OTHER_USER_ID,
          link: { token: `old-${createMode}-token`, userId: EXISTING_USER_ID, email: watchaEmail(WATCHA_USER_ID) },
        };
        requests.length = 0;
        resetCredits();
        const response = await invoke({ state: `old-${createMode}` });
        assertVerifyRedirect(response, `old-${createMode}-token`);
        assertStateCookieCleared(response);
        const location = new URL(response.headers.get("location")!);
        assert.equal(location.searchParams.get("type"), "magiclink");
        assert.equal(location.searchParams.get("redirect_to"), ORIGIN);
        assert.equal(requests.filter((request) => request.path === "/auth/v1/admin/users" && request.method === "GET").length, 0);
        const update = requests.find((request) => request.path.endsWith(`/users/${EXISTING_USER_ID}`));
        const credits = requests.find((request) => request.path === "/rest/v1/user_credits");
        assert.deepEqual(update?.body.user_metadata, {
          watcha_user_id: WATCHA_USER_ID,
          nickname: "观猹测试用户",
          avatar_url: "https://images.example.test/avatar.png",
          provider: "watcha",
        });
        assert.equal(credits?.body.id, EXISTING_USER_ID);
        assert.match(String(credits?.body.referral_code), /^[0-9A-F]{16}$/);
        assert.match(credits?.headers.get("prefer") ?? "", /resolution=ignore-duplicates/);
        assert.equal(creditRows.get(EXISTING_USER_ID), 1);
      }
    });

    await t.test("新用户使用一致的 id 写 metadata，并以 ignoreDuplicates 初始化积分", async () => {
      fixture = defaultFixture();
      requests.length = 0;
      resetCredits();
      const response = await invoke({ state: "new-user" });
      assertVerifyRedirect(response, "hashed-token-safe");
      assertStateCookieCleared(response);

      const create = requests.find((request) => request.path === "/auth/v1/admin/users" && request.method === "POST");
      const update = requests.find((request) => request.path.endsWith(`/users/${NEW_USER_ID}`));
      const credits = requests.find((request) => request.path === "/rest/v1/user_credits");
      assert.equal(create?.body.email, watchaEmail(WATCHA_USER_ID));
      assert.deepEqual(create?.body.user_metadata, update?.body.user_metadata);
      assert.equal(update?.path, `/auth/v1/admin/users/${NEW_USER_ID}`);
      assert.equal(credits?.body.id, NEW_USER_ID);
      assert.equal(credits?.body.credits, 1);
      assert.match(String(credits?.body.referral_code), /^[0-9A-F]{16}$/);
      assert.equal(creditRows.get(NEW_USER_ID), 1);
      assert.match(credits?.headers.get("prefer") ?? "", /resolution=ignore-duplicates/);
      assert.ok(credits?.query.includes("on_conflict=id"));
      assert.ok(
        requests.findIndex((request) => request.path.endsWith(`/users/${NEW_USER_ID}`)) <
          requests.findIndex((request) => request.path === "/rest/v1/user_credits")
      );
    });

    await t.test("其他 createUser 错误不会继续后续流程", async () => {
      fixture = { ...defaultFixture(), createMode: "other" };
      requests.length = 0;
      resetCredits();
      const response = await invoke({ state: "other-create-error" });
      assertAuthFailedRedirect(response);
      assertStateCookieCleared(response);
      assert.equal(requests.filter((request) => request.path === "/auth/v1/admin/generate_link").length, 0);
      assert.equal(requests.filter((request) => request.path.startsWith("/auth/v1/admin/users/")).length, 0);
      assert.equal(requests.filter((request) => request.path === "/rest/v1/user_credits").length, 0);
    });

    await t.test("generateLink 错误、token 缺失、邮箱不符和新用户 id 不符都会失败", async () => {
      const cases: Array<[string, Partial<Fixture["link"]>]> = [
        ["link-error", { error: { code: "link_failed", message: "link-secret-message", status: 503 } }],
        ["missing-token", { token: undefined, userId: NEW_USER_ID, email: watchaEmail(WATCHA_USER_ID) }],
        ["email-mismatch", { token: "email-mismatch-token", userId: NEW_USER_ID, email: "other@example.test" }],
        ["id-mismatch", { token: "id-mismatch-token", userId: OTHER_USER_ID, email: watchaEmail(WATCHA_USER_ID) }],
      ];
      for (const [name, link] of cases) {
        fixture = { ...defaultFixture(), link: { ...defaultFixture().link, ...link } };
        requests.length = 0;
        resetCredits();
        consoleErrors.length = 0;
        const response = await invoke({ state: name });
        assertAuthFailedRedirect(response);
        assertStateCookieCleared(response);
        assert.equal(requests.filter((request) => request.path.startsWith("/auth/v1/admin/users/")).length, 0);
        assert.equal(requests.filter((request) => request.path === "/rest/v1/user_credits").length, 0);
      }
    });

    await t.test("metadata 或积分初始化错误都会失败", async () => {
      fixture = {
        ...defaultFixture(),
        updateError: { code: "metadata_failed", message: "metadata-secret-message", status: 500 },
      };
      requests.length = 0;
      resetCredits();
      let response = await invoke({ state: "metadata-error" });
      assertAuthFailedRedirect(response);
      assertStateCookieCleared(response);
      assert.equal(requests.filter((request) => request.path === "/rest/v1/user_credits").length, 0);

      fixture = {
        ...defaultFixture(),
        creditsError: { code: "credits_failed", message: "credits-secret-message", status: 500 },
      };
      requests.length = 0;
      resetCredits();
      response = await invoke({ state: "credits-error" });
      assertAuthFailedRedirect(response);
      assertStateCookieCleared(response);
      assert.equal(requests.filter((request) => request.path.endsWith(`/users/${NEW_USER_ID}`)).length, 1);
      assert.equal(requests.filter((request) => request.path === "/rest/v1/user_credits").length, 1);
    });

    await t.test("新建后中断可由 email_exists 重试补齐积分，已有 42 余额不变", async () => {
      resetCredits();
      fixture = {
        ...defaultFixture(),
        link: { error: { code: "link_failed", message: "first-link-failure", status: 503 } },
      };
      requests.length = 0;
      let response = await invoke({ state: "recover-after-link-error" });
      assertAuthFailedRedirect(response);
      assertStateCookieCleared(response);
      assert.equal(creditRows.has(NEW_USER_ID), false);
      assert.equal(requests.filter((request) => request.path === "/rest/v1/user_credits").length, 0);

      fixture = {
        ...defaultFixture(),
        createMode: "email_exists",
        createdUserId: OTHER_USER_ID,
        link: { token: "recovery-link-token", userId: NEW_USER_ID, email: watchaEmail(WATCHA_USER_ID) },
      };
      requests.length = 0;
      response = await invoke({ state: "recover-after-link-error-retry" });
      assertVerifyRedirect(response, "recovery-link-token");
      assert.equal(creditRows.get(NEW_USER_ID), 1);

      creditRows.delete(NEW_USER_ID);
      fixture = {
        ...defaultFixture(),
        updateError: { code: "metadata_failed", message: "first-metadata-failure", status: 500 },
      };
      requests.length = 0;
      response = await invoke({ state: "recover-after-metadata-error" });
      assertAuthFailedRedirect(response);
      assertStateCookieCleared(response);
      assert.equal(creditRows.has(NEW_USER_ID), false);
      assert.equal(requests.filter((request) => request.path === "/rest/v1/user_credits").length, 0);

      fixture = {
        ...defaultFixture(),
        createMode: "email_exists",
        createdUserId: OTHER_USER_ID,
        link: { token: "metadata-recovery-token", userId: NEW_USER_ID, email: watchaEmail(WATCHA_USER_ID) },
      };
      requests.length = 0;
      response = await invoke({ state: "recover-after-metadata-error-retry" });
      assertVerifyRedirect(response, "metadata-recovery-token");
      assert.equal(creditRows.get(NEW_USER_ID), 1);

      creditRows.set(EXISTING_USER_ID, 42);
      referralCodes.set(EXISTING_USER_ID, "ABCDEF0123456789");
      fixture = {
        ...defaultFixture(),
        createMode: "email_exists",
        createdUserId: OTHER_USER_ID,
        link: { token: "existing-42-token", userId: EXISTING_USER_ID, email: watchaEmail(WATCHA_USER_ID) },
      };
      requests.length = 0;
      response = await invoke({ state: "existing-42" });
      assertVerifyRedirect(response, "existing-42-token");
      assert.equal(creditRows.get(EXISTING_USER_ID), 42);
      assert.equal(referralCodes.get(EXISTING_USER_ID), "ABCDEF0123456789");
      assert.equal(requests.filter((request) => request.path === "/rest/v1/user_credits").length, 1);
      const credits = requests.find((request) => request.path === "/rest/v1/user_credits");
      assert.match(String(credits?.body.referral_code), /^[0-9A-F]{16}$/);
      assert.match(credits?.headers.get("prefer") ?? "", /resolution=ignore-duplicates/);
    });

    await t.test("invalid_state 不访问任何网络", async () => {
      fixture = defaultFixture();
      requests.length = 0;
      resetCredits();
      const response = await invoke({ state: "query-state", cookieState: "different-cookie-state" });
      assert.equal(response.status, 307);
      assert.match(response.headers.get("location") ?? "", /watcha_error=invalid_state/);
      assert.equal(requests.length, 0);
    });

    await t.test("非法 user_id 被拒绝且不触碰 Supabase", async () => {
      fixture = { ...defaultFixture(), watchaUserId: 0 };
      requests.length = 0;
      resetCredits();
      const response = await invoke({ state: "invalid-user-id" });
      assertAuthFailedRedirect(response);
      assertStateCookieCleared(response);
      assert.equal(requests.filter((request) => request.host === "database.example.test").length, 0);
    });

    await t.test("错误日志只保留阶段和安全 code/status，不泄露原错误消息或 token", async () => {
      fixture = {
        ...defaultFixture(),
        link: { error: { code: "link_failed", message: "must-not-leak-link-message", status: 502 } },
      };
      requests.length = 0;
      resetCredits();
      consoleErrors.length = 0;
      const response = await invoke({ state: "log-safety" });
      assertAuthFailedRedirect(response);
      const log = consoleErrors.join("\n");
      assert.match(log, /stage|link/i);
      assert.match(log, /link_failed|502/);
      assert.doesNotMatch(log, /must-not-leak-link-message|hashed-token|watcha-access-token/);
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});
