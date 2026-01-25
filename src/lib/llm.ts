import { getDashscopeApiKey, getZenmuxApiKey, isCustomKeyEnabled } from "@/lib/api-keys";
import { ALL_MODELS, AVAILABLE_MODELS } from "@/types/game";

export type LLMContentPart =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral"; ttl?: "1h" } }
  | { type: "image_url"; image_url: { url: string; detail?: string } }
  | { type: "input_audio"; input_audio: { data: string; format: "mp3" | "wav" } };

export type ApiKeySource = "user" | "project";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string | LLMContentPart[];
  reasoning_details?: unknown;
}

type Provider = "zenmux" | "dashscope";

function getProviderForModel(model: string): Provider {
   const modelRef =
     ALL_MODELS.find((ref) => ref.model === model) ??
     AVAILABLE_MODELS.find((ref) => ref.model === model);
   return modelRef?.provider ?? "zenmux";
 }

// When using built-in keys (custom disabled), only models in AVAILABLE_MODELS
// are allowed; the server rejects non-AVAILABLE models without x-zenmux-api-key.
// Game state may contain modelRef from ALL_MODELS (e.g. from a game started with
// custom key on). Map to an AVAILABLE model to avoid "此模型需要您提供 Zenmux API Key".
function resolveModelForBuiltin(model: string): string {
  if (AVAILABLE_MODELS.some((r) => r.model === model)) return model;
  const m =
    AVAILABLE_MODELS.find((r) => r.provider === "zenmux") ?? AVAILABLE_MODELS[0];
  return m?.model ?? model;
}

export function resolveApiKeySource(model: string): ApiKeySource {
   const customEnabled = isCustomKeyEnabled();
   if (!customEnabled) return "project";

   const provider = getProviderForModel(model);
   if (provider === "dashscope") {
     return getDashscopeApiKey() ? "user" : "project";
   }
   return getZenmuxApiKey() ? "user" : "project";
 }

