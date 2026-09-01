import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import {
  fetchTokenPayPortal,
  normalizeTokenPayBalance,
  readTokenPayRecoveryAction,
} from "@/lib/tokenpay";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request as unknown as Request);
  if ("error" in auth) return auth.error;

  try {
    const response = await fetchTokenPayPortal(auth.user.id, "/user/balance");
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Failed to load TokenPay balance",
          recoveryAction: readTokenPayRecoveryAction(response),
        },
        { status: response.status },
      );
    }

    const balance = payload ? normalizeTokenPayBalance(payload) : null;
    if (!balance) {
      return NextResponse.json({ error: "Invalid TokenPay balance response" }, { status: 502 });
    }

    return NextResponse.json({ balance });
  } catch (error) {
    const unavailable = error instanceof Error && error.message.includes("not available");
    return NextResponse.json(
      { error: unavailable ? "TokenPay connection is not available" : "Failed to load TokenPay balance" },
      { status: unavailable ? 409 : 500 },
    );
  }
}
