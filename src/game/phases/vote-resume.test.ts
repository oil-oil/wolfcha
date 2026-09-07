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
  for (const id of ["@/lib/vote-rounds", "@/lib/prompt-utils", "@/i18n/translator", "@/lib/game-texts", "@/lib/game-constants", "@/lib/narrator-voice", "@/lib/game-flow-controller"]) modules[id] = await import(id);
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
