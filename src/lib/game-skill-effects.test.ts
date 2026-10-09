import assert from "node:assert/strict";
import test from "node:test";
import type { GameState, Player } from "@/types/game";
import { ROLE_SKILL_AUDIO } from "./role-skill-effects";
import {
  GameSkillCueTracker, GameSkillPlayback, isGameSkillCueVisible,
  type GameSkillCue, type GameSkillEvent, type GameSkillType,
} from "./game-skill-effects";
import type { WolfStrikeSound } from "./wolf-strike";

function fixture(role: Player["role"] = "Werewolf"): GameState {
  return {
    gameId: "integration-game", day: 1, phase: "NIGHT_WOLF_ACTION", difficulty: "normal",
    players: [
      { playerId: "human", seat: 0, displayName: "Human", isHuman: true, role, alignment: "village", alive: true },
      { playerId: "target", seat: 1, displayName: "Target", isHuman: false, role: "Villager", alignment: "village", alive: true },
      { playerId: "other", seat: 2, displayName: "Other", isHuman: false, role: "Werewolf", alignment: "wolf", alive: true },
      { playerId: "hunter", seat: 3, displayName: "Hunter", isHuman: false, role: "Hunter", alignment: "village", alive: false },
      { playerId: "idiot", seat: 4, displayName: "Idiot", isHuman: false, role: "Idiot", alignment: "village", alive: true },
    ],
    roleAbilities: { witchHealUsed: false, witchPoisonUsed: false, hunterCanShoot: true, idiotRevealed: false, whiteWolfKingBoomUsed: false },
    nightActions: {}, events: [], messages: [], currentSpeakerSeat: null, daySpeechStartSeat: null,
    badge: { holderSeat: null, candidates: [], signup: {}, votes: {}, allVotes: {}, history: {}, revoteCount: 0 },
    votes: {}, voteHistory: {}, dailySummaries: {}, dailySummaryFacts: {}, winner: null,
  };
}

function cue(type: GameSkillType, targetSeat = 1): GameSkillCue {
  return { type, targetSeat, gameId: "integration-game", day: 1, viewerId: "human" };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function playbackHarness(play?: (type: GameSkillType, isCurrent: () => boolean) => Promise<number | null>) {
  let now = 1000;
  let nextTimer = 0;
  const events: Array<GameSkillEvent | null> = [];
  const starts: GameSkillType[] = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const sounds = new Map<GameSkillType, WolfStrikeSound>();
  for (const type of ["wolf", ...Object.keys(ROLE_SKILL_AUDIO)] as GameSkillType[]) {
    sounds.set(type, { play: (current) => { starts.push(type); return play?.(type, current) ?? Promise.resolve(now - 20); }, stop: () => {} });
  }
  const playback = new GameSkillPlayback((event) => events.push(event), sounds, {
    now: () => now,
    schedule: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id as unknown as ReturnType<typeof setTimeout>; },
    clear: (id) => { timers.delete(id as unknown as number); },
  });
  const finish = () => {
    const [id, timer] = timers.entries().next().value!;
    timers.delete(id); now += timer.delay; timer.callback();
  };
  return { playback, events, starts, timers, finish };
}

test("recovered private actions and public deaths establish a baseline without replaying sounds", () => {
  for (const role of ["Werewolf", "WhiteWolfKing", "Seer", "Witch", "Guard", "Hunter", "Villager"] as const) {
    const state = fixture(role);
    state.phase = "NIGHT_SEER_ACTION";
    state.nightActions = { wolfTarget: 1, seerTarget: 2, guardTarget: 0, witchSave: true, witchPoison: 2 };
    state.nightHistory = { 1: { resultsAnnounced: true, hunterShot: { hunterSeat: 3, targetSeat: 1 } } };
    state.roleAbilities.idiotRevealed = true;
    state.roleAbilities.whiteWolfKingBoomUsed = true;
    const before = JSON.stringify(state);
    const tracker = new GameSkillCueTracker();
    assert.deepEqual(tracker.observe(state, state.players[0], true), { reset: true, cues: [] });
    assert.deepEqual(tracker.observe(state, state.players[0], true), { reset: false, cues: [] });
    assert.equal(JSON.stringify(state), before, "effects never write the game state or a persisted action");
  }
});

