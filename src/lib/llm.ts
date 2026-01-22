export type LLMContentPart =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral"; ttl?: "1h" } }
  | { type: "image_url"; image_url: { url: string; detail?: string } }
  | { type: "input_audio"; input_audio: { data: string; format: "mp3" | "wav" } };

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string | LLMContentPart[];
  reasoning_details?: unknown;
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

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

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

      const base = 400;
      const jitter = Math.floor(Math.random() * 200);
      const backoffMs = base * 2 ** (attempt - 1) + jitter;
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

  const response = await fetchWithRetry(
    "/api/chat",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: maxTokens,
        ...(options.reasoning ? { reasoning: options.reasoning } : {}),
        ...(options.response_format ? { response_format: options.response_format } : {}),
      }),
    },
    2
  );

  if (!response.ok) {
    const errorText = await response.text();
    try {
      const errorJson = JSON.parse(errorText);
      throw new Error(errorJson.error || `API error: ${response.status}`);
    } catch {
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
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

export async function* generateCompletionStream(
  options: GenerateOptions
): AsyncGenerator<string, void, unknown> {
  const maxTokens =
    typeof options.max_tokens === "number" && Number.isFinite(options.max_tokens)
      ? Math.max(16, Math.floor(options.max_tokens))
      : undefined;

  const response = await fetchWithRetry(
    "/api/chat",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: maxTokens,
        stream: true,
        ...(options.reasoning ? { reasoning: options.reasoning } : {}),
        ...(options.response_format ? { response_format: options.response_format } : {}),
      }),
    },
    2
  );

  if (!response.ok) {
    const errorText = await response.text();
    try {
      const errorJson = JSON.parse(errorText);
      throw new Error(errorJson.error || `API error: ${response.status}`);
    } catch {
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
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
