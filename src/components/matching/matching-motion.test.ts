import assert from "node:assert/strict";
import { test } from "node:test";
import { createCrowdStopSlots, createWalkingRoute, walkingRouteX } from "./matching-motion";

test("6–12 horizontal stops stay away from the edges without prescribing height or scale", () => {
  for (const width of [320, 390, 600, 768, 1280, 1920]) {
    for (let count = 6; count <= 12; count++) {
      const slots = createCrowdStopSlots(width, count);
      assert.equal(slots.length, count);
      assert.equal(new Set(slots.map((slot) => slot.index)).size, count);
      assert.equal(new Set(slots.map((slot) => slot.x)).size, count);
      for (const slot of slots) {
        assert.ok(slot.x >= width * 0.2 && slot.x <= width * 0.8);
        assert.equal("anchorY" in slot, false);
        assert.equal("scale" in slot, false);
      }
    }
  }
});

test("a walker already beyond its stop exits and reenters offscreen without changing direction", () => {
  for (const direction of [1, -1] as const) {
    const start = direction === 1 ? 850 : 150;
    const target = direction === 1 ? 350 : 650;
    const route = createWalkingRoute(start, target, 1000, 180, direction, 120);
    assert.equal(route.wraps, true);
    assert.equal(walkingRouteX(route, 0), start);
    assert.equal(walkingRouteX(route, 1), target);
    let previous = start;
    for (let index = 1; index <= 1000; index++) {
      const x = walkingRouteX(route, index / 1000);
      if (direction * (x - previous) < 0) {
        // Both sides of the wrap are beyond the original visible silhouette.
        assert.ok(direction === 1 ? previous >= 1180 - 2 && x <= -180 + 2 : previous <= -180 + 2 && x >= 1180 - 2);
      }
      previous = x;
    }
  }
});

test("edge entrants traverse the crowd and an existing figure never stops after a negligible step", () => {
  for (const direction of [1, -1] as const) {
    const start = direction === 1 ? -150 : 1150;
    const target = direction === 1 ? 400 : 600;
    const route = createWalkingRoute(start, target, 1000, 150, direction, 120);
    assert.equal(route.wraps, false);
    assert.equal(route.distance, 550);
    assert.equal(walkingRouteX(route, 1), target);
    assert.ok(direction * (walkingRouteX(route, 0.75) - walkingRouteX(route, 0.25)) > 250);
    const tooClose = createWalkingRoute(target - direction * 10, target, 1000, 150, direction, 120);
    assert.equal(tooClose.wraps, true);
    assert.ok(tooClose.distance > 1000);
  }
});
