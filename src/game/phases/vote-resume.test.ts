import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createSinglePlayerContextAuditState } from "../../../scripts/single-player-context-audit";
import type { GameState, Player } from "@/types/game";
import type { VotePhase } from "./VotePhase";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "vote-resume-test";

test("实际投票恢复只调用未投 AI，保留已投票和弃票，跳过翻牌白痴和 PK 候选", async () => {
  const modules: Record<string, unknown> = {};
  for (const id of ["@/lib/vote-rounds", "@/lib/prompt-utils", "@/i18n/translator", "@/lib/game-texts", "@/lib/game-constants", "@/lib/concurrency", "@/lib/narrator-voice", "@/lib/game-flow-controller"]) modules[id] = await import(id);
  modules["../core/GamePhase"] = await import("../core/GamePhase");
  modules["@/lib/narrator-audio-player"] = { playNarrator: async () => {} };
  const calls: string[] = [];
  modules["@/lib/game-master"] = { ...await import("@/lib/game-master"), generateAIVote: async (_: GameState, p: Player) => { calls.push(p.playerId); return { seat: 2, reason: "补完投票" }; } };
  const m = { exports: {} as { VotePhase: typeof VotePhase } };
  const code = ts.transpileModule(readFileSync("src/game/phases/VotePhase.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(`(function(require,module,exports){${code}\n})`, { console })((id: string) => { assert.ok(id in modules, id); return modules[id]; }, m, m.exports);
  let state = createSinglePlayerContextAuditState();
  state.players = state.players.map((p) => ({ ...p, isHuman: p.seat === 4 }));
  state.phase = "DAY_VOTE"; state.pkSource = "vote"; state.pkTargets = [1, 2];
  state.roleAbilities.idiotRevealed = true;
  state.votes = { [state.players[0].playerId]: -1 };
  const originalVotes = { ...state.votes };
  const expected = state.players.filter((p) => p.alive && !p.isHuman && p.role !== "Idiot" && ![0, 1, 2].includes(p.seat)).map((p) => p.playerId);
  let completed = false;
  const runtime = {
    token: { isValid: () => true }, isTokenValid: () => true, humanPlayer: state.players.find((p) => p.isHuman),
    setGameState: (v: GameState | ((p: GameState) => GameState)) => { state = typeof v === "function" ? v(state) : v; },
    getGameState: () => state, setDialogue: () => {}, setIsWaitingForAI: () => {}, waitForUnpause: async () => {},
    onVoteComplete: async () => { completed = true; }, onGameEnd: async () => {}, runAISpeech: async () => {},
  };
  const phase = new m.exports.VotePhase();
  await phase.handleAction({ state, extras: runtime }, { type: "RESUME_VOTES" });
  assert.deepEqual(calls, expected);
  assert.equal(state.votes[state.players[0].playerId], originalVotes[state.players[0].playerId]);
  assert.equal(completed, false);
  assert.equal(state.phase, "DAY_VOTE");
  calls.length = 0;
  await phase.handleAction({ state, extras: runtime }, { type: "RESUME_VOTES" });
  assert.deepEqual(calls, []);
});

async function loadVotePhase(generateAIVote: (state: GameState, player: Player) => Promise<{ seat: number; reason: string }>) {
  const modules: Record<string, unknown> = {};
  for (const id of ["@/lib/vote-rounds", "@/lib/prompt-utils", "@/i18n/translator", "@/lib/game-texts", "@/lib/game-constants", "@/lib/concurrency", "@/lib/narrator-voice", "@/lib/game-flow-controller"]) modules[id] = await import(id);
  modules["../core/GamePhase"] = await import("../core/GamePhase");
  modules["@/lib/narrator-audio-player"] = { playNarrator: async () => {} };
  modules["@/lib/game-master"] = { ...await import("@/lib/game-master"), generateAIVote };
  const m = { exports: {} as { VotePhase: typeof VotePhase } };
  const code = ts.transpileModule(readFileSync("src/game/phases/VotePhase.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(`(function(require,module,exports){${code}\n})`, { console })((id: string) => { assert.ok(id in modules, id); return modules[id]; }, m, m.exports);
  return new m.exports.VotePhase();
}

test("AI 放逐票并行发出且不超过并发上限，所有人基于同一份快照投票", async () => {
  const { GAME_CONFIG } = await import("@/lib/game-constants");
  let active = 0;
  let peak = 0;
  const seenVoteCounts: number[] = [];
  const phase = await loadVotePhase(async (snapshot, player) => {
    active += 1;
    peak = Math.max(peak, active);
    seenVoteCounts.push(Object.keys(snapshot.votes).length);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    return { seat: player.seat === 2 ? 3 : 2, reason: "并行投票" };
  });
  let state = createSinglePlayerContextAuditState();
  state.players = state.players.map((p) => ({ ...p, isHuman: false, alive: true }));
  state.phase = "DAY_VOTE"; state.pkSource = undefined; state.pkTargets = undefined;
  state.roleAbilities.idiotRevealed = false;
  state.votes = {};
  let resolved = false;
  const runtime = {
    token: { isValid: () => true }, isTokenValid: () => true, humanPlayer: null,
    setGameState: (v: GameState | ((p: GameState) => GameState)) => { state = typeof v === "function" ? v(state) : v; },
    getGameState: () => state, setDialogue: () => {}, setIsWaitingForAI: () => {}, waitForUnpause: async () => {},
    onVoteComplete: async () => { resolved = true; }, onGameEnd: async () => { resolved = true; }, runAISpeech: async () => {},
  };
  await phase.handleAction({ state, extras: runtime }, { type: "RESUME_VOTES" });

  assert.ok(peak > 1, "投票应当并行");
  assert.ok(peak <= GAME_CONFIG.AI_VOTE_CONCURRENCY, `并发 ${peak} 超过上限`);
  assert.equal(seenVoteCounts.length, state.players.length);
  assert.ok(seenVoteCounts.every((count) => count === 0), "后发出的请求不应看到先返回的票");
  assert.equal(Object.keys(state.votes).length, state.players.length);
  assert.equal(resolved, true);
});

test("并行投票途中对局被重置时，已返回的旧票不再写入也不结算", async () => {
  let valid = true;
  let returned = 0;
  const phase = await loadVotePhase(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    returned += 1;
    if (returned === 2) valid = false;
    return { seat: 2, reason: "迟到的票" };
  });
  let state = createSinglePlayerContextAuditState();
  state.players = state.players.map((p) => ({ ...p, isHuman: false, alive: true }));
  state.phase = "DAY_VOTE"; state.pkSource = undefined; state.pkTargets = undefined;
  state.roleAbilities.idiotRevealed = false;
  state.votes = {};
  let resolved = false;
  const runtime = {
    token: { isValid: () => valid }, isTokenValid: () => valid, humanPlayer: null,
    setGameState: (v: GameState | ((p: GameState) => GameState)) => { state = typeof v === "function" ? v(state) : v; },
    getGameState: () => state, setDialogue: () => {}, setIsWaitingForAI: () => {}, waitForUnpause: async () => {},
    onVoteComplete: async () => { resolved = true; }, onGameEnd: async () => { resolved = true; }, runAISpeech: async () => {},
  };
  await phase.handleAction({ state, extras: runtime }, { type: "RESUME_VOTES" });

  assert.equal(Object.keys(state.votes).length, 1);
  assert.ok(returned < state.players.length, "失效后不应继续发出剩余请求");
  assert.equal(resolved, false);
  assert.equal(state.phase, "DAY_VOTE");
});
