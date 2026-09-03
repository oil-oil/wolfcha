import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
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
import { recordGameSessionCreditEvent } from "@/lib/server-game-observability";

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

type StartRequestSource = "demo" | "external" | "spring_quota" | "project_credit";

type ExistingGameStart = {
  id: string;
  start_request_id: string;
  start_request_fingerprint: string;
  start_request_source: StartRequestSource;
  lifecycle_status: "starting" | "running" | "failed" | "abandoned" | "completed";
  completed: boolean;
};

const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class IdempotencyConflictError extends Error {
  constructor() {
    super("idempotency_conflict");
    this.name = "IdempotencyConflictError";
  }
}

class TerminalGameStartError extends Error {
  constructor() {
    super("terminal_game_start");
    this.name = "TerminalGameStartError";
  }
}

type ConsumeEventOutcome = "success" | "replay" | "reject";

async function recordConsumeEvent(
  userId: string,
  sessionId: string | null | undefined,
  requestId: string,
  outcome: ConsumeEventOutcome,
  errorCode?: string,
): Promise<void> {
  try {
    await recordGameSessionCreditEvent({
      eventId: randomUUID(),
      sessionId,
      userId,
      requestId,
      outcome,
      errorCode,
    });
  } catch {
    // 可观测性写入不能改变扣费结果，也不能把底层错误内容返回给客户端。
    console.error("[credits/consume] failed to record structured event");
  }
}

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

function buildStartRequestFingerprint(
  source: StartRequestSource,
  payload: ConsumeCreditPayload,
): string {
  const normalized = JSON.stringify({
    version: 1,
    source,
    playerCount: Math.floor(Number(payload.playerCount)),
    difficulty: payload.difficulty?.trim() || null,
    modelUsed: payload.modelUsed?.trim() || null,
  });
  return createHash("sha256").update(normalized).digest("hex");
}

async function readCurrentCredits(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("user_credits")
    .select("credits")
    .eq("id", userId)
    .single();
  if (error || !data) throw new Error("Failed to read credits");
  return (data as { credits: number }).credits;
}

async function findExistingGameStart(
  userId: string,
  requestId: string,
): Promise<ExistingGameStart | null> {
  const { data, error } = await supabaseAdmin
    .from("game_sessions")
    .select("id, start_request_id, start_request_fingerprint, start_request_source, lifecycle_status, completed")
    .eq("user_id", userId)
    .eq("start_request_id", requestId)
    .maybeSingle();
  if (error) throw new Error("Failed to read game start request");
  return (data as ExistingGameStart | null) ?? null;
}

function assertMatchingGameStart(
  existing: ExistingGameStart,
  payload: ConsumeCreditPayload,
) {
  const expected = buildStartRequestFingerprint(existing.start_request_source, payload);
  if (existing.start_request_fingerprint !== expected) {
    throw new IdempotencyConflictError();
  }
}

async function buildExistingGameStartResponse(
  user: AuthenticatedUser,
  payload: ConsumeCreditPayload,
  existing: ExistingGameStart,
) {
  assertMatchingGameStart(existing, payload);
  if (existing.completed || existing.lifecycle_status === "completed" || existing.lifecycle_status === "abandoned") {
    throw new TerminalGameStartError();
  }
  if (existing.lifecycle_status === "failed") {
    const nowIso = new Date().toISOString();
    const { data: reactivated, error } = await supabaseAdmin
      .from("game_sessions")
      .update({
        lifecycle_status: "starting",
        completed: false,
        ended_at: null,
        last_activity_at: nowIso,
      } as never)
      .eq("id", existing.id)
      .eq("user_id", user.id)
      .eq("lifecycle_status", "failed")
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Failed to reactivate game start request");
    if (!reactivated) throw new TerminalGameStartError();
  }
  const credits = await readCurrentCredits(user.id);
  await recordConsumeEvent(user.id, existing.id, existing.start_request_id, "replay");
  return NextResponse.json({
    success: true,
    credits,
    bypassed: existing.start_request_source === "demo" || existing.start_request_source === "external",
    usedTemporaryQuota: existing.start_request_source === "spring_quota",
    sessionId: existing.id,
    idempotentReplay: true,
  });
}

