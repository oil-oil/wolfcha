import {
  requestBuffer,
  resolveAudioMime,
} from "./audio-util";
import {
  type TtsAdapter,
  type TtsProviderId,
  type TtsAudioResult,
  type TtsSynthesizeInput,
  TtsProviderError,
} from "./types";
import { joinProviderUrl } from "@/lib/custom-providers";

const TTS_TIMEOUT_MS = 30_000;

const DEFAULT_MODEL = "gpt-4o-mini-tts";
const DEFAULT_VOICE = "alloy";

/**
 * OpenAI /audio/speech 兼容格式的适配器工厂。
 * 一个形状覆盖 OpenAI 官方、硅基流动、Fish Audio、阶跃星辰 StepFun 及各类
 * 自部署网关（GPT-SoVITS、index-tts 等的兼容层）。
 * 语音参数：model + input + voice + response_format。
 */
export interface OpenAiSpeechAdapterConfig {
  id: TtsProviderId;
  defaultBaseUrl: string;
  defaultModel: string;
  defaultVoiceId: string;
  logTag: string;
  missingKeyMessage: string;
}

export function createOpenAiSpeechAdapter(config: OpenAiSpeechAdapterConfig): TtsAdapter {
  return {
    id: config.id,
    defaultVoiceId() {
      return config.defaultVoiceId;
    },

    async synthesize(input: TtsSynthesizeInput, credentials): Promise<TtsAudioResult> {
      const apiKey = credentials.apiKey?.trim();
      if (!apiKey) {
        throw new TtsProviderError(config.missingKeyMessage, 400);
      }
      const baseUrl = credentials.baseUrl?.trim() || config.defaultBaseUrl;
      const speechUrl = joinProviderUrl(baseUrl, "audio/speech");
      if (!speechUrl) {
        throw new TtsProviderError("Invalid TTS Base URL", 400);
      }

      const voice = input.voiceId.trim() || this.defaultVoiceId(input.locale);

      const first = await requestSpeech(speechUrl, apiKey, {
        model: credentials.model?.trim() || config.defaultModel,
        input: input.text,
        voice,
        response_format: "mp3",
      });

      if (first.statusCode >= 200 && first.statusCode < 300) {
        const mime = resolveAudioMime(first.body, first.headers["content-type"]);
        if (mime) return { audio: first.body, mime };
        throw new TtsProviderError("TTS audio is not in a supported format.", 502, first.body.slice(0, 300).toString("utf8"));
      }

      // 音色无效时回退到默认音色重试一次（各网关对未知 voice 的报错形态不一）
      const errorText = first.body.slice(0, 400).toString("utf8").toLowerCase();
      if (voice !== this.defaultVoiceId(input.locale) && (first.statusCode === 400 || first.statusCode === 404)) {
        console.warn(`[tts/${config.logTag}] voice rejected, retrying with default:`, errorText.slice(0, 200));
        const retry = await requestSpeech(speechUrl, apiKey, {
          model: credentials.model?.trim() || config.defaultModel,
          input: input.text,
          voice: this.defaultVoiceId(input.locale),
          response_format: "mp3",
        });
        if (retry.statusCode >= 200 && retry.statusCode < 300) {
          const mime = resolveAudioMime(retry.body, retry.headers["content-type"]);
          if (mime) return { audio: retry.body, mime };
        }
        throw new TtsProviderError(
          `TTS 请求失败（HTTP ${retry.statusCode}）`,
          retry.statusCode,
          retry.body.slice(0, 300).toString("utf8"),
        );
      }

      throw new TtsProviderError(
        `TTS 请求失败（HTTP ${first.statusCode}）`,
        first.statusCode,
        errorText,
      );
    },
  };
}

export const openaiCompatibleAdapter: TtsAdapter = createOpenAiSpeechAdapter({
  id: "openai-compatible",
  defaultBaseUrl: "https://api.openai.com/v1",
  defaultModel: DEFAULT_MODEL,
  defaultVoiceId: DEFAULT_VOICE,
  logTag: "openai-compatible",
  missingKeyMessage: "OpenAI 兼容 TTS 需要 API Key",
});

async function requestSpeech(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
) {
  return requestBuffer(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: TTS_TIMEOUT_MS,
  });
}
