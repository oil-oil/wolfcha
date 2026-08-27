import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260824023353_multiplayer_timeout_atomicity.sql"),
  "utf8",
);
const reliableLifecycle = readFileSync(
  join(process.cwd(), "supabase/migrations/20260824032257_multiplayer_reliable_lifecycle.sql"),
  "utf8",
);

test("多人生命周期迁移包含原子超时接管和 owner 持久化", () => {
  assert.match(migration, /alter table public\.multiplayer_rooms[\s\S]*game_session_owner_id/);
  assert.match(migration, /create or replace function public\.takeover_multiplayer_timeout/);
  assert.match(migration, /v_next_host/);
  assert.match(migration, /multiplayer_members[\s\S]*role = 'spectator'[\s\S]*seat = null[\s\S]*connected = false/);
});

test("超时 RPC 固定 search_path 且仅授权 service_role", () => {
  assert.match(migration, /takeover_multiplayer_timeout[\s\S]*security definer[\s\S]*set search_path = pg_catalog, public/);
  assert.match(migration, /revoke all on function public\.takeover_multiplayer_timeout[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.takeover_multiplayer_timeout[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]{0,160}to authenticated/);
});

test("额度 claim 与开局在同一事务，结束时由房间触发器原子结算", () => {
  assert.match(reliableLifecycle, /create or replace function public\.start_multiplayer_room/);
  assert.match(reliableLifecycle, /multiplayer_game_session_claims[\s\S]*update public\.multiplayer_rooms/);
  assert.match(reliableLifecycle, /create trigger multiplayer_rooms_complete_game_session/);
  assert.match(reliableLifecycle, /update public\.game_sessions[\s\S]*completed = true/);
  assert.match(reliableLifecycle, /grant execute on function public\.start_multiplayer_room[\s\S]*to service_role/);
  assert.match(reliableLifecycle, /create or replace function public\.purge_multiplayer_history/);
  assert.match(reliableLifecycle, /where status <> 'in_game'/);
  assert.match(reliableLifecycle, /create trigger multiplayer_rooms_set_finished_at/);
  assert.match(reliableLifecycle, /create or replace function public\.increment_multiplayer_ai_usage/);
  assert.match(reliableLifecycle, /ai_calls_count = coalesce\(ai_calls_count, 0\) \+ p_calls/);
  assert.match(reliableLifecycle, /increment_multiplayer_ai_usage[\s\S]*security definer[\s\S]*set search_path = pg_catalog, public/);
  assert.match(reliableLifecycle, /grant execute on function public\.increment_multiplayer_ai_usage[\s\S]*to service_role/);
  assert.doesNotMatch(reliableLifecycle, /grant execute[\s\S]{0,160}to authenticated/);
});
