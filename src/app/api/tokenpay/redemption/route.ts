import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { fetchTokenPayPortal, readTokenPayRecoveryAction } from "@/lib/tokenpay";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request as unknown as Request);
  if ("error" in auth) return auth.error;

  const payload = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof payload?.code === "string" ? payload.code.trim() : "";
  if (!code || code.length > 256) {
    return NextResponse.json({ error: "Invalid redemption code" }, { status: 400 });
  }

  try {
    const response = await fetchTokenPayPortal(auth.user.id, "/redemption/redeem", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    const upstream = (await response.json().catch(() => null)) as {
      credits?: unknown;
    } | null;
    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Failed to redeem TokenPay code",
          recoveryAction: readTokenPayRecoveryAction(response),
        },
        { status: response.status },
      );
    }
    const creditsMicro = Number(upstream?.credits);
    if (!Number.isSafeInteger(creditsMicro) || creditsMicro <= 0) {
      return NextResponse.json({ error: "Invalid TokenPay redemption response" }, { status: 502 });
    }
    return NextResponse.json({ creditsMicro });
  } catch (error) {
    const unavailable = error instanceof Error && error.message.includes("not available");
    return NextResponse.json(
      {
        error: unavailable
          ? "TokenPay connection is not available"
          : "Failed to redeem TokenPay code",
      },
      { status: unavailable ? 409 : 500 },
    );
  }
}
