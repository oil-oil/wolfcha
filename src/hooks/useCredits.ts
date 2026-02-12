"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getDashscopeApiKey, getZenmuxApiKey, isCustomKeyEnabled } from "@/lib/api-keys";
import { readReferralFromStorage, removeReferralFromStorage } from "@/lib/referral";
import type { SpringCampaignSnapshot } from "@/lib/spring-campaign";

const REFERRAL_ENDPOINT = "/api/credits/referral";
const SPRING_CAMPAIGN_ENDPOINT = "/api/credits/spring-login-bonus";
const JSON_CONTENT_TYPE = "application/json";
const AUTH_EVENT = {
  INITIAL_SESSION: "INITIAL_SESSION",
  PASSWORD_RECOVERY: "PASSWORD_RECOVERY",
  SIGNED_IN: "SIGNED_IN",
} as const;

export function useCredits() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
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

  const consumeCredit = useCallback(async (): Promise<boolean> => {
    if (!session) return false;

    try {
      const customEnabled = isCustomKeyEnabled();
      const headerApiKey = customEnabled ? getZenmuxApiKey() : "";
      const dashscopeApiKey = customEnabled ? getDashscopeApiKey() : "";
      const res = await fetch("/api/credits/consume", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(headerApiKey ? { "X-Zenmux-Api-Key": headerApiKey } : {}),
          ...(dashscopeApiKey ? { "X-Dashscope-Api-Key": dashscopeApiKey } : {}),
        },
      });

      if (!res.ok) {
        try {
          const payload = (await res.json()) as { campaign?: SpringCampaignSnapshot };
          if (payload.campaign) {
            setSpringCampaign(payload.campaign);
          }
        } catch {
          // no-op
        }
        return false;
      }

      const payload = (await res.json()) as { credits: number; campaign?: SpringCampaignSnapshot };
      setCredits(payload.credits);
      if (payload.campaign) {
        setSpringCampaign(payload.campaign);
      }
      return true;
    } catch {
      return false;
    }
  }, [session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  const claimDailyBonus = useCallback(async (accessToken: string, userId: string): Promise<void> => {
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

      const payload = await res.json() as {
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

      const payload = await res.json() as { campaign?: SpringCampaignSnapshot };
      if (payload.campaign) {
        setSpringCampaign(payload.campaign);
      }
    } catch {
      // Silently fail - campaign is non-critical
    }
  }, []);

  const applyReferralCode = useCallback(async (accessToken: string): Promise<void> => {
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session) {
        void handleAuthenticatedSession(session);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Handle password recovery flow
        if (event === AUTH_EVENT.PASSWORD_RECOVERY) {
          setIsPasswordRecovery(true);
        }

        if (
          session
          && (event === AUTH_EVENT.SIGNED_IN || event === AUTH_EVENT.INITIAL_SESSION)
        ) {
          await handleAuthenticatedSession(session);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [handleAuthenticatedSession]);

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchCredits();
    } else {
      dailyBonusClaimedUserRef.current = null;
      springCampaignClaimedUserRef.current = null;
      setCredits(null);
      setReferralCode(null);
      setTotalReferrals(0);
      setSpringCampaign(null);
      setLoading(false);
    }
  }, [user, fetchCredits]);

  return {
    user,
    session,
    credits,
    referralCode,
    totalReferrals,
    loading,
    fetchCredits,
    consumeCredit,
    signOut,
    isPasswordRecovery,
    clearPasswordRecovery,
    dailyBonusClaimed,
    springCampaign,
  };
}
