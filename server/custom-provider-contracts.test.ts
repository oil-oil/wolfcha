import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { joinProviderUrl } from "../src/lib/custom-providers";

// 源码契约：与既有 server/*-contract.test.ts 风格一致，防止转发通道被误改。

const chatRouteSource = readFileSync("src/app/api/chat/route.ts", "utf8");
const llmModelsRouteSource = readFileSync("src/app/api/llm-models/route.ts", "utf8");
const ttsRouteSource = readFileSync("src/app/api/tts/route.ts", "utf8");
const openaiAdapterSource = readFileSync("src/lib/tts/openai-compatible.ts", "utf8");
const volcengineAdapterSource = readFileSync("src/lib/tts/volcengine.ts", "utf8");
const elevenlabsAdapterSource = readFileSync("src/lib/tts/elevenlabs.ts", "utf8");
const minimaxAdapterSource = readFileSync("src/lib/tts/minimax.ts", "utf8");
const registrySource = readFileSync("src/lib/tts/registry.ts", "utf8");

test("自定义 LLM Provider：chat 路由接受 custom provider 且强制自备凭据", () => {
  // 流式与批量路径都显式接受 custom
  assert.match(chatRouteSource, /provider === "custom"/g);
  // custom 分支必须要求 Base URL + API Key，拒绝回退系统 Key
  assert.match(chatRouteSource, /此模型需要您提供自定义 Provider 的 Base URL 和 API Key/);
  // 请求头常量贯通
  assert.match(chatRouteSource, /x-custom-base-url/);
  assert.match(chatRouteSource, /x-custom-api-key/);
  // custom 转发只拼 /chat/completions，不允许内置 ZenMux URL
  assert.match(chatRouteSource, /joinProviderUrl\([^)]*, "chat\/completions"\)/);
});

test("自定义 LLM Provider：模型列表代理需要登录且先探测 /models", () => {
  assert.match(llmModelsRouteSource, /authenticateRequest/);
  assert.match(llmModelsRouteSource, /joinProviderUrl\(baseUrl, "models"\)/);
  // /models 不可用时用 max_tokens=1 的最小请求兜底，避免多耗 token
  assert.match(llmModelsRouteSource, /max_tokens: 1/);
  // 401/403 直接判定 key 无效
  assert.match(llmModelsRouteSource, /response\.status === 401 \|\| response\.status === 403/);
});

test("自定义 LLM Provider：批量路径与流式路径共用凭据校验", () => {
  assert.match(chatRouteSource, /runCustomProviderItem/);
  assert.match(chatRouteSource, /hasCustomKeys/);
  // 自带头要计入"玩家已有自定义 Key"，避免被误判为需要项目授权
  assert.match(chatRouteSource, /\(earlyCustomBaseUrl && earlyCustomApiKey\)/);
});

test("TTS 路由按 provider 分发并保留项目模式对局校验", () => {
  assert.match(ttsRouteSource, /resolveTtsRequest/);
  assert.match(ttsRouteSource, /getTtsAdapter/);
  // 无自定义凭据时仍校验游戏会话授权（项目 MiniMax 模式）
  assert.match(ttsRouteSource, /hasAuthorizedActiveGameSession/);
  // 旧协议头兼容
  assert.match(ttsRouteSource, /x-minimax-api-key/);
  // 新协议头
  assert.match(ttsRouteSource, /x-tts-provider/);
  // 连通性测试入口
  assert.match(ttsRouteSource, /probe: true|handleProbe/);
});

test("OpenAI 兼容 TTS 适配器使用标准 /audio/speech 形状", () => {
  assert.match(openaiAdapterSource, /joinProviderUrl\(baseUrl, "audio\/speech"\)/);
  assert.match(openaiAdapterSource, /response_format: "mp3"/);
  // 音色被网关拒绝时回退默认音色重试一次
  assert.match(openaiAdapterSource, /retrying with default/);
});

test("火山引擎适配器使用私有协议且凭据齐全", () => {
  assert.match(volcengineAdapterSource, /openspeech\.bytedance\.com\/api\/v1\/tts/);
  assert.match(volcengineAdapterSource, /Bearer;\$\{accessToken\}/);
  assert.match(volcengineAdapterSource, /cluster: CLUSTER/);
  assert.match(volcengineAdapterSource, /SUCCESS_CODE = 3000/);
});

test("ElevenLabs 适配器按 voiceId 路径合成", () => {
  assert.match(elevenlabsAdapterSource, /v1\/text-to-speech\//);
  assert.match(elevenlabsAdapterSource, /xi-api-key/);
});

test("MiniMax 适配器保留旧路由的健壮性逻辑", () => {
  // 双域名兜底
  assert.match(minimaxAdapterSource, /api\.minimax\.chat/);
  assert.match(minimaxAdapterSource, /api\.minimaxi\.com/);
  // 2054 音色无效自动回退
  assert.match(minimaxAdapterSource, /2054/);
  // t2a_v2 端点
  assert.match(minimaxAdapterSource, /t2a_v2/);
});

test("TTS 注册表覆盖全部五个 Provider", () => {
  for (const id of ["minimax", "openai-compatible", "stepfun", "volcengine", "elevenlabs"]) {
    assert.match(registrySource, new RegExp(id.replace("-", "\\-")));
  }
  // 未知 provider 回退 minimax，保持旧行为
  assert.match(registrySource, /\?\? minimaxAdapter/);
});

test("StepFun 适配器复用 OpenAI speech 形状并预置官方音色", () => {
  const stepfunSource = readFileSync("src/lib/tts/stepfun.ts", "utf8");
  assert.match(stepfunSource, /createOpenAiSpeechAdapter/);
  assert.match(stepfunSource, /api\.stepfun\.com/);
  assert.match(stepfunSource, /step-tts-mini/);
  assert.match(stepfunSource, /cixingnansheng/);
  // 官方音色预设（纯数据、客户端可用）按性别分组，供角色创建采样
  const voicesSource = readFileSync("src/lib/tts/stepfun-voices.ts", "utf8");
  assert.match(voicesSource, /gender: "male"/);
  assert.match(voicesSource, /gender: "female"/);
  // 音色表不得引入服务端适配器（否则 node:https 会进入客户端 bundle）
  assert.doesNotMatch(voicesSource, /openai-compatible|audio-util|node:https/);
});

test("URL 拼接规则：/models 与 /chat/completions 走同一条规范化路径", () => {
  assert.equal(
    joinProviderUrl("https://api.example.com/v1/", "chat/completions"),
    "https://api.example.com/v1/chat/completions",
  );
});
