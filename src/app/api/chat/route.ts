import { NextRequest, NextResponse } from "next/server";
import { ALL_MODELS, AVAILABLE_MODELS } from "@/types/game";

const ZENMUX_API_URL = "https://zenmux.ai/api/v1/chat/completions";
const DASHSCOPE_API_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DASHSCOPE_CHAT_COMPLETIONS_URL = `${DASHSCOPE_API_BASE_URL}/chat/completions`;

type Provider = "zenmux" | "dashscope";

function getProviderForModel(model: string): Provider | null {
  const modelRef =
    ALL_MODELS.find((ref) => ref.model === model) ??
    AVAILABLE_MODELS.find((ref) => ref.model === model);
  return modelRef?.provider ?? null;
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
  if (lower.startsWith("qwen/")) return true;
  if (lower.startsWith("moonshotai/")) return true;
  // Models that may NOT support response_format - be conservative
  // z-ai/glm, volcengine/doubao, etc. - skip response_format to avoid errors
  return false;
}

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

type ChatRequestPayload = {
  model: string;
  messages: unknown[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  reasoning?: { enabled: boolean };
  response_format?: unknown;
  provider?: Provider;
};

async function runBatchItem(
  payload: ChatRequestPayload,
  headerApiKey: string | null,
  headerDashscopeKey: string | null
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; error: string; details?: unknown }> {
  const {
    model,
    messages,
    temperature,
    max_tokens,
    stream,
    reasoning,
    response_format,
    provider,
  } = payload;

  if (stream) {
    return { ok: false, status: 400, error: "Batch request does not support stream=true" };
  }

  const modelProvider: Provider | null =
    provider === "dashscope" || provider === "zenmux" ? provider : getProviderForModel(model);
  if (!modelProvider) {
    return { ok: false, status: 400, error: `Unknown model: ${String(model ?? "").trim() || "unknown"}` };
  }

  const isDefaultModel = AVAILABLE_MODELS.some((ref) => ref.model === model);
  if (!isDefaultModel) {
    if (modelProvider === "zenmux" && !headerApiKey) {
      return { ok: false, status: 401, error: "此模型需要您提供 Zenmux API Key" };
    }
    if (modelProvider === "dashscope" && !headerDashscopeKey) {
      return { ok: false, status: 401, error: "此模型需要您提供百炼 API Key" };
    }
  }

  const normalizedTemperature =
    typeof temperature === "number" && Number.isFinite(temperature) ? temperature : 0.7;
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

  let processedMessages: unknown[] = messages;
  if (!supportsMultipartContent(model)) {
    processedMessages = flattenMultipartContent(processedMessages);
  } else if (modelProvider === "dashscope") {
    processedMessages = stripCacheControl(processedMessages);
  } else if (!supportsExplicitCaching(model)) {
    processedMessages = stripCacheControl(processedMessages);
  }

  if (modelProvider === "dashscope") {
    const dashscopeApiKey = headerDashscopeKey || process.env.DASHSCOPE_API_KEY;
    if (!dashscopeApiKey) {
      return { ok: false, status: 500, error: "DASHSCOPE_API_KEY not configured on server" };
    }

    const normalizedModel = normalizeDashscopeModelName(model);
    const requestBody: Record<string, unknown> = {
      model: normalizedModel,
      messages: processedMessages,
      temperature: cappedTemperature,
    };

    if (typeof max_tokens === "number" && Number.isFinite(max_tokens)) {
      requestBody.max_tokens = Math.max(16, Math.floor(max_tokens));
    }

    if (response_format) {
      requestBody.response_format = response_format;
    }

    const response = await fetch(DASHSCOPE_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dashscopeApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

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

  const isGoogleModel = model?.toLowerCase().startsWith("google/");
  if (isGoogleModel) {
    requestBody.reasoning = { enabled: false };
  } else if (reasoning) {
    requestBody.reasoning = reasoning;
  }

  if (response_format && supportsResponseFormat(model)) {
    requestBody.response_format = response_format;
  }

  const response = await fetch(ZENMUX_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

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
  try {
    const body = await request.json();
    if (Array.isArray(body?.requests)) {
      const headerApiKey = request.headers.get("x-zenmux-api-key")?.trim() || null;
      const headerDashscopeKey = request.headers.get("x-dashscope-api-key")?.trim() || null;
      const requests = body.requests as ChatRequestPayload[];
      const results = await Promise.all(
        requests.map((req) => runBatchItem(req, headerApiKey, headerDashscopeKey))
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
      response_format,
      provider,
    } = body;
    const modelProvider: Provider | null =
      provider === "dashscope" || provider === "zenmux" ? provider : getProviderForModel(model);
    if (!modelProvider) {
      // Reject unknown models early to avoid mis-routing.
      return NextResponse.json(
        { error: `Unknown model: ${String(model ?? "").trim() || "unknown"}` },
        { status: 400 }
      );
    }
    const headerApiKey = request.headers.get("x-zenmux-api-key")?.trim();
    const headerDashscopeKey = request.headers.get("x-dashscope-api-key")?.trim();
    const isDefaultModel = AVAILABLE_MODELS.some((ref) => ref.model === model);

    const normalizedTemperature =
      typeof temperature === "number" && Number.isFinite(temperature) ? temperature : 0.7;
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

    // Process messages based on model capabilities
    let processedMessages = messages;

    // For models that don't support multipart content, flatten to string
    if (!supportsMultipartContent(model)) {
      processedMessages = flattenMultipartContent(processedMessages);
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
    }

    if (modelProvider === "dashscope") {
      const dashscopeApiKey = headerDashscopeKey || process.env.DASHSCOPE_API_KEY;
      if (!dashscopeApiKey) {
        return NextResponse.json(
          { error: "DASHSCOPE_API_KEY not configured on server" },
          { status: 500 }
        );
      }

      const dashscopeApiUrl = DASHSCOPE_CHAT_COMPLETIONS_URL;

      const normalizedModel = normalizeDashscopeModelName(model);
      const requestBody: Record<string, unknown> = {
        model: normalizedModel,
        messages: processedMessages,
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

      const response = await fetch(dashscopeApiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dashscopeApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

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

    // Google Gemini: reasoning tokens count against max_completion_tokens, causing truncation
    // Gemini requires thinking_budget >= 512, which is too high for short responses (e.g., 600 token speech)
    // Must disable reasoning entirely to prevent content truncation
    const isGoogleModel = model?.toLowerCase().startsWith("google/");
    if (isGoogleModel) {
      requestBody.reasoning = { enabled: false };
    } else if (reasoning) {
      requestBody.reasoning = reasoning;
    }

    // Only include response_format for models that support it
    if (response_format && supportsResponseFormat(model)) {
      requestBody.response_format = response_format;
    }

    const response = await fetch(ZENMUX_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

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
