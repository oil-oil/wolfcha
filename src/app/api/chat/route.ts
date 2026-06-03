import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasRecentUnfinishedGameSession, requireCredits } from "@/lib/api-auth";
import { ALL_MODELS, PROJECT_MODELS } from "@/types/game";
import { TOKENDANCE_BASE_URL } from "@/lib/api-keys";
import { Agent, setGlobalDispatcher } from "undici";

// 将 undici 底层 TCP 连接超时从默认 10s 调高到 60s
// 避免访问国内 API 网关（如 tokendance）时因建连慢而提前失败
setGlobalDispatcher(new Agent({ connectTimeout: 60_000 }));

const ZENMUX_API_URL = "https://zenmux.ai/api/v1/chat/completions";
const DASHSCOPE_API_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DASHSCOPE_CHAT_COMPLETIONS_URL = `${DASHSCOPE_API_BASE_URL}/chat/completions`;

// API 调用超时时间（毫秒）
const API_TIMEOUT_MS = 60000;

type Provider = "zenmux" | "dashscope" | "tokendance";

function getProviderForModel(model: string): Provider | null {
  const modelRef =
    ALL_MODELS.find((ref) => ref.model === model) ??
    PROJECT_MODELS.find((ref) => ref.model === model);
  return modelRef?.provider ?? null;
}

function getTokendanceUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return "";
  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  return `${withoutTrailingSlash}/chat/completions`;
}

/** Resolve ModelRef for a model id; used to apply per-model temperature/reasoning overrides. */
function getModelRef(model: string): (typeof PROJECT_MODELS)[number] | (typeof ALL_MODELS)[number] | undefined {
  return ALL_MODELS.find((ref) => ref.model === model) ?? PROJECT_MODELS.find((ref) => ref.model === model);
}

function normalizeDashscopeModelName(model: string): string {
  return model.replace(/^qwen\//i, "");
}

// Models that support explicit cache_control parameter
// Per ZenMux docs: only Anthropic Claude and Qwen series support explicit caching
function supportsExplicitCaching(model: string): boolean {
  if (!model) return false;
  const lower = model.toLowerCase();
  return lower.startsWith("anthropic/") || lower.startsWith("qwen/");
}

// Models that support multipart message format (content as array)
function supportsMultipartContent(model: string): boolean {
  if (!model) return false;
  const lower = model.toLowerCase();
  // Known models that support multipart content
  if (lower.startsWith("openai/")) return true;
  if (lower.startsWith("google/")) return true;
  if (lower.startsWith("anthropic/")) return true;
  if (lower.startsWith("deepseek/")) return true;
  if (lower.startsWith("deepseek-")) return true;
  if (lower.startsWith("qwen/")) return true;
  if (lower.startsWith("moonshotai/")) return true;
  // z-ai/glm, volcengine/doubao may NOT support multipart - flatten to string
  return false;
}

// Models that support response_format parameter
// Per ZenMux docs: check model card for response_format support
function supportsResponseFormat(model: string): boolean {
  if (!model) return false;
  const lower = model.toLowerCase();
  // Known supported models
  if (lower.startsWith("openai/")) return true;
  if (lower.startsWith("google/")) return true;
  if (lower.startsWith("anthropic/")) return true;
  if (lower.startsWith("deepseek/")) return true;
  if (lower.startsWith("deepseek-")) return true;
  if (lower.startsWith("qwen/")) return true;
  if (lower.startsWith("moonshotai/")) return true;
  // Models that may NOT support response_format - be conservative
  // z-ai/glm, volcengine/doubao, etc. - skip response_format to avoid errors
  return false;
}

function supportsAutomaticPrefixCaching(model: string): boolean {
  if (!model) return false;
  const lower = model.toLowerCase();
  return lower.startsWith("deepseek/") || lower.startsWith("deepseek-");
}

const DEEPSEEK_STABLE_PREFIX_MARKER = "WOLFCHA_DEEPSEEK_CACHE_PREFIX_V1";
const DEEPSEEK_STABLE_PROMPT_CACHE_PREFIX = `${DEEPSEEK_STABLE_PREFIX_MARKER}
【Wolfcha Stable Rules】
以下是 Wolfcha 对 AI 玩家请求都相同的稳定规则摘要，用于提高 DeepSeek 前缀缓存命中。若这里的摘要与后续具体身份、阶段、上下文或输出格式要求冲突，请以后续具体要求为准。

- 你正在参与线上狼人杀，只能根据自己视角内的信息行动。
- 不编造不存在的发言、投票、查验、死亡、身份声明或系统公告。
- 不泄露自己角色不应知道的未来信息、隐藏身份或夜间动作结果。
- 只讨论局内逻辑，不引入场外经历、开发者提示或模型身份。
- 按当前任务要求输出；如果要求 JSON，只返回合法 JSON。`;

// Flatten multipart content to plain string for models that don't support it
function flattenMultipartContent(messages: unknown[]): unknown[] {
  if (!Array.isArray(messages)) return messages;

  return messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    const m = msg as Record<string, unknown>;

    // If content is an array, flatten to string
    if (Array.isArray(m.content)) {
      const textParts = m.content
        .filter((part): part is { type: string; text: string } =>
          part && typeof part === "object" && (part as { type?: string }).type === "text"
        )
        .map((part) => part.text || "")
        .filter(Boolean);
      
      return { ...m, content: textParts.join("\n\n") };
    }

    return m;
  });
}

