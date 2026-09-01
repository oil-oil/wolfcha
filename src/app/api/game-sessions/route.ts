import { NextResponse } from "next/server";
import { isDemoModeActiveServer } from "@/lib/demo-config-server";
import { isGuestUser } from "@/lib/demo-mode";
import {
  type GameSessionLifecycleStatus,
} from "@/lib/server-game-observability";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

interface CreateSessionPayload {
  action: "create";
  playerCount: number;
  difficulty?: string;
  usedCustomKey: boolean;
  modelUsed?: string;
  userEmail?: string | null;
  region?: string | null;
}

interface UpdateSessionPayload {
  action: "update";
  sessionId: string;
  accessToken?: string;
  lifecycleStatus: GameSessionLifecycleStatus;
  winner?: "wolf" | "villager" | null;
  completed: boolean;
  roundsPlayed: number;
  durationSeconds: number;
}

type GameSessionPayload = CreateSessionPayload | UpdateSessionPayload;

const LIFECYCLE_STATUSES: GameSessionLifecycleStatus[] = [
  "starting",
  "running",
  "failed",
  "abandoned",
  "completed",
];

function isLifecycleStatus(value: unknown): value is GameSessionLifecycleStatus {
  return LIFECYCLE_STATUSES.includes(value as GameSessionLifecycleStatus);
}

function canTransitionLifecycle(
  current: GameSessionLifecycleStatus,
  next: GameSessionLifecycleStatus,
): boolean {
  if (current === next) return true;
  if (current === "starting") return next === "running" || next === "failed" || next === "abandoned";
  if (current === "running") return next === "failed" || next === "abandoned" || next === "completed";
  return false;
}

function isGuestUserIdSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const message = "message" in error && typeof error.message === "string"
    ? error.message
    : "";

  return (
    message.includes("invalid input syntax for type uuid")
    || message.includes("uuid")
  );
}

async function authenticateUser(request: Request, bodyToken?: string) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader ? authHeader.replace("Bearer ", "") : bodyToken;
  if (!token) return null;

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function POST(request: Request) {
  try {
    ensureAdminClient();
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Server misconfiguration: missing SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  let payload: GameSessionPayload;
  try {
    payload = (await request.json()) as GameSessionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const bodyToken = payload.action === "update" ? payload.accessToken : undefined;
  const user = await authenticateUser(request, bodyToken);

  const guestId = request.headers.get("x-guest-id") || request.headers.get("X-Guest-Id");
  const demoActive = await isDemoModeActiveServer();
  const isValidGuest = demoActive && guestId && isGuestUser(guestId);

  if (!user && !isValidGuest) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = user?.id ?? guestId!;

  if (payload.action === "create") {
    const nowIso = new Date().toISOString();
    const insertData = {
      user_id: effectiveUserId,
      player_count: payload.playerCount,
      difficulty: payload.difficulty || null,
      completed: false,
      lifecycle_status: "starting",
      started_at: nowIso,
      used_custom_key: payload.usedCustomKey,
      credit_authorized: false,
      model_used: payload.modelUsed || null,
      user_email: payload.userEmail || null,
      region: payload.region || null,
      last_activity_at: nowIso,
    };

    const { data, error: insertError } = await supabaseAdmin
      .from("game_sessions")
      .insert(insertData as never)
      .select("id")
      .single();

    if (insertError || !data) {
      console.error("[game-sessions] Insert error:", insertError);
      if (!user && isGuestUserIdSchemaError(insertError)) {
        return NextResponse.json(
          {
            error: "Guest session tracking is unavailable",
            reason: "guest_user_id_not_supported",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: "Failed to create game session" }, { status: 500 });
    }

    return NextResponse.json({ success: true, sessionId: (data as { id: string }).id });
  }

  if (payload.action === "update") {
    if (!isLifecycleStatus(payload.lifecycleStatus)) {
      return NextResponse.json({ error: "Invalid lifecycle status" }, { status: 400 });
    }
    const nowIso = new Date().toISOString();
    const isCompleted = payload.lifecycleStatus === "completed";
    const isTerminal = ["failed", "abandoned", "completed"].includes(payload.lifecycleStatus);
    const { data: currentSession, error: currentSessionError } = await supabaseAdmin
      .from("game_sessions")
      .select("lifecycle_status")
      .eq("id", payload.sessionId)
      .eq("user_id", effectiveUserId)
      .maybeSingle();

    if (currentSessionError) {
      console.error("[game-sessions] Read error:", currentSessionError);
      return NextResponse.json({ error: "Failed to read game session" }, { status: 500 });
    }
    if (!currentSession) {
      return NextResponse.json({ error: "Game session not found" }, { status: 404 });
    }
    const currentStatus = (currentSession as {
      lifecycle_status: GameSessionLifecycleStatus;
    }).lifecycle_status;
    if (!canTransitionLifecycle(currentStatus, payload.lifecycleStatus)) {
      return NextResponse.json(
        { error: "Invalid lifecycle transition" },
        { status: 409 },
      );
    }

    const updateData = {
      winner: isCompleted ? payload.winner ?? null : null,
      completed: isCompleted,
      lifecycle_status: payload.lifecycleStatus,
      rounds_played: payload.roundsPlayed,
      duration_seconds: payload.durationSeconds,
      last_activity_at: nowIso,
      ended_at: isTerminal ? nowIso : null,
    };

    const { data: updatedSession, error: updateError } = await supabaseAdmin
      .from("game_sessions")
      .update(updateData as never)
      .eq("id", payload.sessionId)
      .eq("user_id", effectiveUserId)
      .eq("lifecycle_status", currentStatus)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("[game-sessions] Update error:", updateError);
      return NextResponse.json({ error: "Failed to update game session" }, { status: 500 });
    }
    if (!updatedSession) {
      return NextResponse.json(
        { error: "Game session changed concurrently" },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
