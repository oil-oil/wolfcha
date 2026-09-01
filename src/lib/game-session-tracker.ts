/**
 * 游戏会话追踪器
 *
 * 在关键游戏阶段（天黑/天亮/发言）记录和更新游戏数据。
 * 所有写操作统一走服务端 API，避免依赖客户端数据库权限或策略。
 */

import { supabase } from "@/lib/supabase";
import { fetchDemoModeConfigClient } from "@/lib/demo-config";
import { getGuestId } from "@/lib/demo-mode";
import { fetchWithTimeout, withTimeout } from "@/lib/request-timeout";

export interface GameSessionConfig {
  playerCount: number;
  difficulty?: string;
  usedCustomKey: boolean;
  modelUsed?: string;
  sessionId?: string | null;
}

export type GameSessionStatus =
  | "starting"
  | "running"
  | "failed"
  | "abandoned"
  | "completed";

interface SessionState {
  sessionId: string | null;
  userId: string | null;
  startTime: number;
  config: GameSessionConfig | null;
  roundsPlayed: number;
  lastSyncTime: number;
}

const createInitialState = (): SessionState => ({
  sessionId: null,
  userId: null,
  startTime: 0,
  config: null,
  roundsPlayed: 0,
  lastSyncTime: 0,
});

let state: SessionState = createInitialState();

// 防抖：避免短时间内重复同步
const SYNC_DEBOUNCE_MS = 5000;
const SESSION_READ_TIMEOUT_MS = 10_000;
const SESSION_API_TIMEOUT_MS = 15_000;
const AUTHORIZED_SESSION_ACTOR_ID = "authorized_session";

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
  try {
    const { data, error } = await withTimeout(
      supabase.auth.getSession(),
      SESSION_READ_TIMEOUT_MS,
    );
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
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
    const res = await fetchWithTimeout("/api/game-sessions", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "create", ...payload }),
    }, SESSION_API_TIMEOUT_MS);
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
  lifecycleStatus: GameSessionStatus;
  winner?: "wolf" | "villager" | null;
  completed: boolean;
  roundsPlayed: number;
  durationSeconds: number;
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
    const res = await fetchWithTimeout("/api/game-sessions", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "update", ...payload }),
    }, SESSION_API_TIMEOUT_MS);
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
    if (config.sessionId) {
      state = {
        ...createInitialState(),
        startTime: Date.now(),
        config,
        sessionId: config.sessionId,
        // 该 session 已由 /api/credits/consume 鉴权并创建，先允许追踪继续；
        // 本地用户 ID 随后补齐，不让一次 Auth 网络请求阻塞开局。
        userId: AUTHORIZED_SESSION_ACTOR_ID,
        lastSyncTime: Date.now(),
      };
      const authorizedSessionId = config.sessionId;
      void withTimeout(supabase.auth.getSession(), SESSION_READ_TIMEOUT_MS)
        .then(({ data }) => {
          if (state.sessionId === authorizedSessionId && data.session?.user.id) {
            state.userId = data.session.user.id;
          }
        })
        .catch(() => undefined);
      console.log("[game-session] Reusing authorized session:", config.sessionId);
      return config.sessionId;
    }

    // 仅从本地 session 获取身份；服务端 API 仍负责真正鉴权。
    const sessionResult = await withTimeout(
      supabase.auth.getSession(),
      SESSION_READ_TIMEOUT_MS,
    ).catch(() => null);
    const user = sessionResult?.data.session?.user ?? null;
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

  /** 将已创建的会话标记为运行中。 */
  async markRunning(): Promise<void> {
    await updateSessionStatus("running");
  },

  /** 将角色生成或开局失败的会话标记为失败。 */
  async markFailed(): Promise<void> {
    await updateSessionStatus("failed", null, true);
  },

  /** 用户主动重新开始时，结束上一条会话。 */
  async abandon(): Promise<void> {
    await updateSessionStatus("abandoned", null, true);
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
    if (!state.sessionId) return;

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
    const sessionId = state.sessionId;
    if (!sessionId) return;

    const isGuestSync = state.userId?.startsWith("guest_") ?? false;
    const durationSeconds = Math.round((Date.now() - state.startTime) / 1000);
    const apiUpdate = await updateSessionViaApi({
      sessionId,
      guestId: isGuestSync ? state.userId ?? undefined : undefined,
      lifecycleStatus: "running",
      completed: false,
      roundsPlayed: state.roundsPlayed,
      durationSeconds,
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
    if (completed) {
      await updateSessionStatus("completed", winner, true);
    } else {
      await updateSessionStatus("abandoned", null, true);
    }
  },

  /** 从持久化游戏状态恢复 tracker，保证刷新后继续使用同一 session。 */
  rehydrate(sessionId: string, startedAt: number): void {
    if (!sessionId) return;
    state = {
      ...createInitialState(),
      sessionId,
      userId: AUTHORIZED_SESSION_ACTOR_ID,
      startTime: startedAt,
      lastSyncTime: 0,
    };
    void withTimeout(supabase.auth.getSession(), SESSION_READ_TIMEOUT_MS)
      .then(({ data }) => {
        if (state.sessionId === sessionId && data.session?.user.id) {
          state.userId = data.session.user.id;
        }
      })
      .catch(() => undefined);
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
    lifecycleStatus: "running";
  } | null {
    if (!state.sessionId) return null;
    return {
      sessionId: state.sessionId,
      roundsPlayed: state.roundsPlayed,
      durationSeconds: Math.round((Date.now() - state.startTime) / 1000),
      lifecycleStatus: "running",
    };
  },
};

async function updateSessionStatus(
  lifecycleStatus: GameSessionStatus,
  winner: "wolf" | "villager" | null = null,
  clearAfterUpdate = false,
): Promise<void> {
  const sessionId = state.sessionId;
  if (!sessionId) return;

  const sessionState = state;

  const isGuest = sessionState.userId?.startsWith("guest_") ?? false;
  const durationSeconds = Math.round((Date.now() - sessionState.startTime) / 1000);
  const apiUpdate = await updateSessionViaApi({
    sessionId,
    guestId: isGuest ? sessionState.userId ?? undefined : undefined,
    lifecycleStatus,
    winner,
    completed: lifecycleStatus === "completed",
    roundsPlayed: sessionState.roundsPlayed,
    durationSeconds,
  });

  if (!apiUpdate.ok) {
    // 保留 session，允许调用方在网络失败后重试终态写入。
    console.error("[game-session] Failed to update lifecycle status via API:", {
      sessionId,
      lifecycleStatus,
      apiError: toErrorDebugObject(apiUpdate.error),
      apiStatus: apiUpdate.status,
    });
    throw new Error("Failed to update game session lifecycle");
  }

  if (clearAfterUpdate && state.sessionId === sessionId) {
    state = createInitialState();
  }
  console.log("[game-session] Session lifecycle updated:", sessionId, lifecycleStatus);
}
