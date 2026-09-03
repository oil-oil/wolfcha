export type TtsProviderId = "minimax" | "openai-compatible" | "stepfun" | "volcengine" | "elevenlabs";

export type TtsLocale = "zh" | "en";

/** 各 Provider 的鉴权/端点配置；由客户端通过请求头透传或服务端环境变量兜底。 */
export interface TtsCredentials {
  apiKey?: string;
  /** 仅 MiniMax 需要 */
  groupId?: string;
  /** OpenAI 兼容 / ElevenLabs 的自定义端点 */
  baseUrl?: string;
  /** OpenAI 兼容（如 gpt-4o-mini-tts）或 ElevenLabs 模型（如 eleven_multilingual_v2） */
  model?: string;
  /** 仅火山引擎需要 */
  appId?: string;
  /** 仅火山引擎需要 */
  accessToken?: string;
}

export interface TtsSynthesizeInput {
  text: string;
  voiceId: string;
  locale?: TtsLocale;
}

export interface TtsAudioResult {
  audio: Buffer;
  mime: string;
}

export interface TtsAdapter {
  id: TtsProviderId;
  /** 该 Provider 的兜底音色；音色无效或跨 Provider 残留旧 ID 时使用 */
  defaultVoiceId(locale?: TtsLocale): string;
  synthesize(input: TtsSynthesizeInput, credentials: TtsCredentials): Promise<TtsAudioResult>;
}

export class TtsProviderError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(message: string, status = 502, detail?: string) {
    super(message);
    this.name = "TtsProviderError";
    this.status = status;
    this.detail = detail;
  }
}