async function buildIdempotencyConflictResponse(
  user: AuthenticatedUser,
  payload: ConsumeCreditPayload,
  requestId: string,
) {
  let existing: ExistingGameStart | null = null;
  try {
    existing = await findExistingGameStart(user.id, requestId);
    if (existing) {
      try {
        return await buildExistingGameStartResponse(user, payload, existing);
      } catch (error) {
        if (!(error instanceof IdempotencyConflictError)) throw error;
      }
    }
  } catch (error) {
    if (error instanceof TerminalGameStartError) {
      await recordConsumeEvent(user.id, existing?.id, requestId, "reject", "game_start_request_ended");
      return NextResponse.json(
        { error: "This game start request has already ended", code: "game_start_request_ended" },
        { status: 409 },
      );
    }
    console.error("[credits/consume] failed to recover idempotency conflict", error);
    return NextResponse.json(
      { error: "Failed to recover game start request" },
      { status: 500 },
    );
  }

  await recordConsumeEvent(user.id, existing?.id, requestId, "reject", "idempotency_conflict");
  return NextResponse.json(
    { error: "Idempotency key conflicts with another game start", code: "idempotency_conflict" },
    { status: 409 },
  );
}

async function createGameSessionForConsume(
  user: AuthenticatedUser,
  payload: ConsumeCreditPayload,
  options: {
    creditAuthorized: boolean;
    usedCustomKey: boolean;
    requestId: string;
    requestFingerprint: string;
    requestSource: StartRequestSource;
  }
): Promise<{ sessionId: string | null; replayed: boolean; source: StartRequestSource }> {
  if (!payload.createSession) {
    return { sessionId: null, replayed: false, source: options.requestSource };
  }

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
    start_request_id: options.requestId,
    start_request_fingerprint: options.requestFingerprint,
    start_request_source: options.requestSource,
  };

  const { data, error } = await supabaseAdmin
    .from("game_sessions")
    .insert(insertData as never)
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      const existing = await findExistingGameStart(user.id, options.requestId);
      if (existing) {
        assertMatchingGameStart(existing, payload);
        return {
          sessionId: existing.id,
          replayed: true,
          source: existing.start_request_source,
        };
      }
    }
    console.error("[credits/consume] failed to create game session", error);
    throw new Error("Failed to create game session");
  }

  return {
    sessionId: (data as { id: string }).id,
    replayed: false,
    source: options.requestSource,
  };
}

