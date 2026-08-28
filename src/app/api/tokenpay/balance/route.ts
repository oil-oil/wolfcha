import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { fetchTokenPayPortal, readTokenPayRecoveryAction } from "@/lib/tokenpay";

export const dynamic = "force-dynamic";

type UpstreamBalance = {
  balance?: {
    credits?: unknown;
    credits_used?: unknown;
    balance?: unknown;
  };
};

function asSafeInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request as unknown as Request);
  if ("error" in auth) return auth.error;

  try {
    const response = await fetchTokenPayPortal(auth.user.id, "/user/balance");
    const payload = (await response.json().catch(() => null)) as UpstreamBalance | null;
    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Failed to load TokenPay balance",
          recoveryAction: readTokenPayRecoveryAction(response),
        },
        { status: response.status },
      );
    }

    const creditsMicro = asSafeInteger(payload?.balance?.credits);
    const creditsUsedMicro = asSafeInteger(payload?.balance?.credits_used);
    const availableMicro = asSafeInteger(payload?.balance?.balance);
    if (creditsMicro === null || creditsUsedMicro === null || availableMicro === null) {
      return NextResponse.json({ error: "Invalid TokenPay balance response" }, { status: 502 });
    }

    return NextResponse.json({
      balance: { creditsMicro, creditsUsedMicro, availableMicro },
    });
  } catch (error) {
    const unavailable = error instanceof Error && error.message.includes("not available");
    return NextResponse.json(
      { error: unavailable ? "TokenPay connection is not available" : "Failed to load TokenPay balance" },
      { status: unavailable ? 409 : 500 },
    );
  }
}
