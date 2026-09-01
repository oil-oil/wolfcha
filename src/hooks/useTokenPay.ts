"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const CONNECTION_ENDPOINT = "/api/tokenpay/connection";
const BALANCE_ENDPOINT = "/api/tokenpay/balance";
const OAUTH_START_ENDPOINT = "/api/tokenpay/oauth/start";
const PAYMENT_SESSIONS_ENDPOINT = "/api/tokenpay/payment-sessions";
const REDEMPTION_ENDPOINT = "/api/tokenpay/redemption";
const JSON_CONTENT_TYPE = "application/json";
const PAYMENT_POLL_INTERVAL_MS = 3000;
const PAYMENT_POLL_MAX_INTERVAL_MS = 30000;
const SESSION_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;

export type TokenPayConnectionStatus =
  | "connected"
  | "reauthorize_required"
  | "disconnected";
export type TokenPayPaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "closed"
  | "refunded";

export interface TokenPayConnection {
  connected: boolean;
  status: TokenPayConnectionStatus | null;
}

export interface TokenPayBalance {
  creditsMicro: number;
  creditsUsedMicro: number;
  availableMicro: number;
}

export interface TokenPayPaymentSession {
  id: string;
  amount: number;
  status: TokenPayPaymentStatus;
  paymentUrl: string;
  expiredAt: string | number;
  createdAt: string | number;
  paidAt?: string | number;
}

type ApiErrorPayload = {
  error?: unknown;
  message?: unknown;
  recoveryAction?: unknown;
};

class TokenPayApiError extends Error {
  constructor(
    message: string,
    readonly recoveryAction?: string,
  ) {
    super(message);
  }
}

function getApiError(payload: ApiErrorPayload, fallback: string) {
  if (typeof payload.error === "string") return payload.error;
  if (typeof payload.message === "string") return payload.message;
  return fallback;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("request_timeout")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function getAccessToken() {
  const { data: { session } } = await withTimeout(
    supabase.auth.getSession(),
    SESSION_TIMEOUT_MS,
  );
  if (!session?.access_token) {
    throw new Error("unauthorized");
  }
  return session.access_token;
}

async function tokenPayFetch(input: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abortFromCaller();
  else init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", JSON_CONTENT_TYPE);
  }
  try {
    return await fetch(input, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}

async function readJson<T>(response: Response): Promise<T> {
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
    );
  }
  return payload as T;
}

function isPendingSession(session: TokenPayPaymentSession) {
  return session.status === "pending";
}

export function toTokenPayTimestampMs(value: string | number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric)) {
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }
  return typeof value === "string" ? Date.parse(value) : Number.NaN;
}

