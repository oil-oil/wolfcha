import assert from "node:assert/strict";
import test from "node:test";
import type { Alignment, GameState, Player } from "@/types/game";
import { AsyncFlowController } from "./game-flow-controller";
import { createExecutionLastWordsContinuation, resumeExecutionLastWords } from "./last-words-flow";

const executed: Player = {
  playerId: "executed",
  seat: 0,
  displayName: "Executed player",
  alive: false,
  role: "Villager",
  alignment: "village",
  isHuman: true,
};

function savedLastWords(player: Player, sheriffSeat: number | null = null): GameState {
  return JSON.parse(JSON.stringify({
    gameId: "restored-game",
    gameSessionId: "restored-session",
    day: 2,
    phase: "DAY_LAST_WORDS",
    currentSpeakerSeat: player.seat,
    players: [player],
    badge: { holderSeat: sheriffSeat },
    roleAbilities: { hunterCanShoot: true },
    messages: [{ id: "saved-speech", content: "Already recorded." }],
    votes: { first: player.seat },
  })) as GameState;
}

type Runtime = Parameters<typeof createExecutionLastWordsContinuation>[1];
type Completion = ReturnType<typeof createExecutionLastWordsContinuation>;
type ResumeRuntime = Parameters<typeof resumeExecutionLastWords>[3];

function runtime(overrides: Partial<Runtime> = {}): Runtime {
  return {
    isCurrent: () => true,
    transferBadge: async () => assert.fail("Unexpected badge transfer"),
    handleHunter: async () => assert.fail("Unexpected Hunter action"),
    checkWinner: () => null,
    endGame: async () => assert.fail("Unexpected game end"),
    proceedToNight: async () => assert.fail("Unexpected night transition"),
    ...overrides,
  };
}

function resumeRuntime(overrides: Partial<ResumeRuntime>): ResumeRuntime {
  return {
    setHumanContinuation: () => assert.fail("Unexpected human continuation"),
    showHumanTurn: () => assert.fail("Unexpected human prompt"),
    runAISpeech: async () => assert.fail("Unexpected AI speech"),
    ...overrides,
  };
}

test("恢复真人遗言时，提示发言之前恢复继续回调，重复完成只进入一晚", async () => {
  const state = savedLastWords(executed);
  const events: string[] = [];
  let finish: Completion | undefined;
  const continuation = createExecutionLastWordsContinuation(executed.seat, runtime({
    proceedToNight: async (next) => {
      assert.equal(next, state);
      events.push("night");
    },
  }));

  await resumeExecutionLastWords(state, state.players[0], continuation, resumeRuntime({
    setHumanContinuation: (callback) => {
      finish = callback;
      events.push("armed");
    },
    showHumanTurn: () => events.push("prompt"),
  }));

  assert.deepEqual(events, ["armed", "prompt"]);
  assert.ok(finish);
  await Promise.all([finish(state), finish(state)]);
  assert.deepEqual(events, ["armed", "prompt", "night"]);
});

test("恢复 AI 遗言时，将结算后的继续回调传给发言队列，而不是回到投票", async () => {
  const state = savedLastWords({ ...executed, isHuman: false });
  const events: string[] = [];
  const continuation = createExecutionLastWordsContinuation(executed.seat, runtime({
    checkWinner: () => "village",
    endGame: async (next, winner) => {
      assert.equal(next, state);
      events.push(winner);
    },
  }));

  await resumeExecutionLastWords(state, state.players[0], continuation, resumeRuntime({
    runAISpeech: async (next, speaker, { afterSpeech }) => {
      assert.equal(next, state);
      assert.equal(speaker, state.players[0]);
      assert.deepEqual(next.messages, state.messages);
      events.push("speech");
      await afterSpeech(next);
      await afterSpeech(next);
    },
  }));

  assert.deepEqual(events, ["speech", "village"]);
});

test("被放逐的猎人警长先移交再开枪，重复回调不会重复触发技能", async () => {
  const state = savedLastWords({ ...executed, role: "Hunter" }, executed.seat);
  const afterTransfer = { ...state, badge: { ...state.badge, holderSeat: null } };
  const events: string[] = [];
  const continuation = createExecutionLastWordsContinuation(executed.seat, runtime({
    transferBadge: async (next, sheriff, finish) => {
      assert.equal(next, state);
      assert.equal(sheriff.seat, executed.seat);
      events.push("badge");
      await Promise.all([finish(afterTransfer), finish(afterTransfer)]);
    },
    handleHunter: async (next, hunter) => {
      assert.equal(next, afterTransfer);
      assert.equal(hunter.role, "Hunter");
      events.push("hunter");
    },
    checkWinner: () => assert.fail("Winner check must wait for the Hunter action"),
  }));

  await continuation(state);
  assert.deepEqual(events, ["badge", "hunter"]);
});

test("猎人不能开枪时，使用移交后的状态判定胜负", async () => {
  const state = savedLastWords({ ...executed, role: "Hunter" }, executed.seat);
  const afterTransfer = {
    ...state,
    badge: { ...state.badge, holderSeat: null },
    roleAbilities: { ...state.roleAbilities, hunterCanShoot: false },
  };
  const winners: Alignment[] = [];
  const continuation = createExecutionLastWordsContinuation(executed.seat, runtime({
    transferBadge: async (_next, _sheriff, finish) => finish(afterTransfer),
    checkWinner: (next) => {
      assert.equal(next, afterTransfer);
      return "wolf";
    },
    endGame: async (next, winner) => {
      assert.equal(next, afterTransfer);
      winners.push(winner);
    },
  }));

  await continuation(state);
  assert.deepEqual(winners, ["wolf"]);
});

test("中断流程后，遗言及警徽移交的旧回调都不再推进新对局", async () => {
  const state = savedLastWords(executed, executed.seat);
  const flow = new AsyncFlowController();
  const token = flow.getToken();
  let finishTransfer: Completion | undefined;
  const continuation = createExecutionLastWordsContinuation(executed.seat, runtime({
    isCurrent: token.isValid,
    transferBadge: async (_next, _sheriff, finish) => {
      finishTransfer = finish;
    },
  }));
  const other = createExecutionLastWordsContinuation(executed.seat, runtime({ isCurrent: token.isValid }));

  await continuation(state);
  assert.ok(finishTransfer);
  flow.interrupt();
  await finishTransfer(state);
  await other(state);
});
