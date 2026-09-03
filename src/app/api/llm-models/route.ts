import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { joinProviderUrl, normalizeBaseUrl } from "@/lib/custom-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 15_000;
const FALLBACK_PROBE_MODEL = "gpt-4o-mini";
const MAX_MODELS = 500;

interface ProbeSuccess {
  ok: true;
  models: string[];
  fellBackToChatProbe: boolean;
}

interface ProbeFailure {
  ok: false;
  error: string;
}

/**
 * 自定义 OpenAI 兼容 Provider 的连通性测试与模型列表代理。
 *
 * 浏览器直连各厂商 API 会被 CORS 拦截，统一走本路由：
 * 优先 GET {base}/models（零 token 消耗）；网关未实现 /models 时
 * 退回一条 max_tokens=1 的最小对话请求。
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req as unknown as Request);
  if ("error" in auth) return auth.error;

  const baseUrl = normalizeBaseUrl(req.headers.get("x-custom-base-url")?.trim() ?? "");
  const apiKey = req.headers.get("x-custom-api-key")?.trim() ?? "";
  const probeModel = req.headers.get("x-custom-model")?.trim() ?? "";

  if (!baseUrl || !apiKey) {
    return NextResponse.json({ ok: false, error: "Missing X-Custom-Base-Url or X-Custom-Api-Key" }, { status: 400 });
  }

  const modelsUrl = joinProviderUrl(baseUrl, "models");
  if (!modelsUrl) {
    return NextResponse.json({ ok: false, error: "Invalid Base URL" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const response = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timeoutId));

    if (response.ok) {
      const data: unknown = await response.json().catch(() => null);
      return NextResponse.json({
        ok: true,
        models: extractModelIds(data),
        fellBackToChatProbe: false,
      } satisfies ProbeSuccess);
    }

    // 401/403 说明 key 无效，直接判定失败；其余状态可能是网关没实现 /models
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({
        ok: false,
        error: `API Key 验证失败（HTTP ${response.status}）`,
      } satisfies ProbeFailure);
    }
    console.warn("[llm-models] /models probe failed, falling back to chat probe", {
      status: response.status,
      baseUrlHost: safeHost(baseUrl),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: `连接失败: ${describeError(error)}`,
    } satisfies ProbeFailure);
  }

  const chatUrl = joinProviderUrl(baseUrl, "chat/completions");
  if (!chatUrl) {
    return NextResponse.json({ ok: false, error: "Invalid Base URL" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const response = await fetch(chatUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: probeModel || FALLBACK_PROBE_MODEL,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (response.ok) {
      return NextResponse.json({
        ok: true,
        models: probeModel ? [probeModel] : [],
        fellBackToChatProbe: true,
      } satisfies ProbeSuccess);
    }

    const text = await response.text().catch(() => "");
    return NextResponse.json({
      ok: false,
      error: `验证失败（HTTP ${response.status}）: ${text.slice(0, 300)}`,
    } satisfies ProbeFailure);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: `连接失败: ${describeError(error)}`,
    } satisfies ProbeFailure);
  }
}

function extractModelIds(data: unknown): string[] {
  if (typeof data !== "object" || data === null) return [];
  const list = (data as { data?: unknown }).data;
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item !== null && typeof (item as { id?: unknown }).id === "string") {
        return (item as { id: string }).id;
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, MAX_MODELS);
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return `请求超时（${PROBE_TIMEOUT_MS / 1000}s）`;
  }
  return error instanceof Error ? error.message : String(error);
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}
