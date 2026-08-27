import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { buildStartedRoomState, takeOverMultiplayerPlayer } from "@/multiplayer/engine";
import { SupabaseRoomStore, type RoomRecord } from "../server/room-store";
import type { MultiplayerRoomMember } from "@/types/multiplayer";

type LocalStatus = { API_URL: string; SERVICE_ROLE_KEY: string };

async function main(): Promise<void> {
  const status = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" }),
  ) as LocalStatus;
  const client = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store = new SupabaseRoomStore(client);
  const suffix = randomUUID().slice(0, 8);
  const users: string[] = [];
  const gameSessionId = randomUUID();

  try {
    for (const label of ["host", "friend"]) {
      const { data, error } = await client.auth.admin.createUser({
        email: `${label}-${suffix}@wolfcha.local`,
        email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error("本地测试用户创建失败");
      users.push(data.user.id);
    }

    const roomId = randomUUID();
    const { error: sessionError } = await client.from("game_sessions").insert({
      id: gameSessionId,
      user_id: users[0],
      player_count: 8,
      difficulty: "normal",
      credit_authorized: true,
      used_custom_key: false,
      completed: false,
    });
    if (sessionError) throw sessionError;
    const host: MultiplayerRoomMember = {
      userId: users[0], displayName: "房主", role: "host", seat: 0,
      isReady: true, isConnected: true,
    };
    const friend: MultiplayerRoomMember = {
      userId: users[1], displayName: "朋友", role: "player", seat: 1,
      isReady: true, isConnected: true,
    };
    const room: RoomRecord = {
      id: roomId,
      code: `T${suffix}`.toUpperCase(),
      hostUserId: users[0],
      status: "lobby",
      phase: "LOBBY",
      day: 1,
      winner: null,
      version: 0,
      settings: { playerCount: 8, difficulty: "normal", locale: "zh" },
      createdAt: new Date().toISOString(),
      startedAt: null,
      serverState: null,
    };

    const created = await store.createRoom(room, host);
    assert.equal(created.room.version, 0);
    assert.equal(await store.saveMember(roomId, friend, 0, {
      type: "member_joined", payload: {}, actorUserId: users[1],
    }), 1);

    const startedState = {
      ...buildStartedRoomState([host, friend], 8, roomId),
      roomId,
      version: 2,
      gameSessionId,
      gameSessionOwnerId: users[0],
    };
    assert.deepEqual(await store.startRoomAtomically(roomId, 1, gameSessionId, users[0], {
      status: "in_game",
      phase: startedState.phase,
      day: startedState.day,
      serverState: startedState,
      gameSessionOwnerId: users[0],
      startedAt: new Date().toISOString(),
    }, { type: "room_started", payload: {}, actorUserId: users[0] }), { version: 2, authorized: true });

    const usageWrites = 32;
    await Promise.all(Array.from({ length: usageWrites }, async () => {
      const { data, error } = await client.rpc("increment_multiplayer_ai_usage", {
        p_session_id: gameSessionId,
        p_calls: 1,
        p_input_chars: 2,
        p_output_chars: 3,
        p_prompt_tokens: 4,
        p_completion_tokens: 5,
      });
      if (error) throw error;
      assert.equal(data, true);
    }));
    const { data: usage, error: usageError } = await client
      .from("game_sessions")
      .select("ai_calls_count,ai_input_chars,ai_output_chars,ai_prompt_tokens,ai_completion_tokens")
      .eq("id", gameSessionId)
      .single();
    if (usageError) throw usageError;
    assert.deepEqual(usage, {
      ai_calls_count: usageWrites,
      ai_input_chars: usageWrites * 2,
      ai_output_chars: usageWrites * 3,
      ai_prompt_tokens: usageWrites * 4,
      ai_completion_tokens: usageWrites * 5,
    }, "并发用量写入必须原子累加且不丢增量");

    const takenOverState = takeOverMultiplayerPlayer(startedState, users[0], "timeout");
    const timeout = await store.applyTimeout(roomId, 2, "store-timeout", [users[0]], {
      status: "in_game",
      phase: takenOverState.phase,
      day: takenOverState.day,
      serverState: takenOverState,
    }, { type: "turn_expired", payload: {}, actorUserId: users[0] });
    assert.deepEqual(timeout, { version: 3, duplicate: false });
    assert.deepEqual(
      await store.applyTimeout(roomId, 2, "store-timeout", [users[0]], {}, {
        type: "turn_expired", payload: {}, actorUserId: users[0],
      }),
      { version: 3, duplicate: true },
    );

    const aggregate = await store.getRoom(roomId);
    assert.equal(aggregate?.room.hostUserId, users[1]);
    assert.equal(aggregate?.room.gameSessionOwnerId, users[0]);
    assert.equal(aggregate?.members.find((member) => member.userId === users[0])?.role, "spectator");
    assert.equal(aggregate?.members.find((member) => member.userId === users[0])?.seat, null);

    const finishedState = {
      ...takenOverState,
      phase: "GAME_END" as const,
      winner: "village" as const,
      version: 4,
    };
    assert.deepEqual(await store.applyCommand(roomId, 3, "store-finish", users[1], {
      status: "finished",
      phase: "GAME_END",
      winner: "village",
      day: finishedState.day,
      serverState: finishedState,
    }, { type: "game_finished", payload: {}, actorUserId: users[1] }), { version: 4, duplicate: false });
    const { data: completedSession, error: completedSessionError } = await client
      .from("game_sessions")
      .select("completed,winner,rounds_played")
      .eq("id", gameSessionId)
      .single();
    if (completedSessionError) throw completedSessionError;
    assert.deepEqual(completedSession, { completed: true, winner: "villager", rounds_played: finishedState.day });
    const { data: claim, error: claimError } = await client
      .from("multiplayer_game_session_claims")
      .select("released_at")
      .eq("session_id", gameSessionId)
      .single();
    if (claimError) throw claimError;
    assert.ok(claim.released_at);
    const { error: ageError } = await client
      .from("multiplayer_rooms")
      .update({ finished_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000).toISOString() })
      .eq("id", roomId);
    if (ageError) throw ageError;
    assert.equal(await store.purgeExpiredRooms(30), 1);
    assert.equal(await store.getRoom(roomId), null);
    console.log("SupabaseRoomStore 本地集成测试通过");
  } finally {
    await client.from("game_sessions").delete().eq("id", gameSessionId);
    await Promise.all(users.map((userId) => client.auth.admin.deleteUser(userId)));
  }
}

void main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
