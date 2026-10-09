import assert from "node:assert/strict";
import test from "node:test";
import { createSeerWaterMaps, SEER_WATER_MAP_SIZE, SEER_WATER_VISUAL_MS, seerWaterFrame } from "./seer-water";

test("water maps bend the scene in radial directions and keep the outer surface neutral", () => {
  const map = createSeerWaterMaps();
  assert.equal(map.size, SEER_WATER_MAP_SIZE);
  assert.equal(map.normals.length, 128 * 128 * 4);
  assert.deepEqual([...map.normals.subarray(0, 4)], [128, 128, 128, 255]);
  assert.equal(map.light[3], 0);
  assert.ok(map.normals.some((value, i) => i % 4 < 2 && Math.abs(value - 128) > 60));
  assert.ok(map.light.some((value, i) => i % 4 === 3 && value > 40));
});

test("water travels from center across the full view and returns to neutral; reduced motion never distorts", () => {
  const start = seerWaterFrame(0, SEER_WATER_VISUAL_MS, 850);
  const middle = seerWaterFrame(SEER_WATER_VISUAL_MS / 2, SEER_WATER_VISUAL_MS, 850);
  const end = seerWaterFrame(SEER_WATER_VISUAL_MS, SEER_WATER_VISUAL_MS, 850);
  assert.ok(middle.radius > start.radius);
  assert.ok(end.radius > 850, "wave front reaches the corners");
  assert.equal(start.displacement, 0);
  assert.ok(middle.displacement > 7);
  assert.ok(end.displacement < 0.001);
  assert.equal(end.done, true);
  for (const time of [0, 400, 1200, 2500]) {
    const reduced = seerWaterFrame(time, 2500, 850, true);
    assert.equal(reduced.displacement, 0);
    assert.equal(reduced.lightOpacity, 0);
  }
});

test("the radial surface has only a few broad crests rather than dense repeated rings", () => {
  const { normals, size } = createSeerWaterMaps();
  const samples = Array.from({ length: size / 2 - 4 }, (_, x) => normals[((size / 2) * size + size / 2 + x + 2) * 4] - 128);
  const signChanges = samples.slice(1).filter((value, i) => value * samples[i] < 0).length;
  assert.ok(signChanges >= 3 && signChanges <= 5, `observed ${signChanges} alternating slopes`);
});