test("only newly committed private actions animate for their living owner; selecting alone produces no cue", () => {
  for (const [role, phase, actions, types] of [
    ["Werewolf", "NIGHT_WOLF_ACTION", { wolfTarget: 1 }, ["wolf"]],
    ["WhiteWolfKing", "NIGHT_WOLF_ACTION", { wolfTarget: 1 }, ["wolf"]],
    ["Seer", "NIGHT_SEER_ACTION", { seerTarget: 1 }, ["seer"]],
    ["Guard", "NIGHT_GUARD_ACTION", { guardTarget: 0 }, ["guard"]],
    ["Witch", "NIGHT_WITCH_ACTION", { wolfTarget: 1, witchSave: true, witchPoison: 2 }, ["witch-save", "witch-poison"]],
  ] as const) {
    const state = fixture(role); state.phase = phase;
    const tracker = new GameSkillCueTracker(); tracker.observe(state, state.players[0], true);
    assert.deepEqual(tracker.observe({ ...state }, state.players[0], true).cues, [], "uncommitted selection is not an action");
    const committed = { ...state, nightActions: actions };
    assert.deepEqual(tracker.observe(committed, state.players[0], true).cues.map((event) => event.type), types);
    assert.deepEqual(tracker.observe(committed, state.players[0], true).cues, [], "dialogue and unrelated renders cannot retrigger");
    for (const viewer of [null, { ...state.players[0], role: "Villager" as const }, { ...state.players[0], alive: false }]) {
      const privateTracker = new GameSkillCueTracker(); privateTracker.observe(state, viewer, true);
      assert.deepEqual(privateTracker.observe(committed, viewer, true).cues, []);
    }
  }
});

test("the same target can animate on the next night; stale NIGHT_START fields are never an attack", () => {
  for (const role of ["Werewolf", "Guard", "Seer", "Witch"] as const) {
    const state = fixture(role);
    const actions = role === "Werewolf" ? { wolfTarget: 1 } : role === "Guard" ? { guardTarget: 1 } : role === "Seer" ? { seerTarget: 1 } : { witchPoison: 1 };
    const tracker = new GameSkillCueTracker(); tracker.observe(state, state.players[0], true);
    assert.equal(tracker.observe({ ...state, nightActions: actions }, state.players[0], true).cues.length, 1);
    assert.deepEqual(tracker.observe({ ...state, day: 2, phase: "NIGHT_START", nightActions: actions }, state.players[0], true).cues, []);
    tracker.observe({ ...state, day: 2, nightActions: {} }, state.players[0], true);
    assert.equal(tracker.observe({ ...state, day: 2, nightActions: actions }, state.players[0], true).cues.length, 1);
  }
});

test("new games, development jumps, hidden/revealed tables and pause/resume discard old cues", () => {
  const state = fixture();
  const committed = { ...state, nightActions: { wolfTarget: 1 } };
  for (const boundary of ["new-game", "dev-jump", "hidden", "paused", "background"] as const) {
    const tracker = new GameSkillCueTracker(); tracker.observe(state, state.players[0], true);
    assert.equal(tracker.observe(committed, state.players[0], true).cues.length, 1);
    const changed = boundary === "new-game" ? { ...committed, gameId: "another-game" } : boundary === "dev-jump" ? { ...committed, devMutationId: 1 } : boundary === "paused" ? { ...committed, isPaused: true } : committed;
    if (boundary === "background") tracker.suspend();
    assert.deepEqual(tracker.observe(changed, changed.players[0], boundary !== "hidden").cues, []);
    assert.deepEqual(tracker.observe({ ...changed, isPaused: false }, changed.players[0], true).cues, []);
  }
});

test("unannounced night hunter shots remain private; later publication adds exactly one cue", () => {
  const state = fixture("Villager"); state.phase = "NIGHT_RESOLVE";
  state.nightHistory = { 1: { resultsAnnounced: false, hunterShot: { hunterSeat: 3, targetSeat: 1 } } };
  const tracker = new GameSkillCueTracker(); tracker.observe(state, state.players[0], true);
  assert.deepEqual(tracker.observe(state, state.players[0], true).cues, []);
  const published = { ...state, phase: "DAY_SPEECH" as const, nightHistory: { 1: { ...state.nightHistory[1], resultsAnnounced: true } } };
  assert.deepEqual(tracker.observe(published, state.players[0], true).cues, [cue("hunter-shot")]);
  assert.deepEqual(tracker.observe(published, state.players[0], true).cues, []);
  const invalid = new GameSkillCueTracker(); invalid.observe(fixture(), state.players[0], true);
  assert.deepEqual(invalid.observe({ ...published, dayHistory: { 1: { hunterShot: { hunterSeat: 2, targetSeat: 1 } } }, nightHistory: {} }, state.players[0], true).cues, []);
});

