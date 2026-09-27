import assert from "node:assert/strict";
import test from "node:test";
import { forEachWithConcurrency } from "./concurrency";

test("并发不超过上限，全部项都被处理", async () => {
  let active = 0;
  let peak = 0;
  const done: number[] = [];
  await forEachWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    done.push(item);
  });
  assert.equal(peak, 3);
  assert.deepEqual([...done].sort(), [1, 2, 3, 4, 5, 6, 7]);
});

test("出错后不再启动剩余项，并把错误抛给调用方", async () => {
  const started: number[] = [];
  await assert.rejects(
    forEachWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (item) => {
      started.push(item);
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (item === 2) throw new Error("boom");
    }),
    /boom/,
  );
  assert.ok(started.length < 6);
});
