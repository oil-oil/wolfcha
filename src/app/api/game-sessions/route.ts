import { NextResponse } from "next/server";
import { isDemoModeActiveServer } from "@/lib/demo-config-server";
import { isGuestUser } from "@/lib/demo-mode";
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
  winner?: "wolf" | "villager" | null;
  completed: boolean;
  roundsPlayed: number;
  durationSeconds: number;
  aiCallsCount: number;
  aiInputChars: number;
  aiOutputChars: number;
  aiPromptTokens: number;
  aiCompletionTokens: number;
}

type GameSessionPayload = CreateSessionPayload | UpdateSessionPayload;

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
    const insertData = {
      user_id: effectiveUserId,
      player_count: payload.playerCount,
      difficulty: payload.difficulty || null,
      completed: false,
      used_custom_key: payload.usedCustomKey,
      model_used: payload.modelUsed || null,
      user_email: payload.userEmail || null,
      region: payload.region || null,
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
    const updateData = {
      winner: payload.winner,
      completed: payload.completed,
      rounds_played: payload.roundsPlayed,
      duration_seconds: payload.durationSeconds,
      ai_calls_count: payload.aiCallsCount,
      ai_input_chars: payload.aiInputChars,
      ai_output_chars: payload.aiOutputChars,
      ai_prompt_tokens: payload.aiPromptTokens,
      ai_completion_tokens: payload.aiCompletionTokens,
      ...(payload.completed ? { ended_at: new Date().toISOString() } : {}),
    };

    const { error: updateError } = await supabaseAdmin
      .from("game_sessions")
      .update(updateData as never)
      .eq("id", payload.sessionId)
      .eq("user_id", effectiveUserId);

    if (updateError) {
      console.error("[game-sessions] Update error:", updateError);
      return NextResponse.json({ error: "Failed to update game session" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
