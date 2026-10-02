import assert from "node:assert/strict";
import test from "node:test";
import { GameEntryGate } from "./game-entry-gate";

test("generated players stay in the lobby until this round completes its entrance", async () => {
  const gate = new GameEntryGate();
  let started = false;
  const waiting = gate.wait("round-a").then((completed) => { started = completed; return completed; });
  gate.complete("different-round");
  await Promise.resolve();
  assert.equal(started, false);
  gate.complete("round-a");
  assert.equal(await waiting, true);
  assert.equal(started, true);
  gate.complete("round-a");
});

test("cancelling loading releases the wait without starting night actions", async () => {
  const gate = new GameEntryGate();
  const waiting = gate.wait("abandoned-round");
  gate.cancel();
  gate.cancel();
  gate.complete("abandoned-round");
  assert.equal(await waiting, false);
});

test("a late arrival callback cannot complete a replacement round", async () => {
  const gate = new GameEntryGate();
  const first = gate.wait("old-round");
  let nextStarted = false;
  const second = gate.wait("new-round").then((completed) => { nextStarted = completed; return completed; });
  assert.equal(await first, false);
  gate.complete("old-round");
  await Promise.resolve();
  assert.equal(nextStarted, false);
  gate.complete("new-round");
  assert.equal(await second, true);
});