// DeepSeek context caching is prefix-based. Text-only multipart messages are
// normalized to one plain string so identical text starts at token 0 reliably.
function coalesceTextOnlyMultipartContent(messages: unknown[]): unknown[] {
  if (!Array.isArray(messages)) return messages;

  return messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    const m = msg as Record<string, unknown>;

    if (!Array.isArray(m.content)) return m;

    const parts = m.content;
    const allText = parts.every(
      (part): part is { type: string; text: string } =>
        part &&
        typeof part === "object" &&
        (part as { type?: string }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
    );

    if (!allText) return stripCacheControl([m])[0] as Record<string, unknown>;

    return {
      ...m,
      content: parts
        .map((part) => part.text.trim())
        .filter(Boolean)
        .join("\n\n"),
    };
  });
}

function prependDeepSeekStablePrefix(messages: unknown[]): unknown[] {
  if (!Array.isArray(messages)) return messages;
  let prepended = false;
  const next = messages.map((msg) => {
    if (prepended || !msg || typeof msg !== "object") return msg;
    const m = msg as Record<string, unknown>;
    if (m.role !== "system" || typeof m.content !== "string") return m;
    prepended = true;
    if (m.content.includes(DEEPSEEK_STABLE_PREFIX_MARKER)) return m;
    return {
      ...m,
      content: `${DEEPSEEK_STABLE_PROMPT_CACHE_PREFIX}\n\n${m.content}`,
    };
  });

  if (prepended) return next;
  return [
    { role: "system", content: DEEPSEEK_STABLE_PROMPT_CACHE_PREFIX },
    ...next,
  ];
}

function hasJsonHintInMessages(messages: unknown[]): boolean {
  if (!Array.isArray(messages)) return false;

  const contains = (value: unknown): boolean => {
    if (typeof value === "string") return /json/i.test(value);
    if (Array.isArray(value)) return value.some(contains);
    if (!value || typeof value !== "object") return false;
    const obj = value as Record<string, unknown>;
    if ("text" in obj && typeof obj.text === "string") return /json/i.test(obj.text);
    if ("content" in obj) return contains(obj.content);
    return false;
  };

  return messages.some((m) => contains(m));
}

function withDashscopeJsonHint(messages: unknown[]): unknown[] {
  if (!Array.isArray(messages)) return messages;
  if (hasJsonHintInMessages(messages)) return messages;
  return [{ role: "system", content: "Respond in json." }, ...messages];
}

// Strip cache_control from message content parts for models that don't support it
function stripCacheControl(messages: unknown[]): unknown[] {
  if (!Array.isArray(messages)) return messages;

  return messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    const m = msg as Record<string, unknown>;

    // If content is an array (multipart), strip cache_control from each part
    if (Array.isArray(m.content)) {
      const strippedContent = m.content.map((part) => {
        if (part && typeof part === "object" && "cache_control" in part) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { cache_control, ...rest } = part as Record<string, unknown>;
          return rest;
        }
        return part;
      });
      return { ...m, content: strippedContent };
    }

    return m;
  });
}

// ZenMux reasoning: only enabled, effort, max_tokens (see docs.zenmux.ai/guide/advanced/reasoning.html)
type ReasoningPayload = {
  enabled: boolean;
  effort?: "minimal" | "low" | "medium" | "high";
  max_tokens?: number;
};

