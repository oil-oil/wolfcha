"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translateAuthError } from "@/lib/auth-errors";
import { buildBaseRedirectToFromCurrentUrl, buildEmailRedirectToFromCurrentUrl } from "@/lib/referral";
import { useTranslations } from "next-intl";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PasswordView = "sign_in" | "sign_up" | "forgot_password";

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const t = useTranslations();
  const EMAIL_SEND_COOLDOWN_SECONDS = 60;
  const EMAIL_SEND_COOLDOWN_STORAGE_KEY = "wolfcha_auth_email_cooldown_until";

  const [passwordView, setPasswordView] = useState<PasswordView>("sign_in");
  
  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<ReactNode | null>(null);
  const [emailCooldownUntilMs, setEmailCooldownUntilMs] = useState<number | null>(null);

  const emailCooldownSecondsLeft = useMemo(() => {
    if (!emailCooldownUntilMs) return 0;
    const seconds = Math.ceil((emailCooldownUntilMs - Date.now()) / 1000);
    return Math.max(0, seconds);
  }, [emailCooldownUntilMs]);

  const startEmailCooldown = (seconds = EMAIL_SEND_COOLDOWN_SECONDS) => {
    const until = Date.now() + seconds * 1000;
    setEmailCooldownUntilMs(until);
    try {
      localStorage.setItem(EMAIL_SEND_COOLDOWN_STORAGE_KEY, String(until));
    } catch {
      // Ignore storage errors (e.g. private mode)
    }
  };

  useEffect(() => {
    // Restore cooldown on mount / refresh
    try {
      const raw = localStorage.getItem(EMAIL_SEND_COOLDOWN_STORAGE_KEY);
      if (!raw) return;
      const until = Number(raw);
      if (!Number.isFinite(until)) return;
      if (until > Date.now()) setEmailCooldownUntilMs(until);
      else localStorage.removeItem(EMAIL_SEND_COOLDOWN_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (!emailCooldownUntilMs) return;
    if (emailCooldownUntilMs <= Date.now()) {
      setEmailCooldownUntilMs(null);
      try {
        localStorage.removeItem(EMAIL_SEND_COOLDOWN_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
      return;
    }

    const timer = window.setInterval(() => {
      setEmailCooldownUntilMs((prev) => {
        if (!prev) return prev;
        if (prev <= Date.now()) return null;
        return prev;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [emailCooldownUntilMs]);

  const emailRedirectTo = useMemo(() => {
    return buildEmailRedirectToFromCurrentUrl();
  }, []);

  const passwordRecoveryRedirectTo = useMemo(() => {
    return buildBaseRedirectToFromCurrentUrl();
  }, []);

  // Reset form state when switching views
  const resetForm = () => {
    setEmail("");
    setPassword("");
    setError(null);
    setSuccessMessage(null);
  };

  const handlePasswordViewChange = (view: PasswordView) => {
    setPasswordView(view);
    setError(null);
    setSuccessMessage(null);
    setPassword("");
  };

  // Password login
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError(t("authModal.errors.emailRequired"));
      return;
    }
    if (!password) {
      setError(t("authModal.errors.passwordRequired"));
      return;
    }
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);
    if (error) {
      setError(translateAuthError(error.message));
    } else {
      toast.success(t("authModal.toasts.signInSuccess"));
      onOpenChange(false);
      resetForm();
    }
  };

  // Password sign up
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError(t("authModal.errors.emailRequired"));
      return;
    }
    if (!password) {
      setError(t("authModal.errors.passwordRequired"));
      return;
    }
    if (password.length < 6) {
      setError(t("authModal.errors.passwordTooShort"));
      return;
    }
    setLoading(true);
    setError(null);

    const { error, data } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo,
      },
    });

    setLoading(false);
    if (error) {
      setError(translateAuthError(error.message));
    } else {
      // Check if this is a real new user or existing user
      // Supabase returns empty identities array for existing users (security measure)
      const isExistingUser = data.user?.identities?.length === 0;
      
      if (isExistingUser) {
        // User already exists - show helpful message without revealing this fact explicitly
        setSuccessMessage(t("authModal.messages.signUpExisting"));
      } else if (data.session) {
        // Auto-confirmed, user is logged in
        toast.success(t("authModal.toasts.signUpSuccess"));
        onOpenChange(false);
        resetForm();
      } else if (data.user) {
        // New user, needs email confirmation
        setSuccessMessage(
          <div className="space-y-1">
            <div>{t("authModal.messages.signUpConfirmDetails.line1")}</div>
            <div className="font-semibold text-amber-700">
              {t("authModal.messages.signUpConfirmDetails.line2")}
            </div>
            <div className="text-[var(--text-muted)]">
              {t("authModal.messages.signUpConfirmDetails.line3")}
            </div>
          </div>
        );
        toast.success(t("authModal.toasts.signUpConfirm.title"), {
          description: t("authModal.toasts.signUpConfirm.description"),
        });
      }
    }
  };

  // Forgot password
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError(t("authModal.errors.emailRequired"));
      return;
    }
    if (emailCooldownSecondsLeft > 0) {
      setError(t("authModal.errors.cooldownWait", { seconds: emailCooldownSecondsLeft }));
      return;
    }
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: passwordRecoveryRedirectTo,
    });

    setLoading(false);
    if (error) {
      const status = (error as unknown as { status?: number }).status;
      const code = (error as unknown as { code?: string }).code;
      if (
        status === 429 ||
        code === "over_email_send_rate_limit" ||
        /rate limit/i.test(error.message)
      ) {
        startEmailCooldown();
        setError(t("authModal.errors.sendTooFrequent"));
      } else {
        setError(translateAuthError(error.message));
      }
    } else {
      startEmailCooldown();
      setSuccessMessage(t("authModal.messages.resetSent"));
      toast.success(t("authModal.toasts.resetSent.title"), { description: t("authModal.toasts.resetSent.description") });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      onOpenChange(isOpen);
      if (!isOpen) {
        resetForm();
        setPasswordView("sign_in");
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("authModal.title")}</DialogTitle>
          <DialogDescription>{t("authModal.description")}</DialogDescription>
        </DialogHeader>

        <div className="pt-4">
          {/* OAuth 登录 */}
          {passwordView === "sign_in" && (
            <div className="pb-4">
              {process.env.NEXT_PUBLIC_WATCHA_CLIENT_ID && (
                <a href="/api/auth/watcha" className="block mb-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full flex items-center justify-center gap-2"
                    disabled={loading}
                  >
                    <img
                      src="https://watcha.tos-cn-beijing.volces.com/products/logo/1752064513_guan-cha-insights.png?x-tos-process=image/resize,w_720/format,webp"
                      alt="观猹"
                      className="h-5 w-5 rounded"
                    />
                    {t("authModal.actions.signInWithWatcha")}
                  </Button>
                </a>
              )}

              <div
                onClick={async () => {
                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: "google",
                    options: {
                      redirectTo: window.location.origin,
                    },
                  });
                  if (error) {
                    toast.error(translateAuthError(error.message));
                  }
                }}
                className="block w-full cursor-pointer"
              >
                <Button
                  type="button"
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2 pointer-events-none"
                  disabled={loading}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {t("authModal.actions.signInWithGoogle")}
                </Button>
              </div>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-200/50 dark:border-gray-700/30" />
                </div>
              </div>
            </div>
          )}

          {/* Sign In View */}
          {passwordView === "sign_in" && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">{t("authModal.fields.email")}</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder={t("authModal.placeholders.email")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signin-password">{t("authModal.fields.password")}</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder={t("authModal.placeholders.password")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="current-password"
                  />
                </div>

                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("authModal.actions.signingIn") : t("authModal.actions.signIn")}
                </Button>

                <div className="flex flex-col items-center gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => handlePasswordViewChange("forgot_password")}
                    className="text-[var(--color-gold-dark)] hover:underline"
                  >
                    {t("authModal.links.forgotPassword")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePasswordViewChange("sign_up")}
                    className="text-[var(--color-gold-dark)] hover:underline"
                  >
                    {t("authModal.links.noAccount")}
                  </button>
                </div>
              </form>
            )}

            {/* Sign Up View */}
            {passwordView === "sign_up" && (
              <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">{t("authModal.fields.email")}</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder={t("authModal.placeholders.email")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">{t("authModal.fields.password")}</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder={t("authModal.placeholders.passwordMin")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="new-password"
                    minLength={6}
                  />
                </div>

                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                {successMessage && (
                  <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-600">
                    {successMessage}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("authModal.actions.signingUp") : t("authModal.actions.signUp")}
                </Button>

                <div className="flex justify-center text-sm">
                  <button
                    type="button"
                    onClick={() => handlePasswordViewChange("sign_in")}
                    className="text-[var(--color-gold-dark)] hover:underline"
                  >
                    {t("authModal.links.haveAccount")}
                  </button>
                </div>
              </form>
            )}

            {/* Forgot Password View */}
            {passwordView === "forgot_password" && (
              <form onSubmit={handleForgotPassword} className="space-y-4 pt-4">
                <p className="text-sm text-[var(--text-muted)]">
                  {t("authModal.forgot.description")}
                </p>

                <div className="space-y-2">
                  <Label htmlFor="forgot-email">{t("authModal.fields.email")}</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder={t("authModal.placeholders.email")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>

                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                {successMessage && (
                  <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-600">
                    {successMessage}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || emailCooldownSecondsLeft > 0}
                >
                  {loading
                    ? t("authModal.actions.sending")
                    : emailCooldownSecondsLeft > 0
                      ? t("authModal.actions.waitCooldown", { seconds: emailCooldownSecondsLeft })
                      : t("authModal.actions.sendReset")}
                </Button>

                <div className="flex justify-center text-sm">
                  <button
                    type="button"
                    onClick={() => handlePasswordViewChange("sign_in")}
                    className="text-[var(--color-gold-dark)] hover:underline"
                  >
                    {t("authModal.links.backToSignIn")}
                  </button>
                </div>
              </form>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
