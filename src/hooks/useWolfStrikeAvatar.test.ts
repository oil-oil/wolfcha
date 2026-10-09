import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as strikeModule from "@/lib/wolf-strike";
import type { RoleSkillEvent } from "@/lib/role-skill-effects";
import * as poisonModule from "@/lib/poison-skill";

function runImpact(seat: number, reducedMotion: boolean, poison = false) {
  const calls: { element: string; frames: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean }[] = [];
  const elements = ["avatar", "card", "background", "frame", "portrait"].map((element) => ({
    animate: (frames: Keyframe[], options: KeyframeAnimationOptions) => {
      const call = { element, frames, options, cancelled: false };
      calls.push(call);
      return { cancel: () => { call.cancelled = true; } };
    },
  }));
  let index = 0;
  const cleanups: (() => void)[] = [];
  const modules: Record<string, unknown> = {
    react: { useRef: () => ({ current: elements[index++] }), useLayoutEffect: (callback: () => (() => void) | undefined) => { const cleanup = callback(); if (cleanup) cleanups.push(cleanup); } },
    "framer-motion": { useReducedMotion: () => reducedMotion },
    "@/lib/wolf-strike": strikeModule,
    "@/lib/poison-skill": poisonModule,
  };
  const code = ts.transpileModule(readFileSync("src/hooks/useWolfStrikeAvatar.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} as { useWolfStrikeAvatar: (event: strikeModule.WolfStrikeEvent | null, seat: number, poison?: RoleSkillEvent) => unknown } };
  runInNewContext("(function(require,module,exports){" + code + "\n})", { performance: { now: () => 1000 } })((name: string) => {
    assert.ok(name in modules, name); return modules[name];
  }, loaded, loaded.exports);
  const event = { id: 17, targetSeat: 7, startedAt: 1000 };
  loaded.exports.useWolfStrikeAvatar(poison ? null : event, seat, poison ? { ...event, type: "witch-poison" } : undefined);
  return { calls, cleanup: () => cleanups.forEach((fn) => fn()) };
}

test("V4 A impact moves the target frame and portrait in opposite world directions at 235 ms, then restores both", () => {
  const h = runImpact(7, false);
  assert.deepEqual(h.calls.map((call) => call.element).sort(), ["background", "card", "frame", "portrait"]);
  for (const call of h.calls) {
    assert.equal(call.options.delay, 235);
    assert.equal(call.options.duration, call.element === "card" || call.element === "portrait" ? 300 : 420);
    assert.equal(call.options.fill, "none");
  }
  const card = h.calls.find(call => call.element === "card")!.frames;
  const portrait = h.calls.find(call => call.element === "portrait")!.frames;
  for (let index = 1; index < card.length - 1; index++) {
    const outerX = parseFloat(String(card[index].translate));
    const worldPortraitX = outerX + parseFloat(String(portrait[index].translate));
    assert.ok(outerX * worldPortraitX < 0, "nested portrait moves opposite its enclosing card");
  }
  assert.equal(card.at(-1)!.translate, "0px 0px");
  assert.equal(portrait.at(-1)!.translate, "0px 0px");
  assert.ok(h.calls.every(call => call.frames.every(frame => frame.transform === undefined)), "Framer's existing transform is never overwritten");
  h.cleanup();
  assert.ok(h.calls.every((call) => call.cancelled), "reentry or reset cancels every owned animation");
});

test("wolf tint covers the full shake and fades only after both moving layers have settled", () => {
  const h = runImpact(7, false);
  const tint = h.calls.find(call => call.element === "background")!;
  const solidUntil = Number(tint.frames[2].offset) * Number(tint.options.duration);
  for (const call of h.calls.filter(call => call.element === "card" || call.element === "portrait")) {
    assert.ok(Number(call.options.duration) < solidUntil);
  }
  assert.equal(tint.frames[1].opacity, 1);
  assert.equal(tint.frames[2].opacity, 1);
  assert.equal(tint.frames.at(-1)!.opacity, 0);
  assert.ok(Number(tint.options.delay) + Number(tint.options.duration) < strikeModule.WOLF_STRIKE_TIMING.durationMs);
  h.cleanup();
});

test("a non-target player never receives native impact animations", () => {
  assert.deepEqual(runImpact(6, false).calls, []);
});

test("reduced motion preserves target feedback while omitting the whole-card shake", () => {
  const h = runImpact(7, true);
  assert.deepEqual(h.calls.map((call) => call.element).sort(), ["background", "frame"]);
  assert.ok(h.calls.every((call) => call.frames.every((frame) => frame.transform === undefined && frame.translate === undefined)));
  h.cleanup(); assert.ok(h.calls.every((call) => call.cancelled));
});

test("poison stains only its target slowly, with a separate brief shake and full cancellation", () => {
  const h = runImpact(7, false, true);
  assert.deepEqual(h.calls.map((call) => call.element).sort(), ["background", "card", "frame", "portrait"]);
  assert.ok(h.calls.every((call) => call.options.delay === 235 && call.options.fill === "none"));
  assert.equal(h.calls.find(call => call.element === "card")!.options.duration, 240);
  assert.equal(h.calls.find(call => call.element === "portrait")!.options.duration, 240);
  const card = h.calls.find(call => call.element === "card")!.frames;
  const portrait = h.calls.find(call => call.element === "portrait")!.frames;
  for (let i = 1; i < card.length - 1; i++) {
    const outer = parseFloat(String(card[i].translate));
    const innerWorld = outer + parseFloat(String(portrait[i].translate));
    assert.ok(outer * innerWorld < 0);
  }
  assert.equal(portrait.at(-1)!.translate, "0px 0px");
  for (const call of h.calls.filter(call => call.element === "background" || call.element === "frame")) {
    assert.equal(call.options.duration, 680);
    assert.equal(call.frames[1].offset, 0.24, "slower rise with a longer fade");
    assert.equal(call.frames.at(-1)!.opacity, 0);
  }
  assert.deepEqual(runImpact(6, false, true).calls, []);
  h.cleanup(); assert.ok(h.calls.every((call) => call.cancelled));
});

test("reduced poison retains purple feedback without translating either enclosing card or portrait", () => {
  const h = runImpact(7, true, true);
  assert.deepEqual(h.calls.map(call => call.element).sort(), ["background", "frame"]);
  assert.ok(h.calls.every(call => call.frames.every(frame => frame.translate === undefined && frame.transform === undefined)));
  h.cleanup(); assert.ok(h.calls.every(call => call.cancelled));
});
