import assert from "node:assert/strict";
import test from "node:test";

import { resolveModelSource } from "@/lib/api-keys";
import { ALL_MODELS, AVAILABLE_MODELS, MODEL_IDS } from "@/types/game";

test("model source keeps an explicit selection authoritative", () => {
  assert.equal(
    resolveModelSource({
      storedSource: "project",
      legacyCustomEnabled: true,
      hasLocalKey: true,
      tokenPayConnected: true,
    }),
    "project",
  );
  assert.equal(
    resolveModelSource({ storedSource: "tokenpay", tokenPayConnected: false }),
    "tokenpay",
  );
  assert.equal(
    resolveModelSource({ storedSource: "custom", hasLocalKey: false }),
    "custom",
  );
});

test("legacy key settings migrate to exactly one model source", () => {
  assert.equal(
    resolveModelSource({
      legacyCustomEnabled: true,
      hasLocalKey: true,
      tokenPayConnected: true,
    }),
    "custom",
  );
  assert.equal(
    resolveModelSource({
      legacyCustomEnabled: true,
      hasLocalKey: false,
      tokenPayConnected: true,
    }),
    "tokenpay",
  );
  assert.equal(resolveModelSource({}), "project");
});

test("TokenPay default model uses GLM 5.3 Flash with required thinking enabled", () => {
  const builtInModel = AVAILABLE_MODELS[0];
  const selectableModel = ALL_MODELS.find(
    (model) => model.model === MODEL_IDS.tokendance.glm53Flash,
  );

  assert.equal(builtInModel.model, MODEL_IDS.tokendance.glm53Flash);
  assert.equal(builtInModel.temperature, 1);
  assert.deepEqual(builtInModel.reasoning, { enabled: true, effort: "low" });
  assert.equal(selectableModel?.temperature, 1);
  assert.deepEqual(selectableModel?.reasoning, { enabled: true, effort: "low" });
});
