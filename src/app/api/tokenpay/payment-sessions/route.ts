import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import {
  fetchTokenPayPortal,
  normalizeTokenPayPaymentSession,
  readTokenPayRecoveryAction,
} from "@/lib/tokenpay";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request as unknown as Request);
  if ("error" in auth) return auth.error;

  const payload = (await request.json().catch(() => null)) as { amount?: unknown } | null;
  const amount = Number(payload?.amount);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100_000) {
    return NextResponse.json(
      { error: "Amount must be an integer between 1 and 100000" },
      { status: 400 },
    );
  }

  try {
    const response = await fetchTokenPayPortal(auth.user.id, "/payment/sessions", {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
    const upstream = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Failed to create TokenPay payment session",
          recoveryAction: readTokenPayRecoveryAction(response),
        },
        { status: response.status },
      );
    }
    const session = upstream ? normalizeTokenPayPaymentSession(upstream) : null;
    if (!session) {
      return NextResponse.json({ error: "Invalid TokenPay payment response" }, { status: 502 });
    }
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    const unavailable = error instanceof Error && error.message.includes("not available");
    return NextResponse.json(
      { error: unavailable ? "TokenPay connection is not available" : "Failed to create TokenPay payment session" },
      { status: unavailable ? 409 : 500 },
    );
  }
}
