import { NextRequest, NextResponse } from "next/server";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";
import {
  getWatchaPayAccess,
  getWatchaPayReturnUrl,
  isWatchaPayConfigured,
  WatchaPayError,
} from "@/lib/watcha-pay";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user: { id: string } | null;
  try {
    ensureAdminClient();
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    user = error ? null : data.user;
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isWatchaPayConfigured()) {
    return NextResponse.json(
      { error: "Watcha Pay is not configured" },
      { status: 503 },
    );
  }

  try {
    const access = await getWatchaPayAccess(user.id, getWatchaPayReturnUrl());
    return NextResponse.json(access, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const status = error instanceof WatchaPayError
      ? error.code === "misconfigured" ? 503 : error.status ?? 502
      : 502;
    console.error("[Watcha Pay] Failed to read entitlement", {
      code: error instanceof WatchaPayError ? error.code : "unknown",
      status,
    });
    return NextResponse.json(
      { error: "Failed to read Watcha Pay entitlement" },
      { status },
    );
  }
}
