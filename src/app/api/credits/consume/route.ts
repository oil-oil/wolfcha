import { NextResponse } from "next/server";
import { supabaseAdmin, ensureAdminClient } from "@/lib/supabase-admin";
import type { Database } from "@/types/database";
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
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const headerZenmuxKey = request.headers.get("x-zenmux-api-key")?.trim();
  const headerDashscopeKey = request.headers.get("x-dashscope-api-key")?.trim();
  const hasExternalKey = Boolean(headerZenmuxKey || headerDashscopeKey);
  const now = new Date();
  const springCampaignBase = buildSpringCampaignBase(now);
  const springCampaignActive = isSpringCampaignActive(now);
  const quotaDate = springCampaignActive ? getShanghaiDateKey(now) : null;
  let campaignRow: CampaignQuotaRow | null = null;

  if (springCampaignActive && quotaDate) {
    const { data: campaignData, error: campaignError } = await supabaseAdmin
      .from("campaign_daily_quota")
      .select("granted_quota, consumed_quota, expires_at")
      .eq("user_id", user.id)
      .eq("campaign_code", SPRING_CAMPAIGN_CODE)
      .eq("quota_date", quotaDate)
      .maybeSingle();

    if (!campaignError && campaignData) {
      campaignRow = campaignData as CampaignQuotaRow;
    }
  }

  const buildCampaignPayload = (row: CampaignQuotaRow | null) => {
    if (!springCampaignActive || !quotaDate) {
      return springCampaignBase;
    }
    const totalQuota = row?.granted_quota ?? 0;
    const consumedQuota = row?.consumed_quota ?? 0;
    const remainingQuota = Math.max(totalQuota - consumedQuota, 0);
    return {
      ...springCampaignBase,
      quotaDate,
      claimedToday: !!row,
      totalQuota,
      remainingQuota,
      expiresAt: row?.expires_at ?? null,
    };
  };

  if (hasExternalKey) {
    const { data } = await supabaseAdmin
      .from("user_credits")
      .select("credits")
      .eq("id", user.id)
      .single();
    const creditsRow = data as { credits: number } | null;
    return NextResponse.json({
      success: true,
      credits: creditsRow?.credits ?? 0,
      bypassed: true,
      usedTemporaryQuota: false,
      campaign: buildCampaignPayload(campaignRow),
    });
  }

  if (springCampaignActive && quotaDate && !campaignRow) {
    const insertPayload = {
      user_id: user.id,
      campaign_code: SPRING_CAMPAIGN_CODE,
      quota_date: quotaDate,
      granted_quota: SPRING_CAMPAIGN_DAILY_QUOTA,
      consumed_quota: 0,
      expires_at: getSpringQuotaExpiresAtIso(quotaDate),
      claimed_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    const { data: insertedCampaignData, error: insertCampaignError } = await supabaseAdmin
      .from("campaign_daily_quota")
      .insert(insertPayload as never)
      .select("granted_quota, consumed_quota, expires_at")
      .single();
    if (!insertCampaignError && insertedCampaignData) {
      campaignRow = insertedCampaignData as CampaignQuotaRow;
    } else if (insertCampaignError?.code === "23505") {
      const { data: retriedCampaignData } = await supabaseAdmin
        .from("campaign_daily_quota")
        .select("granted_quota, consumed_quota, expires_at")
        .eq("user_id", user.id)
        .eq("campaign_code", SPRING_CAMPAIGN_CODE)
        .eq("quota_date", quotaDate)
        .maybeSingle();
      campaignRow = (retriedCampaignData as CampaignQuotaRow | null) ?? null;
    }
  }

  if (springCampaignActive && quotaDate && campaignRow) {
    let latestCampaignRow = campaignRow;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remainingBefore = latestCampaignRow.granted_quota - latestCampaignRow.consumed_quota;
      if (remainingBefore <= 0 || new Date(latestCampaignRow.expires_at) <= now) break;

      const nextConsumed = latestCampaignRow.consumed_quota + 1;
      const { data: updatedCampaignData, error: campaignUpdateError } = await supabaseAdmin
        .from("campaign_daily_quota")
        .update({
          consumed_quota: nextConsumed,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("user_id", user.id)
        .eq("campaign_code", SPRING_CAMPAIGN_CODE)
        .eq("quota_date", quotaDate)
        .eq("consumed_quota", latestCampaignRow.consumed_quota)
        .select("granted_quota, consumed_quota, expires_at")
        .single();

      if (!campaignUpdateError && updatedCampaignData) {
        const updatedCampaignRow = updatedCampaignData as CampaignQuotaRow;
        const { data: creditsData } = await supabaseAdmin
          .from("user_credits")
          .select("credits")
          .eq("id", user.id)
          .single();
        const creditsRow = creditsData as { credits: number } | null;

        return NextResponse.json({
          success: true,
          credits: creditsRow?.credits ?? 0,
          usedTemporaryQuota: true,
          campaign: buildCampaignPayload(updatedCampaignRow),
        });
      }

      const { data: refreshedCampaignData } = await supabaseAdmin
        .from("campaign_daily_quota")
        .select("granted_quota, consumed_quota, expires_at")
        .eq("user_id", user.id)
        .eq("campaign_code", SPRING_CAMPAIGN_CODE)
        .eq("quota_date", quotaDate)
        .maybeSingle();
      if (!refreshedCampaignData) {
        break;
      }
      latestCampaignRow = refreshedCampaignData as CampaignQuotaRow;
    }
    campaignRow = latestCampaignRow;
  }

  const { data, error } = await supabaseAdmin
    .from("user_credits")
    .select("credits")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to read credits" }, { status: 500 });
  }

  const creditsRow = data as { credits: number } | null;
  if (!creditsRow || creditsRow.credits <= 0) {
    return NextResponse.json(
      {
        error: "Insufficient credits",
        campaign: buildCampaignPayload(campaignRow),
      },
      { status: 400 }
    );
  }

  const nextCredits = creditsRow.credits - 1;
  const updatePayload: Partial<Database["public"]["Tables"]["user_credits"]["Row"]> = {
    credits: nextCredits,
    updated_at: new Date().toISOString(),
  };
  const { error: updateError } = await supabaseAdmin
    .from("user_credits")
    .update(updatePayload as never)
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to update credits" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    credits: nextCredits,
    usedTemporaryQuota: false,
    campaign: buildCampaignPayload(campaignRow),
  });
}
