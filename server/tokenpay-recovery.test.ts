import assert from "node:assert/strict";
import test from "node:test";

import {
  getTokenPayTopUpRetryIndexes,
  readTokenPayRecoveryAction,
  requestTokenPayTopUp,
  retryTokenPayRequestAfterTopUp,
  settleTokenPayTopUp,
  TOKENPAY_TOP_UP_REQUEST_EVENT,
  type TokenPayTopUpRequestDetail,
} from "@/lib/tokenpay-recovery";

function installEventTargetWindow() {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const eventTarget = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: eventTarget,
  });
  return {
    eventTarget,
    restore() {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, "window", originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    },
  };
}

test("TokenPay recovery action supports headers and JSON without consuming the body", async () => {
  const headerResponse = new Response(null, {
    status: 402,
    headers: { "TokenDance-Recovery-Action": "top_up_balance" },
  });
  assert.equal(await readTokenPayRecoveryAction(headerResponse), "top_up_balance");

  const jsonResponse = new Response(JSON.stringify({ recoveryAction: "top_up_balance" }), {
    status: 402,
    headers: { "content-type": "application/json" },
  });
  assert.equal(await readTokenPayRecoveryAction(jsonResponse), "top_up_balance");
  assert.deepEqual(await jsonResponse.json(), { recoveryAction: "top_up_balance" });
});

test("batch recovery retries only insufficient-balance failures", () => {
  assert.deepEqual(
    getTokenPayTopUpRetryIndexes([
      { ok: true, data: {} },
      { ok: false, recoveryAction: "top_up_balance" },
      { ok: false, recoveryAction: "reauthorize_api_key" },
      { ok: false, recoveryAction: "top_up_balance" },
    ]),
    [1, 3],
  );
});

test("concurrent insufficient-balance requests share one recharge flow", async () => {
  const { eventTarget, restore } = installEventTargetWindow();
  let requestCount = 0;
  let requestId = "";
  eventTarget.addEventListener(TOKENPAY_TOP_UP_REQUEST_EVENT, (event) => {
    requestCount += 1;
    requestId = (event as CustomEvent<TokenPayTopUpRequestDetail>).detail.requestId;
  });

  try {
    const first = requestTokenPayTopUp();
    const second = requestTokenPayTopUp();
    assert.equal(first, second);
    await Promise.resolve();
    assert.equal(requestCount, 1);
    assert.ok(requestId);

    settleTokenPayTopUp(requestId, true);
    assert.deepEqual(await Promise.all([first, second]), [true, true]);
  } finally {
    restore();
  }
});

test("a successful recharge retries the interrupted request exactly once", async () => {
  await Promise.resolve();
  const { eventTarget, restore } = installEventTargetWindow();
  eventTarget.addEventListener(TOKENPAY_TOP_UP_REQUEST_EVENT, (event) => {
    const requestId = (event as CustomEvent<TokenPayTopUpRequestDetail>).detail.requestId;
    settleTokenPayTopUp(requestId, true);
  });

  let retries = 0;
  try {
    const response = await retryTokenPayRequestAfterTopUp(
      new Response(JSON.stringify({ recoveryAction: "top_up_balance" }), {
        status: 402,
        headers: { "content-type": "application/json" },
      }),
      async () => {
        retries += 1;
        return new Response("ok");
      },
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ok");
    assert.equal(retries, 1);
  } finally {
    restore();
  }
});

test("leaving the page settles an unfinished recharge flow", async () => {
  await Promise.resolve();
  const { eventTarget, restore } = installEventTargetWindow();

  try {
    const recovery = requestTokenPayTopUp();
    await Promise.resolve();
    eventTarget.dispatchEvent(new Event("pagehide"));
    assert.equal(await recovery, false);
  } finally {
    restore();
  }
});
