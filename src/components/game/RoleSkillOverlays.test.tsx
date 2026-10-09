import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ROLE_SKILL_AUDIO, type RoleSkillEvent } from "@/lib/role-skill-effects";
import { POISON_BUBBLES } from "@/lib/poison-skill";
import { RoyalSkillOverlay } from "./RoyalSkillOverlay";
import { PoisonSkull } from "./PoisonSkull";
import { WOLF_STRIKE_TIMING } from "@/lib/wolf-strike";

function animateHarness(type: "guard" | "white-wolf-king" | "witch-poison", reduced = false) {
  const calls: { selector: string; frames: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean }[] = [];
  let cleanup!: () => void;
  const counts: Record<string, number> = type === "guard" ? { "[data-shield-piece]": 7, "[data-shield-seam]": 1 } : type === "white-wolf-king" ? { "[data-wolf-head]": 1, "[data-wolf-jaw]": 1, "[data-roar-ray]": 12, "[data-roar-echo]": 6, "[data-roar-grain]": 14 } : { "[data-skill-core]": 1, "[data-fog]": 3, "[data-poison-bubble]": 7, "[data-skull-sway]": 1 };
  const root = { querySelectorAll: (selector: string) => Array.from({ length: counts[selector] ?? 0 }, () => ({ animate: (frames: Keyframe[], options: KeyframeAnimationOptions) => { const call = { selector, frames, options, cancelled: false }; calls.push(call); return { cancel: () => { call.cancelled = true; } }; } })) };
  const modules: Record<string, unknown> = {
    react: { useRef: () => ({ current: root }), useId: () => "unit-owned", useLayoutEffect: (effect: () => () => void) => { cleanup = effect(); } },
    "react/jsx-runtime": { jsx: (component: unknown, props: unknown) => typeof component === "function" ? component(props) : null, jsxs: () => null },
    "react-dom": { createPortal: () => null }, "framer-motion": { useReducedMotion: () => reduced },
    "@/lib/role-skill-effects": { ROLE_SKILL_AUDIO }, "@/lib/poison-skill": { POISON_BUBBLES },
    "./PlayerSkillMarks": {}, "./SeerWaterSurface": {}, "./PoisonSkull": {}, "./RoyalSkillOverlay": {}, "./SkillEdgeAtmosphere": {},
  };
  const file = type === "witch-poison" ? "NightActionOverlay" : "RoyalSkillOverlay";
  let code = readFileSync(`src/components/game/${file}.tsx`, "utf8");
  if (type === "witch-poison") code = code.replace("function CentralSkill(", "export function CentralSkill(");
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} as Record<string, (props: { event: RoleSkillEvent }) => unknown> };
  runInNewContext("(function(require,module,exports){" + js + "\n})", { performance: { now: () => 1000 }, document: { body: {} } })((name: string) => { assert.ok(name in modules, name); return modules[name]; }, loaded, loaded.exports);
  loaded.exports[type === "witch-poison" ? "CentralSkill" : "RoyalSkillOverlay"]({ event: { id: 1, type, targetSeat: 7, startedAt: 1000 } });
  return { calls, cleanup: () => cleanup() };
}

for (const type of ["guard", "white-wolf-king", "witch-poison"] as const) {
  test(`${type} keeps all animation work bounded by its sound and cancels every owned animation`, () => {
    const h = animateHarness(type);
    assert.ok(h.calls.length > 0);
    for (const call of h.calls) {
      assert.ok(Number(call.options.duration) + Number(call.options.delay) <= ROLE_SKILL_AUDIO[type].durationMs);
      assert.equal(call.options.fill, "none");
    }
    h.cleanup(); assert.ok(h.calls.every(call => call.cancelled));
    const reentry = animateHarness(type); reentry.cleanup(); assert.ok(reentry.calls.every(call => call.cancelled));
  });
  test(`${type} reduced motion preserves the cue without moving the scene`, () => {
    const h = animateHarness(type, true);
    assert.ok(h.calls.every(call => call.frames.every(frame => frame.transform === undefined || frame.transform === "none")));
    h.cleanup(); assert.ok(h.calls.every(call => call.cancelled));
  });
}

test("guard is seven fragments of one shield; white wolf has a distinct face and moving jaw", () => {
  const base = { id: 22, targetSeat: 7, startedAt: 0 };
  const guard = renderToStaticMarkup(createElement(RoyalSkillOverlay, { event: { ...base, type: "guard" } }));
  assert.equal((guard.match(/data-shield-piece=/g) ?? []).length, 7);
  assert.match(guard, /data-shield-seam/); assert.doesNotMatch(guard, /data-wolf-head/);
  const wolf = renderToStaticMarkup(createElement(RoyalSkillOverlay, { event: { ...base, type: "white-wolf-king" } }));
  assert.match(wolf, /data-wolf-head/); assert.match(wolf, /data-wolf-jaw/); assert.doesNotMatch(wolf, /data-shield-piece/);
  assert.doesNotMatch(wolf, /data-roar-ring|data-roar-air|<ellipse/);
  assert.equal((wolf.match(/data-roar-layer=/g) ?? []).length, 3);
  const skull = renderToStaticMarkup(createElement("svg", null, createElement(PoisonSkull, { id: "test" })));
  assert.match(skull, /data-skull-sway/);
  assert.match(skull, /test-socket/);
  assert.match(skull, /test-jaw/);
});

