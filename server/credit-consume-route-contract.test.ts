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

test("持久化幂等键失败时在任何扣费网络请求前返回明确错误", () => {
  assert.match(hookSource, /GameStartPersistenceError/);
  assert.match(hookSource, /idempotency_storage_unavailable/);
  const persistIndex = hookSource.indexOf("getOrCreateGameStartRequest");
  const fetchIndex = hookSource.indexOf("fetchWithTimeout(");
  assert.ok(persistIndex >= 0 && fetchIndex > persistIndex);
});

test("活动额度的读取、首次写入和冲突重查失败都会 fail closed", () => {
  assert.match(routeSource, /campaign quota read failed/);
  assert.match(routeSource, /campaign_quota_unavailable/);
  assert.match(routeSource, /campaign quota claim failed/);
  assert.match(routeSource, /campaign quota conflict recovery failed/);
  assert.match(routeSource, /status:\s*503/);
  assert.doesNotMatch(routeSource, /if\s*\(!campaignError\s*&&\s*campaignData\)/);
});

test("活动额度只有明确耗尽或过期才允许回退项目额度", () => {
  assert.match(routeSource, /insufficient_spring_quota/);
  assert.match(routeSource, /spring_quota_expired/);
  assert.match(routeSource, /if\s*\(!quotaUnavailable\)/);
  assert.match(routeSource, /consumeCreditAndCreateSession/);
  assert.doesNotMatch(routeSource, /quotaUnavailable\s*=\s*true/);
});

test("TokenPay 连接查询异常与真实未连接分开处理，不误报额度耗尽", () => {
  assert.match(routeSource, /tokenpay_lookup_failed/);
  assert.match(routeSource, /TokenPay connection is temporarily unavailable/);
  assert.match(routeSource, /status:\s*503/);
  assert.match(routeSource, /tokenPayRequested && !tokenPayConnected/);
  assert.doesNotMatch(routeSource, /tokenpay_lookup_failed[\s\S]{0,200}quota/i);
});

test("开局扣费结果通过 helper 写入无敏感字段的结构化事件", () => {
  assert.match(routeSource, /recordGameSessionCreditEvent/);
  assert.match(routeSource, /requestId/);
  assert.match(routeSource, /outcome/);
  const eventBlock = routeSource.slice(
    routeSource.indexOf("await recordGameSessionCreditEvent"),
    routeSource.indexOf("});", routeSource.indexOf("await recordGameSessionCreditEvent")) + 3,
  );
  assert.doesNotMatch(eventBlock, /email|api.?key|prompt|role/i);
});

test("失败开局可复用原扣费会话，已结束对局不会被错误重开", () => {
  assert.match(routeSource, /existing\.lifecycle_status === "failed"/);
  assert.match(routeSource, /lifecycle_status:\s*"starting"/);
  assert.match(routeSource, /game_start_request_ended/);
  assert.match(routeSource, /existing\.lifecycle_status === "abandoned"/);
  assert.match(routeSource, /existing\.lifecycle_status === "completed"/);
});
