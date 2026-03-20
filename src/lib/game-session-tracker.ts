/**
 * 游戏会话追踪器
 *
 * 在关键游戏阶段（天黑/天亮/发言）记录和更新游戏数据。
 * 所有写操作统一走服务端 API，避免依赖客户端数据库权限或策略。
 */

import { supabase } from "@/lib/supabase";
import { fetchDemoModeConfigClient } from "@/lib/demo-config";
import { getGuestId } from "@/lib/demo-mode";

export interface GameSessionConfig {
  playerCount: number;
  difficulty?: string;
  usedCustomKey: boolean;
  modelUsed?: string;
}

interface SessionState {
  sessionId: string | null;
  userId: string | null;
  startTime: number;
  config: GameSessionConfig | null;
  roundsPlayed: number;
  aiCallsCount: number;
  aiInputChars: number;
  aiOutputChars: number;
  aiPromptTokens: number;
  aiCompletionTokens: number;
  lastSyncTime: number;
}

const createInitialState = (): SessionState => ({
  sessionId: null,
  userId: null,
  startTime: 0,
  config: null,
  roundsPlayed: 0,
  aiCallsCount: 0,
  aiInputChars: 0,
  aiOutputChars: 0,
  aiPromptTokens: 0,
  aiCompletionTokens: 0,
  lastSyncTime: 0,
});

let state: SessionState = createInitialState();

// 防抖：避免短时间内重复同步
const SYNC_DEBOUNCE_MS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toErrorDebugObject(error: unknown): Record<string, unknown> {
  if (error == null) return { error: null };
  if (!isRecord(error)) return { error };
  const obj = error;
  const ownProps = Object.getOwnPropertyNames(error).reduce<Record<string, unknown>>((acc, k) => {
    acc[k] = obj[k];
    return acc;
  }, {});
  return {
    ...ownProps,
    message: typeof obj.message === "string" ? obj.message : undefined,
    code: obj.code,
    details: obj.details,
    hint: obj.hint,
    name: obj.name,
  };
}

async function parseJsonObject(response: Response): Promise<Record<string, unknown>> {
  const json: unknown = await response.json().catch(() => ({}));
  return isRecord(json) ? json : {};
}

async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

async function createSessionViaApi(payload: {
  playerCount: number;
  difficulty?: string;
  usedCustomKey: boolean;
  modelUsed?: string;
  userEmail?: string | null;
  region?: string | null;
  guestId?: string;
}): Promise<{ ok: true; sessionId: string } | { ok: false; error: unknown; status?: number }> {
  const token = await getAccessToken();
  const demoConfig = await fetchDemoModeConfigClient();
  const isGuest = !token && demoConfig.active;
  if (!token && !isGuest) return { ok: false, error: new Error("Missing access token") };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (payload.guestId) {
    headers["X-Guest-Id"] = payload.guestId;
  }

  try {
    const res = await fetch("/api/game-sessions", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "create", ...payload }),
    });
    const json = await parseJsonObject(res);
    const sessionId = typeof json.sessionId === "string" ? json.sessionId : null;
    if (!res.ok || !sessionId) {
      return { ok: false, status: res.status, error: json };
    }
    return { ok: true, sessionId };
  } catch (error) {
    return { ok: false, error };
  }
}

