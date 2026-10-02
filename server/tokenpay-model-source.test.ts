import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveAiVoiceAvailability,
  resolveModelSource,
  setModelSource,
} from "@/lib/api-keys";
import { ALL_MODELS, AVAILABLE_MODELS, MODEL_IDS, SUMMARY_MODEL, REVIEW_MODEL } from "@/types/game";

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

test("项目与 TokenPay 使用已授权的服务端语音，自定义来源需要本地语音 Key", () => {
  assert.equal(resolveAiVoiceAvailability("project", false), true);
  assert.equal(resolveAiVoiceAvailability("tokenpay", false), true);
  assert.equal(resolveAiVoiceAvailability("tokenpay", true), true);
  assert.equal(resolveAiVoiceAvailability("custom", false), false);
  assert.equal(resolveAiVoiceAvailability("custom", true), true);
  assert.equal(resolveAiVoiceAvailability("custom", false, true), true);
});

test("TokenPay 语音请求不混用已保存的自定义 Key，切换到自定义来源后才发送", async () => {
  const { AudioManager } = await import("@/lib/audio-manager");
  const audioManager = new AudioManager();
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const originalFetch = globalThis.fetch;
  const values = new Map<string, string>([
    ["wolfcha_guest_id", "guest_voice_test"],
    ["wolfcha_minimax_api_key", "test-user-minimax-key"],
    ["wolfcha_minimax_group_id", "test-user-minimax-group"],
  ]);
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

  const requestHeaders: Headers[] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: fakeWindow.localStorage });
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/tts");
    requestHeaders.push(new Headers(init?.headers));
    return new Response(null, { status: 500 });
  };

  try {
    setModelSource("tokenpay");
    audioManager.setEnabled(true);
    assert.equal(audioManager.isEnabled(), true);
    const task = {
      id: "tokenpay-server-tts",
      text: "测试",
      voiceId: "voice",
      playerId: "player",
    };
    await assert.rejects(audioManager.ensureReady(task), /TTS request failed: 500/);
    assert.equal(requestHeaders.length, 1);
    assert.equal(requestHeaders[0].get("X-Guest-Id"), "guest_voice_test");
    assert.equal(requestHeaders[0].has("X-Minimax-Api-Key"), false);
    assert.equal(requestHeaders[0].has("X-Minimax-Group-Id"), false);
    assert.equal(requestHeaders[0].has("X-TokenPay-Mode"), false);

    setModelSource("custom");
    await assert.rejects(audioManager.ensureReady(task), /TTS request failed: 500/);
    assert.equal(requestHeaders.length, 2);
    assert.equal(requestHeaders[1].get("X-Minimax-Api-Key"), "test-user-minimax-key");
    assert.equal(requestHeaders[1].get("X-Minimax-Group-Id"), "test-user-minimax-group");
  } finally {
    audioManager.setEnabled(false);
    globalThis.fetch = originalFetch;
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
    if (originalStorageDescriptor) Object.defineProperty(globalThis, "localStorage", originalStorageDescriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
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

test("TokenPay、总结和复盘默认使用 DeepSeek V4.1 Flash", () => {
  const builtInModel = AVAILABLE_MODELS[0];
  const selectableModel = ALL_MODELS.find(
    (model) => model.model === MODEL_IDS.tokendance.deepseekV41Flash,
  );

  assert.equal(builtInModel.model, "deepseek-v4.1-flash");
  assert.equal(SUMMARY_MODEL, builtInModel.model);
  assert.equal(REVIEW_MODEL, builtInModel.model);
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
      model: MODEL_IDS.tokendance.deepseekV41Flash,
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
