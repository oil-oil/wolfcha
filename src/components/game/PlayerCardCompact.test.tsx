import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { AvatarConfig, getAvatarBgColor } from "@/lib/avatar-config";
import type { Player } from "@/types/game";
import { ALL_MODELS } from "@/types/game";
import { PlayerCardCompact } from "./PlayerCardCompact";
import { HunterAvatarMarks, IdiotConfetti, WhiteWolfClawMark } from "./PlayerSkillMarks";
import type { WolfStrikeEvent } from "@/lib/wolf-strike";
import type { RoleSkillEvent } from "@/lib/role-skill-effects";

const messages = { roles: { werewolf: "狼人", seer: "预言家", witch: "女巫", hunter: "猎人", guard: "守卫", idiot: "白痴", whiteWolfKing: "白狼王", villager: "村民" }, common: { you: "你" }, playerCard: { wolfTeam: "狼队" } };
const player: Player = { playerId: "target", seat: 7, displayName: "target", alive: true, isHuman: true, role: "Villager", alignment: "village" };
const wolf: Player = { ...player, playerId: "human", seat: 0, role: "Werewolf", alignment: "wolf" };
const strike: WolfStrikeEvent = { id: 20, targetSeat: 7, startedAt: 0 };
const poison: RoleSkillEvent = { ...strike, type: "witch-poison" };

function card(overrides: Partial<Parameters<typeof PlayerCardCompact>[0]> = {}) {
  return renderToStaticMarkup(<NextIntlClientProvider locale="zh" timeZone="UTC" now={new Date(0)} messages={messages}>
    <PlayerCardCompact player={player} humanPlayer={wolf} isSpeaking={false} canClick isSelected={false} skipEntranceAnimation onClick={() => {}} {...overrides} />
  </NextIntlClientProvider>);
}
function base(html: string) { return html.match(/<div[^>]*data-avatar-base[^>]*>/)?.[0]; }
function image(html: string) { return html.match(/<img[^>]*>/)?.[0]; }

test("every avatar palette keeps its original base before, during and after wolf or poison feedback", () => {
  const seeds = new Map<string, string>();
  for (let i = 0; i < 100 && seeds.size < AvatarConfig.AVATAR_BG_COLORS.length; i++) seeds.set(getAvatarBgColor("color-" + i), "color-" + i);
  assert.equal(seeds.size, AvatarConfig.AVATAR_BG_COLORS.length);
  for (const [color, avatarSeed] of seeds) {
    const own = { ...player, avatarSeed };
    const before = card({ player: own });
    for (const feedback of [{ wolfStrike: strike }, { roleSkill: poison }]) {
      const during = card({ player: own, ...feedback });
      assert.equal(base(during), base(before), color + " must not be cleared to transparent");
      assert.match(base(during)!, new RegExp("background-color:#" + color));
      assert.equal(image(during), image(before), "no image/background reload during hit");
      assert.ok(during.indexOf("wc-wolf-hit-background") > during.indexOf("data-avatar-base"));
      assert.ok(during.indexOf("wc-wolf-hit-background") < during.indexOf("<img"));
    }
    assert.equal(card({ player: own }), before);
  }
});

test("white wolf claws belong only to confirmed carried targets and survive the transient cue", () => {
  const event: RoleSkillEvent = { ...strike, type: "white-wolf-king" };
  const target = { ...player, alive: false };
  assert.match(card({ player: target, whiteWolfHit: true, roleSkill: event }), /data-white-wolf-hit/);
  assert.match(card({ player: target, whiteWolfHit: true, roleSkill: null }), /data-white-wolf-hit/);
  assert.doesNotMatch(card({ roleSkill: event }), /data-white-wolf-hit/, "an event alone is not a cause-of-death record");
  assert.doesNotMatch(card(), /data-white-wolf-hit/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(WhiteWolfClawMark, { hit: false, event })), /data-white-wolf-hit/);
});

test("night wolf base belongs to the normal style and survives a hit without being overwritten", () => {
  const teammate = { ...player, role: "Werewolf" as const, alignment: "wolf" as const };
  const before = card({ player: teammate, isNight: true });
  const during = card({ player: teammate, isNight: true, wolfStrike: strike });
  assert.match(before, /data-known-night-wolf="true"/);
  assert.match(before, /wc-player-card__avatar--known-wolf/);
  assert.equal(base(during), base(before));
  assert.equal(image(during), image(before));
  assert.doesNotMatch(card({ player: teammate, isNight: false }), /data-known-night-wolf|avatar--known-wolf/);
});

