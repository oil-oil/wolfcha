import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { RoomCoordinator } from "../server/room-coordinator";
import { SupabaseRoomStore } from "../server/room-store";
import { ServerMultiplayerAiService } from "../server/ai-service";
import { takeOverMultiplayerPlayer } from "@/multiplayer/engine";
import type { MultiplayerGameCommand } from "@/types/multiplayer";

async function main() {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Local test database only");
  const client = createClient(url.origin, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const store = new SupabaseRoomStore(client);
  const users: string[] = [], rooms: string[] = [], sessions: string[] = [];
  const originalFetch = globalThis.fetch;
  const suffix = randomUUID().slice(0, 8);
  const summary: Record<string, unknown> = { at: new Date().toISOString(), providerRequests: 0, fixedResponseRequests: 0, defaultActionTimeoutMs: 90000, defaultSpeechTimeoutMs: 120000, testDataOnly: true };
  const saveFixtures = () => { if (process.env.QA_FIXTURE_FILE) writeFileSync(process.env.QA_FIXTURE_FILE, JSON.stringify({ users, rooms, sessions }), { mode: 0o600 }); };
  const release = async (userId: string, sessionId: string, roomId: string) => {
    const { error } = await client.rpc("release_multiplayer_game_session", { p_user_id: userId, p_session_id: sessionId, p_room_id: roomId }); if (error) throw error;
  };
  const reserve = async (userId: string, roomId: string) => {
    const { data, error } = await client.rpc("reserve_multiplayer_game_session", { p_user_id: userId, p_room_id: roomId, p_player_count: 8, p_difficulty: "normal" });
    if (error) throw error; const id = data?.[0]?.session_id; assert.ok(id); sessions.push(id); saveFixtures(); return String(id);
  };
  try {
    for (let i = 0; i < 8; i++) {
      const { data, error } = await client.auth.admin.createUser({ email: `lifecycle-${suffix}-${i}@wolfcha.local`, email_confirm: true });
      if (error) throw error; assert.ok(data.user); users.push(data.user.id); saveFixtures();
    }
    let attempts = 0, now = new Date();
    const c = new RoomCoordinator({ store, now: () => now, releaseGameSession: release, aiService: {
      isAvailable: () => true, async resolveAiTurns() { attempts++; throw new Error("AI_RETRY_EXHAUSTED", { cause: new Error("AI_HTTP_503") }); },
    }});
    const created = await c.create(users[0], { displayName: "临时生命周期房主", playerCount: 8, difficulty: "normal", locale: "zh" }); assert.ok(created.ok); const id = created.view.room.id; rooms.push(id); saveFixtures();
    for (let i = 1; i < 8; i++) assert.ok((await c.join(users[i], { code: created.view.room.code, displayName: `临时${i}` })).ok);
    const joined = await c.viewFor(id, users[0]); assert.ok(joined);
    const ready = await Promise.all(users.map(u => c.ready(u, id, true, joined.room.version))); assert.ok(ready.every(r => r.ok));
    const a = new RoomCoordinator({ store }), b = new RoomCoordinator({ store });
    const beforeRace = await c.viewFor(id, users[0]); assert.ok(beforeRace);
    assert.ok((await Promise.all([a.ready(users[0], id, false, beforeRace.room.version), b.ready(users[1], id, false, beforeRace.room.version)])).every(r => r.ok));
    assert.ok((await Promise.all([a.ready(users[0], id, true, beforeRace.room.version), b.ready(users[1], id, true, beforeRace.room.version)])).every(r => r.ok));
    const allReady = await c.viewFor(id, users[0]); assert.ok(allReady); assert.equal(allReady.members.filter(m => m.isReady).length, 8);
    summary.concurrentReadyClients = 8; summary.competingCoordinatorsReady = true;
    const session = await reserve(users[0], id);
    const started = await c.start(users[0], id, allReady.room.version, session); assert.ok(started.ok);
    let aggregate = await store.getRoom(id); assert.ok(aggregate?.room.serverState);
    let state = takeOverMultiplayerPlayer(aggregate.room.serverState, users[0], "timeout");
    state.phase = "DAY_BADGE_SIGNUP"; state.badge!.signup = {}; state.submittedSeats = {}; state.version = aggregate.room.version + 1;
    assert.ok(await store.applyTimeout(id, aggregate.room.version, "fixture-one-timeout", [users[0]], { serverState: state, phase: state.phase }, { type: "turn_expired", payload: {}, actorUserId: users[0] }));
    for (let i = 0; i < 3; i++) await assert.rejects(c.progressAi(id), /AI_RETRY_EXHAUSTED/);
    assert.equal(attempts, 3); assert.equal(await c.progressAi(id), false);
    const paused = await c.viewFor(id, users[1]); assert.ok(paused); assert.equal(paused.publicState.aiProgress?.status, "paused");
    const restarted = new RoomCoordinator({ store, aiService: { async resolveAiTurns(s) { attempts++; return s; } } });
    assert.equal(await restarted.progressAi(id), false); assert.equal(attempts, 3);
    assert.ok((await c.retryAi(users[1], id, paused.room.version)).ok);
    summary.durableFailurePause = true; summary.recoveryDoesNotResetPause = true; summary.explicitHostRetry = true;
    aggregate = await store.getRoom(id); assert.ok(aggregate?.room.serverState); state = aggregate.room.serverState;
    for (let i = 1; i < 7; i++) state = takeOverMultiplayerPlayer(state, users[i], "timeout");
    state.phase = "DAY_BADGE_SIGNUP"; state.badge!.signup = {}; state.submittedSeats = {}; state.turnKey = "fixture-last-human"; state.deadlineAt = new Date(now.getTime() + 90000).toISOString(); state.version = aggregate.room.version + 1;
    assert.ok(await store.applyTimeout(id, aggregate.room.version, "fixture-seven-timeouts", users.slice(1, 7), { serverState: state, phase: state.phase }, { type: "turn_expired", payload: {}, actorUserId: users[1] }));
    aggregate = await store.getRoom(id); assert.ok(aggregate); now = new Date(now.getTime() + 90001);
    assert.equal(await c.expireTurn(id, aggregate.room.version, "fixture-last-human"), true);
    assert.equal((await store.getRoom(id))?.room.status, "closed");
    assert.ok((await Promise.all(users.map(u => c.leave(u, id, 0)))).every(r => r.ok));
    const { count: claims, error: claimError } = await client.from("multiplayer_game_session_claims").select("session_id", { count: "exact", head: true }).eq("room_id", id).is("released_at", null); if (claimError) throw claimError; assert.equal(claims, 0);
    summary.lastHumanTimeoutCloses = true; summary.allSpectatorsCanLeave = true; summary.originalSessionOwnerClaimReleased = true;
    // The full integration run uses fixed legal responses through the production AI
    // parser/validator. It is explicitly not a paid-model or browser acceptance run.
    let fixedRequests = 0;
    globalThis.fetch = async (input, init) => {
      const target = new URL(input instanceof Request ? input.url : String(input));
      if (target.hostname === "qa-fixed.invalid") {
        fixedRequests++; if (fixedRequests > 200) throw Error("QA_FIXED_REQUEST_CAP");
        const body = JSON.parse(String(init?.body)); const prompt: string = body.messages[0].content;
        const actions = /当前允许动作：([^。\n]+)/.exec(prompt)?.[1].split("、") ?? [];
        const action = actions.includes("speech") ? "speech" : actions[0];
        const number = Number.parseInt(/可选目标玩家号：([^。\n]+)/.exec(prompt)?.[1] ?? "", 10);
        const decision = action === "speech" ? { action, content: "我会根据公开发言和票型作判断。" } : action === "witch" ? { action, save: false, poisonTargetSeat: null } : action === "badge_signup" ? { action, signup: false } : action === "badge_transfer" ? { action, destroy: true, targetSeat: null } : { action, targetSeat: Number.isFinite(number) ? number : null };
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      assert.ok(["localhost", "127.0.0.1"].includes(target.hostname), "External requests blocked in this fixture");
      return originalFetch(input, init);
    };
    const ai = new ServerMultiplayerAiService(async () => {}, 1500, () => ({ url: "http://qa-fixed.invalid/chat/completions", key: "fixture", model: "fixed-qa-model", provider: "zenmux" }));
    const full = new RoomCoordinator({ store, aiService: ai, releaseGameSession: release, completeGameSession: async (sessionId, winner, day) => {
      const { error } = await client.from("game_sessions").update({ completed: true, winner: winner === "village" ? "villager" : "wolf", rounds_played: day, ended_at: new Date().toISOString() }).eq("id", sessionId); if (error) throw error;
    }});
    const room = await full.create(users[1], { displayName: "临时整局房主", playerCount: 8, difficulty: "normal", locale: "zh" }); assert.ok(room.ok); rooms.push(room.view.room.id); saveFixtures();
    assert.ok((await full.join(users[2], { code: room.view.room.code, displayName: "临时整局访客" })).ok);
    for (const u of users.slice(1, 3)) { const v = await full.viewFor(room.view.room.id, u); assert.ok(v); assert.ok((await full.ready(u, v.room.id, true, v.room.version)).ok); }
    const startView = await full.viewFor(room.view.room.id, users[1]); assert.ok(startView);
    const fullSession = await reserve(users[1], room.view.room.id); assert.ok((await full.start(users[1], room.view.room.id, startView.room.version, fullSession)).ok);
    let humanCommands = 0, steps = 0;
    for (; steps < 300; steps++) {
      const v = await full.viewFor(room.view.room.id, users[1]); assert.ok(v); if (v.room.status === "finished") break;
      let submitted = false;
      for (const u of users.slice(1, 3)) {
        const own = await full.viewFor(room.view.room.id, u); assert.ok(own); const action = own.privateState.allowedActions[0]; if (!action) continue;
        const targetSeat = own.privateState.eligibleTargets[0] ?? null;
        const command = { commandId: randomUUID(), roomId: own.room.id, expectedVersion: own.room.version, type: action, targetSeat, ...(action === "speech" ? { content: `数据库整局人工发言${humanCommands}` } : {}), ...(action === "witch" ? { save: false, poisonTargetSeat: null } : {}), ...(action === "badge_signup" ? { signup: own.privateState.seat === 0 } : {}), ...(action === "badge_transfer" ? { destroy: true, targetSeat: null } : {}) } as MultiplayerGameCommand;
        const result = await full.command(u, command); assert.ok(result.ok, JSON.stringify(result.ok ? {} : result.error)); humanCommands++; submitted = true; break;
      }
      if (!submitted) assert.equal(await full.progressAi(room.view.room.id), true, "Expected a human or AI transition");
    }
    const terminal = await full.viewFor(room.view.room.id, users[1]); assert.ok(terminal); assert.equal(terminal.room.status, "finished");
    const { data: completed, error: completedError } = await client.from("game_sessions").select("completed,rounds_played").eq("id", fullSession).single(); if (completedError) throw completedError;
    assert.equal(completed.completed, true); assert.equal(completed.rounds_played, terminal.room.day);
    summary.fixedResponseRequests = fixedRequests; summary.fixedResponseGame = { completed: true, day: terminal.room.day, winner: terminal.room.winner, steps, humanCommands, browser: false, paidModel: false };
  } finally {
    globalThis.fetch = originalFetch;
    const cleanupErrors: string[] = [];
    for (const id of sessions) { const { error } = await client.from("game_sessions").delete().eq("id", id); if (error) cleanupErrors.push("session cleanup failed"); }
    for (const id of rooms) { const { error } = await client.from("multiplayer_rooms").delete().eq("id", id); if (error) cleanupErrors.push("room cleanup failed"); }
    for (const id of users) { const { error } = await client.auth.admin.deleteUser(id); if (error) cleanupErrors.push("temporary user cleanup failed"); }
    summary.cleanup = { users: users.length, rooms: rooms.length, sessions: sessions.length, errors: cleanupErrors };
    if (process.env.QA_SUMMARY_FILE) writeFileSync(process.env.QA_SUMMARY_FILE, JSON.stringify(summary, null, 2), { mode: 0o600 });
    assert.deepEqual(cleanupErrors, []);
  }
  console.log(JSON.stringify(summary));
}
void main().catch(cause => { console.error(cause instanceof Error ? cause.message : "Local database lifecycle test failed"); process.exitCode = 1; });
