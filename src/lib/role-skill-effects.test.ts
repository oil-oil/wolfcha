import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { GameState, Player } from "@/types/game";
import { getVisibleHunterHitSeats, getVisibleWhiteWolfHitSeats, getVisibleGuardTarget, getSkillTargetCursor, isHunterAiming, isKnownNightWolf, RoleSkillCueTracker, roleSkillForSeat } from "./role-skill-effects";

function fixture(): GameState {
  return { gameId: "skill-test", day: 1, phase: "NIGHT_WOLF_ACTION", difficulty: "normal",
    events: [], messages: [], currentSpeakerSeat: null, daySpeechStartSeat: null,
    badge: { holderSeat: null, candidates: [], signup: {}, votes: {}, allVotes: {}, history: {}, revoteCount: 0 },
    votes: {}, voteHistory: {}, nightActions: {}, dailySummaries: {}, dailySummaryFacts: {}, winner: null,
    roleAbilities: { witchHealUsed: false, witchPoisonUsed: false, hunterCanShoot: true, idiotRevealed: false, whiteWolfKingBoomUsed: false },
    players: [
    { playerId: "human", seat: 0, displayName: "human", isHuman: true, role: "Werewolf", alignment: "wolf", alive: true },
    { playerId: "seer", seat: 1, displayName: "seer", isHuman: false, role: "Seer", alignment: "village", alive: true },
    { playerId: "idiot", seat: 2, displayName: "idiot", isHuman: false, role: "Idiot", alignment: "village", alive: true },
    { playerId: "hunter", seat: 3, displayName: "hunter", isHuman: false, role: "Hunter", alignment: "village", alive: false },
    { playerId: "wolf", seat: 4, displayName: "wolf", isHuman: false, role: "Werewolf", alignment: "wolf", alive: true },
  ] };
}

test("all selected audio files keep their exact bytes, including 853303 and independent hunter cues", () => {
  const hashes: Record<string, string> = {
    "seer-skill.wav": "316d684b0a2346e739388b93a49e05e6d1579e0018fe843387c9e213e980ace8",
    "hunter-ready.wav": "01523ab136c24d9840bcf3bbd15a561b3e8562c19aed8610ca504a699ca71113",
    "hunter-shot.wav": "d9b3a5316181aafb92af2e8b57e8371fc4bc369d2141d05a946a0bc2f137b3d9",
    "idiot-skill.wav": "151c956809bb5fb65e82d072fc360d871560ae935e32b376a728f93562d62a62",
    "witch-poison-a.wav": "00d129fb28043804e70bf366c44864066ea4e245d97d2a37e035506e303fcc4c",
    "witch-antidote-b-compact.wav": "0b270b9518116a9e8bd80f9e566833c468f22b3b5895a4b043a21832b7f77381",
    "guard-block.wav": "c8484580898f7c0706c8a4af9fe66b645667b79f54da7740350977761e5df4ee",
    "white-wolf-king-howl.wav": "d8f10a44fb60b855b1c6a57985433dc3e056cb68ab2f19787449402aafac9865",
  };
  for (const [file, sha] of Object.entries(hashes)) assert.equal(createHash("sha256").update(readFileSync("public/audio/sfx/" + file)).digest("hex"), sha, file);
});

test("guard assembly requires a confirmed valid private action from the living guard at night", () => {
  const state = fixture(); state.phase = "NIGHT_GUARD_ACTION";
  const guard = { ...state.players[0], role: "Guard" as const };
  assert.deepEqual(new RoleSkillCueTracker().observe(state, guard), []);
  state.nightActions.guardTarget = 4;
  const tracker = new RoleSkillCueTracker();
  assert.deepEqual(tracker.observe(state, guard), [{ type: "guard", targetSeat: 4 }]);
  assert.deepEqual(tracker.observe(state, guard), []);
  assert.deepEqual(tracker.observe({ ...state, day: 2 }, guard), [{ type: "guard", targetSeat: 4 }]);
  for (const viewer of [null, state.players[0], state.players[1], { ...guard, alive: false }]) assert.deepEqual(new RoleSkillCueTracker().observe(state, viewer), []);
  assert.deepEqual(new RoleSkillCueTracker().observe({ ...state, phase: "DAY_SPEECH" }, guard), []);
  state.nightActions.guardTarget = -1;
  assert.deepEqual(new RoleSkillCueTracker().observe(state, guard), [], "abstaining never assembles the shield");
});