export interface ChatCompletionResponse {
  id: string;
  choices: {
    message: {
      role: "assistant";
      content: string;
      reasoning_details?: unknown;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | {
      type: "json_schema";
      strict?: boolean;
      json_schema: {
        name: string;
        description?: string;
        schema: unknown;
        // Note: 'strict' is not supported by ZenMux, use json_object for simple cases
      };
    };

export interface GenerateOptions {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  reasoning?: { enabled: boolean };
  response_format?: ResponseFormat;
}

export type BatchCompletionResult =
  | { ok: true; content: string; reasoning_details?: unknown; raw: ChatCompletionResponse }
  | { ok: false; error: string; status?: number };

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function parseRetryAfterMs(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const sec = Number(raw);
  if (Number.isFinite(sec) && sec > 0) return Math.round(sec * 1000);

  const dateMs = Date.parse(raw);
  if (!Number.isFinite(dateMs)) return null;
  const diff = dateMs - Date.now();
  return diff > 0 ? diff : null;
}

function formatApiError(status: number, errorText: string): string {
  let msg = `API error: ${status}`;
  try {
    const errorJson = JSON.parse(errorText) as any;
    if (typeof errorJson?.error === "string" && errorJson.error.trim()) {
      msg = errorJson.error.trim();
    }
    const detailsMsg = errorJson?.details?.error?.message;
    if (typeof detailsMsg === "string" && detailsMsg.trim()) {
      msg = `${msg} - ${detailsMsg.trim()}`;
    }
    return msg;
  } catch {
    const trimmed = (errorText || "").trim();
    return trimmed ? `${msg} - ${trimmed.slice(0, 600)}` : msg;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  maxAttempts: number
): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(input, init);
      lastResponse = response;

      if (response.ok) return response;

      if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts) {
        return response;
      }

      const retryAfterMs = parseRetryAfterMs(response);
      const base = response.status === 429 ? 1000 : 400;
      const jitter = Math.floor(Math.random() * 200);
      const backoffMs =
        (retryAfterMs !== null ? Math.min(15000, Math.max(0, retryAfterMs)) : base * 2 ** (attempt - 1)) +
        jitter;
      await sleep(backoffMs);
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;
      const base = 400;
      const jitter = Math.floor(Math.random() * 200);
      const backoffMs = base * 2 ** (attempt - 1) + jitter;
      await sleep(backoffMs);
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function stripMarkdownCodeFences(text: string): string {
  let t = text.trim();

  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z0-9_-]*\s*/m, "");
    t = t.replace(/\s*```\s*$/m, "");
  }

  return t.trim();
}

export async function generateCompletion(
  options: GenerateOptions
): Promise<{ content: string; reasoning_details?: unknown; raw: ChatCompletionResponse }> {
  const maxTokens =
    typeof options.max_tokens === "number" && Number.isFinite(options.max_tokens)
      ? Math.max(16, Math.floor(options.max_tokens))
      : undefined;

  const customEnabled = isCustomKeyEnabled();
  const headerApiKey = customEnabled ? getZenmuxApiKey() : "";
  const dashscopeApiKey = customEnabled ? getDashscopeApiKey() : "";
  const modelToUse = customEnabled
    ? options.model
    : resolveModelForBuiltin(options.model);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (headerApiKey) {
    headers["X-Zenmux-Api-Key"] = headerApiKey;
  }
  if (dashscopeApiKey) {
    headers["X-Dashscope-Api-Key"] = dashscopeApiKey;
  }

  const response = await fetchWithRetry(
    "/api/chat",
    {
      method: "POST",
      headers: {
        ...headers,
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: maxTokens,
        ...(options.reasoning ? { reasoning: options.reasoning } : {}),
        ...(options.response_format ? { response_format: options.response_format } : {}),
      }),
    },
    4
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(formatApiError(response.status, errorText));
  }

  const result: ChatCompletionResponse = await response.json();
  const choice = result.choices?.[0];
  const assistantMessage = choice?.message;

  if (!assistantMessage) {
    throw new Error(
      `No response from model. Raw response: ${JSON.stringify(result).slice(0, 500)}`
    );
  }

  // Warn if output was truncated due to max_tokens
  if (choice.finish_reason === "length") {
    console.warn(
      `[LLM] Output truncated (finish_reason=length). Consider increasing max_tokens.`
    );
  }

  return {
    content: assistantMessage.content,
    reasoning_details: assistantMessage.reasoning_details,
    raw: result,
  };
}

export async function generateCompletionBatch(
  requests: GenerateOptions[]
): Promise<BatchCompletionResult[]> {
  if (!Array.isArray(requests) || requests.length === 0) return [];

  const customEnabled = isCustomKeyEnabled();
  const headerApiKey = customEnabled ? getZenmuxApiKey() : "";
  const dashscopeApiKey = customEnabled ? getDashscopeApiKey() : "";
  const resolvedRequests = customEnabled
    ? requests
    : requests.map((r) => ({ ...r, model: resolveModelForBuiltin(r.model) }));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (headerApiKey) {
    headers["X-Zenmux-Api-Key"] = headerApiKey;
  }
  if (dashscopeApiKey) {
    headers["X-Dashscope-Api-Key"] = dashscopeApiKey;
  }

  const response = await fetchWithRetry(
    "/api/chat",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ requests: resolvedRequests }),
    },
    3
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(formatApiError(response.status, errorText));
  }

  const data = await response.json();
  const results = Array.isArray(data?.results) ? data.results : [];

  return results.map((item: any) => {
    if (!item || item.ok !== true) {
      return {
        ok: false,
        error: String(item?.error || "Unknown error"),
        status: typeof item?.status === "number" ? item.status : undefined,
      };
    }
    const raw = item.data as ChatCompletionResponse;
    const choice = raw?.choices?.[0];
    const assistantMessage = choice?.message;
    if (!assistantMessage) {
      return { ok: false, error: "No response from model" };
    }
    return {
      ok: true,
      content: assistantMessage.content,
      reasoning_details: assistantMessage.reasoning_details,
      raw,
    };
  });
}

export async function* generateCompletionStream(
  options: GenerateOptions
): AsyncGenerator<string, void, unknown> {
  const maxTokens =
    typeof options.max_tokens === "number" && Number.isFinite(options.max_tokens)
      ? Math.max(16, Math.floor(options.max_tokens))
      : undefined;

  const customEnabled = isCustomKeyEnabled();
  const headerApiKey = customEnabled ? getZenmuxApiKey() : "";
  const dashscopeApiKey = customEnabled ? getDashscopeApiKey() : "";
  const modelToUse = customEnabled
    ? options.model
    : resolveModelForBuiltin(options.model);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (headerApiKey) {
    headers["X-Zenmux-Api-Key"] = headerApiKey;
  }
  if (dashscopeApiKey) {
    headers["X-Dashscope-Api-Key"] = dashscopeApiKey;
  }

  const response = await fetchWithRetry(
    "/api/chat",
    {
      method: "POST",
      headers: {
        ...headers,
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: maxTokens,
        stream: true,
        ...(options.reasoning ? { reasoning: options.reasoning } : {}),
        ...(options.response_format ? { response_format: options.response_format } : {}),
      }),
    },
    4
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(formatApiError(response.status, errorText));
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const json = JSON.parse(trimmed.slice(6));
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }
}

export async function generateJSON<T>(
  options: GenerateOptions & { schema?: string }
): Promise<T> {
  const messagesWithFormat = [...options.messages];

  const lastMessage = messagesWithFormat[messagesWithFormat.length - 1];
  if (lastMessage && lastMessage.role === "user") {
    const suffix = "\n\nRespond with valid JSON only. No markdown, no code blocks, just raw JSON.";
    if (typeof lastMessage.content === "string") {
      lastMessage.content += suffix;
    } else if (Array.isArray(lastMessage.content)) {
      const parts = lastMessage.content;
      const lastPart = parts[parts.length - 1];
      if (lastPart && lastPart.type === "text") {
        lastPart.text += suffix;
      } else {
        parts.push({ type: "text", text: suffix });
      }
    }
  }

  const result = await generateCompletion({
    ...options,
    messages: messagesWithFormat,
  });

  let jsonStr = stripMarkdownCodeFences(result.content);

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // 尝试提取 JSON 对象或数组
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);

    // 优先使用对象格式（因为我们通常期望 { characters: [...] }）
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]) as T;
      } catch {
        // 对象解析失败，尝试数组
      }
    }

    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]) as T;
      } catch {
        // 数组解析也失败
      }
    }

    throw new Error(`Failed to parse JSON response: ${result.content}`);
  }
}