test("howl pressure leads its drawn echoes and drifting ink grains, then every layer fades once", () => {
  const h = animateHarness("white-wolf-king");
  const rays = h.calls.filter(call => call.selector === "[data-roar-ray]");
  const echoes = h.calls.filter(call => call.selector === "[data-roar-echo]");
  const grains = h.calls.filter(call => call.selector === "[data-roar-grain]");
  assert.ok(rays.length > 2 && echoes.length > 2 && grains.length > 0, "a full howl has pressure, traced echoes and texture rather than two rigid side pieces");
  assert.ok(Math.min(...rays.map(call => Number(call.options.delay))) < Math.min(...echoes.map(call => Number(call.options.delay))));
  for (const call of [...rays, ...echoes, ...grains]) {
    assert.equal(call.frames[0].opacity, 0); assert.equal(call.frames.at(-1)!.opacity, 0);
    assert.equal(call.options.iterations ?? 1, 1);
  }
  assert.ok(echoes.every(call => call.frames[0].strokeDashoffset === 1 && call.frames[1].strokeDashoffset === 0));
  const reduced = animateHarness("white-wolf-king", true);
  assert.ok(reduced.calls.filter(call => call.selector === "[data-roar-echo]").every(call => call.frames.every(frame => frame.strokeDashoffset === 0)));
  h.cleanup(); reduced.cleanup();
});

test("poison gently sways its engraved skull separately from the fade and restores its angle", () => {
  const h = animateHarness("witch-poison");
  const sway = h.calls.find(call => call.selector === "[data-skull-sway]")!;
  assert.equal(sway.frames[0].transform, "rotate(0deg)");
  assert.equal(sway.frames.at(-1)!.transform, "rotate(0deg)");
  assert.ok(sway.frames.some(frame => frame.transform === "rotate(-2.2deg)"));
  assert.equal(animateHarness("witch-poison", true).calls.some(call => call.selector === "[data-skull-sway]"), false);
  h.cleanup(); assert.ok(sway.cancelled);
});

function simpleEffectHarness(file: string, component: string, type: string, reduced: boolean, width = 390) {
  const calls: { element: string; frames: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean }[] = [];
  const node = (element: string) => ({ animate: (frames: Keyframe[], options: KeyframeAnimationOptions) => { const call = { element, frames, options, cancelled: false }; calls.push(call); return { cancel: () => { call.cancelled = true; } }; } });
  const root = { ...node("root"), querySelectorAll: () => Array.from({ length: 48 }, (_, i) => node("piece-" + i)), querySelector: () => node("clown") };
  let cleanup: (() => void) | undefined;
  const modules: Record<string, unknown> = {
    react: { useRef: () => ({ current: root }), useId: () => "owned", useLayoutEffect: (effect: () => (() => void) | undefined) => { cleanup = effect(); } },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null }, "framer-motion": { useReducedMotion: () => reduced },
    "@/lib/role-skill-effects": { ROLE_SKILL_AUDIO }, "@/lib/wolf-strike": { WOLF_STRIKE_TIMING },
  };
  const code = ts.transpileModule(readFileSync(`src/components/game/${file}.tsx`, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} as Record<string, (props: { event: object }) => unknown> };
  runInNewContext("(function(require,module,exports){" + code + "\n})", { performance: { now: () => 1000 }, window: { innerWidth: width, innerHeight: 844 } })((name: string) => { assert.ok(name in modules, name); return modules[name]; }, loaded, loaded.exports);
  loaded.exports[component]({ event: { id: 17, targetSeat: 7, startedAt: 1000, ...(type === "wolf" ? {} : { type }) } });
  return { calls, cleanup: () => cleanup?.() };
}

