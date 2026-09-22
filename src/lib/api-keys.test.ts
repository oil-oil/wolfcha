import assert from "node:assert/strict";
import test from "node:test";

import { resolveModelSource } from "./api-keys";

test("显式选择自定义 Key 时不会被 TokenPay 连接状态覆盖", () => {
  assert.equal(
    resolveModelSource({
      storedSource: "custom",
      storedSourceExplicit: true,
      hasLocalKey: true,
      tokenPayConnected: true,
    }),
    "custom",
  );
});

test("显式选择 TokenPay 时不会因为仍保存自定义 Key 而切回 custom", () => {
  assert.equal(
    resolveModelSource({
      storedSource: "tokenpay",
      storedSourceExplicit: true,
      hasLocalKey: true,
      tokenPayConnected: true,
    }),
    "tokenpay",
  );
});

test("旧版本保存过 custom 且仍有 Key 时，优先保持 custom 的单一来源", () => {
  assert.equal(
    resolveModelSource({
      storedSource: "custom",
      storedSourceExplicit: false,
      hasLocalKey: true,
      tokenPayConnected: true,
    }),
    "custom",
  );
});

test("旧版本没有有效 custom 配置时，TokenPay 连接可以成为来源", () => {
  assert.equal(
    resolveModelSource({
      storedSource: "project",
      storedSourceExplicit: false,
      hasLocalKey: true,
      tokenPayConnected: true,
    }),
    "tokenpay",
  );
});
