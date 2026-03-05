import { NextResponse } from "next/server";
import { buildWatchaAuthorizeUrl, getWatchaClientId } from "@/lib/watcha-oauth";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/watcha
 * 生成 state 并重定向到观猹授权页面
 */
export async function GET(request: Request) {
  try {
    getWatchaClientId();
  } catch {
    return NextResponse.json({ error: "Watcha OAuth not configured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const redirectUri = `${origin}/api/auth/watcha/callback`;
  const state = randomBytes(16).toString("hex");

  const authorizeUrl = buildWatchaAuthorizeUrl(redirectUri, state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("watcha_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
