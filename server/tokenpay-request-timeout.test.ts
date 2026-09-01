import assert from "node:assert/strict";
import test from "node:test";

import { RequestTimeoutError, withTimeout } from "@/lib/request-timeout";

test("withTimeout returns a completed operation", async () => {
  assert.equal(await withTimeout(Promise.resolve("ok"), 100), "ok");
});

test("withTimeout rejects an operation that never settles", async () => {
  await assert.rejects(
    () => withTimeout(new Promise<never>(() => undefined), 5),
    RequestTimeoutError,
  );
});
