import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

test("进行中的持久化状态必须携带唯一 gameSessionId，且版本已升级", async () => {
  const { createInitialGameState } = await import("@/lib/game-master");
  const { GAME_STATE_VERSION, isRestorableGameState } = await import("@/store/game-machine");
  const state = createInitialGameState();
  state.phase = "NIGHT_START";
  state.players = [{
    playerId: "player-1",
    seat: 0,
    displayName: "你",
    avatarSeed: "player-1",
    alive: true,
    role: "Villager",
    alignment: "village",
    isHuman: true,
  }];

  assert.equal(GAME_STATE_VERSION, 2);
  assert.equal(isRestorableGameState(state), false);
  state.gameSessionId = "session-1";
  assert.equal(isRestorableGameState(state), true);
});
