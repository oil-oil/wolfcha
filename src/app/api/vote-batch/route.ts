import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";

type VoteBatchRequest = {
  voterId: string;
  model: string;
  messages: unknown[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  reasoning?: { enabled: boolean; effort?: "minimal" | "low" | "medium" | "high"; max_tokens?: number };
  reasoning_effort?: "minimal" | "low" | "medium" | "high";
  response_format?: unknown;
  provider?: "zenmux" | "dashscope" | "tokendance";
};

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request as unknown as Request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const requests = Array.isArray(body?.requests) ? (body.requests as VoteBatchRequest[]) : [];
    if (requests.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const headerApiKey = request.headers.get("x-zenmux-api-key")?.trim();
    const headerDashscopeKey = request.headers.get("x-dashscope-api-key")?.trim();
    const headerTokendanceKey = request.headers.get("x-tokendance-api-key")?.trim();
    const headerTokendanceBaseUrl = request.headers.get("x-tokendance-base-url")?.trim();
    const origin = request.nextUrl.origin;

    const chatRequests = requests.map(({ voterId: _voterId, ...payload }) => payload);
    const chatResponse = await fetch(`${origin}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(headerApiKey ? { "X-Zenmux-Api-Key": headerApiKey } : {}),
        ...(headerDashscopeKey ? { "X-Dashscope-Api-Key": headerDashscopeKey } : {}),
        ...(headerTokendanceKey ? { "X-Tokendance-Api-Key": headerTokendanceKey } : {}),
        ...(headerTokendanceBaseUrl ? { "X-Tokendance-Base-Url": headerTokendanceBaseUrl } : {}),
        Authorization: request.headers.get("Authorization") || "",
      },
      body: JSON.stringify({ requests: chatRequests }),
    });

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text().catch(() => "");
      return NextResponse.json(
        { error: errorText || "Vote batch request failed" },
        { status: chatResponse.status }
      );
    }

    const data = await chatResponse.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    const enriched = results.map((result: unknown, index: number) => ({
      ...(result && typeof result === "object" ? result : {}),
      voterId: requests[index]?.voterId ?? "",
    }));

    return NextResponse.json({ results: enriched });
  } catch (error) {
    return NextResponse.json(
      { error: String(error ?? "Unknown error") },
      { status: 500 }
    );
  }
}
