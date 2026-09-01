import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import {
  fetchTokenPayPortal,
  normalizeTokenPayPaymentSession,
  readTokenPayRecoveryAction,
} from "@/lib/tokenpay";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request as unknown as Request);
  if ("error" in auth) return auth.error;
  const { sessionId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(sessionId)) {
    return NextResponse.json({ error: "Invalid payment session" }, { status: 400 });
  }

  try {
    const response = await fetchTokenPayPortal(
      auth.user.id,
      `/payment/sessions/${encodeURIComponent(sessionId)}`,
    );
    const upstream = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Failed to load TokenPay payment session",
          recoveryAction: readTokenPayRecoveryAction(response),
        },
        { status: response.status },
      );
    }
    const session = normalizeTokenPayPaymentSession(upstream ?? {});
    if (!session || session.id !== sessionId) {
      return NextResponse.json({ error: "Invalid TokenPay payment response" }, { status: 502 });
    }
    return NextResponse.json({ session });
  } catch (error) {
    const unavailable = error instanceof Error && error.message.includes("not available");
    return NextResponse.json(
      { error: unavailable ? "TokenPay connection is not available" : "Failed to load TokenPay payment session" },
      { status: unavailable ? 409 : 500 },
    );
  }
}
