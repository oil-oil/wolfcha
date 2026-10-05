import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import { loadMatchingImage, MATCHING_IMAGE_CACHE_LIMIT, scheduleMatchingAssetWarmup } from "./matching-assets";

function mockBrowser(t: TestContext) {
  const requests: TestImage[] = [];
  const timers = new Map<number, () => void>();
  const idle = new Map<number, () => void>();
  let nextId = 0;
  class TestImage {
    src = "";
    crossOrigin = "";
    fetchPriority = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    decodeError = false;
    constructor() { requests.push(this); }
    async decode() { if (this.decodeError) throw new Error("Invalid image"); }
  }
  const navigator = { connection: { saveData: false } };
  const replacements = {
    Image: TestImage,
    navigator,
    window: {
      setTimeout: (callback: () => void) => { const id = ++nextId; timers.set(id, callback); return id; },
      clearTimeout: (id: number) => timers.delete(id),
      requestIdleCallback: (callback: () => void) => { const id = ++nextId; idle.set(id, callback); return id; },
      cancelIdleCallback: (id: number) => idle.delete(id),
    },
  };
  for (const [name, value] of Object.entries(replacements)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  return { requests, timers, idle, navigator };
}

test("prewarming and multiple scenes share one request and one decoded image", async (t) => {
  const browser = mockBrowser(t);
  const warm = loadMatchingImage("/test-shared.svg", "low");
  const scene = loadMatchingImage("/test-shared.svg");
  assert.equal(warm, scene);
  assert.equal(browser.requests.length, 1);
  assert.equal(browser.requests[0].fetchPriority, "high");
  assert.equal(browser.requests[0].crossOrigin, "anonymous");
  browser.requests[0].onload?.();
  const image = await scene;
  assert.equal(await loadMatchingImage("/test-shared.svg"), image);
  assert.equal(browser.requests.length, 1);
  assert.equal(browser.timers.size, 0);
});

test("failed downloads and invalid SVG decoding can be retried by the visible scene", async (t) => {
  const browser = mockBrowser(t);
  const failed = loadMatchingImage("/test-retry.svg", "low");
  const rejected = assert.rejects(failed, /Unable to load/);
  browser.requests[0].onerror?.();
  await rejected;
  const invalid = loadMatchingImage("/test-retry.svg");
  const invalidRejected = assert.rejects(invalid, /Unable to load/);
  browser.requests[1].decodeError = true;
  browser.requests[1].onload?.();
  await invalidRejected;
  const retry = loadMatchingImage("/test-retry.svg");
  browser.requests[2].onload?.();
  await retry;
  assert.equal(browser.requests.length, 3);
  assert.equal(browser.timers.size, 0);
});

test("a timed-out request cannot overwrite or invalidate its replacement", async (t) => {
  const browser = mockBrowser(t);
  const stalled = loadMatchingImage("/test-timeout.svg");
  const rejected = assert.rejects(stalled, /Unable to load/);
  const lateLoad = browser.requests[0].onload;
  browser.timers.values().next().value?.();
  await rejected;
  const retry = loadMatchingImage("/test-timeout.svg");
  lateLoad?.();
  browser.requests[1].onload?.();
  await retry;
  assert.equal(loadMatchingImage("/test-timeout.svg"), retry);
  assert.equal(browser.requests.length, 2);
});

test("decoded image retention is bounded while recently used figures stay reusable", async (t) => {
  const browser = mockBrowser(t);
  for (let i = 0; i < MATCHING_IMAGE_CACHE_LIMIT + 2; i++) {
    const pending = loadMatchingImage(`/test-lru-${i}.svg`);
    browser.requests.at(-1)?.onload?.();
    await pending;
  }
  const count = browser.requests.length;
  await loadMatchingImage(`/test-lru-${MATCHING_IMAGE_CACHE_LIMIT + 1}.svg`);
  assert.equal(browser.requests.length, count);
  const evicted = loadMatchingImage("/test-lru-0.svg");
  assert.equal(browser.requests.length, count + 1);
  browser.requests.at(-1)?.onload?.();
  await evicted;
});

test("welcome warmup runs four low-priority requests at a time and stops queuing after unmount", async (t) => {
  const browser = mockBrowser(t);
  const cancel = scheduleMatchingAssetWarmup();
  assert.equal(browser.requests.length, 0);
  browser.idle.values().next().value?.();
  assert.equal(browser.requests.length, 4);
  assert.ok(browser.requests.every((image) => image.fetchPriority === "low"));
  cancel();
  browser.requests.forEach((image) => image.onload?.());
  await setImmediate();
  assert.equal(browser.requests.length, 4);
  assert.equal(browser.idle.size, 0);
  assert.equal(browser.timers.size, 0);
});

test("data saving disables speculative warmup", (t) => {
  const browser = mockBrowser(t);
  browser.navigator.connection.saveData = true;
  scheduleMatchingAssetWarmup()();
  assert.equal(browser.idle.size, 0);
  assert.equal(browser.requests.length, 0);
});
