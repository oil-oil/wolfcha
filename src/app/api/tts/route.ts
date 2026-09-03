import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasAuthorizedActiveGameSession } from "@/lib/api-auth";
import {
  GAME_SESSION_EXPIRED_CODE,
  GAME_SESSION_EXPIRED_MESSAGE,
} from "@/lib/game-session-policy";
import { bufferToArrayBuffer, sniffAudioMime } from "@/lib/tts/audio-util";
import { getTtsAdapter, isTtsProviderId } from "@/lib/tts/registry";
import type { TtsCredentials, TtsProviderId } from "@/lib/tts/types";
import { TtsProviderError } from "@/lib/tts/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROBE_TEXT = "你好，欢迎来到狼人杀。";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface ResolvedTtsRequest {
  provider: TtsProviderId;
  credentials: TtsCredentials;
  /** 是否使用玩家自带的 TTS 配置（为 false 时走服务端环境变量，需要校验对局授权） */
  hasCustomCredentials: boolean;
}

function resolveTtsRequest(req: NextRequest): ResolvedTtsRequest | { error: NextResponse } {
  const providerHeader = req.headers.get("x-tts-provider")?.trim() ?? "";

  // 新协议：显式指定 provider，凭据从 x-tts-* 头读取
  if (providerHeader) {
    if (!isTtsProviderId(providerHeader)) {
      return {
        error: NextResponse.json({ error: `Unknown TTS provider: ${providerHeader}` }, { status: 400 }),
      };
    }
    const credentials: TtsCredentials = {
      apiKey: req.headers.get("x-tts-api-key")?.trim() || undefined,
      baseUrl: req.headers.get("x-tts-base-url")?.trim() || undefined,
      model: req.headers.get("x-tts-model")?.trim() || undefined,
      appId: req.headers.get("x-tts-app-id")?.trim() || undefined,
      accessToken: req.headers.get("x-tts-access-token")?.trim() || undefined,
    };
    return {
      provider: providerHeader,
      credentials,
      hasCustomCredentials: true,
    };
  }

  // 旧协议：MiniMax 自带 key
  const headerApiKey = req.headers.get("x-minimax-api-key")?.trim();
  const headerGroupId = req.headers.get("x-minimax-group-id")?.trim();
  if (headerApiKey || headerGroupId) {
    if (!headerApiKey || !headerGroupId) {
      return {
        error: NextResponse.json(
          { error: "MiniMax API key and group ID are both required" },
          { status: 400 },
        ),
      };
    }
    return {
      provider: "minimax",
      credentials: { apiKey: headerApiKey, groupId: headerGroupId },
      hasCustomCredentials: true,
    };
  }

  // 项目模式：服务端环境变量（仅 MiniMax 有 env 兜底）
  const envApiKey = process.env.MINIMAX_API_KEY;
  const envGroupId = process.env.MINIMAX_GROUP_ID;
  if (!envApiKey || !envGroupId) {
    return {
      error: NextResponse.json({ error: "Server configuration error" }, { status: 500 }),
    };
  }
  return {
    provider: "minimax",
    credentials: { apiKey: envApiKey, groupId: envGroupId },
    hasCustomCredentials: false,
  };
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req as unknown as Request);
  if ("error" in auth) return auth.error;

  const resolved = resolveTtsRequest(req);
  if ("error" in resolved) return resolved.error;
  const { provider, credentials, hasCustomCredentials } = resolved;

  if (!hasCustomCredentials) {
    const sessionId = req.headers.get("x-game-session-id")?.trim() || null;
    const hasAuthorizedSession = await hasAuthorizedActiveGameSession(auth.user.id, sessionId);
    if (!hasAuthorizedSession) {
      return NextResponse.json(
        {
          error: GAME_SESSION_EXPIRED_MESSAGE,
          code: GAME_SESSION_EXPIRED_CODE,
        },
        { status: 409 },
      );
    }
  }

  try {
    const parsed: unknown = await req.json().catch(() => ({}));
    const parsedRecord = isRecord(parsed) ? parsed : {};
    const text = typeof parsedRecord.text === "string" ? parsedRecord.text : String(parsedRecord.text ?? "");
    const voiceId = typeof parsedRecord.voiceId === "string" ? parsedRecord.voiceId : String(parsedRecord.voiceId ?? "");
    const probe = parsedRecord.probe === true;
    const locale = parsedRecord.locale === "en" ? "en" : "zh";

    if (probe) {
      return await handleProbe(provider, credentials, locale);
    }

    const normText = text.trim();
    const normVoiceId = voiceId.trim();

    if (!normText || !normVoiceId) {
      return NextResponse.json({ error: "Missing text or voiceId" }, { status: 400 });
    }

    const adapter = getTtsAdapter(provider);
    const { audio } = await adapter.synthesize(
      { text: normText, voiceId: normVoiceId, locale },
      credentials,
    );

    const sniff = sniffAudioMime(audio);
    if (!sniff.mime) {
      const preview = audio.slice(0, 400).toString("utf8");
      return NextResponse.json(
        {
          error: "TTS audio is not in a supported format.",
          reason: sniff.reason,
          byteLength: audio.length,
          preview,
        },
        { status: 502 },
      );
    }

    return new NextResponse(bufferToArrayBuffer(audio), {
      headers: {
        "Content-Type": sniff.mime,
        "Content-Length": audio.length.toString(),
        "X-TTS-Provider": provider,
        "X-TTS-Voice-Requested": normVoiceId,
      },
    });
  } catch (error) {
    if (error instanceof TtsProviderError) {
      console.error(`TTS API Error (${provider}):`, error.message, error.detail ?? "");
      return NextResponse.json(
        { error: error.message, detail: error.detail, provider },
        { status: error.status === 400 ? 400 : error.status },
      );
    }
    console.error("TTS API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** 连通性测试：用各 Provider 的默认音色合成一句话，返回结果元信息（丢弃音频）。 */
async function handleProbe(
  provider: TtsProviderId,
  credentials: TtsCredentials,
  locale: "zh" | "en",
) {
  const adapter = getTtsAdapter(provider);
  try {
    const { audio } = await adapter.synthesize(
      { text: PROBE_TEXT, voiceId: adapter.defaultVoiceId(locale), locale },
      credentials,
    );
    const sniff = sniffAudioMime(audio);
    if (!sniff.mime) {
      return NextResponse.json(
        { ok: false, error: "TTS 返回了无法识别的音频格式", provider },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      provider,
      mimeType: sniff.mime,
      bytes: audio.length,
    });
  } catch (error) {
    if (error instanceof TtsProviderError) {
      return NextResponse.json(
        { ok: false, error: error.message, detail: error.detail, provider },
        { status: 200 },
      );
    }
    return NextResponse.json(
      { ok: false, error: `连接失败: ${String(error)}`, provider },
      { status: 200 },
    );
  }
}
