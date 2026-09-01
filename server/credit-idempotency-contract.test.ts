import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260901132040_idempotent_game_start_requests.sql",
  ),
  "utf8",
).toLowerCase();

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} must be defined`);
  const end = migration.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${name} must have a complete plpgsql body`);
  return migration.slice(start, end);
}

test("game_sessions 增加可空幂等列及同用户唯一键", () => {
  assert.match(
    migration,
    /alter table public\.game_sessions[\s\S]*add column if not exists start_request_id uuid;/,
  );
  assert.match(
    migration,
    /alter table public\.game_sessions[\s\S]*add column if not exists start_request_fingerprint text;/,
  );
  assert.match(
    migration,
    /create unique index if not exists game_sessions_user_start_request_uidx[\s\S]*\(user_id, start_request_id\)[\s\S]*where start_request_id is not null/,
  );
  assert.match(
    migration,
    /add constraint game_sessions_start_request_source_check[\s\S]*start_request_source in \('demo', 'external', 'spring_quota', 'project_credit'\)/,
  );
  assert.match(
    migration,
    /add constraint game_sessions_start_request_fields_check[\s\S]*start_request_id is null[\s\S]*start_request_fingerprint is null[\s\S]*start_request_source is null[\s\S]*start_request_id is not null[\s\S]*start_request_fingerprint is not null[\s\S]*start_request_source is not null/,
  );
  assert.match(migration, /start_request_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /if not exists \([\s\S]*pg_constraint[\s\S]*conname/);
  assert.match(migration, /validate constraint game_sessions_start_request_fields_check/);
});

test("credit v2 先锁余额并重放，再检查余额和扣费", () => {
  const body = functionBody("consume_credit_for_authorized_game_session_v2");
  const lock = body.indexOf("from public.user_credits uc");
  const replayLookup = body.indexOf("from public.game_sessions gs");
  const replayReturn = body.indexOf("return query select v_session_id, v_credits, true");
  const balanceCheck = body.indexOf("if v_credits <= 0");
  const debit = body.indexOf("update public.user_credits");
  const sessionInsert = body.indexOf("insert into public.game_sessions");

  assert.ok(lock >= 0 && body.indexOf("for update", lock) > lock);
  assert.ok(lock < replayLookup);
  assert.ok(replayLookup < replayReturn);
  assert.ok(replayReturn < balanceCheck);
  assert.ok(balanceCheck < debit && debit < sessionInsert);
  assert.match(body, /p_start_request_id uuid/);
  assert.match(body, /p_start_request_fingerprint text/);
  assert.match(body, /returns table\(session_id uuid, credits integer, replayed boolean\)/);
  assert.match(body, /'project_credit'/);
  assert.match(body, /v_existing_source is distinct from 'project_credit'/);
  assert.match(body, /idempotency_conflict/);
  assert.match(body, /replayed boolean/);
  assert.match(body, /return query select v_session_id, v_credits, false/);
});

test("spring v2 在同一事务中扣 quota 并插入 session，且重放返回 quota 状态", () => {
  const body = functionBody("consume_spring_quota_for_authorized_game_session_v2");
  const quotaLock = body.indexOf("from public.campaign_daily_quota q");
  const replayLookup = body.indexOf("from public.game_sessions gs");
  const replayReturn = body.indexOf("v_expires_at,\n             true");
  const expiryCheck = body.indexOf("if v_expires_at <= now()");
  const quotaUpdate = body.indexOf("update public.campaign_daily_quota");
  const sessionInsert = body.indexOf("insert into public.game_sessions");

  assert.ok(quotaLock >= 0 && body.indexOf("for update", quotaLock) > quotaLock);
  assert.ok(quotaLock < replayLookup && replayLookup < replayReturn);
  assert.ok(replayReturn < expiryCheck);
  assert.ok(expiryCheck < quotaUpdate && quotaUpdate < sessionInsert);
  assert.match(body, /spring_quota_expired/);
  assert.match(body, /insufficient_spring_quota/);
  assert.match(
    body,
    /returns table\([\s\S]*session_id uuid,[\s\S]*granted_quota integer,[\s\S]*consumed_quota integer,[\s\S]*expires_at timestamptz,[\s\S]*replayed boolean[\s\S]*\)/,
  );
  assert.doesNotMatch(body, /remaining_quota/);
  assert.match(body, /'spring_quota'/);
  assert.match(body, /v_existing_source is distinct from 'spring_quota'/);
  assert.match(body, /idempotency_conflict/);
  assert.match(body, /return query[\s\S]*v_consumed_quota \+ 1[\s\S]*false/);
});

test("两个新 RPC 使用 security invoker 且只向 service_role 授权", () => {
  const compactMigration = migration.replace(/\s+/g, " ");
  for (const [name, signature] of [
    [
      "consume_credit_for_authorized_game_session_v2",
      "uuid, integer, text, text, text, text, uuid, text",
    ],
    [
      "consume_spring_quota_for_authorized_game_session_v2",
      "uuid, text, date, integer, text, text, text, text, uuid, text",
    ],
  ]) {
    const functionPattern = new RegExp(
      `create or replace function public\\.${name}[\\s\\S]*?security invoker`,
    );
    assert.match(migration, functionPattern);
    assert.doesNotMatch(
      migration,
      new RegExp(`create or replace function public\\.${name}[\\s\\S]*?security definer`),
    );
    const compactSignature = signature.replaceAll(", ", ", ");
    assert.match(
      compactMigration,
      new RegExp(
        `revoke all on function public\\.${name}\\( ${compactSignature} \\) from public, anon, authenticated`,
      ),
    );
    assert.match(
      compactMigration,
      new RegExp(
        `grant execute on function public\\.${name}\\( ${compactSignature} \\) to service_role`,
      ),
    );
  }
});

test("迁移不替换或删除旧 credit RPC，并可重复执行", () => {
  assert.doesNotMatch(
    migration,
    /(?:drop|create or replace) function public\.consume_credit_for_authorized_game_session\s*\(/,
  );
  assert.match(migration, /add column if not exists/);
  assert.match(migration, /create or replace function public\.consume_credit_for_authorized_game_session_v2/);
  assert.match(migration, /create or replace function public\.consume_spring_quota_for_authorized_game_session_v2/);
});
