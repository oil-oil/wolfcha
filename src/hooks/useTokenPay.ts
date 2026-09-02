"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readTokenPayJson,
  TokenPayApiError,
  tokenPayFetch,
  type TokenPayConnection,
} from "@/lib/tokenpay-client";

const CONNECTION_ENDPOINT = "/api/tokenpay/connection";
const BALANCE_ENDPOINT = "/api/tokenpay/balance";
const OAUTH_START_ENDPOINT = "/api/tokenpay/oauth/start";
const PAYMENT_SESSIONS_ENDPOINT = "/api/tokenpay/payment-sessions";
const REDEMPTION_ENDPOINT = "/api/tokenpay/redemption";
const PAYMENT_POLL_INTERVAL_MS = 3000;
const PAYMENT_POLL_MAX_INTERVAL_MS = 30000;
export type { TokenPayConnection, TokenPayConnectionStatus } from "@/lib/tokenpay-client";
export type TokenPayPaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "closed"
  | "refunded";

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
      const payload = await readTokenPayJson<{ balance: TokenPayBalance }>(response);
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
      const payload = await readTokenPayJson<TokenPayConnection>(response);
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
      const payload = await readTokenPayJson<{ authorizationUrl: string }>(response);
      window.location.assign(payload.authorizationUrl);
    } finally {
      setOauthLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const response = await tokenPayFetch(CONNECTION_ENDPOINT, { method: "DELETE" });
    await readTokenPayJson<{ success: true }>(response);
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
      const payload = await readTokenPayJson<{ session: TokenPayPaymentSession }>(response);
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
      const payload = await readTokenPayJson<{ creditsMicro: number }>(response);
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
      const { session } = await readTokenPayJson<{ session: TokenPayPaymentSession }>(response);
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
