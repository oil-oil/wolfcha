"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  fetchDemoModeConfigClient,
  getDefaultDemoModeConfigSnapshot,
  type DemoModePublicConfigSnapshot,
} from "@/lib/demo-config";
import {
  getDashscopeApiKey,
  getTokendanceApiKey,
  getTokendanceBaseUrl,
  getZenmuxApiKey,
  getModelSource,
  setTokenPayConnected,
} from "@/lib/api-keys";
import { clearGuestId, getGuestId, readGuestIdFromStorage } from "@/lib/demo-mode";
import { supabase } from "@/lib/supabase";
import {
  DAILY_BONUS_ENABLED,
  REFERRAL_BONUS_ENABLED,
  SPRING_CAMPAIGN_ENABLED,
} from "@/lib/welfare-config";
import { readReferralFromStorage, removeReferralFromStorage } from "@/lib/referral";
import type { SpringCampaignSnapshot } from "@/lib/spring-campaign";
import { fetchWithTimeout } from "@/lib/request-timeout";

const REFERRAL_ENDPOINT = "/api/credits/referral";
const REDEEM_ENDPOINT = "/api/credits/redeem";
const SPRING_CAMPAIGN_ENDPOINT = "/api/credits/spring-login-bonus";
const JSON_CONTENT_TYPE = "application/json";
const DEMO_CONFIG_REFRESH_INTERVAL_MS = 60_000;
const CONSUME_CREDIT_TIMEOUT_MS = 15_000;
const AUTH_EVENT = {
  INITIAL_SESSION: "INITIAL_SESSION",
  PASSWORD_RECOVERY: "PASSWORD_RECOVERY",
  SIGNED_IN: "SIGNED_IN",
  SIGNED_OUT: "SIGNED_OUT",
} as const;

export type ConsumeCreditOptions = {
  createSession?: boolean;
  playerCount?: number;
  difficulty?: string;
  usedCustomKey?: boolean;
  modelUsed?: string;
  userEmail?: string | null;
  region?: string | null;
};

export type ConsumeCreditResult = {
  success: boolean;
  credits?: number;
  sessionId?: string | null;
  error?: string;
  code?: string;
  recoveryAction?: string;
  status?: number;
};

