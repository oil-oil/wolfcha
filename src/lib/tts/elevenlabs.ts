import {
  requestBuffer,
  resolveAudioMime,
} from "./audio-util";
import {
  type TtsAdapter,
  type TtsAudioResult,
  type TtsSynthesizeInput,
  TtsProviderError,
} from "./types";
import { joinProviderUrl } from "@/lib/custom-providers";

const TTS_TIMEOUT_MS = 30_000;
const DEFAULT_BASE_URL = "https://api.elevenlabs.io";
const DEFAULT_MODEL = "eleven_multilingual_v2";
/** 免费可用的预置音色（Rachel）；未知音色一律回退到它 */
const FALLBACK_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/** ElevenLabs REST TTS：按 voiceId 路径合成，xi-api-key 鉴权。 */
export const elevenlabsAdapter: TtsAdapter = {
  id: "elevenlabs",
  defaultVoiceId() {
    return FALLBACK_VOICE_ID;
  },

  async synthesize(input: TtsSynthesizeInput, credentials): Promise<TtsAudioResult> {
    const apiKey = credentials.apiKey?.trim();
    if (!apiKey) {
      throw new TtsProviderError("ElevenLabs TTS 需要 API Key", 400);
    }

    const baseUrl = credentials.baseUrl?.trim() || DEFAULT_BASE_URL;
    const voice = input.voiceId.trim() || this.defaultVoiceId(input.locale);
    const outputFormat = "mp3_44100_128";

    const synthesizeOnce = async (voiceId: string) => {
      const url = joinProviderUrl(baseUrl, `v1/text-to-speech/${encodeURIComponent(voiceId)}`);
      if (!url) throw new TtsProviderError("Invalid TTS Base URL", 400);
      return requestBuffer(`${url}?output_format=${outputFormat}`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: input.text,
          model_id: credentials.model?.trim() || DEFAULT_MODEL,
        }),
        timeoutMs: TTS_TIMEOUT_MS,
      });
    };

    let response = await synthesizeOnce(voice);

    // 音色无效（400/404/422）时回退到预置音色重试一次
    if ([400, 404, 422].includes(response.statusCode) && voice !== this.defaultVoiceId(input.locale)) {
      console.warn("[tts/elevenlabs] voice rejected, retrying with default voice");
      response = await synthesizeOnce(this.defaultVoiceId(input.locale));
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new TtsProviderError(
        `ElevenLabs TTS 请求失败（HTTP ${response.statusCode}）`,
        response.statusCode,
        response.body.slice(0, 300).toString("utf8"),
      );
    }

    const mime = resolveAudioMime(response.body, response.headers["content-type"]);
    if (!mime) {
      throw new TtsProviderError(
        "TTS audio is not in a supported format.",
        502,
        response.body.slice(0, 300).toString("utf8"),
      );
    }
    return { audio: response.body, mime };
  },
};
