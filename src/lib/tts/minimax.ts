import { DEFAULT_VOICE_ID, DEFAULT_VOICE_ID_EN } from "@/lib/voice-constants";
import {
  requestBuffer,
  sniffAudioMime,
} from "./audio-util";
import {
  type TtsAdapter,
  type TtsAudioResult,
  type TtsCredentials,
  type TtsSynthesizeInput,
  TtsProviderError,
} from "./types";

const TTS_TIMEOUT_MS = 30_000;

interface MiniMaxCredentials extends TtsCredentials {
  apiKey: string;
  groupId: string;
}

const asMiniMax = (c: TtsCredentials): MiniMaxCredentials | null =>
  c.apiKey && c.groupId ? { ...c, apiKey: c.apiKey, groupId: c.groupId } : null;

function pickFallbackVoiceId(badVoiceId: string): string {
  const v = badVoiceId.toLowerCase();
  if (v.startsWith("female") || v.includes("female")) return DEFAULT_VOICE_ID.female;
  return DEFAULT_VOICE_ID.male;
}

/**
 * MiniMax T2A V2。保留旧 /api/tts 路由的全部健壮性逻辑：
 * 双域名兜底、2054 音色无效自动回退、audio url / hex / base64 三种返回形态。
 * 参考文档：https://platform.minimaxi.com/document/T2A%20V2
 */
export const minimaxAdapter: TtsAdapter = {
  id: "minimax",
  defaultVoiceId(locale) {
    return locale === "en" ? DEFAULT_VOICE_ID_EN.male : DEFAULT_VOICE_ID.male;
  },

  async synthesize(input: TtsSynthesizeInput, credentials): Promise<TtsAudioResult> {
    const creds = asMiniMax(credentials);
    if (!creds) {
      throw new TtsProviderError("MiniMax API key and group ID are both required", 400);
    }

    const baseUrlFromEnv = process.env.MINIMAX_API_BASE_URL;
    const primaryBaseUrl = baseUrlFromEnv || creds.baseUrl || "https://api.minimax.chat";

    const candidateBaseUrls = [primaryBaseUrl];
    if (!baseUrlFromEnv && !creds.baseUrl) {
      // 自动兜底另一个域名，避免因为平台（minimax.chat vs minimaxi.com）差异导致连不通
      candidateBaseUrls.push(
        primaryBaseUrl.includes("minimaxi.com")
          ? "https://api.minimax.chat"
          : "https://api.minimaxi.com",
      );
    }

    const payload = {
      model: creds.model || process.env.MINIMAX_TTS_MODEL || "speech-01-turbo",
      text: input.text,
      stream: false,
      voice_setting: {
        voice_id: input.voiceId,
        speed: 1.0,
        vol: 1.0,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: "mp3",
        channel: 1,
      },
    };

    let usedVoiceId = input.voiceId;

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await requestMiniMaxCompletion(creds, candidateBaseUrls, payload, usedVoiceId);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        const errorText = response.body.toString("utf8");
        console.error("MiniMax API Error:", response.statusCode, errorText);
        throw new TtsProviderError(`MiniMax API error: ${errorText}`, response.statusCode || 502);
      }

      const contentType = response.headers["content-type"];
      if (typeof contentType === "string" && contentType.includes("application/json")) {
        let json: unknown;
        try {
          json = JSON.parse(response.body.toString("utf8"));
        } catch (e) {
          const preview = response.body.slice(0, 600).toString("utf8");
          console.error("MiniMax JSON parse failed:", e, { preview });
          throw new TtsProviderError("MiniMax JSON parse failed", 502, preview);
        }

        const jsonRecord = (json ?? {}) as Record<string, unknown>;
        const baseResp = jsonRecord.base_resp as Record<string, unknown> | undefined;
        if (baseResp && Number(baseResp.status_code) !== 0) {
          const code = Number(baseResp.status_code);
          const msg = String(baseResp.status_msg || "");

          if (code === 2054 && attempt === 0) {
            const fallback = pickFallbackVoiceId(usedVoiceId);
            if (fallback !== usedVoiceId) {
              usedVoiceId = fallback;
              continue;
            }
          }

          console.error("MiniMax base_resp error:", {
            status_code: code,
            status_msg: msg,
            voiceId: usedVoiceId,
            textPreview: input.text.slice(0, 200),
          });
          throw new TtsProviderError(
            "MiniMax base_resp error",
            502,
            JSON.stringify({ status_code: code, status_msg: msg, voiceId: usedVoiceId }),
          );
        }

        const audio = await extractMiniMaxAudio(jsonRecord, response.body);
        return { audio, mime: sniffAudioMime(audio).mime ?? "audio/mpeg" };
      }

      // 二进制响应
      return {
        audio: response.body,
        mime: sniffAudioMime(response.body).mime ?? "audio/mpeg",
      };
    }

    throw new TtsProviderError("MiniMax voiceId retry exhausted", 502, usedVoiceId);
  },
};

