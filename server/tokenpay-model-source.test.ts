import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveAiVoiceAvailability,
  resolveModelSource,
  setModelSource,
} from "@/lib/api-keys";
import { ALL_MODELS, AVAILABLE_MODELS, MODEL_IDS } from "@/types/game";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "test-publishable-key";

test("model source keeps an explicit selection authoritative", () => {
  assert.equal(
    resolveModelSource({
      storedSource: "project",
      storedSourceExplicit: true,
      legacyCustomEnabled: true,
      hasLocalKey: true,
      tokenPayConnected: true,
    }),
    "project",
  );
  assert.equal(
    resolveModelSource({
      storedSource: "tokenpay",
      storedSourceExplicit: true,
      tokenPayConnected: false,
    }),
    "tokenpay",
  );
  assert.equal(
    resolveModelSource({
      storedSource: "custom",
      storedSourceExplicit: true,
      hasLocalKey: false,
    }),
    "custom",
  );
});

test("旧版本自动写入的 project 不会覆盖已连接的 TokenPay", () => {
  assert.equal(
    resolveModelSource({
      storedSource: "project",
      storedSourceExplicit: false,
      tokenPayConnected: true,
    }),
    "tokenpay",
  );
});

test("TokenPay 不会在没有用户 MiniMax Key 时调用项目语音", () => {
  assert.equal(resolveAiVoiceAvailability("project", false), true);
  assert.equal(resolveAiVoiceAvailability("tokenpay", false), false);
  assert.equal(resolveAiVoiceAvailability("tokenpay", true), true);
  assert.equal(resolveAiVoiceAvailability("custom", false), false);
  assert.equal(resolveAiVoiceAvailability("custom", true), true);
});

test("TokenPay 无 MiniMax Key 时 AudioManager 不会发起 TTS 请求", async () => {
  const { audioManager } = await import("@/lib/audio-manager");
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  const values = new Map<string, string>();
  const fakeWindow = new EventTarget() as EventTarget & {
    localStorage: Storage;
  };
  Object.defineProperty(fakeWindow, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } satisfies Storage,
  });

  let fetchCalls = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(null, { status: 500 });
  };

  try {
    setModelSource("tokenpay");
    audioManager.setEnabled(true);
    assert.equal(audioManager.isEnabled(), false);
    await audioManager.ensureReady({
      id: "tokenpay-no-tts",
      text: "测试",
      voiceId: "voice",
      playerId: "player",
    });
    assert.equal(fetchCalls, 0);
  } finally {
    audioManager.setEnabled(false);
    globalThis.fetch = originalFetch;
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
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
