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

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return window.location.origin;
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
        emailRedirectTo: redirectTo,
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
      redirectTo: redirectTo,
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
          {/* Sign In View */}
          {passwordView === "sign_in" && (
              <form onSubmit={handleSignIn} className="space-y-4 pt-4">
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
