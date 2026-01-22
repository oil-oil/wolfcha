import { NextResponse } from "next/server";
import { supabaseAdmin, ensureAdminClient } from "@/lib/supabase-admin";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type ReferralPayload = {
  referralCode?: string;
};

export async function POST(request: Request) {
  try {
    ensureAdminClient();
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Server misconfiguration: missing SUPABASE_SERVICE_ROLE_KEY" },
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

  let payload: ReferralPayload;
  try {
    payload = (await request.json()) as ReferralPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const referralCode = payload.referralCode?.trim();
  if (!referralCode) {
    return NextResponse.json({ error: "Missing referral code" }, { status: 400 });
  }

  const { data: referrer, error: referrerError } = await supabaseAdmin
    .from("user_credits")
    .select("id")
    .eq("referral_code", referralCode)
    .single();

  const referrerRow = referrer as { id: string } | null;
  if (referrerError || !referrerRow || referrerRow.id === user.id) {
    return NextResponse.json({ error: "Invalid referral code" }, { status: 400 });
  }

  const { data: currentUser, error: currentUserError } = await supabaseAdmin
    .from("user_credits")
    .select("referred_by")
    .eq("id", user.id)
    .single();

  if (currentUserError) {
    return NextResponse.json({ error: "Failed to read user" }, { status: 500 });
  }

  const currentUserRow = currentUser as { referred_by: string | null } | null;
  if (currentUserRow?.referred_by) {
    return NextResponse.json({ error: "Already referred" }, { status: 400 });
  }

  const updatePayload: Partial<Database["public"]["Tables"]["user_credits"]["Row"]> = {
    referred_by: referrerRow.id,
    updated_at: new Date().toISOString(),
  };
  const { error: updateError } = await supabaseAdmin
    .from("user_credits")
    .update(updatePayload as never)
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to update referral" }, { status: 500 });
  }

  const { data: referrerCredits, error: creditsError } = await supabaseAdmin
    .from("user_credits")
    .select("credits, total_referrals")
    .eq("id", referrerRow.id)
    .single();

  const referrerCreditsRow = referrerCredits as {
    credits: number;
    total_referrals: number;
  } | null;
  if (creditsError || !referrerCreditsRow) {
    return NextResponse.json({ error: "Failed to read referrer" }, { status: 500 });
  }

  const referrerUpdatePayload: Partial<Database["public"]["Tables"]["user_credits"]["Row"]> = {
    credits: referrerCreditsRow.credits + 3,
    total_referrals: referrerCreditsRow.total_referrals + 1,
    updated_at: new Date().toISOString(),
  };
  const { error: referrerUpdateError } = await supabaseAdmin
    .from("user_credits")
    .update(referrerUpdatePayload as never)
    .eq("id", referrerRow.id);

  if (referrerUpdateError) {
    return NextResponse.json({ error: "Failed to update referrer" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
