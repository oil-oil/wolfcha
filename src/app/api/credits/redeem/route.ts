import { NextResponse } from "next/server";
import { supabaseAdmin, ensureAdminClient } from "@/lib/supabase-admin";
import { REDEMPTION_CODE_ENABLED } from "@/lib/welfare-config";

export const dynamic = "force-dynamic";

const REDEEM_ERROR = {
  disabled: "disabled",
  invalidCode: "invalid_code",
  alreadyRedeemed: "already_redeemed",
} as const;

type RedeemPayload = {
  code?: string;
};

async function restoreRedemptionCode(codeId: string, userId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from("redemption_codes")
      .update({ is_redeemed: false, redeemed_by: null, redeemed_at: null } as never)
      .eq("id", codeId)
      .eq("redeemed_by", userId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Failed to restore redemption code after credit grant failure");
    }
  } catch {
    console.error("Failed to restore redemption code after credit grant failure");
  }
}

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

  if (!REDEMPTION_CODE_ENABLED) {
    return NextResponse.json({ error: REDEEM_ERROR.disabled }, { status: 400 });
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

  let payload: RedeemPayload;
  try {
    payload = (await request.json()) as RedeemPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const code = payload.code?.trim();
  if (!code) {
    return NextResponse.json({ error: REDEEM_ERROR.invalidCode }, { status: 400 });
  }

  const { data: codeRow, error: codeError } = await supabaseAdmin
    .from("redemption_codes")
    .select("id, credits_amount, is_redeemed")
    .eq("code", code)
    .maybeSingle();

  if (codeError || !codeRow) {
    return NextResponse.json({ error: REDEEM_ERROR.invalidCode }, { status: 400 });
  }

  const typedCodeRow = codeRow as { id: string; credits_amount: number; is_redeemed: boolean };

  if (typedCodeRow.is_redeemed) {
    return NextResponse.json({ error: REDEEM_ERROR.alreadyRedeemed }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: updatedCode, error: updateCodeError } = await supabaseAdmin
    .from("redemption_codes")
    .update({
      is_redeemed: true,
      redeemed_by: user.id,
      redeemed_at: now,
    } as never)
    .eq("id", typedCodeRow.id)
    .eq("is_redeemed", false)
    .select("id")
    .maybeSingle();

  if (updateCodeError || !updatedCode) {
    return NextResponse.json({ error: REDEEM_ERROR.alreadyRedeemed }, { status: 400 });
  }

  const creditsGranted = typedCodeRow.credits_amount;
  let newCredits: number | undefined;
  let creditsFailure = "Failed to update credits";

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      creditsFailure = "Failed to read credits";
      const { data: creditsData, error: creditsError } = await supabaseAdmin
        .from("user_credits")
        .select("credits")
        .eq("id", user.id)
        .single();

      if (creditsError || !creditsData) break;
      const currentCredits = (creditsData as { credits: number }).credits;
      creditsFailure = "Failed to update credits";
      // Preserve a concurrent game-start debit by retrying against the latest balance.
      const { data: updatedCredits, error: updateCreditsError } = await supabaseAdmin
        .from("user_credits")
        .update({ credits: currentCredits + creditsGranted, updated_at: now } as never)
        .eq("id", user.id)
        .eq("credits", currentCredits)
        .select("credits")
        .maybeSingle();

      if (updateCreditsError) break;
      if (updatedCredits) {
        newCredits = (updatedCredits as { credits: number }).credits;
        break;
      }
    }
  } catch {
    // A transport failure also needs to release the claimed code.
  }

  if (newCredits === undefined) {
    await restoreRedemptionCode(typedCodeRow.id, user.id);
    return NextResponse.json({ error: creditsFailure }, { status: 500 });
  }

  const { error: recordError } = await supabaseAdmin
    .from("redemption_records")
    .insert({
      user_id: user.id,
      code,
      credits_granted: creditsGranted,
    } as never);

  if (recordError) {
    console.error("Failed to insert redemption record:", recordError);
  }

  return NextResponse.json({
    success: true,
    credits: newCredits,
    creditsGranted,
  });
}