async function consumeCreditAndCreateSession(
  user: AuthenticatedUser,
  payload: ConsumeCreditPayload,
  requestId: string,
  requestFingerprint: string,
): Promise<{ sessionId: string | null; credits: number; replayed: boolean }> {
  const playerCount = Number(payload.playerCount);
  if (!payload.createSession) {
    throw new Error("Game session is required for project credits");
  }
  if (!Number.isFinite(playerCount) || playerCount <= 0) {
    throw new Error("Invalid player count");
  }

  const { data, error } = await supabaseAdmin.rpc(
    "consume_credit_for_authorized_game_session_v2" as never,
    {
      p_user_id: user.id,
      p_player_count: Math.floor(playerCount),
      p_difficulty: payload.difficulty || null,
      p_model_used: payload.modelUsed || null,
      p_user_email: payload.userEmail ?? user.email ?? null,
      p_region: payload.region || null,
      p_start_request_id: requestId,
      p_start_request_fingerprint: requestFingerprint,
    } as never
  );

  if (error) {
    if (error.message.includes("insufficient_credits")) {
      throw new Error("Insufficient credits");
    }
    if (error.message.includes("idempotency_conflict")) {
      throw new IdempotencyConflictError();
    }
    console.error("[credits/consume] rpc failed", error);
    throw new Error("Failed to consume credit");
  }

  const rows = data as unknown as Array<{
    session_id: string;
    credits: number;
    replayed: boolean;
  }>;
  const row = rows[0];
  if (!row) {
    throw new Error("Failed to consume credit");
  }

  return {
    sessionId: row.session_id,
    credits: row.credits,
    replayed: row.replayed === true,
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
  if (payload.createSession !== true) {
    return NextResponse.json(
      { error: "Game session is required", code: "game_session_required" },
      { status: 400 },
    );
  }

  const startRequestId = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim() || "";
  if (!startRequestId) {
    return NextResponse.json(
      {
        error: "Please refresh the page before starting a game",
        code: "idempotency_key_required",
      },
      { status: 428 },
    );
  }
  if (!UUID_PATTERN.test(startRequestId)) {
    return NextResponse.json(
      { error: "Invalid idempotency key", code: "invalid_idempotency_key" },
      { status: 400 },
    );
  }

  try {
    const existing = await findExistingGameStart(user.id, startRequestId);
    if (existing) {
      return await buildExistingGameStartResponse(user, payload, existing);
    }
  } catch (error) {
    if (error instanceof TerminalGameStartError) {
      await recordConsumeEvent(user.id, null, startRequestId, "reject", "game_start_request_ended");
      return NextResponse.json(
        {
          error: "This game start request has already ended",
          code: "game_start_request_ended",
        },
        { status: 409 },
      );
    }
    if (error instanceof IdempotencyConflictError) {
      await recordConsumeEvent(user.id, null, startRequestId, "reject", "idempotency_conflict");
      return NextResponse.json(
        { error: "Idempotency key conflicts with another game start", code: "idempotency_conflict" },
        { status: 409 },
      );
    }
    console.error("[credits/consume] failed to recover game start request", error);
    await recordConsumeEvent(user.id, null, startRequestId, "reject", "request_lookup_failed");
    return NextResponse.json({ error: "Failed to recover game start request" }, { status: 500 });
  }

  // Demo mode: skip credit consumption entirely
  if (await isDemoModeActiveServer()) {
    const { data } = await supabaseAdmin
      .from("user_credits")
      .select("credits")
      .eq("id", user.id)
      .single();
    const creditsRow = data as { credits: number } | null;
    const requestSource: StartRequestSource = "demo";
    let session: Awaited<ReturnType<typeof createGameSessionForConsume>>;
    try {
      session = await createGameSessionForConsume(user, payload, {
        creditAuthorized: false,
        usedCustomKey: Boolean(payload.usedCustomKey),
        requestId: startRequestId,
        requestFingerprint: buildStartRequestFingerprint(requestSource, payload),
        requestSource,
      });
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        return buildIdempotencyConflictResponse(user, payload, startRequestId);
      }
      console.error("[credits/consume] demo session creation failed", error);
      await recordConsumeEvent(user.id, null, startRequestId, "reject", "session_create_failed");
      return NextResponse.json({ error: "Failed to create game session" }, { status: 500 });
    }
    await recordConsumeEvent(user.id, session.sessionId, startRequestId, session.replayed ? "replay" : "success");
    return NextResponse.json({
      success: true,
      credits: creditsRow?.credits ?? 0,
      bypassed: session.source === "demo" || session.source === "external",
      demoMode: session.source === "demo",
      usedTemporaryQuota: session.source === "spring_quota",
      sessionId: session.sessionId,
      idempotentReplay: session.replayed,
    });
  }

  const headerZenmuxKey = request.headers.get("x-zenmux-api-key")?.trim();
  const headerDashscopeKey = request.headers.get("x-dashscope-api-key")?.trim();
  const headerTokendanceKey = request.headers.get("x-tokendance-api-key")?.trim();
  // 自定义 OpenAI 兼容 Provider 的凭据同样构成"自带 Key"路径（免扣项目额度）
  const headerCustomBaseUrl = request.headers.get("x-custom-base-url")?.trim();
  const headerCustomApiKey = request.headers.get("x-custom-api-key")?.trim();
  const tokenPayRequested = request.headers.get(TOKENPAY_MODE_HEADER) === "true";
  let tokenPayConnected = false;
  if (tokenPayRequested) {
    try {
      tokenPayConnected = await hasConnectedTokenPay(user.id);
    } catch {
      await recordConsumeEvent(user.id, null, startRequestId, "reject", "tokenpay_lookup_failed");
      return NextResponse.json(
        {
          error: "TokenPay connection is temporarily unavailable",
          code: "tokenpay_connection_unavailable",
        },
        { status: 503 },
      );
    }
  }
  if (tokenPayRequested && !tokenPayConnected) {
    await recordConsumeEvent(user.id, null, startRequestId, "reject", "tokenpay_connection_unavailable");
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
    headerZenmuxKey ||
    headerDashscopeKey ||
    headerTokendanceKey ||
    tokenPayConnected ||
    (headerCustomBaseUrl && headerCustomApiKey),
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

    if (campaignError) {
      console.error("[credits/consume] campaign quota read failed");
      await recordConsumeEvent(user.id, null, startRequestId, "reject", "campaign_quota_unavailable");
      return NextResponse.json(
        { error: "Campaign quota is temporarily unavailable", code: "campaign_quota_unavailable" },
        { status: 503 },
      );
    }
    if (campaignData) {
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
    const requestSource: StartRequestSource = "external";
    let session: Awaited<ReturnType<typeof createGameSessionForConsume>>;
    try {
      session = await createGameSessionForConsume(user, payload, {
        creditAuthorized: false,
        usedCustomKey: true,
        requestId: startRequestId,
        requestFingerprint: buildStartRequestFingerprint(requestSource, payload),
        requestSource,
      });
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        return buildIdempotencyConflictResponse(user, payload, startRequestId);
      }
      console.error("[credits/consume] external session creation failed", error);
      await recordConsumeEvent(user.id, null, startRequestId, "reject", "session_create_failed");
      return NextResponse.json({ error: "Failed to create game session" }, { status: 500 });
    }
    await recordConsumeEvent(user.id, session.sessionId, startRequestId, session.replayed ? "replay" : "success");
    return NextResponse.json({
      success: true,
      credits: creditsRow?.credits ?? 0,
      bypassed: session.source === "demo" || session.source === "external",
      usedTemporaryQuota: session.source === "spring_quota",
      campaign: buildCampaignPayload(campaignRow),
      sessionId: session.sessionId,
      idempotentReplay: session.replayed,
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
      const { data: retriedCampaignData, error: retryCampaignError } = await supabaseAdmin
        .from("campaign_daily_quota")
        .select("granted_quota, consumed_quota, expires_at")
        .eq("user_id", user.id)
        .eq("campaign_code", SPRING_CAMPAIGN_CODE)
        .eq("quota_date", quotaDate)
        .maybeSingle();
      if (retryCampaignError || !retriedCampaignData) {
        console.error("[credits/consume] campaign quota conflict recovery failed");
        await recordConsumeEvent(user.id, null, startRequestId, "reject", "campaign_quota_unavailable");
        return NextResponse.json(
          { error: "Campaign quota is temporarily unavailable", code: "campaign_quota_unavailable" },
          { status: 503 },
        );
      }
      campaignRow = retriedCampaignData as CampaignQuotaRow;
    } else {
      console.error("[credits/consume] campaign quota claim failed");
      await recordConsumeEvent(user.id, null, startRequestId, "reject", "campaign_quota_unavailable");
      return NextResponse.json(
        { error: "Campaign quota is temporarily unavailable", code: "campaign_quota_unavailable" },
        { status: 503 },
      );
    }
  }

  if (springCampaignActive && quotaDate && campaignRow) {
    const requestSource: StartRequestSource = "spring_quota";
    const { data, error } = await supabaseAdmin.rpc(
      "consume_spring_quota_for_authorized_game_session_v2" as never,
      {
        p_user_id: user.id,
        p_campaign_code: SPRING_CAMPAIGN_CODE,
        p_quota_date: quotaDate,
        p_player_count: Math.floor(Number(payload.playerCount)),
        p_difficulty: payload.difficulty || null,
        p_model_used: payload.modelUsed || null,
        p_user_email: payload.userEmail ?? user.email ?? null,
        p_region: payload.region || null,
        p_start_request_id: startRequestId,
        p_start_request_fingerprint: buildStartRequestFingerprint(requestSource, payload),
      } as never,
    );

    if (!error) {
      const row = (data as unknown as Array<{
        session_id: string;
        granted_quota: number;
        consumed_quota: number;
        expires_at: string;
        replayed: boolean;
      }>)[0];
      if (!row) {
        await recordConsumeEvent(user.id, null, startRequestId, "reject", "campaign_quota_unavailable");
        return NextResponse.json(
          { error: "Failed to consume temporary quota", code: "campaign_quota_unavailable" },
          { status: 503 },
        );
      }
      const updatedCampaignRow: CampaignQuotaRow = {
        granted_quota: row.granted_quota,
        consumed_quota: row.consumed_quota,
        expires_at: row.expires_at,
      };
      const replayed = row.replayed === true;
      let currentCredits: number;
      try {
        currentCredits = await readCurrentCredits(user.id);
      } catch {
        await recordConsumeEvent(user.id, row.session_id, startRequestId, "reject", "credits_unavailable");
        return NextResponse.json(
          { error: "Failed to read credits", code: "credits_unavailable" },
          { status: 503 },
        );
      }
      await recordConsumeEvent(user.id, row.session_id, startRequestId, replayed ? "replay" : "success");
      return NextResponse.json({
        success: true,
        credits: currentCredits,
        usedTemporaryQuota: true,
        campaign: buildCampaignPayload(updatedCampaignRow),
        sessionId: row.session_id,
        idempotentReplay: replayed,
      });
    }

    if (error.message.includes("idempotency_conflict")) {
      return buildIdempotencyConflictResponse(user, payload, startRequestId);
    }

    const quotaUnavailable =
      error.message.includes("insufficient_spring_quota") ||
      error.message.includes("spring_quota_expired");
    if (!quotaUnavailable) {
      console.error("[credits/consume] spring quota rpc failed", error);
      await recordConsumeEvent(user.id, null, startRequestId, "reject", "campaign_quota_unavailable");
      return NextResponse.json(
        { error: "Campaign quota is temporarily unavailable", code: "campaign_quota_unavailable" },
        { status: 503 },
      );
    }
  }

  try {
    const requestSource: StartRequestSource = "project_credit";
    const result = await consumeCreditAndCreateSession(
      user,
      payload,
      startRequestId,
      buildStartRequestFingerprint(requestSource, payload),
    );
    await recordConsumeEvent(user.id, result.sessionId, startRequestId, result.replayed ? "replay" : "success");
    return NextResponse.json({
      success: true,
      credits: result.credits,
      usedTemporaryQuota: false,
      campaign: buildCampaignPayload(campaignRow),
      sessionId: result.sessionId,
      idempotentReplay: result.replayed,
    });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return buildIdempotencyConflictResponse(user, payload, startRequestId);
    }
    if (String(error).includes("Insufficient credits")) {
      await recordConsumeEvent(user.id, null, startRequestId, "reject", "insufficient_credits");
      return NextResponse.json(
        {
          error: "Insufficient credits",
          campaign: buildCampaignPayload(campaignRow),
        },
        { status: 400 }
      );
    }

    await recordConsumeEvent(user.id, null, startRequestId, "reject", "credit_consume_failed");
    return NextResponse.json({ error: "Failed to consume credit" }, { status: 500 });
  }
}
