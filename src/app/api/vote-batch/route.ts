import { NextRequest, NextResponse } from "next/server";

type VoteBatchRequest = {
  voterId: string;
  model: string;
  messages: unknown[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  reasoning?: { enabled: boolean };
  response_format?: unknown;
  provider?: "zenmux" | "dashscope";
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requests = Array.isArray(body?.requests) ? (body.requests as VoteBatchRequest[]) : [];
    if (requests.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const headerApiKey = request.headers.get("x-zenmux-api-key")?.trim();
    const headerDashscopeKey = request.headers.get("x-dashscope-api-key")?.trim();
    const origin = request.nextUrl.origin;

    const chatRequests = requests.map(({ voterId: _voterId, ...payload }) => payload);
    const chatResponse = await fetch(`${origin}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(headerApiKey ? { "X-Zenmux-Api-Key": headerApiKey } : {}),
        ...(headerDashscopeKey ? { "X-Dashscope-Api-Key": headerDashscopeKey } : {}),
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
