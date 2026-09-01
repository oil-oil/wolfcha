import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const routeSource = readFileSync(
  join(process.cwd(), "src/app/api/credits/consume/route.ts"),
  "utf8",
);
const hookSource = readFileSync(
  join(process.cwd(), "src/hooks/useCredits.ts"),
  "utf8",
);
const welcomeSource = readFileSync(
  join(process.cwd(), "src/components/game/WelcomeScreen.tsx"),
  "utf8",
);

test("扣费前强制校验幂等键，旧页面不会继续产生扣款", () => {
  const requiredIndex = routeSource.indexOf('code: "idempotency_key_required"');
  const firstMutationIndex = routeSource.indexOf("isDemoModeActiveServer()");

  assert.ok(requiredIndex >= 0);
  assert.ok(firstMutationIndex >= 0);
  assert.ok(requiredIndex < firstMutationIndex);
  assert.match(routeSource, /status:\s*428/);
});

test("所有开局会话分支都持久化请求身份，付费分支只调用 v2 RPC", () => {
  assert.match(routeSource, /start_request_id:\s*options\.requestId/);
  assert.match(routeSource, /start_request_fingerprint:\s*options\.requestFingerprint/);
  assert.match(routeSource, /start_request_source:\s*options\.requestSource/);
  assert.match(routeSource, /consume_credit_for_authorized_game_session_v2/);
  assert.match(routeSource, /consume_spring_quota_for_authorized_game_session_v2/);
  assert.doesNotMatch(
    routeSource,
    /supabaseAdmin\.rpc\(\s*["']consume_credit_for_authorized_game_session["']/,
  );
});

test("并发幂等冲突在所有来源都统一映射为 409", () => {
  assert.match(routeSource, /buildIdempotencyConflictResponse/);
  assert.match(routeSource, /code:\s*"idempotency_conflict"/);
  assert.match(routeSource, /status:\s*409/);
  assert.ok(
    (routeSource.match(/return buildIdempotencyConflictResponse\(user, payload, startRequestId\)/g) ?? [])
      .length >= 3,
  );
});

test("客户端持久化同一请求 ID，并在真实开局完成后才清除", () => {
  assert.match(hookSource, /getOrCreateGameStartRequest/);
  assert.match(hookSource, /"Idempotency-Key": startRequestId/);
  assert.match(hookSource, /runGameStartRequestWithRetry/);
  assert.match(welcomeSource, /!hasPendingGameStartRequest\(buildCreditConsumeOptions\(\)\)/);

  const onStartIndex = welcomeSource.indexOf("await onStart(buildStartOptions(gameSessionId))");
  const completeIndex = welcomeSource.indexOf("completeGameStartRequest(startRequestId)");
  assert.ok(onStartIndex >= 0);
  assert.ok(completeIndex > onStartIndex);
});
