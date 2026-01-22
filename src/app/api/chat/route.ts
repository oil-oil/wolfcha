import { NextRequest, NextResponse } from "next/server";

const ZENMUX_API_URL = "https://zenmux.ai/api/v1/chat/completions";

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

export async function POST(request: NextRequest) {
  const apiKey = process.env.ZENMUX_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ZENMUX_API_KEY not configured on server" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { model, messages, temperature, max_tokens, stream, reasoning, response_format } = body;

    const normalizedTemperature =
      typeof temperature === "number" && Number.isFinite(temperature) ? temperature : 0.7;
    const cappedTemperature = (() => {
      const lower = typeof model === "string" ? model.toLowerCase() : "";
      if (lower.startsWith("moonshotai/")) {
        return Math.min(Math.max(0, normalizedTemperature), 1);
      }
      return Math.max(0, normalizedTemperature);
    })();

    // Process messages based on model capabilities
    let processedMessages = messages;
    
    // For models that don't support multipart content, flatten to string
    if (!supportsMultipartContent(model)) {
      processedMessages = flattenMultipartContent(processedMessages);
    } else if (!supportsExplicitCaching(model)) {
      // For models that support multipart but not cache_control, strip cache_control
      processedMessages = stripCacheControl(processedMessages);
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
