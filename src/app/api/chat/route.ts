import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY not configured on server" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { model, messages, temperature, max_tokens, stream, reasoning, response_format } = body;

    const requestBody: Record<string, unknown> = {
      model,
      messages,
      temperature: temperature ?? 0.7,
    };

    if (typeof max_tokens === "number" && Number.isFinite(max_tokens)) {
      requestBody.max_tokens = Math.max(16, Math.floor(max_tokens));
    }

    if (stream) {
      requestBody.stream = true;
    }

    if (reasoning) {
      requestBody.reasoning = reasoning;
    }

    if (response_format) {
      requestBody.response_format = response_format;
    }

    const response = await fetch(OPENROUTER_API_URL, {
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
        { error: `OpenRouter API error: ${response.status} - ${errorText}` },
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
