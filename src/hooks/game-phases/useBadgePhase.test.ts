import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createSinglePlayerContextAuditState } from "../../../scripts/single-player-context-audit";
import type { GameState } from "@/types/game";
import type { BadgePhaseActions } from "./useBadgePhase";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "badge-round-test-key";

test("真实警徽结算：首轮票型公开进入 PK，复投保留各轮候选与改票记录", async () => {
  const modules: Record<string, unknown> = {
    "@/lib/game-master": await import("@/lib/game-master"),
    "@/lib/vote-rounds": await import("@/lib/vote-rounds"),
    "@/i18n/translator": await import("@/i18n/translator"),
    "@/lib/game-texts": await import("@/lib/game-texts"),
    "@/lib/game-constants": await import("@/lib/game-constants"),
    "@/lib/game-flow-controller": { delay: async () => {} },
    "@/lib/narrator-audio-player": { playNarrator: async () => {} },
    "@/store/game-machine": { gameStateAtom: {} },
  };
  let state = createSinglePlayerContextAuditState();
  state.phase = "DAY_BADGE_ELECTION"; state.day = 1; state.messages = [];
  state.badge = { ...state.badge, holderSeat: null, candidates: [0, 1, 2], revoteCount: 0, history: {}, allVotes: {},
    votes: Object.fromEntries(state.players.slice(3).map((p, i) => [p.playerId, i < 4 ? 0 : 1])) };
  const originalVotes = { ...state.badge.votes };
  modules.react = { useCallback: (fn: unknown) => fn, useRef: (current: unknown) => ({ current }) };
  modules.jotai = { useAtom: () => [state, (next: GameState) => { state = next; }] };
  const source = readFileSync("src/hooks/game-phases/useBadgePhase.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedModule = { exports: {} as { useBadgePhase: (callbacks: unknown) => BadgePhaseActions } };
  runInNewContext(`(function(require,module,exports){${code}\n})`, { console })((id: string) => {
    assert.ok(id in modules, id); return modules[id];
  }, loadedModule, loadedModule.exports);
  const hook = loadedModule.exports.useBadgePhase({
    setDialogue: () => {}, clearDialogue: () => {}, setIsWaitingForAI: () => {}, waitForUnpause: async () => {},
    isTokenValid: () => true, runAISpeech: async () => {},
    onBadgeElectionComplete: async (next: GameState) => { state = next; }, onBadgeTransferComplete: async () => {},
  });
  await hook.maybeResolveBadgeElection(state);
  assert.equal(state.phase, "DAY_PK_SPEECH");
  assert.equal(state.voteRounds?.length, 1);
  assert.deepEqual(state.voteRounds![0].candidates, [0, 1, 2]);
  assert.ok(state.messages.some((m) => m.content.startsWith("[VOTE_RESULT]")));
  const firstRound = state.voteRounds![0];
  state = { ...state, phase: "DAY_BADGE_ELECTION", badge: { ...state.badge,
    votes: Object.fromEntries(state.players.slice(2).map((p, i) => [p.playerId, i < 5 ? 1 : 0])) } };
  await hook.maybeResolveBadgeElection(state);
  assert.equal(state.voteRounds?.length, 2);
  assert.deepEqual(firstRound.votes, originalVotes);
  assert.deepEqual(state.voteRounds![0].votes, originalVotes);
  assert.deepEqual(state.voteRounds![1].candidates, [0, 1]);
  assert.equal(state.voteRounds![1].winnerSeat, 1);
  assert.equal(state.badge.holderSeat, 1);
  assert.deepEqual({ ...state.badge.history[1] }, state.voteRounds![1].votes);
});