export function useCredits() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [demoConfig, setDemoConfig] = useState<DemoModePublicConfigSnapshot>(() =>
    getDefaultDemoModeConfigSnapshot()
  );
  const [demoConfigLoading, setDemoConfigLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [dailyBonusClaimed, setDailyBonusClaimed] = useState<boolean | null>(null);
  const dailyBonusClaimedUserRef = useRef<string | null>(null);
  const springCampaignClaimedUserRef = useRef<string | null>(null);
  const [springCampaign, setSpringCampaign] = useState<SpringCampaignSnapshot | null>(null);

  const fetchCredits = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("user_credits")
      .select("credits, referral_code, total_referrals")
      .eq("id", user.id)
      .single();

    const creditsRow = data as {
      credits: number;
      referral_code: string;
      total_referrals: number;
    } | null;
    if (!error && creditsRow) {
      setCredits(creditsRow.credits);
      setReferralCode(creditsRow.referral_code);
      setTotalReferrals(creditsRow.total_referrals);
    }

    setLoading(false);
  }, [user]);

  const refreshDemoConfig = useCallback(async (forceRefresh = false) => {
    const snapshot = await fetchDemoModeConfigClient(forceRefresh);
    setDemoConfig(snapshot);
    setIsDemoMode(snapshot.active);
    setGuestId(snapshot.active ? getGuestId() : null);
    setDemoConfigLoading(false);
    return snapshot;
  }, []);

  const consumeCredit = useCallback(async (options: ConsumeCreditOptions = {}): Promise<ConsumeCreditResult> => {
    if (isDemoMode) return { success: true };
    if (!session) return { success: false, error: "unauthorized", status: 401 };

    try {
      const modelSource = getModelSource();
      const customEnabled = modelSource === "custom";
      const headerApiKey = customEnabled ? getZenmuxApiKey() : "";
      const dashscopeApiKey = customEnabled ? getDashscopeApiKey() : "";
      const tokendanceApiKey = customEnabled ? getTokendanceApiKey() : "";
      const hasCustomKey = Boolean(headerApiKey || dashscopeApiKey || tokendanceApiKey);
      const tokenPayRequested = modelSource === "tokenpay";
      const tokendanceBaseUrl = customEnabled ? getTokendanceBaseUrl() : "";
      const res = await fetchWithTimeout("/api/credits/consume", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": JSON_CONTENT_TYPE,
          ...(headerApiKey ? { "X-Zenmux-Api-Key": headerApiKey } : {}),
          ...(dashscopeApiKey ? { "X-Dashscope-Api-Key": dashscopeApiKey } : {}),
          ...(tokendanceApiKey ? { "X-Tokendance-Api-Key": tokendanceApiKey } : {}),
          ...(tokendanceApiKey && tokendanceBaseUrl
            ? { "X-Tokendance-Base-Url": tokendanceBaseUrl }
            : {}),
          ...(tokenPayRequested ? { "X-TokenPay-Mode": "true" } : {}),
        },
        body: JSON.stringify({
          ...options,
          usedCustomKey: tokenPayRequested || hasCustomKey,
        }),
      }, CONSUME_CREDIT_TIMEOUT_MS);

      if (!res.ok) {
        let payload: {
          campaign?: SpringCampaignSnapshot;
          error?: unknown;
          code?: unknown;
          recoveryAction?: unknown;
        } = {};
        try {
          payload = await res.json() as typeof payload;
          if (payload.campaign) {
            setSpringCampaign(payload.campaign);
          }
        } catch {
          // no-op
        }
        return {
          success: false,
          status: res.status,
          error: typeof payload.error === "string" ? payload.error : `request_failed_${res.status}`,
          code: typeof payload.code === "string" ? payload.code : undefined,
          recoveryAction:
            typeof payload.recoveryAction === "string" ? payload.recoveryAction : undefined,
        };
      }

      const payload = (await res.json()) as {
        credits: number;
        campaign?: SpringCampaignSnapshot;
        sessionId?: string | null;
      };
      setCredits(payload.credits);
      if (payload.campaign) {
        setSpringCampaign(payload.campaign);
      }
      return { success: true, credits: payload.credits, sessionId: payload.sessionId ?? null };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "network_error",
      };
    }
  }, [isDemoMode, session]);

  const redeemCode = useCallback(async (code: string): Promise<{
    success: boolean;
    credits?: number;
    creditsGranted?: number;
    error?: string;
  }> => {
    if (!session) return { success: false, error: "unauthorized" };

    try {
      const res = await fetch(REDEEM_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": JSON_CONTENT_TYPE,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ code: code.trim() }),
      });

      const payload = (await res.json()) as {
        success?: boolean;
        credits?: number;
        creditsGranted?: number;
        error?: string;
      };

      if (!res.ok) {
        return { success: false, error: payload.error };
      }

      if (payload.credits !== undefined) {
        setCredits(payload.credits);
      }

      return {
        success: true,
        credits: payload.credits,
        creditsGranted: payload.creditsGranted,
      };
    } catch {
      return { success: false, error: "network_error" };
    }
  }, [session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  const claimDailyBonus = useCallback(async (accessToken: string, userId: string): Promise<void> => {
    if (!DAILY_BONUS_ENABLED) return;
    if (dailyBonusClaimedUserRef.current === userId) return;
    dailyBonusClaimedUserRef.current = userId;

    try {
      const res = await fetch("/api/credits/daily-bonus", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) return;

      const payload = (await res.json()) as {
        credits: number;
        bonusClaimed: boolean;
        bonusAmount?: number;
      };

      setCredits(payload.credits);
      setDailyBonusClaimed(payload.bonusClaimed);
    } catch {
      // Silently fail - daily bonus is not critical
    }
  }, []);

  const claimSpringCampaign = useCallback(async (accessToken: string, userId: string): Promise<void> => {
    if (!SPRING_CAMPAIGN_ENABLED) return;
    if (springCampaignClaimedUserRef.current === userId) return;
    springCampaignClaimedUserRef.current = userId;

    try {
      const res = await fetch(SPRING_CAMPAIGN_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) return;

      const payload = (await res.json()) as { campaign?: SpringCampaignSnapshot };
      if (payload.campaign) {
        setSpringCampaign(payload.campaign);
      }
    } catch {
      // Silently fail - campaign is non-critical
    }
  }, []);

  const applyReferralCode = useCallback(async (accessToken: string): Promise<void> => {
    if (!REFERRAL_BONUS_ENABLED) {
      removeReferralFromStorage();
      return;
    }
    const referralCode = readReferralFromStorage();

    if (!referralCode) return;

    console.log("[Referral] Applying referral code:", referralCode);

    try {
      const res = await fetch(REFERRAL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": JSON_CONTENT_TYPE,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ referralCode }),
      });

      if (!res.ok) {
        console.warn("[Referral] API returned non-OK status:", res.status);
        return;
      }

      console.log("[Referral] Successfully applied referral code");

      removeReferralFromStorage();
    } catch (error) {
      console.error("[Referral] Failed to apply referral code:", error);
    }
  }, []);

  const handleAuthenticatedSession = useCallback(async (currentSession: Session): Promise<void> => {
    await applyReferralCode(currentSession.access_token);
    await Promise.all([
      claimDailyBonus(currentSession.access_token, currentSession.user.id),
      claimSpringCampaign(currentSession.access_token, currentSession.user.id),
    ]);
  }, [applyReferralCode, claimDailyBonus, claimSpringCampaign]);

  useEffect(() => {
    let cancelled = false;

    const runRefresh = async (forceRefresh = false) => {
      const snapshot = await refreshDemoConfig(forceRefresh);
      if (cancelled) return;
      setDemoConfig(snapshot);
      setIsDemoMode(snapshot.active);
      setGuestId(snapshot.active ? getGuestId() : null);
    };

    void runRefresh(true);

    const onFocus = () => {
      void runRefresh(true);
    };

    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => {
      void runRefresh(true);
    }, DEMO_CONFIG_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [refreshDemoConfig]);

  useEffect(() => {
    let active = true;
    const deferredAuthTasks = new Set<number>();

    const deferAuthTask = (task: () => Promise<void>) => {
      const timeoutId = window.setTimeout(() => {
        deferredAuthTasks.delete(timeoutId);
        if (!active) return;
        void task().catch((error) => {
          console.error("[auth] deferred session task failed", error);
          if (active) setDemoConfigLoading(false);
        });
      }, 0);
      deferredAuthTasks.add(timeoutId);
    };

    setTokenPayConnected(false);
    void supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!active) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session) {
          void handleAuthenticatedSession(session);
        }
      })
      .catch((error) => {
        console.error("[auth] failed to load initial session", error);
        if (!active) return;
        setSession(null);
        setUser(null);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (
          event === AUTH_EVENT.SIGNED_IN ||
          event === AUTH_EVENT.SIGNED_OUT
        ) {
          setTokenPayConnected(false);
        }
        setSession(session);
        setUser(session?.user ?? null);

        if (event === AUTH_EVENT.PASSWORD_RECOVERY) {
          setIsPasswordRecovery(true);
        }

        if (
          session
          && (event === AUTH_EVENT.SIGNED_IN || event === AUTH_EVENT.INITIAL_SESSION)
        ) {
          // Supabase auth listeners must return synchronously. Awaiting network
          // work here can hold the auth lock and make later getSession() calls
          // (including TokenPay) wait forever.
          deferAuthTask(async () => {
            const latestDemoConfig = await fetchDemoModeConfigClient(true);
            if (!active) return;
            setDemoConfig(latestDemoConfig);
            setIsDemoMode(latestDemoConfig.active);
            setGuestId(latestDemoConfig.active ? getGuestId() : null);
            setDemoConfigLoading(false);

            if (latestDemoConfig.active) {
              const previousGuestId = readGuestIdFromStorage();
              if (previousGuestId && session.user) {
                void migrateGuestSessions(previousGuestId, session.access_token).then(() => {
                  if (!active) return;
                  clearGuestId();
                  setGuestId(null);
                });
              }
            }

            await handleAuthenticatedSession(session);
          });
        }
      }
    );

    return () => {
      active = false;
      deferredAuthTasks.forEach((timeoutId) => window.clearTimeout(timeoutId));
      deferredAuthTasks.clear();
      subscription.unsubscribe();
    };
  }, [handleAuthenticatedSession]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (user) {
        void fetchCredits();
        return;
      }

      dailyBonusClaimedUserRef.current = null;
      springCampaignClaimedUserRef.current = null;
      setCredits(null);
      setReferralCode(null);
      setTotalReferrals(0);
      setSpringCampaign(null);
      setLoading(false);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [user, fetchCredits]);

  return {
    user,
    session,
    credits,
    referralCode,
    totalReferrals,
    loading: loading || demoConfigLoading,
    fetchCredits,
    consumeCredit,
    redeemCode,
    signOut,
    isPasswordRecovery,
    clearPasswordRecovery,
    dailyBonusClaimed,
    springCampaign,
    isDemoMode,
    guestId,
    demoConfig,
    refreshDemoConfig,
  };
}

async function migrateGuestSessions(guestId: string, accessToken: string): Promise<void> {
  try {
    const res = await fetch("/api/guest/migrate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ guestId }),
    });
    if (!res.ok) {
      console.warn("[demo-mode] Failed to migrate guest sessions:", res.status);
    } else {
      console.log("[demo-mode] Guest sessions migrated successfully");
    }
  } catch (error) {
    console.error("[demo-mode] Migration error:", error);
  }
}
