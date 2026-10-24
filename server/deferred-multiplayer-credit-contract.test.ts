import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261022120000_deferred_multiplayer_credit_charge.sql"),
  "utf8",
);
const consumeRoute = readFileSync(
  join(process.cwd(), "src/app/api/credits/consume/route.ts"),
  "utf8",
);
const apiAuth = readFileSync(join(process.cwd(), "src/lib/api-auth.ts"), "utf8");
const creditsHook = readFileSync(join(process.cwd(), "src/hooks/useCredits.ts"), "utf8");

test("多人预留按用户和房间复用，且预留本身不授权 AI 或扣费", () => {
  assert.match(migration, /credit_consumption_pending boolean not null default false/);
  assert.match(migration, /multiplayer_room_id uuid/);
  assert.match(migration, /unique index if not exists game_sessions_pending_multiplayer_room_idx[\s\S]*on public\.game_sessions \(user_id, multiplayer_room_id\)[\s\S]*credit_consumption_pending = true and completed = false/);
  assert.match(migration, /reserve_multiplayer_game_session[\s\S]*credit_authorized, credit_consumption_pending, multiplayer_room_id[\s\S]*false, true, p_room_id/);
  assert.match(migration, /on conflict \(user_id, multiplayer_room_id\)[\s\S]*credit_consumption_pending = true and completed = false[\s\S]*do update/);
  const deferredBranch = consumeRoute.indexOf("if (payload.deferredMultiplayerRoomId)");
  const activeCampaignGuard = consumeRoute.indexOf("if (springCampaignActive)", deferredBranch);
  const campaignConflict = consumeRoute.indexOf("status: 409", activeCampaignGuard);
  const reservationRpc = consumeRoute.indexOf('"reserve_multiplayer_game_session"', deferredBranch);
  const eagerConsumeCall = consumeRoute.indexOf("consumeCreditAndCreateSession(user, payload)", deferredBranch);
  assert.ok(deferredBranch >= 0 && activeCampaignGuard > deferredBranch);
  assert.ok(campaignConflict > activeCampaignGuard);
  assert.ok(reservationRpc > campaignConflict && eagerConsumeCall > campaignConflict);
  assert.match(consumeRoute.slice(activeCampaignGuard, reservationRpc), /Campaign credits are temporarily unavailable for multiplayer starts/);
  assert.match(creditsHook, /const deferredMultiplayer = Boolean\(options\.deferredMultiplayerRoomId\)/);
  assert.match(creditsHook, /customEnabled && !deferredMultiplayer \? getZenmuxApiKey\(\)/);
  assert.match(apiAuth, /eq\("credit_authorized", true\)/);
});

test("开局事务只为房间绑定的 pending session 扣费，并把扣费与房间状态提交放在同一 RPC", () => {
  const pendingBranch = migration.indexOf("elsif v_pending then");
  const charge = migration.indexOf("update public.user_credits", pendingBranch);
  const roomTransition = migration.indexOf("update public.multiplayer_rooms", charge);
  assert.ok(pendingBranch > 0 && charge > pendingBranch && roomTransition > charge);
  assert.match(migration.slice(pendingBranch, roomTransition), /multiplayer_room_id is distinct from p_room_id/);
  assert.match(migration.slice(pendingBranch, roomTransition), /select uc\.credits[\s\S]*for update/);
  assert.match(migration.slice(pendingBranch, roomTransition), /if not found or v_credits <= 0[\s\S]*authorized := false/);
  assert.match(migration.slice(pendingBranch, roomTransition), /credit_authorized = true,[\s\S]*credit_consumption_pending = false/);
  assert.match(migration, /exception when unique_violation then[\s\S]*authorized := false/);
});

test("旧已扣费 session 沿用授权窗口，pending session 不能绕过 owner、完成态或 claim 校验", () => {
  assert.match(migration, /v_session\.user_id::text <> p_user_id::text/);
  assert.match(migration, /v_session\.completed = true/);
  assert.match(migration, /v_session\.used_custom_key = true/);
  assert.match(migration, /v_session\.last_activity_at < now\(\) - interval '4 hours'/);
  assert.match(migration, /v_session\.multiplayer_room_id is not null[\s\S]*v_session\.multiplayer_room_id <> p_room_id/);
  assert.match(migration, /if exists \([\s\S]*where c\.session_id = p_session_id and c\.room_id <> p_room_id[\s\S]*\) then/);
  assert.match(migration, /set multiplayer_room_id = coalesce\(multiplayer_room_id, p_room_id\),[\s\S]*last_activity_at = now\(\)/);
  assert.match(migration, /v_claim\.room_id <> p_room_id or v_claim\.user_id <> p_user_id/);
  assert.match(migration, /v_pending and v_claim_found[\s\S]*authorized := false/);
});
