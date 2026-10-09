import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { GameState, Player } from "@/types/game";
import { getNewWolfStrikeTarget, WolfStrikeController, wolfStrikeForSeat, type WolfStrikeEvent, type WolfStrikeSound } from "./wolf-strike";

function harness(soundPlay: WolfStrikeSound["play"] = async () => null) {
  let now = 1000;
  let nextTimer = 0;
  let stopped = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const events: (WolfStrikeEvent | null)[] = [];
  const controller = new WolfStrikeController((event) => events.push(event), {
    play: soundPlay, stop: () => { stopped += 1; },
  }, {
    now: () => now,
    schedule: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clear: (id) => { timers.delete(id as unknown as number); },
  });
  return { controller, events, timers, setNow: (value: number) => { now = value; }, stopped: () => stopped };
}

test("the approved V4 A asset is byte-identical to the verified original, not a seer clip", () => {
  const file = readFileSync("public/audio/sfx/wolf-strike-v4a.wav");
  assert.equal(createHash("sha256").update(file).digest("hex"), "a86d85967f13af196865bffdbebe697073df3e991f436909e79d0d57698e9177");
  assert.equal(file.subarray(0, 4).toString(), "RIFF");
});

test("only the target receives the shared identity; seat zero is valid", async () => {
  const h = harness(async () => 980);
  await h.controller.play(0);
  const strike = h.events.at(-1)!;
  assert.deepEqual(strike, { id: 1, targetSeat: 0, startedAt: 980 });
  for (let seat = 0; seat < 12; seat += 1) assert.equal(wolfStrikeForSeat(strike, seat), seat === 0 ? strike : null);
  assert.equal(h.timers.values().next().value?.delay, 1080, "cleanup follows the real media origin, not promise completion");
});

test("repeating the same target has a new identity and a late old timer cannot erase it", async () => {
  const h = harness();
  await h.controller.play(7);
  const first = h.events.at(-1)!;
  const oldTimer = h.timers.values().next().value!;
  h.setNow(1120);
  await h.controller.play(7);
  const second = h.events.at(-1)!;
  assert.ok(second.id > first.id);
  assert.equal(second.targetSeat, 7);
  assert.equal(h.timers.size, 1);
  oldTimer.callback();
  assert.equal(h.events.at(-1), second);
  h.timers.values().next().value!.callback();
  assert.equal(h.events.at(-1), null);
  assert.ok(h.stopped() >= 3);
});

test("rapid asynchronous starts retain only the latest target", async () => {
  const pending: ((value: number | null) => void)[] = [];
  const h = harness(() => new Promise((resolve) => pending.push(resolve)));
  const first = h.controller.play(2);
  const second = h.controller.play(8);
  pending[1](1040);
  await second;
  const current = h.events.at(-1);
  pending[0](1000);
  await first;
  assert.equal(h.events.at(-1), current);
  assert.equal(current?.targetSeat, 8);
  assert.equal(current?.id, 2);
  assert.equal(h.timers.size, 1);
});

test("reset or unmount invalidates pending sound completion and removes timers", async () => {
  let resolve!: (value: number | null) => void;
  const h = harness(() => new Promise((done) => { resolve = done; }));
  const pending = h.controller.play(3);
  h.controller.cancel();
  resolve(1000);
  await pending;
  assert.ok(h.events.every((event) => event === null));
  assert.equal(h.timers.size, 0);
  const before = h.events.length;
  h.controller.cancel(false);
  assert.equal(h.events.length, before, "unmount must not publish another React state update");
});

test("silent playback still shows a cue and invalid targets leave the active cue intact", async () => {
  const h = harness();
  await h.controller.play(4);
  const current = h.events.at(-1);
  assert.equal(current?.startedAt, 1000);
  for (const target of [-1, 1.5, NaN]) await h.controller.play(target);
  assert.equal(h.events.at(-1), current);
  h.controller.cancel();
  assert.equal(h.events.at(-1), null);
  assert.equal(h.timers.size, 0);
});

test("private wolf cues do not disclose targets to other roles, dead wolves, or during daytime", () => {
  const wolf: Player = { playerId: "wolf", seat: 0, displayName: "wolf", isHuman: true, alive: true, role: "Werewolf", alignment: "wolf" };
  const target: Player = { ...wolf, playerId: "target", seat: 7, isHuman: false, role: "Villager", alignment: "village" };
  const state: Pick<GameState, "day" | "phase" | "players" | "nightActions"> = { day: 1, phase: "NIGHT_WOLF_ACTION", players: [wolf, target], nightActions: { wolfTarget: 7 } };
  assert.equal(getNewWolfStrikeTarget(state, wolf, {}), 7);
  assert.equal(getNewWolfStrikeTarget(state, { ...wolf, role: "WhiteWolfKing" }, {}), 7);
  for (const role of ["Seer", "Witch", "Guard", "Hunter", "Idiot", "Villager"] as const) {
    assert.equal(getNewWolfStrikeTarget(state, { ...wolf, role }, {}), null);
  }
  assert.equal(getNewWolfStrikeTarget(state, { ...wolf, alive: false }, {}), null);
  assert.equal(getNewWolfStrikeTarget(state, null, {}), null);
  assert.equal(getNewWolfStrikeTarget({ ...state, phase: "DAY_SPEECH" }, wolf, {}), null);
  for (const phase of ["NIGHT_START", "NIGHT_GUARD_ACTION", "NIGHT_WITCH_ACTION", "NIGHT_SEER_ACTION", "NIGHT_RESOLVE"] as const) {
    assert.equal(getNewWolfStrikeTarget({ ...state, phase }, wolf, { wolfTarget: 0, wolfDay: 1 }), null, "later role transitions cannot replay an earlier attack snapshot");
  }
  assert.equal(getNewWolfStrikeTarget({ ...state, nightActions: { wolfTarget: -1 } }, wolf, {}), null);
  assert.equal(getNewWolfStrikeTarget(state, wolf, { wolfTarget: 7, wolfDay: 1 }), null);
  assert.equal(getNewWolfStrikeTarget({ ...state, day: 2 }, wolf, { wolfTarget: 7, wolfDay: 1 }), 7);
  const before = JSON.stringify(state);
  getNewWolfStrikeTarget(state, wolf, {});
  assert.equal(JSON.stringify(state), before, "presentation cannot resolve or change the game");
});
