import { NextResponse } from "next/server";
import { supabaseAdmin, ensureAdminClient } from "@/lib/supabase-admin";
import { isGuestUser } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";

/**
 * POST /api/guest/migrate
 * 将游客的 game_sessions 记录迁移到正式用户名下
 * Body: { guestId: string }
 * Auth: Bearer token (正式用户)
 */
export async function POST(request: Request) {
  try {
    ensureAdminClient();
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { guestId?: string };
  try {
    body = (await request.json()) as { guestId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { guestId } = body;
  if (!guestId || !isGuestUser(guestId)) {
    return NextResponse.json({ error: "Invalid guest ID" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("game_sessions")
    .update({ user_id: user.id } as never)
    .eq("user_id", guestId)
    .select("id");

  if (updateError) {
    console.error("[guest/migrate] Update error:", updateError);
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }

  const migratedCount = (updated as { id: string }[] | null)?.length ?? 0;
  console.log(`[guest/migrate] Migrated ${migratedCount} sessions from ${guestId} to ${user.id}`);

  return NextResponse.json({ success: true, migratedCount });
}
