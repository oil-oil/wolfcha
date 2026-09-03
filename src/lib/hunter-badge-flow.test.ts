import assert from "node:assert/strict";
import test from "node:test";
import type { GameState, Player } from "@/types/game";
import { continueAfterHunterShotWithBadgeTransfer } from "./hunter-badge-flow";

const sheriff: Player = {
  playerId: "sheriff",
  seat: 2,
  displayName: "警长",
  alive: false,
  role: "Hunter",
  alignment: "village",
  isHuman: false,
};

const state = {
  players: [sheriff],
  badge: { holderSeat: sheriff.seat },
} as GameState;

test("猎人开枪后若警长死亡，必须先完成警徽移交再继续流程", async () => {
  const events: string[] = [];
  const transferredState = { ...state, badge: { ...state.badge, holderSeat: null } };

  await continueAfterHunterShotWithBadgeTransfer(
    state,
    async (_currentState, deadSheriff, continuation) => {
      events.push(`transfer:${deadSheriff.seat}`);
      await continuation(transferredState);
    },
    async (nextState) => {
      events.push(`continue:${String(nextState.badge.holderSeat)}`);
    }
  );

  assert.deepEqual(events, ["transfer:2", "continue:null"]);
});

test("警长仍存活时直接继续，不触发警徽移交", async () => {
  const aliveState = {
    ...state,
    players: [{ ...sheriff, alive: true }],
  };
  let transferCalls = 0;
  let continuationCalls = 0;

  await continueAfterHunterShotWithBadgeTransfer(
    aliveState,
    async () => {
      transferCalls += 1;
    },
    async (nextState) => {
      continuationCalls += 1;
      assert.equal(nextState, aliveState);
    }
  );

  assert.equal(transferCalls, 0);
  assert.equal(continuationCalls, 1);
});