function isBeforeExpiry(session: TokenPayPaymentSession) {
  const expiresAt = toTokenPayTimestampMs(session.expiredAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function useTokenPay() {
  const [connection, setConnection] = useState<TokenPayConnection | null>(null);
  const [balance, setBalance] = useState<TokenPayBalance | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [connectionRefreshing, setConnectionRefreshing] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceRefreshing, setBalanceRefreshing] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [paymentSession, setPaymentSession] = useState<TokenPayPaymentSession | null>(null);
  const [paymentCreating, setPaymentCreating] = useState(false);
  const [paymentRefreshing, setPaymentRefreshing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [redemptionLoading, setRedemptionLoading] = useState(false);
  const [redemptionError, setRedemptionError] = useState<string | null>(null);
  const hasLoadedConnectionRef = useRef(false);
  const balanceRef = useRef<TokenPayBalance | null>(null);

  const refreshBalance = useCallback(async () => {
    const hasBalance = balanceRef.current !== null;
    setBalanceLoading(!hasBalance);
    setBalanceRefreshing(hasBalance);
    setBalanceError(null);

    try {
      const response = await tokenPayFetch(BALANCE_ENDPOINT);
      const payload = await readJson<{ balance: TokenPayBalance }>(response);
      balanceRef.current = payload.balance;
      setBalance(payload.balance);
      return payload.balance;
    } catch (error) {
      if (
        error instanceof TokenPayApiError &&
        error.recoveryAction === "reauthorize_api_key"
      ) {
        setConnection({ connected: false, status: "reauthorize_required" });
      }
      setBalanceError(error instanceof Error ? error.message : "request_failed");
      return null;
    } finally {
      setBalanceLoading(false);
      setBalanceRefreshing(false);
    }
  }, []);

  const refreshConnection = useCallback(async () => {
    const isInitialLoad = !hasLoadedConnectionRef.current;
    setConnectionLoading(isInitialLoad);
    setConnectionRefreshing(!isInitialLoad);
    setConnectionError(null);

    try {
      const response = await tokenPayFetch(CONNECTION_ENDPOINT);
      const payload = await readJson<TokenPayConnection>(response);
      setConnection(payload);
      hasLoadedConnectionRef.current = true;
      return payload;
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "request_failed");
      return null;
    } finally {
      hasLoadedConnectionRef.current = true;
      setConnectionLoading(false);
      setConnectionRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void refreshConnection().then((nextConnection) => {
      if (active && nextConnection?.connected) {
        void refreshBalance();
      }
    });
    return () => {
      active = false;
    };
  }, [refreshBalance, refreshConnection]);

  const startOAuth = useCallback(async () => {
    setOauthLoading(true);
    try {
      const response = await tokenPayFetch(OAUTH_START_ENDPOINT, { method: "POST" });
      const payload = await readJson<{ authorizationUrl: string }>(response);
      window.location.assign(payload.authorizationUrl);
    } finally {
      setOauthLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const response = await tokenPayFetch(CONNECTION_ENDPOINT, { method: "DELETE" });
    await readJson<{ success: true }>(response);
    const disconnected: TokenPayConnection = { connected: false, status: "disconnected" };
    setConnection(disconnected);
    balanceRef.current = null;
    setBalance(null);
    setBalanceError(null);
    return disconnected;
  }, []);

  const createPaymentSession = useCallback(async (amount: number) => {
    if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
      setPaymentError("invalid_amount");
      return null;
    }

    setPaymentCreating(true);
    setPaymentError(null);
    try {
      const response = await tokenPayFetch(PAYMENT_SESSIONS_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      const payload = await readJson<{ session: TokenPayPaymentSession }>(response);
      setPaymentSession(payload.session);
      return payload.session;
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "request_failed");
      return null;
    } finally {
      setPaymentCreating(false);
    }
  }, []);

  const redeemTokenPayCode = useCallback(async (code: string) => {
    const normalized = code.trim();
    if (!normalized || normalized.length > 256) {
      setRedemptionError("invalid_code");
      return null;
    }
    setRedemptionLoading(true);
    setRedemptionError(null);
    try {
      const response = await tokenPayFetch(REDEMPTION_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ code: normalized }),
      });
      const payload = await readJson<{ creditsMicro: number }>(response);
      void refreshBalance();
      return payload.creditsMicro;
    } catch (error) {
      if (
        error instanceof TokenPayApiError &&
        error.recoveryAction === "reauthorize_api_key"
      ) {
        setConnection({ connected: false, status: "reauthorize_required" });
      }
      setRedemptionError(error instanceof Error ? error.message : "request_failed");
      return null;
    } finally {
      setRedemptionLoading(false);
    }
  }, [refreshBalance]);

  const refreshPaymentSession = useCallback(async (sessionId: string) => {
    setPaymentRefreshing(true);
    setPaymentError(null);
    try {
      const response = await tokenPayFetch(`${PAYMENT_SESSIONS_ENDPOINT}/${encodeURIComponent(sessionId)}`);
      const { session } = await readJson<{ session: TokenPayPaymentSession }>(response);
      setPaymentSession(session);
      if (session.status === "paid") {
        void refreshBalance();
      }
      return session;
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "request_failed");
      return null;
    } finally {
      setPaymentRefreshing(false);
    }
  }, [refreshBalance]);

  useEffect(() => {
    if (!paymentSession || !isPendingSession(paymentSession) || !isBeforeExpiry(paymentSession)) {
      return;
    }

    let active = true;
    let timeoutId: number | undefined;
    let failureCount = 0;

    const schedulePoll = (delay: number) => {
      if (!active) return;
      timeoutId = window.setTimeout(() => void poll(), delay);
    };

    const poll = async () => {
      if (
        !active ||
        document.visibilityState !== "visible" ||
        !isBeforeExpiry(paymentSession)
      ) {
        return;
      }

      const nextSession = await refreshPaymentSession(paymentSession.id);
      if (!active || (nextSession && !isPendingSession(nextSession))) return;

      failureCount = nextSession ? 0 : Math.min(failureCount + 1, 4);
      schedulePoll(
        Math.min(
          PAYMENT_POLL_INTERVAL_MS * 2 ** failureCount,
          PAYMENT_POLL_MAX_INTERVAL_MS,
        ),
      );
    };

    const handleVisibilityChange = () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      if (active && document.visibilityState === "visible") void poll();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedulePoll(PAYMENT_POLL_INTERVAL_MS);

    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [paymentSession, refreshPaymentSession]);

  return {
    connection,
    balance,
    paymentSession,
    connectionLoading,
    connectionRefreshing,
    balanceLoading,
    balanceRefreshing,
    oauthLoading,
    paymentCreating,
    paymentRefreshing,
    redemptionLoading,
    connectionError,
    balanceError,
    paymentError,
    redemptionError,
    refreshConnection,
    refreshBalance,
    startOAuth,
    disconnect,
    createPaymentSession,
    refreshPaymentSession,
    redeemTokenPayCode,
  };
}
