import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getTtsSettings,
  saveTtsSettings,
  isCustomTtsActive,
  resolveVoiceIdForActiveProvider,
} from "./tts-client";

/**
 * tts-client 在 Node 测试环境没有 window，需要先注入 localStorage 桩，
 * 才能 exercise 配置读取路径（函数体惰性读取，静态导入安全）。
 */
interface StorageStub {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function installWindowStorage(storage: Record<string, string>) {
  const stub: StorageStub = {
    getItem: (key) => (key in storage ? storage[key] : null),
    setItem: (key, value) => {
      storage[key] = value;
    },
    removeItem: (key) => {
      delete storage[key];
    },
  };
  (globalThis as unknown as { window: { localStorage: StorageStub; dispatchEvent: () => boolean } }).window = {
    localStorage: stub,
    dispatchEvent: () => true,
  };
  return storage as Record<string, string>;
}

const storage = installWindowStorage({});

test("默认 TTS 配置是内置 MiniMax，且不算自定义 TTS", () => {
  delete storage["wolfcha_tts_settings_v1"];
  const settings = getTtsSettings();
  assert.equal(settings.provider, "minimax");
  assert.equal(isCustomTtsActive(settings), false);
});

test("保存 OpenAI 兼容配置后自定义 TTS 生效", () => {
  delete storage["wolfcha_tts_settings_v1"];
  const settings = saveTtsSettings({
    ...getTtsSettings(),
    provider: "openai-compatible",
    openai: { baseUrl: "https://api.siliconflow.cn/v1", apiKey: "sk-test", model: "FunAudioLLM/CosyVoice2-0.5B" },
  });
  assert.equal(isCustomTtsActive(settings), true);
  assert.equal(getTtsSettings().provider, "openai-compatible");
});

test("火山引擎缺少任一凭据时不算可用", () => {
  const base = getTtsSettings();
  const missingToken = {
    ...base,
    provider: "volcengine" as const,
    volcengine: { appId: "app-1", accessToken: "" },
  };
  assert.equal(isCustomTtsActive(missingToken), false);
  const complete = {
    ...base,
    provider: "volcengine" as const,
    volcengine: { appId: "app-1", accessToken: "token-1" },
  };
  assert.equal(isCustomTtsActive(complete), true);
});

test("MiniMax Provider 下合法音色 ID 原样保留（与旧 resolveVoiceId 行为一致）", () => {
  delete storage["wolfcha_tts_settings_v1"];
  const voiceId = resolveVoiceIdForActiveProvider(
    "male-qn-jingying",
    "male",
    30,
    "zh",
  );
  assert.equal(voiceId, "male-qn-jingying");
});

test("非 MiniMax Provider 会把旧存档的异 Provider 音色稳定映射到新音色表", () => {
  saveTtsSettings({
    ...getTtsSettings(),
    provider: "openai-compatible",
    openai: { baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "gpt-4o-mini-tts" },
  });

  const a1 = resolveVoiceIdForActiveProvider("male-qn-jingying", "male", 30, "zh", "player-1");
  const a2 = resolveVoiceIdForActiveProvider("male-qn-jingying", "male", 30, "zh", "player-1");
  const b = resolveVoiceIdForActiveProvider("male-qn-jingying", "male", 30, "zh", "player-2");

  // 同一种子确定性收敛，不同种子应能产生区分
  assert.equal(a1, a2);
  assert.notEqual(a1, b);

  // 命中当前 Provider 音色表的输入直接保留
  assert.equal(resolveVoiceIdForActiveProvider("alloy", "female", 30, "zh", "x"), "alloy");
});
