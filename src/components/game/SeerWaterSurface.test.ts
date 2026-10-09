import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as water from "@/lib/seer-water";
import { ROLE_SKILL_AUDIO } from "@/lib/role-skill-effects";

function surfaceHarness(reduced = false) {
  const nodes = Array.from({ length: 7 }, () => ({ attributes: new Map<string, string>(), setAttribute(name: string, value: string) { this.attributes.set(name, value); } }));
  let filterValue = "blur(0px)";
  const style = { get filter() { return filterValue; }, set filter(value: string) { filterValue = value.replace(/url\(#([^)]+)\)/g, 'url("#$1")'); } };
  const surface = { style, dataset: {} as Record<string, string>, getBoundingClientRect: () => ({ width: 1440, height: 900 }) };
  const pending = new Map<number, (now: number) => void>();
  let counter = 0;
  let now = 1000;
  let ref = 0;
  let canvasCount = 0;
  let cleanup!: () => void;
  const events = new Map<string, () => void>();
  const modules: Record<string, unknown> = {
    react: { useId: () => "owned", useRef: () => ({ current: nodes[ref++] }), useLayoutEffect: (effect: () => () => void) => { cleanup = effect(); } },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
    "framer-motion": { useReducedMotion: () => reduced },
    "@/lib/role-skill-effects": { ROLE_SKILL_AUDIO },
    "@/lib/seer-water": water,
  };
  const code = ts.transpileModule(readFileSync("src/components/game/SeerWaterSurface.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} as { SeerWaterSurface: (props: { event: { id: number; type: string; targetSeat: number; startedAt: number } }) => unknown } };
  runInNewContext("(function(require,module,exports){" + code + "\n})", {
    performance: { now: () => now }, process: { env: { NODE_ENV: "development" } },
    window: { innerWidth: 1440, innerHeight: 900, location: { search: "" }, addEventListener: (name: string, callback: () => void) => { events.set(name, callback); }, removeEventListener: (name: string) => { events.delete(name); } },
    document: { querySelector: () => surface, createElement: () => { canvasCount++; return { getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(128 * 128 * 4) }), putImageData: () => {} }), toDataURL: () => "data:image/png;base64,test" }; } },
    requestAnimationFrame: (callback: (now: number) => void) => { const id = ++counter; pending.set(id, callback); return id; },
    cancelAnimationFrame: (id: number) => { pending.delete(id); },
  })((name: string) => { assert.ok(name in modules, name); return modules[name]; }, loaded, loaded.exports);
  loaded.exports.SeerWaterSurface({ event: { id: 1, type: "seer", targetSeat: 7, startedAt: 1000 } });
  const advance = (time: number) => { now = time; const [id, callback] = pending.entries().next().value!; pending.delete(id); callback(time); return callback; };
  return { nodes, surface, pending, events, canvasCount: () => canvasCount, advance, cleanup: () => cleanup() };
}

test("full-view water restores CSSOM-normalized filters, animation frames and resize listener", () => {
  const h = surfaceHarness();
  assert.equal(h.surface.style.filter, 'blur(0px) url("#seer-water-owned")');
  h.advance(1000);
  h.advance(1725);
  assert.ok(Number(h.nodes[3].attributes.get("scale")) > 7);
  assert.ok(Number(h.nodes[2].attributes.get("width")) > 1000);
  const old = h.advance(1800);
  h.cleanup();
  assert.equal(h.surface.style.filter, "blur(0px)");
  assert.equal(h.pending.size, 0);
  assert.equal(h.events.size, 0);
  old(2350);
  assert.equal(h.pending.size, 0, "late frames cannot reenter after reset");
});

test("water settles before the original audio ends and stops all work at its visual deadline", () => {
  const h = surfaceHarness();
  h.advance(1000);
  h.advance(2450);
  assert.equal(h.surface.style.filter, "blur(0px)");
  assert.equal(h.pending.size, 0);
  assert.equal(h.events.size, 0);
  assert.equal(h.nodes[0].attributes.get("data-visual-finished"), "true");
  assert.equal(ROLE_SKILL_AUDIO.seer.durationMs, 2500);
  const stats = h.surface.dataset.seerWaterStats;
  h.cleanup();
  assert.equal(h.surface.dataset.seerWaterStats, stats, "cleanup must not overwrite the actual visual deadline measurement");
});

test("water cleanup does not overwrite a newer scene style", () => {
  const h = surfaceHarness();
  h.surface.style.filter = "brightness(1)";
  h.cleanup();
  assert.equal(h.surface.style.filter, "brightness(1)");
});

test("reduced motion never generates textures or adds a scene distortion filter", () => {
  const h = surfaceHarness(true);
  assert.equal(h.canvasCount(), 0);
  assert.equal(h.surface.style.filter, "blur(0px)");
  h.advance(2250);
  assert.equal(h.nodes[3].attributes.get("scale"), "0");
  assert.equal(h.nodes[4].attributes.get("opacity"), "0");
  h.cleanup();
  assert.equal(h.pending.size, 0);
});