test("corner atmosphere follows the four requested sounds, changes opacity only and cancels on reentry", () => {
  for (const type of ["wolf", "witch-poison", "witch-save", "guard"] as const) for (const reduced of [false, true]) {
    const h = simpleEffectHarness("SkillEdgeAtmosphere", "SkillEdgeAtmosphere", type, reduced);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].options.duration, type === "wolf" ? WOLF_STRIKE_TIMING.durationMs : ROLE_SKILL_AUDIO[type].durationMs);
    assert.ok(h.calls[0].frames.every(frame => frame.transform === undefined && frame.translate === undefined && frame.filter === undefined));
    assert.equal(h.calls[0].frames.at(-1)!.opacity, 0);
    h.cleanup(); assert.ok(h.calls[0].cancelled);
  }
  for (const type of ["seer", "idiot", "hunter-ready", "hunter-shot", "white-wolf-king"]) assert.equal(simpleEffectHarness("SkillEdgeAtmosphere", "SkillEdgeAtmosphere", type, false).calls.length, 0, "unrelated roles acquire no extra edge animation");
});

test("one corner burst scatters promptly, drifts visibly before fading, and cleans up with the clown", () => {
  for (const width of [390, 1440]) {
    const h = simpleEffectHarness("PlayerSkillMarks", "IdiotConfetti", "idiot", false, width);
    assert.equal(h.calls.length, 50);
    h.calls.filter(call => call.element.startsWith("piece-")).forEach((call, index) => {
      const [, x, y] = String(call.frames.at(-1)!.transform).match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)!.map(Number);
      const corner = Math.floor(index / 12);
      assert.ok((corner === 1 || corner === 2 ? -x : x) > 0);
      assert.ok((corner >= 2 ? -y : y) > 0);
      assert.ok(Math.abs(x) < width / 3 && Math.abs(y) < 844 / 3, "pieces stay near their originating perimeter");
      assert.ok(Number(call.options.duration) + Number(call.options.delay) < ROLE_SKILL_AUDIO.idiot.durationMs, "the extended drift still ends within the original cue");
      assert.ok((Number(call.frames[3].offset) - Number(call.frames[2].offset)) * Number(call.options.duration) > 750, "scattered pieces linger visibly before fading");
      assert.ok(Number(call.frames[3].opacity) >= 0.9);
      assert.equal(call.options.iterations ?? 1, 1, "one throw, without an endless confetti emitter");
      assert.equal(call.frames.at(-1)!.opacity, 0);
    });
    const clown = h.calls.find(call => call.element === "clown" && call.frames.some(frame => frame.opacity !== undefined))!;
    assert.ok(Number(clown.options.duration) > 1500 && Number(clown.options.duration) < ROLE_SKILL_AUDIO.idiot.durationMs);
    assert.equal(clown.frames.at(-1)!.opacity, 0);
    assert.ok((Number(clown.frames[2].offset) - Number(clown.frames[1].offset)) * Number(clown.options.duration) > 1500, "clear visible hold lasts more than 1.5s");
    const sway = h.calls.find(call => call.element === "clown" && call.frames.some(frame => frame.transform !== undefined))!;
    assert.ok(sway.frames.some(frame => String(frame.transform).includes("rotate(-4.5deg)")));
    assert.ok(sway.frames.some(frame => String(frame.transform).includes("rotate(4.5deg)")));
    assert.equal(sway.frames.length, 4, "one left/right sway before settling, without repeated wobbling");
    const halfCycle = (Number(sway.frames[2].offset) - Number(sway.frames[1].offset)) * Number(sway.options.duration);
    assert.ok(halfCycle >= 650 && halfCycle <= 800, "left-to-right sweep takes about 0.7s rather than a rapid wobble");
    assert.equal(sway.frames.at(-1)!.transform, "translateX(0) rotate(0deg)");
    assert.ok(h.calls.every(call => call.options.fill === "none"));
    h.cleanup(); assert.ok(h.calls.every(call => call.cancelled));
  }
  const reduced = simpleEffectHarness("PlayerSkillMarks", "IdiotConfetti", "idiot", true);
  assert.ok(reduced.calls.every(call => call.frames.every(frame => frame.transform === undefined)));
  reduced.cleanup(); assert.ok(reduced.calls.every(call => call.cancelled));
});

test("each corner scatters paper over a fan with multiple depths rather than one diagonal line", () => {
  for (const width of [360, 1440]) {
    const h = simpleEffectHarness("PlayerSkillMarks", "IdiotConfetti", "idiot", false, width);
    const pieces = h.calls.filter(call => call.element.startsWith("piece-"));
    for (let corner = 0; corner < 4; corner++) {
      const points = pieces.slice(corner * 12, (corner + 1) * 12).map(call => {
        const match = String(call.frames[2].transform).match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)!;
        return [Number(match[1]), Number(match[2])];
      });
      const [a, b] = points;
      const areas = points.slice(2).map(c => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])));
      assert.ok(Math.max(...areas) > 100, "a collinear streak has zero area");
      const angles = points.map(([x,y]) => Math.atan2(Math.abs(y),Math.abs(x)));
      assert.ok(Math.max(...angles) - Math.min(...angles) > Math.PI / 4, "rays cover a broad angle");
    }
    h.cleanup();
  }
});