test("real idiot reveal and white wolf execution produce fresh public cues, without selection predictions", () => {
  const state = fixture("WhiteWolfKing"); state.phase = "WHITE_WOLF_KING_BOOM";
  const tracker = new GameSkillCueTracker(); tracker.observe(state, state.players[0], true);
  assert.deepEqual(tracker.observe(state, state.players[0], true).cues, []);
  const executed = { ...state, players: state.players.map((player) => player.seat < 2 ? { ...player, alive: false } : player),
    roleAbilities: { ...state.roleAbilities, whiteWolfKingBoomUsed: true, idiotRevealed: true },
    dayHistory: { 1: { whiteWolfKingBoom: { boomSeat: 0, targetSeat: 1 }, idiotRevealed: { seat: 4 } } } };
  assert.deepEqual(tracker.observe(executed, executed.players[0], true).cues.map((event) => [event.type, event.targetSeat]), [["idiot", 4], ["white-wolf-king", 1]]);
});

test("batched vote, boom and shot completion retain their actual public day after the next night begins", () => {
  const state = fixture("WhiteWolfKing"); state.phase = "DAY_VOTE";
  const tracker = new GameSkillCueTracker(); tracker.observe(state, state.players[0], true);
  const nextNight: GameState = { ...state, day: 2, phase: "NIGHT_START",
    players: state.players.map((player) => player.seat < 2 ? { ...player, alive: false } : player),
    roleAbilities: { ...state.roleAbilities, whiteWolfKingBoomUsed: true, idiotRevealed: true },
    dayHistory: { 1: { whiteWolfKingBoom: { boomSeat: 0, targetSeat: 1 }, idiotRevealed: { seat: 4 }, hunterShot: { hunterSeat: 3, targetSeat: 2 } } },
  };
  assert.deepEqual(tracker.observe(nextNight, nextNight.players[0], true).cues.map((event) => [event.type, event.targetSeat, event.day]), [["hunter-shot", 2, 1], ["idiot", 4, 1], ["white-wolf-king", 1, 1]]);
  assert.deepEqual(tracker.observe(nextNight, nextNight.players[0], true).cues, []);
  assert.deepEqual(new GameSkillCueTracker().observe(nextNight, nextNight.players[0], true).cues, [], "recovery still does not replay completed public actions");
});

test("private cues lose ownership immediately at daybreak, a new night, death, viewer change or interruption", () => {
  for (const [role, type, actions] of [
    ["Werewolf", "wolf", { wolfTarget: 1 }], ["Guard", "guard", { guardTarget: 1 }],
    ["Seer", "seer", { seerTarget: 1 }], ["Witch", "witch-save", { wolfTarget: 1, witchSave: true }],
    ["Witch", "witch-poison", { witchPoison: 1 }],
  ] as const) {
    const state = fixture(role); state.nightActions = actions;
    const event = cue(type);
    assert.equal(isGameSkillCueVisible(event, state, state.players[0], true), true);
    for (const changed of [{ ...state, phase: "DAY_START" as const }, { ...state, phase: "GAME_END" as const }, { ...state, day: 2 }, { ...state, isPaused: true }, { ...state, gameId: "new" }, { ...state, devMutationId: 1 }]) {
      assert.equal(isGameSkillCueVisible(event, changed, state.players[0], true), false);
    }
    assert.equal(isGameSkillCueVisible(event, state, state.players[0], false), false);
    assert.equal(isGameSkillCueVisible(event, state, { ...state.players[0], playerId: "new-viewer" }, true), false);
    assert.equal(isGameSkillCueVisible(event, state, { ...state.players[0], alive: false }, true), false);
  }
});

test("public effects can finish during normal phase transitions; game end still clears all ownership", () => {
  const state = fixture(); state.phase = "NIGHT_START"; state.day = 2;
  state.roleAbilities.idiotRevealed = true; state.roleAbilities.whiteWolfKingBoomUsed = true;
  state.dayHistory = { 1: { hunterShot: { hunterSeat: 3, targetSeat: 1 } } };
  for (const type of ["idiot", "white-wolf-king", "hunter-shot"] as const) {
    assert.equal(isGameSkillCueVisible(cue(type), state, null, true), true);
    assert.equal(isGameSkillCueVisible(cue(type), { ...state, phase: "GAME_END" }, null, true), false);
  }
});

