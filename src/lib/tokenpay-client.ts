"use client";

import { supabase } from "@/lib/supabase";
import { fetchWithTimeout, withTimeout } from "@/lib/request-timeout";

const JSON_CONTENT_TYPE = "application/json";
const SESSION_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;
const CONNECTION_RETRY_DELAYS_MS = [0, 300, 1_000] as const;

export type TokenPayConnectionStatus =
  | "connected"
  | "reauthorize_required"
  | "disconnected";

export interface TokenPayConnection {
  connected: boolean;
  status: TokenPayConnectionStatus | null;
}

type ApiErrorPayload = {
  error?: unknown;
  message?: unknown;
  recoveryAction?: unknown;
};

export class TokenPayApiError extends Error {
  constructor(
    message: string,
    readonly recoveryAction?: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "TokenPayApiError";
  }
}

function getApiError(payload: ApiErrorPayload, fallback: string) {
  if (typeof payload.error === "string") return payload.error;
  if (typeof payload.message === "string") return payload.message;
  return fallback;
}

function shouldRetryStatus(status: number) {
  return status === 401 || status === 408 || status === 429 || status >= 500;
}

async function getAccessToken(expectedUserId?: string) {
  const { data: { session }, error } = await withTimeout(
    supabase.auth.getSession(),
    SESSION_TIMEOUT_MS,
  );
  if (error || !session?.access_token) {
    throw new TokenPayApiError("unauthorized", undefined, 401, true);
  }
  if (expectedUserId && session.user.id !== expectedUserId) {
    throw new TokenPayApiError("auth_session_changed", undefined, 409, false);
  }
  return session.access_token;
}

export async function tokenPayFetch(
  input: string,
  init: RequestInit = {},
  expectedUserId?: string,
) {
  const token = await getAccessToken(expectedUserId);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", JSON_CONTENT_TYPE);
  }
  return fetchWithTimeout(input, { ...init, headers }, REQUEST_TIMEOUT_MS);
}

export async function readTokenPayJson<T>(response: Response): Promise<T> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorPayload = (payload ?? {}) as ApiErrorPayload;
    throw new TokenPayApiError(
      getApiError(errorPayload, `request_failed_${response.status}`),
      typeof errorPayload.recoveryAction === "string"
        ? errorPayload.recoveryAction
        : undefined,
      response.status,
      shouldRetryStatus(response.status),
    );
  }
  return payload as T;
}

function isTokenPayConnection(value: unknown): value is TokenPayConnection {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.connected === "boolean" && (
    record.status === null ||
    record.status === "connected" ||
    record.status === "reauthorize_required" ||
    record.status === "disconnected"
  );
}

export async function loadTokenPayConnection(
  expectedUserId: string,
  signal?: AbortSignal,
): Promise<TokenPayConnection> {
  const response = await tokenPayFetch(
    "/api/tokenpay/connection",
    { cache: "no-store", signal },
    expectedUserId,
  );
  const payload = await readTokenPayJson<unknown>(response);
  if (!isTokenPayConnection(payload)) {
    throw new TokenPayApiError(
      "invalid_tokenpay_connection_response",
      undefined,
      502,
      true,
    );
  }
  return payload;
}

function waitForRetry(delayMs: number, signal?: AbortSignal) {
  if (delayMs <= 0) return Promise.resolve();
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  }
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, delayMs);
    const abort = () => {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function loadTokenPayConnectionWithRetry(
  expectedUserId: string,
  signal?: AbortSignal,
): Promise<TokenPayConnection> {
  let lastError: unknown;
  for (const delayMs of CONNECTION_RETRY_DELAYS_MS) {
    await waitForRetry(delayMs, signal);
    try {
      return await loadTokenPayConnection(expectedUserId, signal);
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
      if (error instanceof TokenPayApiError && !error.retryable) throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new TokenPayApiError("tokenpay_connection_sync_failed");
}
