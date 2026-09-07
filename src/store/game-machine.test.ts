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

test("投票中刷新保留每张已提交的票，旧发言延迟保存不能覆盖投票检查点", async () => {
  const [{ readFileSync }, { runInNewContext }, ts, { createStore }, { createSinglePlayerContextAuditState }] = await Promise.all([
    import("node:fs"), import("node:vm"), import("typescript"), import("jotai"), import("../../scripts/single-player-context-audit"),
  ]);
  const modules: Record<string, unknown> = {
    jotai: await import("jotai"), "jotai/utils": await import("jotai/utils"),
    "@/types/game": await import("@/types/game"), "@/lib/game-master": await import("@/lib/game-master"),
    "@/lib/game-session-policy": await import("@/lib/game-session-policy"), "@/i18n/translator": await import("@/i18n/translator"),
  };
  const storage = new Map<string, string>();
  const timers = new Map<number, () => void>(); let serial = 0;
  const localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) };
  const code = ts.transpileModule(readFileSync("src/store/game-machine.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const load = () => {
    const m = { exports: {} as typeof import("./game-machine") };
    runInNewContext(`(function(require,module,exports){${code}\n})`, {
      window: {}, localStorage, console,
      setTimeout: (fn: () => void) => { timers.set(++serial, fn); return serial; },
      clearTimeout: (id: number) => timers.delete(id),
    })((id: string) => { assert.ok(id in modules, id); return modules[id]; }, m, m.exports);
    return m.exports;
  };
  const { gameStateAtom } = load(); const store = createStore();
  const state = createSinglePlayerContextAuditState(); state.gameSessionId = "vote-resume-test"; state.phase = "DAY_SPEECH";
  store.set(gameStateAtom, state);
  store.set(gameStateAtom, { ...state, messages: [...state.messages] });
  assert.equal(timers.size, 1);
  const voting = { ...state, phase: "DAY_VOTE" as const, votes: { [state.players[0].playerId]: 4 } };
  store.set(gameStateAtom, voting);
  assert.equal(timers.size, 0);
  for (const fn of timers.values()) fn();
  const restored = createStore().get(load().gameStateAtom);
  assert.equal(restored.phase, "DAY_VOTE");
  assert.deepEqual({ ...restored.votes }, voting.votes);
  assert.equal(restored.gameSessionId, state.gameSessionId);
  const badge = { ...state, phase: "DAY_BADGE_ELECTION" as const, badge: { ...state.badge, candidates: [1, 2], votes: { [state.players[0].playerId]: -1 } } };
  store.set(gameStateAtom, badge);
  const badgeRestored = createStore().get(load().gameStateAtom);
  assert.equal(badgeRestored.phase, "DAY_BADGE_ELECTION");
  assert.deepEqual({ ...badgeRestored.badge.votes }, badge.badge.votes);
});