async function updateSessionViaApi(payload: {
  sessionId: string;
  guestId?: string;
  winner?: "wolf" | "villager" | null;
  completed: boolean;
  roundsPlayed: number;
  durationSeconds: number;
  aiCallsCount: number;
  aiInputChars: number;
  aiOutputChars: number;
  aiPromptTokens: number;
  aiCompletionTokens: number;
}): Promise<{ ok: true } | { ok: false; error: unknown; status?: number }> {
  const token = await getAccessToken();
  const demoConfig = await fetchDemoModeConfigClient();
  const isGuest = !token && demoConfig.active;
  if (!token && !isGuest) return { ok: false, error: new Error("Missing access token") };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (payload.guestId) {
    headers["X-Guest-Id"] = payload.guestId;
  }

  try {
    const res = await fetch("/api/game-sessions", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "update", ...payload }),
    });
    const json = await parseJsonObject(res);
    if (!res.ok || json.success !== true) {
      return { ok: false, status: res.status, error: json };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

export const gameSessionTracker = {
  /**
   * 开始新的游戏会话
   * 在游戏开始时调用，创建数据库记录
   */
  async start(config: GameSessionConfig): Promise<string | null> {
    // 获取当前用户
    const { data: { user } } = await supabase.auth.getUser();
    const demoConfig = await fetchDemoModeConfigClient();
    const demoActive = demoConfig.active;

    let effectiveUserId: string | null = user?.id ?? null;
    if (!effectiveUserId && demoActive) {
      effectiveUserId = getGuestId();
    }
    if (!effectiveUserId) {
      console.log("[game-session] No authenticated user, skipping session tracking");
      return null;
    }

    state = {
      ...createInitialState(),
      startTime: Date.now(),
      config,
      userId: effectiveUserId,
    };

    // 获取用户地区信息（基于浏览器语言和时区）
    const region = typeof navigator !== "undefined" 
      ? `${navigator.language || "unknown"}|${Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown"}`
      : null;

    const isGuestSession = !user;

    const apiCreate = await createSessionViaApi({
      playerCount: config.playerCount,
      difficulty: config.difficulty,
      usedCustomKey: config.usedCustomKey,
      modelUsed: config.modelUsed,
      userEmail: user?.email || null,
      region,
      guestId: isGuestSession ? effectiveUserId : undefined,
    });

    if (apiCreate.ok) {
      const sessionId = apiCreate.sessionId;
      state.sessionId = sessionId;
      state.lastSyncTime = Date.now();
      console.log("[game-session] Session created:", sessionId);
      return sessionId;
    }

    if (isGuestSession) {
      console.error("[game-session] Failed to create guest session via API:", {
        apiError: toErrorDebugObject(apiCreate.error),
        apiStatus: apiCreate.status,
      });
      return null;
    }

    console.error("[game-session] Failed to create session via API:", {
      apiError: toErrorDebugObject(apiCreate.error),
      apiStatus: apiCreate.status,
    });
    return null;
  },

  /**
   * 获取当前会话 ID
   */
  getSessionId(): string | null {
    return state.sessionId;
  },

  /**
   * 记录 AI 调用统计
   */
  addAiCall(stats: {
    inputChars: number;
    outputChars: number;
    promptTokens?: number;
    completionTokens?: number;
  }) {
    state.aiCallsCount += 1;
    state.aiInputChars += stats.inputChars;
    state.aiOutputChars += stats.outputChars;
    if (stats.promptTokens) state.aiPromptTokens += stats.promptTokens;
    if (stats.completionTokens) state.aiCompletionTokens += stats.completionTokens;
  },

  /**
   * 增加回合数并立即同步到数据库
   */
  async incrementRound(): Promise<void> {
    state.roundsPlayed += 1;
    // 回合数变化时立即同步（绕过防抖）
    await this.syncProgressImmediate();
  },

  /**
   * 在关键阶段同步数据到数据库（带防抖）
   * 调用时机：天亮、发言开始等
   */
  async syncProgress(): Promise<void> {
    if (!state.sessionId || !state.userId) return;

    // 防抖检查
    const now = Date.now();
    if (now - state.lastSyncTime < SYNC_DEBOUNCE_MS) {
      return;
    }

    await this.syncProgressImmediate();
  },

  /**
   * 立即同步数据到数据库（无防抖）
   */
  async syncProgressImmediate(): Promise<void> {
    if (!state.sessionId || !state.userId) return;

    const isGuestSync = state.userId?.startsWith("guest_") ?? false;
    const durationSeconds = Math.round((Date.now() - state.startTime) / 1000);
    const apiUpdate = await updateSessionViaApi({
      sessionId: state.sessionId,
      guestId: isGuestSync ? state.userId ?? undefined : undefined,
      completed: false,
      roundsPlayed: state.roundsPlayed,
      durationSeconds,
      aiCallsCount: state.aiCallsCount,
      aiInputChars: state.aiInputChars,
      aiOutputChars: state.aiOutputChars,
      aiPromptTokens: state.aiPromptTokens,
      aiCompletionTokens: state.aiCompletionTokens,
    });

    if (!apiUpdate.ok) {
      console.error("[game-session] Failed to sync progress via API:", {
        apiError: toErrorDebugObject(apiUpdate.error),
        apiStatus: apiUpdate.status,
      });
      return;
    }

    state.lastSyncTime = Date.now();
    console.log("[game-session] Progress synced, round:", state.roundsPlayed);
  },

  /**
   * 结束游戏会话
   * 在游戏结束时调用，更新最终数据
   */
  async end(winner: "wolf" | "villager" | null, completed: boolean): Promise<void> {
    if (!state.sessionId || !state.userId) return;

    const durationSeconds = Math.round((Date.now() - state.startTime) / 1000);

    const isGuestEnd = state.userId?.startsWith("guest_") ?? false;

    const apiUpdate = await updateSessionViaApi({
      sessionId: state.sessionId,
      guestId: isGuestEnd ? state.userId ?? undefined : undefined,
      winner,
      completed,
      roundsPlayed: state.roundsPlayed,
      durationSeconds,
      aiCallsCount: state.aiCallsCount,
      aiInputChars: state.aiInputChars,
      aiOutputChars: state.aiOutputChars,
      aiPromptTokens: state.aiPromptTokens,
      aiCompletionTokens: state.aiCompletionTokens,
    });

    if (!apiUpdate.ok) {
      console.error("[game-session] Failed to end session via API:", {
        apiError: toErrorDebugObject(apiUpdate.error),
        apiStatus: apiUpdate.status,
      });
      return;
    }

    console.log("[game-session] Session ended:", state.sessionId, { winner, completed, durationSeconds });
  },

  /**
   * 重置追踪器状态
   */
  reset() {
    state = createInitialState();
  },

  /**
   * 获取当前统计摘要（用于 sendBeacon 等场景）
   */
  getSummary(): {
    sessionId: string;
    roundsPlayed: number;
    durationSeconds: number;
    aiCallsCount: number;
    aiInputChars: number;
    aiOutputChars: number;
    aiPromptTokens: number;
    aiCompletionTokens: number;
  } | null {
    if (!state.sessionId) return null;
    return {
      sessionId: state.sessionId,
      roundsPlayed: state.roundsPlayed,
      durationSeconds: Math.round((Date.now() - state.startTime) / 1000),
      aiCallsCount: state.aiCallsCount,
      aiInputChars: state.aiInputChars,
      aiOutputChars: state.aiOutputChars,
      aiPromptTokens: state.aiPromptTokens,
      aiCompletionTokens: state.aiCompletionTokens,
    };
  },
};
