
import { NextRequest, NextResponse } from "next/server";
import { stripMarkdownCodeFences, type OpenRouterMessage } from "@/lib/openrouter";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeBase64Audio(input: unknown): string {
  if (typeof input !== "string") return "";
  const trimmed = input.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("data:")) {
    const comma = trimmed.indexOf(",");
    if (comma >= 0) {
      return trimmed.slice(comma + 1).trim();
    }
  }

  return trimmed;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY not configured on server" },
      { status: 500 }
    );
  }

  try {
    const parsed = await request.json().catch(() => ({} as any));
    const audio = normalizeBase64Audio(parsed?.audio);
    const format = (typeof parsed?.format === "string" ? parsed.format : "mp3") as "mp3" | "wav";
    const model = typeof parsed?.model === "string" && parsed.model.trim()
      ? String(parsed.model).trim()
      : "google/gemini-2.5-flash-lite-preview-09-2025";

    if (!audio) {
      return NextResponse.json({ error: "Missing audio" }, { status: 400 });
    }

    if (format !== "mp3" && format !== "wav") {
      return NextResponse.json({ error: "Unsupported format (expected mp3 or wav)" }, { status: 400 });
    }

    const messages: OpenRouterMessage[] = [
      {
        role: "system",
        content:
          "You are a transcriber. Output ONLY the verbatim transcription of the audio. Do not reply to the content.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_audio",
            input_audio: {
              data: audio,
              format,
            },
          },
        ],
      },
    ];

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `OpenRouter API error: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    const result = (await response.json()) as any;
    const content = String(result?.choices?.[0]?.message?.content ?? "");
    const text = stripMarkdownCodeFences(content).trim();

    return NextResponse.json({ text });
  } catch (error) {
    console.error("[api/stt] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
