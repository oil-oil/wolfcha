export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
  reasoning_details?: unknown;
}

export interface OpenRouterResponse {
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

export interface GenerateOptions {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  reasoning?: { enabled: boolean };
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

export async function generateCompletion(
  apiKey: string,
  options: GenerateOptions
): Promise<{ content: string; reasoning_details?: unknown; raw: OpenRouterResponse }> {
  const response = await fetchWithRetry(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 2048,
        ...(options.reasoning ? { reasoning: options.reasoning } : {}),
      }),
    },
    2
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const result: OpenRouterResponse = await response.json();
  const assistantMessage = result.choices[0]?.message;

  if (!assistantMessage) {
    throw new Error("No response from model");
  }

  return {
    content: assistantMessage.content,
    reasoning_details: assistantMessage.reasoning_details,
    raw: result,
  };
}

export async function* generateCompletionStream(
  apiKey: string,
  options: GenerateOptions
): AsyncGenerator<string, void, unknown> {
  const response = await fetchWithRetry(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 2048,
        stream: true,
        ...(options.reasoning ? { reasoning: options.reasoning } : {}),
      }),
    },
    2
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
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
  apiKey: string,
  options: GenerateOptions & { schema?: string }
): Promise<T> {
  const messagesWithFormat = [...options.messages];
  
  const lastMessage = messagesWithFormat[messagesWithFormat.length - 1];
  if (lastMessage && lastMessage.role === "user") {
    lastMessage.content += "\n\nRespond with valid JSON only. No markdown, no code blocks, just raw JSON.";
  }

  const result = await generateCompletion(apiKey, {
    ...options,
    messages: messagesWithFormat,
  });

  let jsonStr = result.content.trim();
  
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

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
