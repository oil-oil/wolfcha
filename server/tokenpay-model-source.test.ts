import assert from "node:assert/strict";
import test from "node:test";

import { resolveModelSource } from "@/lib/api-keys";
import { ALL_MODELS, AVAILABLE_MODELS, MODEL_IDS } from "@/types/game";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "test-publishable-key";

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

test("TokenPay default model uses DeepSeek V4 Flash", () => {
  const builtInModel = AVAILABLE_MODELS[0];
  const selectableModel = ALL_MODELS.find(
    (model) => model.model === MODEL_IDS.tokendance.deepseekV4Flash0731,
  );

  assert.equal(builtInModel.model, MODEL_IDS.tokendance.deepseekV4Flash0731);
  assert.deepEqual(builtInModel.reasoning, { enabled: false });
  assert.deepEqual(selectableModel?.reasoning, { enabled: false });
});

test("TokenPay 会同时归一化旧存档的模型与 Provider", async () => {
  const { resolveRequestModelForSource } = await import("@/lib/llm");
  assert.deepEqual(
    resolveRequestModelForSource(
      "tokenpay",
      MODEL_IDS.zenmux.geminiFlashLite,
      "zenmux",
    ),
    {
      model: MODEL_IDS.tokendance.deepseekV4Flash0731,
      provider: "tokendance",
    },
  );
});

test("自定义 Key 仍保留用户显式选择的 Provider", async () => {
  const { resolveRequestModelForSource } = await import("@/lib/llm");
  assert.deepEqual(
    resolveRequestModelForSource(
      "custom",
      MODEL_IDS.zenmux.geminiFlashLite,
      "zenmux",
    ),
    {
      model: MODEL_IDS.zenmux.geminiFlashLite,
      provider: "zenmux",
    },
  );
});