type ReasoningEffort = NonNullable<ReasoningPayload["effort"]>;
const ALLOWED_REASONING_EFFORT = new Set<ReasoningEffort>(["minimal", "low", "medium", "high"]);

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && ALLOWED_REASONING_EFFORT.has(value as ReasoningEffort);
}

/** Build ZenMux request reasoning object (no unsupported fields like exclude). */
function toZenMuxReasoning(
  r: { enabled?: boolean; effort?: string; max_tokens?: number } | undefined
): { enabled: boolean; effort?: string; max_tokens?: number } {
  if (r?.enabled === true) {
    return {
      enabled: true,
      ...(r.effort != null && { effort: r.effort }),
      ...(typeof r.max_tokens === "number" && Number.isFinite(r.max_tokens) && { max_tokens: r.max_tokens }),
    };
  }
  return { enabled: false };
}

function toTokendanceThinking(
  r: { enabled?: boolean; effort?: string; max_tokens?: number } | undefined
): Record<string, unknown> | undefined {
  if (r === undefined) return undefined;
  if (r.enabled !== true) return { type: "disabled" };

  const effortBudget: Record<string, number> = {
    minimal: 64,
    low: 128,
    medium: 256,
    high: 512,
  };
  const budget =
    typeof r.max_tokens === "number" && Number.isFinite(r.max_tokens)
      ? Math.max(32, Math.floor(r.max_tokens))
      : r.effort
        ? effortBudget[r.effort]
        : undefined;

  return {
    type: "enabled",
    ...(budget ? { budget_tokens: budget } : {}),
  };
}

