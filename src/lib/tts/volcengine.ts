import { randomUUID } from "node:crypto";
import { requestBuffer } from "./audio-util";
import {
  type TtsAdapter,
  type TtsAudioResult,
  type TtsSynthesizeInput,
  TtsProviderError,
} from "./types";

const TTS_TIMEOUT_MS = 30_000;
const CLUSTER = "volcano_tts";
const ENDPOINT = "https://openspeech.bytedance.com/api/v1/tts";
const SUCCESS_CODE = 3000;

/**
 * 火山引擎（豆包）语音合成。私有 JSON 协议：
 * appid + access token 鉴权，响应为 JSON 内嵌 base64 音频。
 */
export const volcengineAdapter: TtsAdapter = {
  id: "volcengine",
  defaultVoiceId() {
    // 通用女声；具体音色 ID 需在火山引擎控制台开通后使用
    return "zh_female_cancan_mars_bigtts";
  },

  async synthesize(input: TtsSynthesizeInput, credentials): Promise<TtsAudioResult> {
    const appId = credentials.appId?.trim();
    const accessToken = credentials.accessToken?.trim();
    if (!appId || !accessToken) {
      throw new TtsProviderError("火山引擎 TTS 需要 App ID 和 Access Token", 400);
    }

    const voice = input.voiceId.trim() || this.defaultVoiceId(input.locale);
    const body = JSON.stringify({
      app: { appid: appId, token: accessToken, cluster: CLUSTER },
      user: { uid: "wolfcha" },
      audio: {
        voice_type: voice,
        encoding: "mp3",
        speed_ratio: 1.0,
      },
      request: {
        reqid: randomUUID(),
        text: input.text,
        text_type: "plain",
        operation: "query",
      },
    });

    const response = await requestBuffer(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer;${accessToken}`,
        "Content-Type": "application/json",
      },
      body,
      timeoutMs: TTS_TIMEOUT_MS,
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new TtsProviderError(
        `火山引擎 TTS 请求失败（HTTP ${response.statusCode}）`,
        response.statusCode,
        response.body.slice(0, 300).toString("utf8"),
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(response.body.toString("utf8"));
    } catch {
      throw new TtsProviderError("火山引擎 TTS 返回了无法解析的响应", 502);
    }

    const record = (json ?? {}) as Record<string, unknown>;
    const code = Number(record.code);
    if (code !== SUCCESS_CODE) {
      throw new TtsProviderError(
        `火山引擎 TTS 错误（code ${code}）`,
        502,
        String(record.message ?? ""),
      );
    }

    const data = typeof record.data === "string" ? record.data : "";
    if (!data) {
      throw new TtsProviderError("火山引擎 TTS 未返回音频数据", 502);
    }

    const maybeB64 = data.startsWith("data:") ? data.split(",").slice(1).join(",") : data;
    return { audio: Buffer.from(maybeB64, "base64"), mime: "audio/mpeg" };
  },
};