test("white wolf roar follows actual execution; aiming and restored records never replay a boom", () => {
  const state = fixture(); state.phase = "WHITE_WOLF_KING_BOOM"; state.players[0].role = "WhiteWolfKing";
  const tracker = new RoleSkillCueTracker();
  assert.deepEqual(tracker.observe(state, state.players[0]), [], "selection is not execution");
  state.players[0].alive = false; state.players[4].alive = false;
  state.roleAbilities.whiteWolfKingBoomUsed = true;
  state.dayHistory = { 1: { whiteWolfKingBoom: { boomSeat: 0, targetSeat: 4 } } };
  const before = JSON.stringify(state);
  assert.deepEqual(tracker.observe(state, null), [{ type: "white-wolf-king", targetSeat: 4 }]);
  assert.deepEqual(tracker.observe(state, null), []);
  assert.deepEqual(new RoleSkillCueTracker().observe(state, null), [], "saved state carries its mark, without another howl");
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual([...getVisibleWhiteWolfHitSeats(state)], [4]);
  assert.deepEqual([...getVisibleWhiteWolfHitSeats({ ...state, day: 3 })], [4]);
  assert.deepEqual([...getVisibleWhiteWolfHitSeats({ ...state, dayHistory: {}, gameId: "new" })], []);
});

test("white wolf without a carried target still roars, but adds no predicted or self claw mark", () => {
  const state = fixture(); state.players[0].role = "WhiteWolfKing";
  const tracker = new RoleSkillCueTracker(); tracker.observe(state, null);
  state.players[0].alive = false; state.roleAbilities.whiteWolfKingBoomUsed = true;
  assert.deepEqual(tracker.observe(state, null), [{ type: "white-wolf-king", targetSeat: 0 }]);
  assert.deepEqual([...getVisibleWhiteWolfHitSeats(state)], []);
  for (const record of [{ boomSeat: 0, targetSeat: 0 }, { boomSeat: 1, targetSeat: 4 }, { boomSeat: 0, targetSeat: -1 }, { boomSeat: 0, targetSeat: 4 }]) {
    state.dayHistory = { 1: { whiteWolfKingBoom: record } };
    assert.deepEqual([...getVisibleWhiteWolfHitSeats(state)], [], "self, wrong actor, abstention or surviving target is not a death mark");
  }
  state.players[4].alive = false;
  state.dayHistory = { 2: { whiteWolfKingBoom: { boomSeat: 0, targetSeat: 4 } } };
  assert.deepEqual([...getVisibleWhiteWolfHitSeats(state)], [], "future records are invisible");
});

test("private seer and witch effects are scoped to the living acting role at night", () => {
  const state = fixture();
  state.nightActions = { seerTarget: 4, wolfTarget: 1, witchSave: true, witchPoison: 2 };
  const asRole = (role: Player["role"], alive = true) => ({ ...state.players[0], role, alive });
  assert.deepEqual(new RoleSkillCueTracker().observe(state, asRole("Seer")), [{ type: "seer", targetSeat: 4 }]);
  assert.deepEqual(new RoleSkillCueTracker().observe(state, asRole("Witch")), [{ type: "witch-save", targetSeat: 1 }, { type: "witch-poison", targetSeat: 2 }]);
  for (const human of [null, asRole("Werewolf"), asRole("Villager"), asRole("Seer", false), asRole("Witch", false)]) assert.deepEqual(new RoleSkillCueTracker().observe(state, human), []);
  assert.deepEqual(new RoleSkillCueTracker().observe({ ...state, phase: "DAY_SPEECH" }, asRole("Seer")), []);
  const tracker = new RoleSkillCueTracker();
  tracker.observe(state, asRole("Seer"));
  assert.deepEqual(tracker.observe(state, asRole("Seer")), []);
  assert.deepEqual(tracker.observe({ ...state, day: 2 }, asRole("Seer")), [{ type: "seer", targetSeat: 4 }]);
});

