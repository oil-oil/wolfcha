import { NextResponse } from "next/server";
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
