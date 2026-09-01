import { NextResponse } from "next/server";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";
import { isDemoModeActiveServer } from "@/lib/demo-config-server";
import { isGuestUser } from "@/lib/demo-mode";
import { GAME_SESSION_RESUME_WINDOW_MS } from "@/lib/game-session-policy";

export async function authenticateRequest(request: Request): Promise<
  | { user: { id: string } }
  | { error: NextResponse }
> {
  try {
    ensureAdminClient();
  } catch (error) {
    console.error("[api-auth] ensureAdminClient error", error);
    return {
      error: NextResponse.json({ error: "Server configuration error" }, { status: 500 }),
    };
  }

  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    if (await isDemoModeActiveServer()) {
      const guestId = request.headers.get("x-guest-id") || request.headers.get("X-Guest-Id");
      if (guestId && isGuestUser(guestId)) {
        return { user: { id: guestId } };
      }
    }

    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    console.error("[api-auth] getUser error", error);
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user: { id: data.user.id } };
}

export async function requireCredits(userId: string): Promise<boolean> {
  if (await isDemoModeActiveServer()) return true;

  try {
    const { data, error } = await supabaseAdmin
      .from("user_credits")
      .select("credits")
      .eq("id", userId)
      .single();

    if (error || !data) return false;
    const credits = Number((data as { credits: number | string }).credits ?? 0);
    return Number.isFinite(credits) && credits > 0;
  } catch (error) {
    console.error("[api-auth] requireCredits error", error);
    return false;
  }
}

export async function hasAuthorizedActiveGameSession(userId: string, sessionId?: string | null): Promise<boolean> {
  if (await isDemoModeActiveServer()) return true;
  if (!sessionId) return false;

  try {
    const since = new Date(Date.now() - GAME_SESSION_RESUME_WINDOW_MS).toISOString();
    const { data, error } = await supabaseAdmin
      .from("game_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("completed", false)
      .in("lifecycle_status", ["starting", "running"])
      .eq("used_custom_key", false)
      .eq("credit_authorized", true)
      .gte("last_activity_at", since)
      .eq("id", sessionId)
      .order("last_activity_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[api-auth] hasAuthorizedActiveGameSession error", error);
      return false;
    }

    const row = Array.isArray(data) ? (data[0] as { id?: string } | undefined) : undefined;
    if (!row?.id) return false;

    const { error: touchError } = await supabaseAdmin
      .from("game_sessions")
      .update({ last_activity_at: new Date().toISOString() } as never)
      .eq("id", row.id)
      .eq("user_id", userId);

    if (touchError) {
      console.warn("[api-auth] failed to refresh game session activity", touchError);
    }

    return true;
  } catch (error) {
    console.error("[api-auth] hasAuthorizedActiveGameSession error", error);
    return false;
  }
}

export const hasRecentUnfinishedGameSession = hasAuthorizedActiveGameSession;