test("idiot celebration requires a fresh real reveal; public identity alone does not replay it", () => {
  const state = fixture();
  const tracker = new RoleSkillCueTracker();
  tracker.observe(state, state.players[0]);
  const revealed = { ...state, phase: "DAY_RESOLVE" as const, roleAbilities: { ...state.roleAbilities, idiotRevealed: true }, dayHistory: { 1: { idiotRevealed: { seat: 2 } } } };
  assert.deepEqual(tracker.observe(revealed, state.players[0]), [{ type: "idiot", targetSeat: 2 }]);
  assert.deepEqual(tracker.observe(revealed, state.players[0]), []);
  assert.deepEqual(new RoleSkillCueTracker().observe(revealed, state.players[0]), []);
  const invalid = new RoleSkillCueTracker(); invalid.observe(state, null);
  assert.deepEqual(invalid.observe({ ...revealed, dayHistory: { 1: { idiotRevealed: { seat: 1 } } } }, null), []);
});

test("hunter preparation respects eligibility; actual shot records and public visibility control the hit", () => {
  const state = fixture();
  const hunter = state.players[3];
  state.phase = "HUNTER_SHOOT";
  assert.equal(isHunterAiming(state, hunter), true, "a dead hunter can still exercise the existing skill");
  assert.deepEqual(new RoleSkillCueTracker().observe(state, hunter), [{ type: "hunter-ready", targetSeat: 3 }]);
  assert.equal(isHunterAiming({ ...state, roleAbilities: { ...state.roleAbilities, hunterCanShoot: false } }, hunter), false);
  assert.equal(isHunterAiming(state, state.players[0]), false);
  state.phase = "NIGHT_RESOLVE";
  state.nightHistory = { 1: { resultsAnnounced: false, hunterShot: { hunterSeat: 3, targetSeat: 4 } } };
  const observer = new RoleSkillCueTracker();
  assert.deepEqual(observer.observe(state, state.players[0]), []);
  assert.deepEqual(new RoleSkillCueTracker().observe(state, hunter), [{ type: "hunter-shot", targetSeat: 4 }]);
  state.nightHistory[1].resultsAnnounced = true;
  assert.deepEqual(observer.observe(state, state.players[0]), [{ type: "hunter-shot", targetSeat: 4 }]);
  assert.deepEqual(observer.observe(state, state.players[0]), []);
  state.nightHistory[1].hunterShot!.targetSeat = -1;
  assert.deepEqual(new RoleSkillCueTracker().observe(state, hunter), [], "abstaining is not a shot");
});

test("known wolf backgrounds clear during daytime and never reveal team identities to other roles", () => {
  const state = fixture();
  const human = state.players[0];
  for (const player of state.players) assert.equal(isKnownNightWolf(player, human, true), player.role === "Werewolf" && player.alive);
  assert.equal(isKnownNightWolf(state.players[4], human, false), false);
  assert.equal(isKnownNightWolf(state.players[4], state.players[1], true), false);
  assert.equal(isKnownNightWolf(state.players[4], null, true), false);
});

test("target marks and cue tracking preserve game state and reset between games", () => {
  const state = fixture(); state.nightActions.seerTarget = 4;
  const human = state.players[1]; const before = JSON.stringify(state);
  const tracker = new RoleSkillCueTracker(); tracker.observe(state, human);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(tracker.observe({ ...state, gameId: "new-game" }, human), [{ type: "seer", targetSeat: 4 }]);
  tracker.reset(); assert.equal(tracker.observe(state, human).length, 1);
  const event = { type: "hunter-shot" as const, targetSeat: 4, id: 12, startedAt: 100 };
  for (const player of state.players) assert.equal(roleSkillForSeat(event, player.seat), player.seat === 4 ? event : null);
});

test("hunter hit markers remain on dead targets and later days, and vanish with the game's records", () => {
  const state = fixture();
  state.players[4].alive = false;
  state.dayHistory = { 1: { hunterShot: { hunterSeat: 3, targetSeat: 4 } } };
  assert.deepEqual([...getVisibleHunterHitSeats(state, state.players[0])], [4]);
  assert.deepEqual([...getVisibleHunterHitSeats({ ...state, day: 3 }, state.players[0])], [4]);
  assert.deepEqual([...getVisibleHunterHitSeats({ ...state, gameId: "reset", dayHistory: {}, nightHistory: {} }, null)], []);
  const before = JSON.stringify(state);
  getVisibleHunterHitSeats(state, null);
  assert.equal(JSON.stringify(state), before);
});