test("simultaneous committed effects play in order on their actual media clocks", async () => {
  const h = playbackHarness(); h.playback.enqueue([cue("witch-save"), cue("witch-poison", 2)]);
  await settle();
  assert.deepEqual(h.starts, ["witch-save"]);
  assert.equal(h.events.at(-1)?.startedAt, 980);
  assert.equal(h.timers.values().next().value?.delay, 1580);
  const firstId = h.events.at(-1)!.id;
  h.finish(); await settle();
  assert.deepEqual(h.starts, ["witch-save", "witch-poison"]);
  assert.equal(h.events.at(-1)?.type, "witch-poison");
  assert.equal(h.events.at(-1)?.targetSeat, 2);
  assert.ok(h.events.at(-1)!.id > firstId);
  h.finish(); assert.equal(h.events.at(-1), null); assert.equal(h.timers.size, 0);
});

test("late sound completion after cancellation cannot resurrect a target or its queued successor", async () => {
  let resolve!: (time: number | null) => void;
  let owns!: () => boolean;
  const h = playbackHarness((_type, current) => { owns = current; return new Promise((done) => { resolve = done; }); });
  h.playback.enqueue([cue("wolf"), cue("idiot", 4)]);
  h.playback.cancel(); assert.equal(owns(), false);
  resolve(1000); await settle();
  assert.deepEqual(h.starts, ["wolf"]);
  assert.ok(h.events.every((event) => event === null)); assert.equal(h.timers.size, 0);
  const count = h.events.length; h.playback.cancel(false); assert.equal(h.events.length, count);
});

test("reentry with a new target cancels the previous sound and a stale timer cannot erase the new cue", async () => {
  const h = playbackHarness(); h.playback.enqueue([cue("wolf")]); await settle();
  const old = h.timers.values().next().value!;
  const id = h.events.at(-1)!.id;
  h.playback.retain((event) => event.targetSeat === 2);
  h.playback.enqueue([cue("wolf", 2)]); await settle();
  const current = h.events.at(-1)!;
  assert.ok(current.id > id); assert.equal(current.targetSeat, 2);
  old.callback(); assert.equal(h.events.at(-1), current);
  h.finish(); assert.equal(h.events.at(-1), null);
});

test("a hunter's actual shot supersedes loading readiness and skips stale queued readiness", async () => {
  let ready!: (time: number | null) => void;
  const h = playbackHarness((type) => type === "hunter-ready" ? new Promise((done) => { ready = done; }) : Promise.resolve(1000));
  h.playback.enqueue([cue("hunter-ready", 0)]);
  h.playback.enqueue([cue("hunter-ready", 0), cue("hunter-shot", 2)]); await settle();
  assert.equal(h.events.at(-1)?.type, "hunter-shot");
  const shot = h.events.at(-1); ready(1000); await settle(); assert.equal(h.events.at(-1), shot);
  assert.deepEqual(h.starts, ["hunter-ready", "hunter-shot"]);
  h.finish(); assert.equal(h.events.at(-1), null);
});

test("visibility cancellation clears a whole queue; silence preserves the same visual lifetime", async () => {
  const h = playbackHarness(async () => null); h.playback.enqueue([cue("wolf"), cue("seer", 2)]); await settle();
  assert.equal(h.events.at(-1)?.startedAt, 1000);
  assert.equal(h.timers.values().next().value?.delay, 1100);
  h.playback.retain(() => false);
  assert.equal(h.events.at(-1), null); assert.equal(h.timers.size, 0);
  assert.deepEqual(h.starts, ["wolf"]);
});

test("malformed saved targets cannot block the next confirmed cue", async () => {
  const h = playbackHarness();
  h.playback.enqueue([cue("wolf", -1), cue("seer", NaN), cue("guard", 1.5), cue("wolf", 2)]);
  await settle();
  assert.deepEqual(h.starts, ["wolf"]);
  assert.equal(h.events.at(-1)?.targetSeat, 2);
  h.finish(); assert.equal(h.events.at(-1), null);
});
