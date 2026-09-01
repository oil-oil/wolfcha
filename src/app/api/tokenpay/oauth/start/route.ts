import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { createTokenPayAuthorization } from "@/lib/tokenpay";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request as unknown as Request);
  if ("error" in auth) return auth.error;

  try {
    const authorizationUrl = await createTokenPayAuthorization(
      auth.user.id,
      request.nextUrl.origin,
    );
    return NextResponse.json({ authorizationUrl });
  } catch (error) {
    console.error("[TokenPay OAuth] Failed to start authorization", error);
    return NextResponse.json(
      { error: "TokenPay authorization is unavailable" },
      { status: 500 },
    );
  }
}
