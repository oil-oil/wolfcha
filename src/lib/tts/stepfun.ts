import { createOpenAiSpeechAdapter } from "./openai-compatible";

/**
 * 阶跃星辰 StepFun TTS。OpenAI /audio/speech 兼容形状：
 * POST {base}/audio/speech {model, input, voice, response_format}。
 * 模型：step-tts-mini / step-tts-2 / stepaudio-2.5-tts。
 * Step Plan 订阅需使用 https://api.stepfun.com/step_plan/v1 作为 Base URL。
 * 音色预设（客户端可用）见 ./stepfun-voices。
 */

export const STEPFUN_DEFAULT_BASE_URL = "https://api.stepfun.com/v1";
export const STEPFUN_DEFAULT_MODEL = "step-tts-mini";
export const STEPFUN_DEFAULT_VOICE = "cixingnansheng";

export const stepfunAdapter = createOpenAiSpeechAdapter({
  id: "stepfun",
  defaultBaseUrl: STEPFUN_DEFAULT_BASE_URL,
  defaultModel: STEPFUN_DEFAULT_MODEL,
  defaultVoiceId: STEPFUN_DEFAULT_VOICE,
  logTag: "stepfun",
  missingKeyMessage: "StepFun TTS 需要 API Key",
});
