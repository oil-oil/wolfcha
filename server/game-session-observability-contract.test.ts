import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260901142328_session_lifecycle_and_ai_attempts.sql"),
  "utf8",
).toLowerCase();
const normalizedMigration = migration.replace(/\s+/g, " ");
const tableDefinition = migration.slice(
  migration.indexOf("create table if not exists public.game_session_events"),
  migration.indexOf("create index if not exists game_session_events_session_created_idx"),
);
const helper = readFileSync(
  join(process.cwd(), "src/lib/server-game-observability.ts"),
  "utf8",
).toLowerCase();
const databaseTypes = readFileSync(join(process.cwd(), "src/types/database.ts"), "utf8");

test("可观测性只使用一张结构化事件表", () => {
  assert.equal(
    (migration.match(/create table(?: if not exists)? public\.game_session_events/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(migration, /create table[\s\S]*ai_attempts/);
  assert.match(migration, /event_id uuid primary key/);
  assert.match(migration, /session_id uuid references public\.game_sessions\(id\)/);
  assert.match(migration, /event_type text not null[\s\S]*event_type in \('lifecycle', 'credit_consume', 'ai_attempt'\)/);
  assert.match(migration, /input_chars integer not null/);
  assert.match(migration, /output_chars integer not null/);
  assert.match(migration, /prompt_tokens integer not null/);
  assert.match(migration, /completion_tokens integer not null/);
  for (const field of [
    "request_id",
    "attempt",
    "provider",
    "prompt_scope",
    "mode",
    "outcome",
    "http_status",
    "duration_ms",
    "error_code",
  ]) {
    assert.match(migration, new RegExp(`\\b${field}\\b`));
  }

  assert.doesNotMatch(tableDefinition, /prompt\s+text|response\s+text|api[_ ]key|role\s+text/);
  assert.doesNotMatch(helper, /payload|api[_ ]key|actor[_ ]role|player[_ ]role/);
});

test("废弃的匿名 SECURITY DEFINER 扣费入口被移除", () => {
  assert.match(
    migration,
    /drop function if exists public\.consume_credit_for_authorized_game_session\([\s\S]*uuid, integer, text, text, text, text[\s\S]*\)/,
  );
});

test("生命周期状态和结构约束完整", () => {
  assert.match(migration, /add column if not exists lifecycle_status text/);
  assert.match(migration, /add column if not exists started_at timestamptz/);
  assert.match(migration, /when completed then 'completed'/);
  assert.match(migration, /last_activity_at >= now\(\) - interval '24 hours' then 'running'/);
  assert.match(migration, /else 'abandoned'/);
  assert.match(migration, /game_sessions_lifecycle_status_activity_idx/);
  assert.match(
    normalizedMigration,
    /lifecycle_status in \(\s*'starting', 'running', 'failed', 'abandoned', 'completed'\s*\)/,
  );
  assert.match(migration, /event_type = 'lifecycle'[\s\S]*lifecycle_status is not null/);
  assert.match(migration, /event_type = 'lifecycle'[\s\S]*session_id is not null/);
  assert.doesNotMatch(migration, /event_type = 'lifecycle'[\s\S]*?and outcome is null/);
  assert.match(migration, /event_type = 'credit_consume'[\s\S]*outcome in \('success', 'replay', 'reject'\)/);
  assert.match(migration, /event_type = 'credit_consume'[\s\S]*request_id is not null/);
  assert.match(migration, /event_type = 'credit_consume'[\s\S]*error_code is null or outcome = 'reject'/);
  assert.match(migration, /event_type = 'ai_attempt'[\s\S]*lifecycle_status is null/);
  assert.match(migration, /event_type = 'ai_attempt'[\s\S]*session_id is not null/);
  assert.match(migration, /input_chars >= 0/);
  assert.match(migration, /output_chars >= 0/);
  assert.match(migration, /prompt_tokens >= 0/);
  assert.match(migration, /completion_tokens >= 0/);
  assert.match(migration, /create trigger game_sessions_lifecycle_event_trigger/);
  assert.match(migration, /after insert or update of lifecycle_status on public\.game_sessions/);
  assert.match(migration, /old\.lifecycle_status is not distinct from new\.lifecycle_status/);
});

test("事件表和 AI attempt RPC 仅允许 service_role", () => {
  assert.match(migration, /alter table public\.game_session_events enable row level security/);
  assert.match(
    migration,
    /revoke all on table public\.game_session_events from public, anon, authenticated/,
  );
  assert.match(migration, /grant all on table public\.game_session_events to service_role/);
  assert.match(migration, /record_game_session_ai_attempt\([\s\S]*security invoker/);
  assert.match(
    migration,
    /revoke all on function public\.record_game_session_ai_attempt\([\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.record_game_session_ai_attempt\([\s\S]*to service_role/,
  );
  assert.doesNotMatch(migration, /grant execute[\s\S]{0,240}to authenticated/);
});

test("AI attempt 校验归属、event_id 幂等且原子累加 session 指标", () => {
  assert.match(migration, /select gs\.user_id[\s\S]*from public\.game_sessions gs[\s\S]*for update/);
  assert.match(migration, /v_session_user_id is distinct from p_user_id/);
  assert.match(migration, /where e\.event_id = p_event_id[\s\S]*for update/);
  assert.match(migration, /game_session_ai_attempt_idempotency_conflict/);
  assert.match(migration, /insert into public\.game_session_events/);
  assert.match(migration, /ai_calls_count = coalesce\(ai_calls_count, 0\) \+ 1/);
  assert.match(migration, /ai_input_chars = coalesce\(ai_input_chars, 0\) \+ p_input_chars/);
  assert.match(migration, /ai_output_chars = coalesce\(ai_output_chars, 0\) \+ p_output_chars/);
  assert.match(migration, /ai_prompt_tokens = coalesce\(ai_prompt_tokens, 0\) \+ p_prompt_tokens/);
  assert.match(migration, /ai_completion_tokens = coalesce\(ai_completion_tokens, 0\) \+ p_completion_tokens/);
  assert.match(migration, /last_activity_at = now\(\)/);
});

test("服务端 helper 只写结构化字段，失败不返回底层错误或事件内容", () => {
  assert.match(helper, /export async function recordgamesessioncreditevent/);
  assert.match(helper, /export async function recordgamesessionaiattempt/);
  assert.match(helper, /requestid/);
  assert.match(helper, /outcome/);
  for (const field of ["requestid", "attempt", "provider", "promptscope", "mode", "httpstatus", "durationms", "errorcode"]) {
    assert.match(helper, new RegExp(field));
  }
  assert.match(helper, /from\("game_session_events"\)\.insert/);
  assert.match(helper, /rpc\("record_game_session_ai_attempt"/);
  assert.match(helper, /catch \{[\s\S]*throweventwriteerror\(\)/);
  assert.match(helper, /记录游戏会话可观测性事件失败/);
  assert.match(databaseTypes, /game_session_events: \{/);
  assert.match(databaseTypes, /record_game_session_ai_attempt: \{/);
});
