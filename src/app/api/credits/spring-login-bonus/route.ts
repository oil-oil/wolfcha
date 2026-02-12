import { NextResponse } from "next/server";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";
import {
  SPRING_CAMPAIGN_CODE,
  SPRING_CAMPAIGN_DAILY_QUOTA,
  buildSpringCampaignBase,
  getShanghaiDateKey,
  getSpringQuotaExpiresAtIso,
  isSpringCampaignActive,
} from "@/lib/spring-campaign";

export const dynamic = "force-dynamic";

type CampaignQuotaRow = {
  granted_quota: number;
  consumed_quota: number;
  expires_at: string;
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
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const base = buildSpringCampaignBase(now);
  if (!isSpringCampaignActive(now)) {
    return NextResponse.json({ success: true, campaign: base });
  }

  const quotaDate = getShanghaiDateKey(now);
  const expiresAt = getSpringQuotaExpiresAtIso(quotaDate);

  const {
    data: existingData,
    error: existingError,
  } = await supabaseAdmin
    .from("campaign_daily_quota")
    .select("granted_quota, consumed_quota, expires_at")
    .eq("user_id", user.id)
    .eq("campaign_code", SPRING_CAMPAIGN_CODE)
    .eq("quota_date", quotaDate)
    .maybeSingle();

  if (existingError) {
    console.error("[Spring Campaign] Failed to read quota row:", existingError);
    return NextResponse.json({ error: "Failed to read campaign quota" }, { status: 500 });
  }

  let row = existingData as CampaignQuotaRow | null;
  let justClaimed = false;

  if (!row) {
    const insertPayload = {
      user_id: user.id,
      campaign_code: SPRING_CAMPAIGN_CODE,
      quota_date: quotaDate,
      granted_quota: SPRING_CAMPAIGN_DAILY_QUOTA,
      consumed_quota: 0,
      expires_at: expiresAt,
      claimed_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    const { data: insertedData, error: insertError } = await supabaseAdmin
      .from("campaign_daily_quota")
      .insert(insertPayload as never)
      .select("granted_quota, consumed_quota, expires_at")
      .single();

    if (insertError) {
      if (insertError.code !== "23505") {
        console.error("[Spring Campaign] Failed to insert quota row:", insertError);
        return NextResponse.json({ error: "Failed to claim campaign quota" }, { status: 500 });
      }

      const {
        data: retriedData,
        error: retryError,
      } = await supabaseAdmin
        .from("campaign_daily_quota")
        .select("granted_quota, consumed_quota, expires_at")
        .eq("user_id", user.id)
        .eq("campaign_code", SPRING_CAMPAIGN_CODE)
        .eq("quota_date", quotaDate)
        .single();

      if (retryError || !retriedData) {
        console.error("[Spring Campaign] Failed to recover quota row:", retryError);
        return NextResponse.json({ error: "Failed to claim campaign quota" }, { status: 500 });
      }
      row = retriedData as CampaignQuotaRow;
    } else {
      row = insertedData as CampaignQuotaRow;
      justClaimed = true;
    }
  }

  const totalQuota = row?.granted_quota ?? 0;
  const consumedQuota = row?.consumed_quota ?? 0;
  const remainingQuota = Math.max(totalQuota - consumedQuota, 0);

  return NextResponse.json({
    success: true,
    campaign: {
      ...base,
      claimedToday: !!row,
      justClaimed,
      quotaDate,
      totalQuota,
      remainingQuota,
      expiresAt: row?.expires_at ?? expiresAt,
    },
  });
}