async function requestMiniMaxCompletion(
  creds: MiniMaxCredentials,
  candidateBaseUrls: string[],
  payload: Record<string, unknown>,
  voiceId: string,
) {
  const body = JSON.stringify({
    ...payload,
    voice_setting: {
      ...((payload.voice_setting as Record<string, unknown> | undefined) ?? {}),
      voice_id: voiceId,
    },
  });

  let response: Awaited<ReturnType<typeof requestBuffer>> | null = null;
  let lastError: unknown = null;

  for (const baseUrl of candidateBaseUrls) {
    const url = `${baseUrl}/v1/t2a_v2?GroupId=${encodeURIComponent(creds.groupId)}`;
    try {
      response = await requestBuffer(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.apiKey}`,
          "Content-Type": "application/json",
          GroupId: creds.groupId,
          "Accept-Encoding": "identity",
        },
        body,
        timeoutMs: TTS_TIMEOUT_MS,
      });
      break;
    } catch (e) {
      lastError = e;
      continue;
    }
  }

  if (!response) {
    const attempted = candidateBaseUrls.join(", ");
    console.error("MiniMax fetch failed. attempted base urls:", attempted, lastError);
    throw new TtsProviderError(
      "MiniMax fetch failed (connect timeout / network). Please set MINIMAX_API_BASE_URL to the correct domain (https://api.minimaxi.com or https://api.minimax.chat).",
      502,
    );
  }

  return response;
}

async function extractMiniMaxAudio(
  json: Record<string, unknown>,
  rawBody: Buffer,
): Promise<Buffer> {
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

  const dataRecord = isRecord(json.data) ? json.data : null;
  const audioRecord = isRecord(json.audio) ? json.audio : null;
  const dataStr: unknown =
    (typeof json.data === "string" ? json.data : undefined) ??
    dataRecord?.audio ??
    dataRecord?.data ??
    audioRecord?.data ??
    json.audio_data;

  const audioUrl: unknown = audioRecord?.url ?? dataRecord?.url ?? json.url;

  if (typeof audioUrl === "string" && audioUrl.startsWith("http")) {
    const audioResp = await requestBuffer(audioUrl, {
      method: "GET",
      headers: { "Accept-Encoding": "identity" },
      timeoutMs: TTS_TIMEOUT_MS,
    });
    if (audioResp.statusCode < 200 || audioResp.statusCode >= 300) {
      throw new TtsProviderError(`MiniMax audio url fetch failed: ${audioResp.statusCode}`);
    }
    return audioResp.body;
  }

  if (typeof dataStr === "string" && dataStr.trim()) {
    const t = dataStr.trim();

    const maybeB64 = t.startsWith("data:") ? t.split(",").slice(1).join(",") : t;
    const looksLikeBase64 = /[+/=]/.test(maybeB64);
    const looksLikeHex = !looksLikeBase64 && /^[0-9a-fA-F]+$/.test(t) && t.length % 2 === 0;

    let buffer: Buffer;
    let altBuffer: Buffer | null = null;

    if (looksLikeHex) {
      buffer = Buffer.from(t, "hex");
      try {
        altBuffer = Buffer.from(maybeB64, "base64");
      } catch {
        altBuffer = null;
      }
    } else {
      buffer = Buffer.from(maybeB64, "base64");
      if (/^[0-9a-fA-F]+$/.test(t) && t.length % 2 === 0) {
        try {
          altBuffer = Buffer.from(t, "hex");
        } catch {
          altBuffer = null;
        }
      }
    }

    const primarySniff = sniffAudioMime(buffer);
    if (!primarySniff.mime && altBuffer) {
      const altSniff = sniffAudioMime(altBuffer);
      if (altSniff.mime) {
        buffer = altBuffer;
      }
    }
    return buffer;
  }

  return rawBody;
}
