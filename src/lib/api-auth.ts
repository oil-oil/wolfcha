import { NextResponse } from "next/server";
import { authenticateAccessToken } from "@/lib/access-token-auth";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";
import { isDemoModeActiveServer } from "@/lib/demo-config-server";
import { isGuestUser } from "@/lib/demo-mode";

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

  let user: { id: string } | null;
  try {
    user = await authenticateAccessToken(token);
  } catch (error) {
    console.error("[api-auth] authenticateAccessToken error", error);
    return {
      error: NextResponse.json({ error: "Server configuration error" }, { status: 500 }),
    };
  }
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user };
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

const AUTHORIZED_SESSION_WINDOW_MS = 4 * 60 * 60 * 1000;

export async function hasAuthorizedActiveGameSession(userId: string, sessionId?: string | null): Promise<boolean> {
  if (await isDemoModeActiveServer()) return true;
  if (!sessionId) return false;

  try {
    const since = new Date(Date.now() - AUTHORIZED_SESSION_WINDOW_MS).toISOString();
    const { data, error } = await supabaseAdmin
      .from("game_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("completed", false)
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

/**
 * 原子占用一个已扣费 session。重复占用同一房间可安全重试，
 * 但同一 session 不能再启动另一个房间。
 */
export async function claimAuthorizedGameSession(
  userId: string,
  sessionId: string | null | undefined,
  roomId: string,
): Promise<boolean> {
  if (await isDemoModeActiveServer()) return true;
  if (!sessionId || !roomId) return false;
  try {
    const { data, error } = await supabaseAdmin.rpc(
      "claim_multiplayer_game_session" as never,
      {
        p_session_id: sessionId,
        p_user_id: userId,
        p_room_id: roomId,
      } as never,
    );
    if (error) {
      console.error("[api-auth] claimAuthorizedGameSession error", error);
      return false;
    }
    return data === true;
  } catch (error) {
    console.error("[api-auth] claimAuthorizedGameSession error", error);
    return false;
  }
}

/** 仅释放仍属于指定用户和房间的占用，数据库函数负责校验房间生命周期。 */
export async function releaseAuthorizedGameSessionClaim(
  userId: string,
  sessionId: string,
  roomId: string,
): Promise<void> {
  if (await isDemoModeActiveServer()) return;
  const { error } = await supabaseAdmin.rpc(
    "release_multiplayer_game_session" as never,
    { p_session_id: sessionId, p_user_id: userId, p_room_id: roomId } as never,
  );
  if (error) throw error;
}
