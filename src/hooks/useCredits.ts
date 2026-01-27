"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getDashscopeApiKey, getZenmuxApiKey, isCustomKeyEnabled } from "@/lib/api-keys";

const REFERRAL_STORAGE_KEY = "wolfcha_referral";

export function useCredits() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [dailyBonusClaimed, setDailyBonusClaimed] = useState<boolean | null>(null);
  const dailyBonusClaimedRef = useRef(false);

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

    if (!res.ok) return false;

    const payload = (await res.json()) as { credits: number };
    setCredits(payload.credits);
    return true;
  }, [session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  const claimDailyBonus = useCallback(async (accessToken: string): Promise<void> => {
    if (dailyBonusClaimedRef.current) return;
    dailyBonusClaimedRef.current = true;

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Handle password recovery flow
        if (event === "PASSWORD_RECOVERY") {
          setIsPasswordRecovery(true);
        }

        if (event === "SIGNED_IN" && session) {
          const referralCode = localStorage.getItem(REFERRAL_STORAGE_KEY);
          if (referralCode) {
            await fetch("/api/credits/referral", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ referralCode }),
            });
            localStorage.removeItem(REFERRAL_STORAGE_KEY);
          }

          // 自动领取每日签到奖励
          void claimDailyBonus(session.access_token);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      void fetchCredits();
    } else {
      setCredits(null);
      setReferralCode(null);
      setTotalReferrals(0);
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
  };
}
