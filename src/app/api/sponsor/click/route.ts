import { NextResponse } from "next/server";
import { supabaseAdmin, ensureAdminClient } from "@/lib/supabase-admin";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    ensureAdminClient();
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { sponsorId, ref } = await request.json();

  if (!sponsorId || typeof sponsorId !== "string") {
    return NextResponse.json({ error: "Missing sponsorId" }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent") || null;

  const insertPayload: Database["public"]["Tables"]["sponsor_clicks"]["Insert"] = {
    sponsor_id: sponsorId,
    ref: ref || null,
    user_agent: userAgent,
  };
  const { error } = await supabaseAdmin
    .from("sponsor_clicks")
    .insert(insertPayload as never);

  if (error) {
    console.error("Failed to track sponsor click:", error);
    return NextResponse.json({ error: "Failed to track click" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