test("private night hunter marks follow publication; unrelated, invalid and future shots add no marker", () => {
  const state = fixture(); state.phase = "NIGHT_RESOLVE";
  state.nightHistory = { 1: { resultsAnnounced: false, hunterShot: { hunterSeat: 3, targetSeat: 4 } } };
  assert.deepEqual([...getVisibleHunterHitSeats(state, state.players[0])], []);
  assert.deepEqual([...getVisibleHunterHitSeats(state, state.players[3])], [4]);
  state.nightHistory[1].resultsAnnounced = true;
  assert.deepEqual([...getVisibleHunterHitSeats(state, state.players[0])], [4]);
  state.nightHistory[1].hunterShot = { hunterSeat: 1, targetSeat: 4 };
  assert.deepEqual([...getVisibleHunterHitSeats(state, null)], []);
  state.dayHistory = { 2: { hunterShot: { hunterSeat: 3, targetSeat: 4 } }, 1: { hunterShot: { hunterSeat: 3, targetSeat: -1 } } };
  assert.deepEqual([...getVisibleHunterHitSeats(state, null)], []);
});

test("eye and shield cursors follow only their living owner's unresolved selection, restoring after cast and cancellation", () => {
  for (const [role, phase, action, cursor] of [["Seer", "NIGHT_SEER_ACTION", "seerTarget", "seer"], ["Guard", "NIGHT_GUARD_ACTION", "guardTarget", "guard"]] as const) {
    const state = fixture(); state.phase = phase;
    const human = { ...state.players[0], role };
    assert.equal(getSkillTargetCursor(state, human), cursor);
    assert.equal(getSkillTargetCursor(state, human, false), null, "cancelled choice, hidden table or blocking reveal");
    for (const other of [null, state.players[0], { ...human, alive: false }]) assert.equal(getSkillTargetCursor(state, other), null);
    for (const nextPhase of ["NIGHT_START", "NIGHT_WOLF_ACTION", "NIGHT_RESOLVE", "DAY_SPEECH", "GAME_END"] as const) assert.equal(getSkillTargetCursor({ ...state, phase: nextPhase }, human), null);
    state.nightActions[action] = 0;
    assert.equal(getSkillTargetCursor(state, human), null, "confirmed seat zero clears cursor before the phase's async exit");
    state.nightActions[action] = -1;
    assert.equal(getSkillTargetCursor(state, human), null, "confirmed abstention also clears cursor");
    state.nightActions = {};
    assert.equal(getSkillTargetCursor(state, human), cursor, "next unresolved choice has a fresh cursor");
  }
});

test("guard avatar shield is private to the living guard and lasts only the current active night protection cycle", () => {
  const state = fixture(); state.phase = "NIGHT_GUARD_ACTION";
  const guard = { ...state.players[0], role: "Guard" as const };
  assert.equal(getVisibleGuardTarget(state, guard), null, "choice alone does not mark a player");
  state.nightActions.guardTarget = 0;
  const before = JSON.stringify(state);
  for (const phase of ["NIGHT_GUARD_ACTION", "NIGHT_WOLF_ACTION", "NIGHT_WITCH_ACTION", "NIGHT_SEER_ACTION", "NIGHT_RESOLVE"] as const) assert.equal(getVisibleGuardTarget({ ...state, phase }, guard), 0);
  for (const viewer of [null, state.players[0], state.players[1], { ...guard, alive: false }]) assert.equal(getVisibleGuardTarget(state, viewer), null);
  for (const phase of ["NIGHT_START", "DAY_START", "DAY_SPEECH", "GAME_END"] as const) assert.equal(getVisibleGuardTarget({ ...state, phase }, guard), null, "stale previous-night target cannot leak into a new cycle");
  assert.equal(getVisibleGuardTarget({ ...state, nightActions: {} }, guard), null, "reset removes shield");
  assert.equal(JSON.stringify(state), before, "presentation does not alter actions or publish history");
  state.nightActions.guardTarget = -1;
  assert.equal(getVisibleGuardTarget(state, guard), null);
  state.nightActions.guardTarget = 3;
  assert.equal(getVisibleGuardTarget(state, guard), null, "a dead target is not actively protected");
});
