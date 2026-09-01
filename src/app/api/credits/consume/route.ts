import { NextResponse } from "next/server";
import { supabaseAdmin, ensureAdminClient } from "@/lib/supabase-admin";
import { isDemoModeActiveServer } from "@/lib/demo-config-server";
import {
  SPRING_CAMPAIGN_CODE,
  SPRING_CAMPAIGN_DAILY_QUOTA,
  buildSpringCampaignBase,
  getShanghaiDateKey,
  getSpringQuotaExpiresAtIso,
  isSpringCampaignActive,
} from "@/lib/spring-campaign";
import { hasConnectedTokenPay, TOKENPAY_MODE_HEADER } from "@/lib/tokenpay";

export const dynamic = "force-dynamic";

type CampaignQuotaRow = {
  granted_quota: number;
  consumed_quota: number;
  expires_at: string;
};

type ConsumeCreditPayload = {
  createSession?: boolean;
  playerCount?: number;
  difficulty?: string;
  usedCustomKey?: boolean;
  modelUsed?: string;
  userEmail?: string | null;
  region?: string | null;
};

type AuthenticatedUser = {
  id: string;
  email?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readPayload(request: Request): Promise<ConsumeCreditPayload> {
  try {
    const json: unknown = await request.json();
    if (!isRecord(json)) return {};
    return json as ConsumeCreditPayload;
  } catch {
    return {};
  }
}

async function createGameSessionForConsume(
  user: AuthenticatedUser,
  payload: ConsumeCreditPayload,
  options: { creditAuthorized: boolean; usedCustomKey: boolean }
): Promise<string | null> {
  if (!payload.createSession) return null;

  const playerCount = Number(payload.playerCount);
  if (!Number.isFinite(playerCount) || playerCount <= 0) {
    throw new Error("Invalid player count");
  }

  const nowIso = new Date().toISOString();
  const insertData = {
    user_id: user.id,
    player_count: Math.floor(playerCount),
    difficulty: payload.difficulty || null,
    completed: false,
    used_custom_key: options.usedCustomKey,
    credit_authorized: options.creditAuthorized,
    model_used: payload.modelUsed || null,
    user_email: payload.userEmail ?? user.email ?? null,
    region: payload.region || null,
    last_activity_at: nowIso,
  };

  const { data, error } = await supabaseAdmin
    .from("game_sessions")
    .insert(insertData as never)
    .select("id")
    .single();

  if (error || !data) {
    console.error("[credits/consume] failed to create game session", error);
    throw new Error("Failed to create game session");
  }

  return (data as { id: string }).id;
}

async function consumeCreditAndCreateSession(
  user: AuthenticatedUser,
  payload: ConsumeCreditPayload
): Promise<{ sessionId: string | null; credits: number }> {
  const playerCount = Number(payload.playerCount);
  if (!payload.createSession) {
    throw new Error("Game session is required for project credits");
  }
  if (!Number.isFinite(playerCount) || playerCount <= 0) {
    throw new Error("Invalid player count");
  }

  const { data, error } = await supabaseAdmin.rpc(
    "consume_credit_for_authorized_game_session" as never,
    {
      p_user_id: user.id,
      p_player_count: Math.floor(playerCount),
      p_difficulty: payload.difficulty || null,
      p_model_used: payload.modelUsed || null,
      p_user_email: payload.userEmail ?? user.email ?? null,
      p_region: payload.region || null,
    } as never
  );

  if (error) {
    if (error.message.includes("insufficient_credits")) {
      throw new Error("Insufficient credits");
    }
    console.error("[credits/consume] rpc failed", error);
    throw new Error("Failed to consume credit");
  }

  const rows = data as unknown as Array<{ session_id: string; credits: number }>;
  const row = rows[0];
  if (!row) {
    throw new Error("Failed to consume credit");
  }

  return {
    sessionId: row.session_id,
    credits: row.credits,
  };
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

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await readPayload(request);

  // Demo mode: skip credit consumption entirely
  if (await isDemoModeActiveServer()) {
    const { data } = await supabaseAdmin
      .from("user_credits")
      .select("credits")
      .eq("id", user.id)
      .single();
    const creditsRow = data as { credits: number } | null;
    const sessionId = await createGameSessionForConsume(user, payload, {
      creditAuthorized: false,
      usedCustomKey: Boolean(payload.usedCustomKey),
    });
    return NextResponse.json({
      success: true,
      credits: creditsRow?.credits ?? 0,
      bypassed: true,
      demoMode: true,
      sessionId,
    });
  }

  const headerZenmuxKey = request.headers.get("x-zenmux-api-key")?.trim();
  const headerDashscopeKey = request.headers.get("x-dashscope-api-key")?.trim();
  const headerTokendanceKey = request.headers.get("x-tokendance-api-key")?.trim();
  const tokenPayRequested = request.headers.get(TOKENPAY_MODE_HEADER) === "true";
  const tokenPayConnected = tokenPayRequested
    ? await hasConnectedTokenPay(user.id)
    : false;
  if (tokenPayRequested && !tokenPayConnected) {
    return NextResponse.json(
      {
        error: "TokenPay connection is not available",
        code: "tokenpay_connection_unavailable",
        recoveryAction: "reauthorize_api_key",
      },
      { status: 409 },
    );
  }
  const hasExternalKey = Boolean(
    headerZenmuxKey || headerDashscopeKey || headerTokendanceKey || tokenPayConnected,
  );
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
    const sessionId = await createGameSessionForConsume(user, payload, {
      creditAuthorized: false,
      usedCustomKey: true,
    });
    return NextResponse.json({
      success: true,
      credits: creditsRow?.credits ?? 0,
      bypassed: true,
      usedTemporaryQuota: false,
      campaign: buildCampaignPayload(campaignRow),
      sessionId,
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
        const sessionId = await createGameSessionForConsume(user, payload, {
          creditAuthorized: true,
          usedCustomKey: false,
        });

        return NextResponse.json({
          success: true,
          credits: creditsRow?.credits ?? 0,
          usedTemporaryQuota: true,
          campaign: buildCampaignPayload(updatedCampaignRow),
          sessionId,
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

  try {
    const result = await consumeCreditAndCreateSession(user, payload);
    return NextResponse.json({
      success: true,
      credits: result.credits,
      usedTemporaryQuota: false,
      campaign: buildCampaignPayload(campaignRow),
      sessionId: result.sessionId,
    });
  } catch (error) {
    if (String(error).includes("Insufficient credits")) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          campaign: buildCampaignPayload(campaignRow),
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Failed to consume credit" }, { status: 500 });
  }
}