test("model avatars keep their theme base beneath the flash rather than switching it off", () => {
  const model: Player = { ...player, isHuman: false, agentProfile: { modelRef: ALL_MODELS[0], persona: { gender: "male", age: 25, mbti: "INTP", voiceRules: [], basicInfo: "" } } };
  const before = card({ player: model, isGenshinMode: true });
  const during = card({ player: model, isGenshinMode: true, wolfStrike: strike });
  assert.equal(base(before), base(during));
  assert.match(base(during)!, /background-color:var\(--bg-secondary\)/);
  assert.equal(image(before), image(during));
  assert.doesNotMatch(image(during)!, /bg-\[/);
});

test("non-target cards have identical backgrounds and no wolf or poison cue nodes", () => {
  const before = card();
  assert.equal(card({ wolfStrike: { ...strike, targetSeat: 6 }, roleSkill: { ...poison, targetSeat: 6 } }), before);
  assert.doesNotMatch(before, /wc-wolf-hit|wc-poison-hit/);
});

test("base and hit color fill the stationary clipped circle outside the counter-moving portrait", () => {
  for (const facing of ["left", "right"] as const) for (const variant of ["default", "mobile"] as const) {
    const html = card({ wolfStrike: strike, facing, variant });
    const prefix = html.slice(html.indexOf("data-avatar-seat"), html.indexOf("data-avatar-portrait"));
    assert.match(prefix, /class="absolute inset-0" data-avatar-base/);
    assert.match(prefix, /wc-wolf-hit-background/);
    const art = html.match(/<div[^>]*data-avatar-art[^>]*>/)![0];
    assert.doesNotMatch(art, /background-color/);
    assert.doesNotMatch(html.slice(html.indexOf("data-avatar-portrait")), /wc-wolf-hit-background/);
  }
});

test("confirmed hunter marks persist after cue expiry and remove the lock immediately; reset removes the hole", () => {
  const shot: RoleSkillEvent = { ...strike, type: "hunter-shot" };
  const marks = (hit: boolean, event: RoleSkillEvent | null) => renderToStaticMarkup(createElement(HunterAvatarMarks, { hit, event, locked: true }));
  assert.match(marks(true, shot), /data-hunter-hit/);
  assert.doesNotMatch(marks(true, shot), /data-hunter-lock/);
  assert.match(marks(true, null), /data-hunter-hit/);
  assert.doesNotMatch(marks(true, null), /data-hunter-lock/);
  assert.match(card({ player: { ...player, alive: false }, hunterHit: true }), /data-hunter-hit/);
  assert.doesNotMatch(marks(false, null), /data-hunter-hit/);
  assert.match(marks(false, null), /data-hunter-lock/);
});

test("idiot bursts from all four corners with a central clown while its public identity hat remains in the card", () => {
  const event: RoleSkillEvent = { ...strike, type: "idiot" };
  const html = card({ player: { ...player, role: "Idiot" }, roleSkill: event, isRevealedIdiot: true });
  assert.match(html, /data-idiot-party-hat/);
  assert.doesNotMatch(html, /data-idiot-burst/);
  const burst = renderToStaticMarkup(createElement(IdiotConfetti, { event }));
  assert.match(burst, /wc-idiot-confetti/);
  assert.match(burst, /data-idiot-clown/);
  assert.equal((burst.match(/--piece-color/g) ?? []).length, 48);
  for (const corner of ["top-left", "top-right", "bottom-right", "bottom-left"]) {
    assert.equal((burst.match(new RegExp(`data-confetti-corner="${corner}"`, "g")) ?? []).length, 12);
  }
  for (const kind of ["ribbon", "paper", "chip"]) assert.equal((burst.match(new RegExp(`data-confetti-kind="${kind}"`, "g")) ?? []).length, 16);
});

test("the party hat sits inside the portrait's mirrored canvas at desktop and mobile sizes", () => {
  for (const variant of ["default", "mobile"] as const) for (const facing of ["left", "right"] as const) {
    const html = card({ player: { ...player, role: "Idiot" }, isRevealedIdiot: true, variant, facing });
    const canvas = html.match(/<div[^>]*data-avatar-art[^>]*>[\s\S]*?<\/div>/)![0];
    assert.match(canvas, /data-idiot-party-hat/);
    assert.ok(canvas.indexOf("<img") < canvas.indexOf("data-idiot-party-hat"), "hat overlays the actual portrait in its coordinate system");
    assert.match(canvas, /viewBox="0 0 64 64"/);
    assert.match(html, /data-avatar-portrait/);
  }
  assert.doesNotMatch(card(), /data-idiot-party-hat/);
});

test("protection symbol adds no public role badge and disappears when its private active flag clears", () => {
  const html = card({ guardProtected: true, showRoleBadge: false });
  assert.equal((html.match(/data-guard-protected/g) ?? []).length, 1);
  assert.equal(base(html), base(card()), "no base color replacement");
  assert.equal(image(html), image(card()), "no identity-dependent image change");
  assert.doesNotMatch(card({ guardProtected: false }), /data-guard-protected/);
});

test("an AI idiot's role stays private until publicly revealed, then remains in the frame's bottom-right corner", () => {
  const idiot: Player = { ...player, isHuman: false, role: "Idiot", agentProfile: { modelRef: ALL_MODELS[0], persona: { gender: "male", age: 25, mbti: "INTP", voiceRules: [], basicInfo: "" } } };
  const event: RoleSkillEvent = { ...strike, type: "idiot" };
  assert.doesNotMatch(card({ player: idiot }), /data-public-role|白痴/);
  assert.doesNotMatch(card({ player: idiot, roleSkill: event }), /data-public-role|白痴/, "a transient effect cannot disclose a role");
  for (const variant of ["default", "mobile"] as const) for (const facing of ["left", "right"] as const) for (const isGenshinMode of [false, true]) {
    const props = { player: idiot, isRevealedIdiot: true, variant, facing, isGenshinMode, showRoleBadge: false };
    for (const roleSkill of [event, null]) {
      const html = card({ ...props, roleSkill });
      const badge = html.match(/<div[^>]*data-public-role="Idiot"[^>]*>白痴<\/div>/)?.[0];
      assert.ok(badge, "public identity survives cue completion, independently of the private self-role toggle");
      assert.match(badge, /absolute bottom-0 right-0/);
      assert.equal((html.match(/data-public-role=/g) ?? []).length, 1);
    }
  }
  assert.match(card({ player: { ...idiot, alive: false }, isRevealedIdiot: true }), /data-public-role="Idiot"[^>]*>白痴/);
  assert.doesNotMatch(card({ player: idiot, isRevealedIdiot: false }), /data-public-role|白痴/, "reset or a new scene removes prior public identity");
  assert.doesNotMatch(card({ player: { ...idiot, role: "Villager" }, isRevealedIdiot: true }), /data-public-role|白痴/, "a reveal flag never labels another role");
});
