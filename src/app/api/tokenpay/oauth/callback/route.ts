import { NextRequest, NextResponse } from "next/server";
import {
  consumeTokenPayOAuthFlow,
  completeTokenPayOAuthFlow,
  exchangeTokenPayAuthorizationCode,
  getTokenPayAppUrl,
  releaseTokenPayOAuthFlow,
  saveTokenPayConnection,
} from "@/lib/tokenpay";

export const dynamic = "force-dynamic";

function redirectToApp(request: NextRequest, result: string) {
  const redirectUrl = new URL("/", getTokenPayAppUrl(request.nextUrl.origin));
  redirectUrl.searchParams.set("tokenpay", result);
  return NextResponse.redirect(redirectUrl);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim();
  const state = request.nextUrl.searchParams.get("state")?.trim();
  const upstreamError = request.nextUrl.searchParams.get("error")?.trim();

  if (upstreamError) return redirectToApp(request, "denied");
  if (!code || !state || code.length > 4096 || state.length > 256) {
    return redirectToApp(request, "invalid_callback");
  }

  try {
    const flow = await consumeTokenPayOAuthFlow(state);
    let apiKey: string;
    try {
      apiKey = await exchangeTokenPayAuthorizationCode(code, flow.codeVerifier);
    } catch (error) {
      if (
        error instanceof Error &&
        "retryable" in error &&
        error.retryable === false
      ) {
        await completeTokenPayOAuthFlow(flow.stateHash);
      } else {
        await releaseTokenPayOAuthFlow(flow.stateHash);
      }
      throw error;
    }
    let saved = false;
    for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
      try {
        await saveTokenPayConnection(flow.userId, apiKey);
        saved = true;
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
    await completeTokenPayOAuthFlow(flow.stateHash);
    return redirectToApp(request, "connected");
  } catch (error) {
    console.error("[TokenPay OAuth] Callback failed", error);
    return redirectToApp(request, "failed");
  }
}