type ChatRequestPayload = {
  model: string;
  messages: unknown[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  reasoning?: ReasoningPayload;
  reasoning_effort?: "minimal" | "low" | "medium" | "high";
  response_format?: unknown;
  provider?: Provider;
};

async function runBatchItem(
  payload: ChatRequestPayload,
  headerApiKey: string | null,
  headerDashscopeKey: string | null,
  headerTokendanceKey: string | null,
  headerTokendanceBaseUrl: string | null
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; error: string; details?: unknown }> {
  const {
    model,
    messages,
    temperature,
    max_tokens,
    stream,
    reasoning,
    reasoning_effort,
    response_format,
    provider,
  } = payload;

  if (stream) {
    return { ok: false, status: 400, error: "Batch request does not support stream=true" };
  }

  const modelProvider: Provider | null =
    provider === "dashscope" || provider === "zenmux" || provider === "tokendance" ? provider : getProviderForModel(model);
  if (!modelProvider) {
    return { ok: false, status: 400, error: `Unknown model: ${String(model ?? "").trim() || "unknown"}` };
  }

  const isDefaultModel = PROJECT_MODELS.some((ref) => ref.model === model);
  if (!isDefaultModel) {
    if (modelProvider === "zenmux" && !headerApiKey) {
      return { ok: false, status: 401, error: "此模型需要您提供 Zenmux API Key" };
    }
    if (modelProvider === "dashscope" && !headerDashscopeKey) {
      return { ok: false, status: 401, error: "此模型需要您提供百炼 API Key" };
    }
    if (modelProvider === "tokendance" && !headerTokendanceKey) {
      return { ok: false, status: 401, error: "此模型需要您提供 TokenDance Key" };
    }
  }

  const hasAnyCustomKeyHeader = Boolean((headerApiKey ?? "").trim() || (headerDashscopeKey ?? "").trim() || (headerTokendanceKey ?? "").trim());

  const modelRefOverride = getModelRef(model);
  const normalizedTemperature =
    modelRefOverride?.temperature !== undefined
      ? modelRefOverride.temperature
      : (typeof temperature === "number" && Number.isFinite(temperature) ? temperature : 0.7);
  const cappedTemperature = (() => {
    const lower = typeof model === "string" ? model.toLowerCase() : "";
    const needZeroOne =
      modelProvider === "zenmux" ||
      lower.startsWith("moonshotai/") ||
      lower.includes("kimi");
    if (needZeroOne) {
      return Math.min(Math.max(0, normalizedTemperature), 1);
    }
    return Math.max(0, normalizedTemperature);
  })();
  const effectiveReasoning = modelRefOverride?.reasoning !== undefined ? modelRefOverride.reasoning : reasoning;

  let processedMessages: unknown[] = messages;
  if (!supportsMultipartContent(model)) {
    processedMessages = flattenMultipartContent(processedMessages);
  } else if (supportsAutomaticPrefixCaching(model)) {
    processedMessages = prependDeepSeekStablePrefix(coalesceTextOnlyMultipartContent(processedMessages));
  } else if (modelProvider === "dashscope") {
    processedMessages = stripCacheControl(processedMessages);
  } else if (!supportsExplicitCaching(model)) {
    processedMessages = stripCacheControl(processedMessages);
  }

  if (modelProvider === "dashscope") {
    if (hasAnyCustomKeyHeader && !headerDashscopeKey) {
      return { ok: false, status: 401, error: "已启用自定义 Key，但未提供百炼 API Key（已拒绝回退到系统 Key）" };
    }
    const dashscopeApiKey = headerDashscopeKey || process.env.DASHSCOPE_API_KEY;
    if (!dashscopeApiKey) {
      return { ok: false, status: 500, error: "DASHSCOPE_API_KEY not configured on server" };
    }

    const normalizedModel = normalizeDashscopeModelName(model);
    const normalizedResponseFormat = response_format as { type?: unknown } | undefined;
    const dashscopeMessages =
      normalizedResponseFormat?.type === "json_object"
        ? withDashscopeJsonHint(processedMessages)
        : processedMessages;

    const requestBody: Record<string, unknown> = {
      model: normalizedModel,
      messages: dashscopeMessages,
      temperature: cappedTemperature,
    };

    if (typeof max_tokens === "number" && Number.isFinite(max_tokens)) {
      requestBody.max_tokens = Math.max(16, Math.floor(max_tokens));
    }

    if (response_format) {
      requestBody.response_format = response_format;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(DASHSCOPE_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dashscopeApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      let parsed: unknown = undefined;
      try {
        parsed = JSON.parse(errorText);
      } catch {
        // ignore
      }
      return {
        ok: false,
        status: response.status,
        error: `DashScope API error: ${response.status}`,
        details: parsed ?? errorText,
      };
    }

    const result = await response.json();
    return { ok: true, data: result };
  }

  if (modelProvider === "tokendance") {
    if (hasAnyCustomKeyHeader && !headerTokendanceKey) {
      return { ok: false, status: 401, error: "已启用自定义 Key，但未提供 TokenDance Key（已拒绝回退到系统 Key）" };
    }
    const tokendanceApiKey = headerTokendanceKey || process.env.TOKENDANCE_API_KEY;
    const tokendanceBaseUrl = headerTokendanceBaseUrl || process.env.TOKENDANCE_BASE_URL || TOKENDANCE_BASE_URL;
    if (!tokendanceApiKey || !tokendanceBaseUrl) {
      return { ok: false, status: 500, error: "TOKENDANCE_API_KEY or TOKENDANCE_BASE_URL not configured on server" };
    }

    const tokendanceUrl = getTokendanceUrl(tokendanceBaseUrl);
    if (!tokendanceUrl) {
      return { ok: false, status: 500, error: "Invalid TokenDance Base URL" };
    }

    const requestBody: Record<string, unknown> = {
      model,
      messages: processedMessages,
      temperature: cappedTemperature,
    };

    if (typeof max_tokens === "number" && Number.isFinite(max_tokens)) {
      requestBody.max_tokens = Math.max(16, Math.floor(max_tokens));
    }

    // GLM-4.7 / Kimi K2.5 默认开启思考，API 参数可关闭（已实测有效）
    const modelLower = model.toLowerCase();
    const thinking = toTokendanceThinking(effectiveReasoning);
    if (thinking) {
      requestBody.thinking = thinking;
    } else if (modelLower.includes("glm") || modelLower.includes("kimi")) {
      requestBody.thinking = { type: "disabled" };
    }

    if (response_format && supportsResponseFormat(model)) {
      requestBody.response_format = response_format;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(tokendanceUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokendanceApiKey}`,
          "Content-Type": "application/json",
          "X-App-Name": "Wolfcha",
          "X-Site-URL": "https://wolf-cha.com",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      let parsed: unknown = undefined;
      try {
        parsed = JSON.parse(errorText);
      } catch {
        // ignore
      }
      return {
        ok: false,
        status: response.status,
        error: `TokenDance error: ${response.status}`,
        details: parsed ?? errorText,
      };
    }

    const result = await response.json();
    return { ok: true, data: result };
  }

  if (hasAnyCustomKeyHeader && !headerApiKey) {
    return { ok: false, status: 401, error: "已启用自定义 Key，但未提供 Zenmux API Key（已拒绝回退到系统 Key）" };
  }

  const apiKey = headerApiKey || process.env.ZENMUX_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 500, error: "ZENMUX_API_KEY not configured on server" };
  }

  const requestBody: Record<string, unknown> = {
    model,
    messages: processedMessages,
    temperature: cappedTemperature,
  };

  if (typeof max_tokens === "number" && Number.isFinite(max_tokens)) {
    requestBody.max_tokens = Math.max(16, Math.floor(max_tokens));
  }

  const reasoningEffort = isReasoningEffort(reasoning_effort) ? reasoning_effort : undefined;
  const reasoningToUse = effectiveReasoning ?? reasoning;
  if (reasoningToUse !== undefined) {
    requestBody.reasoning = toZenMuxReasoning(reasoningToUse);
  } else if (reasoningEffort) {
    requestBody.reasoning_effort = reasoningEffort;
  } else {
    requestBody.reasoning = { enabled: false };
  }

  if (response_format && supportsResponseFormat(model)) {
    requestBody.response_format = response_format;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ZENMUX_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    return {
      ok: false,
      status: response.status,
      error: `ZenMux API error: ${response.status} - ${errorText}`,
    };
  }

  const result = await response.json();
  return { ok: true, data: result };
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request as unknown as Request);
  if ("error" in auth) return auth.error;

  const earlyZenmuxKey = request.headers.get("x-zenmux-api-key")?.trim();
  const earlyDashscopeKey = request.headers.get("x-dashscope-api-key")?.trim();
  const earlyTokendanceKey = request.headers.get("x-tokendance-api-key")?.trim();
  const hasCustomKeys = Boolean(
    (earlyZenmuxKey ?? "") ||
    (earlyDashscopeKey ?? "") ||
    (earlyTokendanceKey ?? "")
  );

  if (!hasCustomKeys) {
    const hasCredits = await requireCredits(auth.user.id);
    if (!hasCredits) {
      const hasRecentSession = await hasRecentUnfinishedGameSession(auth.user.id);
      if (!hasRecentSession) {
        return NextResponse.json({ error: "Insufficient credits" }, { status: 403 });
      }
      console.warn("[api-chat] allowed by recent unfinished game session", {
        userId: auth.user.id,
      });
    }
  }

  try {
    const body = await request.json();
    if (Array.isArray(body?.requests)) {
      const headerApiKey = request.headers.get("x-zenmux-api-key")?.trim() || null;
      const headerDashscopeKey = request.headers.get("x-dashscope-api-key")?.trim() || null;
      const headerTokendanceKey = request.headers.get("x-tokendance-api-key")?.trim() || null;
      const headerTokendanceBaseUrl = request.headers.get("x-tokendance-base-url")?.trim() || null;
      const requests = body.requests as ChatRequestPayload[];
      const results = await Promise.all(
        requests.map((req) => runBatchItem(req, headerApiKey, headerDashscopeKey, headerTokendanceKey, headerTokendanceBaseUrl))
      );
      return NextResponse.json({ results });
    }
    const {
      model,
      messages,
      temperature,
      max_tokens,
      stream,
      reasoning,
      reasoning_effort,
      response_format,
      provider,
    } = body;
    const modelProvider: Provider | null =
      provider === "dashscope" || provider === "zenmux" || provider === "tokendance" ? provider : getProviderForModel(model);
    if (!modelProvider) {
      // Reject unknown models early to avoid mis-routing.
      return NextResponse.json(
        { error: `Unknown model: ${String(model ?? "").trim() || "unknown"}` },
        { status: 400 }
      );
    }
    const headerApiKey = request.headers.get("x-zenmux-api-key")?.trim();
    const headerDashscopeKey = request.headers.get("x-dashscope-api-key")?.trim();
    const headerTokendanceKey = request.headers.get("x-tokendance-api-key")?.trim();
    const headerTokendanceBaseUrl = request.headers.get("x-tokendance-base-url")?.trim();
    const hasAnyCustomKeyHeader = Boolean((headerApiKey ?? "").trim() || (headerDashscopeKey ?? "").trim() || (headerTokendanceKey ?? "").trim());
    const isDefaultModel = PROJECT_MODELS.some((ref) => ref.model === model);

    const modelRefOverride = getModelRef(model);
    const normalizedTemperature =
      modelRefOverride?.temperature !== undefined
        ? modelRefOverride.temperature
        : (typeof temperature === "number" && Number.isFinite(temperature) ? temperature : 0.7);
    // ZenMux requires temperature in 0..1; Moonshot/Kimi also
    const cappedTemperature = (() => {
      const lower = typeof model === "string" ? model.toLowerCase() : "";
      const needZeroOne =
        modelProvider === "zenmux" ||
        lower.startsWith("moonshotai/") ||
        lower.includes("kimi");
      if (needZeroOne) {
        return Math.min(Math.max(0, normalizedTemperature), 1);
      }
      return Math.max(0, normalizedTemperature);
    })();
    const effectiveReasoning = modelRefOverride?.reasoning !== undefined ? modelRefOverride.reasoning : reasoning;

    // Process messages based on model capabilities
    let processedMessages = messages;

    // For models that don't support multipart content, flatten to string
    if (!supportsMultipartContent(model)) {
      processedMessages = flattenMultipartContent(processedMessages);
    } else if (supportsAutomaticPrefixCaching(model)) {
      processedMessages = prependDeepSeekStablePrefix(coalesceTextOnlyMultipartContent(processedMessages));
    } else if (modelProvider === "dashscope") {
      // Dashscope is OpenAI compatible but does not support cache_control
      processedMessages = stripCacheControl(processedMessages);
    } else if (!supportsExplicitCaching(model)) {
      // For models that support multipart but not cache_control, strip cache_control
      processedMessages = stripCacheControl(processedMessages);
    }

    if (!isDefaultModel) {
      if (modelProvider === "zenmux" && !headerApiKey) {
        return NextResponse.json(
          { error: "此模型需要您提供 Zenmux API Key" },
          { status: 401 }
        );
      }
      if (modelProvider === "dashscope" && !headerDashscopeKey) {
        return NextResponse.json(
          { error: "此模型需要您提供百炼 API Key" },
          { status: 401 }
        );
      }
      if (modelProvider === "tokendance" && !headerTokendanceKey) {
        return NextResponse.json(
          { error: "此模型需要您提供 TokenDance Key" },
          { status: 401 }
        );
      }
    }

    if (modelProvider === "dashscope") {
      if (hasAnyCustomKeyHeader && !headerDashscopeKey) {
        return NextResponse.json(
          { error: "已启用自定义 Key，但未提供百炼 API Key（已拒绝回退到系统 Key）" },
          { status: 401 }
        );
      }

      const dashscopeApiKey = headerDashscopeKey || process.env.DASHSCOPE_API_KEY;
      if (!dashscopeApiKey) {
        return NextResponse.json(
          { error: "DASHSCOPE_API_KEY not configured on server" },
          { status: 500 }
        );
      }

      const dashscopeApiUrl = DASHSCOPE_CHAT_COMPLETIONS_URL;

      const normalizedModel = normalizeDashscopeModelName(model);
      const normalizedResponseFormat = response_format as { type?: unknown } | undefined;
      const dashscopeMessages =
        normalizedResponseFormat?.type === "json_object"
          ? withDashscopeJsonHint(processedMessages)
          : processedMessages;
      const requestBody: Record<string, unknown> = {
        model: normalizedModel,
        messages: dashscopeMessages,
        temperature: cappedTemperature,
      };

      if (typeof max_tokens === "number" && Number.isFinite(max_tokens)) {
        requestBody.max_tokens = Math.max(16, Math.floor(max_tokens));
      }

      if (stream) {
        requestBody.stream = true;
      }

      if (response_format) {
        requestBody.response_format = response_format;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(dashscopeApiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${dashscopeApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorText = await response.text();
        let parsed: unknown = undefined;
        try {
          parsed = JSON.parse(errorText);
        } catch {
          // ignore
        }
        return NextResponse.json(
          {
            error: `DashScope API error: ${response.status}`,
            details: parsed ?? errorText,
          },
          { status: response.status }
        );
      }

      if (stream) {
        // For streaming responses, forward the stream
        const headers = new Headers();
        headers.set("Content-Type", "text/event-stream");
        headers.set("Cache-Control", "no-cache");
        headers.set("Connection", "keep-alive");

        return new Response(response.body, { headers });
      }

      const result = await response.json();
      return NextResponse.json(result);
    }

    if (modelProvider === "tokendance") {
      if (hasAnyCustomKeyHeader && !headerTokendanceKey) {
        return NextResponse.json(
          { error: "已启用自定义 Key，但未提供 TokenDance Key（已拒绝回退到系统 Key）" },
          { status: 401 }
        );
      }

      const tokendanceApiKey = headerTokendanceKey || process.env.TOKENDANCE_API_KEY;
      const tokendanceBaseUrl = headerTokendanceBaseUrl || process.env.TOKENDANCE_BASE_URL || TOKENDANCE_BASE_URL;
      if (!tokendanceApiKey || !tokendanceBaseUrl) {
        return NextResponse.json(
          { error: "TOKENDANCE_API_KEY or TOKENDANCE_BASE_URL not configured on server" },
          { status: 500 }
        );
      }

      const tokendanceUrl = getTokendanceUrl(tokendanceBaseUrl);
      if (!tokendanceUrl) {
        return NextResponse.json(
          { error: "Invalid TokenDance Base URL" },
          { status: 500 }
        );
      }

      const requestBody: Record<string, unknown> = {
        model,
        messages: processedMessages,
        temperature: cappedTemperature,
      };

      if (typeof max_tokens === "number" && Number.isFinite(max_tokens)) {
        requestBody.max_tokens = Math.max(16, Math.floor(max_tokens));
      }

      if (stream) {
        requestBody.stream = true;
      }

      // GLM-4.7 / Kimi K2.5 默认开启思考，API 参数可关闭（已实测有效）
      const modelLower = model.toLowerCase();
      const thinking = toTokendanceThinking(effectiveReasoning);
      if (thinking) {
        requestBody.thinking = thinking;
      } else if (modelLower.includes("glm") || modelLower.includes("kimi")) {
        requestBody.thinking = { type: "disabled" };
      }

      if (response_format && supportsResponseFormat(model)) {
        requestBody.response_format = response_format;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(tokendanceUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokendanceApiKey}`,
            "Content-Type": "application/json",
            "X-App-Name": "Wolfcha",
            "X-Site-URL": "https://wolf-cha.com",
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorText = await response.text();
        let parsed: unknown = undefined;
        try {
          parsed = JSON.parse(errorText);
        } catch {
          // ignore
        }
        return NextResponse.json(
          {
            error: `TokenDance error: ${response.status}`,
            details: parsed ?? errorText,
          },
          { status: response.status }
        );
      }

      if (stream) {
        const headers = new Headers();
        headers.set("Content-Type", "text/event-stream");
        headers.set("Cache-Control", "no-cache");
        headers.set("Connection", "keep-alive");

        return new Response(response.body, { headers });
      }

      const result = await response.json();
      return NextResponse.json(result);
    }

    if (hasAnyCustomKeyHeader && !headerApiKey) {
      return NextResponse.json(
        { error: "已启用自定义 Key，但未提供 Zenmux API Key（已拒绝回退到系统 Key）" },
        { status: 401 }
      );
    }

    const apiKey = headerApiKey || process.env.ZENMUX_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ZENMUX_API_KEY not configured on server" },
        { status: 500 }
      );
    }

    const requestBody: Record<string, unknown> = {
      model,
      messages: processedMessages,
      temperature: cappedTemperature,
    };

    if (typeof max_tokens === "number" && Number.isFinite(max_tokens)) {
      requestBody.max_tokens = Math.max(16, Math.floor(max_tokens));
    }

    if (stream) {
      requestBody.stream = true;
    }

    const reasoningEffort = isReasoningEffort(reasoning_effort) ? reasoning_effort : undefined;
    const reasoningToUse = effectiveReasoning ?? reasoning;
    if (reasoningToUse !== undefined) {
      requestBody.reasoning = toZenMuxReasoning(reasoningToUse);
    } else if (reasoningEffort) {
      requestBody.reasoning_effort = reasoningEffort;
    } else {
      requestBody.reasoning = { enabled: false };
    }

    // Only include response_format for models that support it
    if (response_format && supportsResponseFormat(model)) {
      requestBody.response_format = response_format;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(ZENMUX_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `ZenMux API error: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    if (stream) {
      // For streaming responses, forward the stream
      const headers = new Headers();
      headers.set("Content-Type", "text/event-stream");
      headers.set("Cache-Control", "no-cache");
      headers.set("Connection", "keep-alive");

      return new Response(response.body, { headers });
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/chat] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
