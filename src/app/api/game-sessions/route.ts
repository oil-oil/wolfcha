import { NextResponse } from "next/server";
import { supabaseAdmin, ensureAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

interface CreateSessionPayload {
  action: "create";
  playerCount: number;
  difficulty?: string;
  usedCustomKey: boolean;
  modelUsed?: string;
  userAgent?: string;
}

interface UpdateSessionPayload {
  action: "update";
  sessionId: string;
  accessToken?: string; // 用于 sendBeacon 场景（无法发送 header）
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

async function authenticateUser(request: Request, bodyToken?: string) {
  // 优先使用 header 中的 token，其次使用 body 中的 token（sendBeacon 场景）
  const authHeader = request.headers.get("Authorization");
  const token = authHeader ? authHeader.replace("Bearer ", "") : bodyToken;
  if (!token) return null;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
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

  let payload: GameSessionPayload;
  try {
    payload = (await request.json()) as GameSessionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // 对于 update 操作，支持从 body 中获取 token（sendBeacon 场景）
  const bodyToken = payload.action === "update" ? payload.accessToken : undefined;
  const user = await authenticateUser(request, bodyToken);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 创建新会话
  if (payload.action === "create") {
    const insertData = {
      user_id: user.id,
      player_count: payload.playerCount,
      difficulty: payload.difficulty || null,
      completed: false,
      used_custom_key: payload.usedCustomKey,
      model_used: payload.modelUsed || null,
      user_agent: payload.userAgent || null,
    };

    const { data, error: insertError } = await supabaseAdmin
      .from("game_sessions")
      .insert(insertData as never)
      .select("id")
      .single();

    if (insertError || !data) {
      console.error("[game-sessions] Insert error:", insertError);
      return NextResponse.json({ error: "Failed to create game session" }, { status: 500 });
    }

    return NextResponse.json({ success: true, sessionId: (data as { id: string }).id });
  }

  // 更新现有会话
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
      ended_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseAdmin
      .from("game_sessions")
      .update(updateData as never)
      .eq("id", payload.sessionId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[game-sessions] Update error:", updateError);
      return NextResponse.json({ error: "Failed to update game session" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
