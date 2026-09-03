import type { LlmProviderId } from "@/types/game";
import "server-only";

import { withTimeout } from "@/lib/request-timeout";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";

const OBSERVABILITY_WRITE_TIMEOUT_MS = 2_000;

export type GameSessionLifecycleStatus =
  | "starting"
  | "running"
  | "failed"
  | "abandoned"
  | "completed";

export type GameSessionConsumeOutcome = "success" | "replay" | "reject";
export type GameSessionAiOutcome =
  | "success"
  | "http_error"
  | "network_error"
  | "cancelled"
  | "interrupted"
  | "error";

export interface GameSessionCreditEventInput {
  eventId: string;
  sessionId?: string | null;
  userId: string;
  requestId: string;
  errorCode?: string | null;
  outcome: GameSessionConsumeOutcome;
}

export interface GameSessionAiAttemptInput {
  eventId: string;
  sessionId: string;
  userId: string;
  requestId: string;
  attempt: number;
  provider: LlmProviderId;
  promptScope: "gameplay" | "utility";
  mode: "completion" | "batch" | "stream";
  outcome: GameSessionAiOutcome;
  httpStatus?: number | null;
  durationMs: number;
  errorCode?: string | null;
  model: string;
  inputChars: number;
  outputChars: number;
  promptTokens: number;
  completionTokens: number;
}

export interface GameSessionAiAttemptResult {
  eventId: string;
  replayed: boolean;
}

function throwEventWriteError(): never {
  // 不把 Supabase error 或调用参数带到上层，避免意外泄漏结构化事件内容。
  throw new Error("记录游戏会话可观测性事件失败");
}

async function writeGameSessionCreditEvent(input: GameSessionCreditEventInput): Promise<void> {
  ensureAdminClient();

  if (!isConsumeOutcome(input.outcome)) throw new Error("invalid_consume_event");
  if (input.requestId.trim() === "") throw new Error("invalid_consume_request");
  if (input.errorCode && input.outcome !== "reject") throw new Error("invalid_consume_error");
  if (!input.sessionId && input.outcome !== "reject") throw new Error("session_required");
  if (input.sessionId) {
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("game_sessions")
      .select("id")
      .eq("id", input.sessionId)
      .eq("user_id", input.userId)
      .maybeSingle();

    if (sessionError || !session) throw new Error("session_not_found");
  }

  const { error } = await supabaseAdmin.from("game_session_events").insert({
    event_id: input.eventId,
    session_id: input.sessionId,
    user_id: input.userId,
    event_type: "credit_consume",
    lifecycle_status: null,
    request_id: input.requestId,
    outcome: input.outcome,
    error_code: input.errorCode ?? null,
    model: null,
    input_chars: 0,
    output_chars: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
  });

  if (error) throw new Error("event_insert_failed");
}

export async function recordGameSessionCreditEvent(
  input: GameSessionCreditEventInput,
): Promise<void> {
  try {
    await withTimeout(writeGameSessionCreditEvent(input), OBSERVABILITY_WRITE_TIMEOUT_MS);
  } catch {
    throwEventWriteError();
  }
}

async function writeGameSessionAiAttempt(
  input: GameSessionAiAttemptInput,
): Promise<GameSessionAiAttemptResult> {
  ensureAdminClient();

  const { data, error } = await supabaseAdmin.rpc("record_game_session_ai_attempt", {
    p_event_id: input.eventId,
    p_session_id: input.sessionId,
    p_user_id: input.userId,
    p_request_id: input.requestId,
    p_attempt: input.attempt,
    p_provider: input.provider,
    p_prompt_scope: input.promptScope,
    p_mode: input.mode,
    p_outcome: input.outcome,
    p_http_status: input.httpStatus ?? null,
    p_duration_ms: input.durationMs,
    p_error_code: input.errorCode ?? null,
    p_model: input.model,
    p_input_chars: input.inputChars,
    p_output_chars: input.outputChars,
    // 自定义 OpenAI 兼容 Provider 的流式响应常无 usage 统计；RPC 校验拒绝 NULL，归零兜底
    p_prompt_tokens: input.promptTokens ?? 0,
    p_completion_tokens: input.completionTokens ?? 0,
  });

  const result = data?.[0];
  if (error || !result) throw new Error("ai_attempt_write_failed");

  return { eventId: result.event_id, replayed: result.replayed };
}

export async function recordGameSessionAiAttempt(
  input: GameSessionAiAttemptInput,
): Promise<GameSessionAiAttemptResult> {
  try {
    return await withTimeout(
      writeGameSessionAiAttempt(input),
      OBSERVABILITY_WRITE_TIMEOUT_MS,
    );
  } catch {
    throwEventWriteError();
  }
}

function isConsumeOutcome(value: unknown): value is GameSessionConsumeOutcome {
  return value === "success" || value === "replay" || value === "reject";
}
