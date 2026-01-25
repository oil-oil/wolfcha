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

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PasswordView = "sign_in" | "sign_up" | "forgot_password";

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
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
      setError("请输入邮箱");
      return;
    }
    if (!password) {
      setError("请输入密码");
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
      toast.success("登录成功");
      onOpenChange(false);
      resetForm();
    }
  };

  // Password sign up
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("请输入邮箱");
      return;
    }
    if (!password) {
      setError("请输入密码");
      return;
    }
    if (password.length < 6) {
      setError("密码长度至少为 6 位");
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
        setSuccessMessage("如果该邮箱未注册，您将收到验证邮件。如已注册，请直接登录。");
      } else if (data.session) {
        // Auto-confirmed, user is logged in
        toast.success("注册成功");
        onOpenChange(false);
        resetForm();
      } else if (data.user) {
        // New user, needs email confirmation
        setSuccessMessage(
          <div className="space-y-1">
            <div>注册成功！我们已向您的邮箱发送验证邮件，请打开邮件完成验证。</div>
            <div className="font-semibold text-amber-700">
              没有收到？邮件服务商有时会把自动验证邮件误判为广告/群发，可能会被放到垃圾箱/广告邮件。
            </div>
            <div className="text-[var(--text-muted)]">
              建议将发件人加入白名单/通讯录，并稍等 1–2 分钟再刷新收件箱。
            </div>
          </div>
        );
        toast.success("注册成功", {
          description: "请查收邮箱完成验证（可能被误判到垃圾箱/广告邮件）",
        });
      }
    }
  };

  // Forgot password
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("请输入邮箱");
      return;
    }
    if (emailCooldownSecondsLeft > 0) {
      setError(`发送过于频繁，请在 ${emailCooldownSecondsLeft}s 后再试`);
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
        setError("发送过于频繁，请稍后再试");
      } else {
        setError(translateAuthError(error.message));
      }
    } else {
      startEmailCooldown();
      setSuccessMessage("重置邮件已发送，请检查邮箱");
      toast.success("重置邮件已发送", { description: "请检查邮箱" });
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
          <DialogTitle>登录或注册</DialogTitle>
          <DialogDescription>登录后可获得额度并使用分享奖励；每天上线可领 2 局哦～</DialogDescription>
        </DialogHeader>

        <div className="pt-4">
          {/* Sign In View */}
          {passwordView === "sign_in" && (
              <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">邮箱</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="请输入邮箱"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signin-password">密码</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="请输入密码"
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
                  {loading ? "登录中..." : "登录"}
                </Button>

                <div className="flex flex-col items-center gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => handlePasswordViewChange("forgot_password")}
                    className="text-[var(--color-gold-dark)] hover:underline"
                  >
                    忘记密码？
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePasswordViewChange("sign_up")}
                    className="text-[var(--color-gold-dark)] hover:underline"
                  >
                    还没有账号？去注册
                  </button>
                </div>
              </form>
            )}

            {/* Sign Up View */}
            {passwordView === "sign_up" && (
              <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">邮箱</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="请输入邮箱"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">密码</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="请输入密码（至少 6 位）"
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
                  {loading ? "注册中..." : "注册"}
                </Button>

                <div className="flex justify-center text-sm">
                  <button
                    type="button"
                    onClick={() => handlePasswordViewChange("sign_in")}
                    className="text-[var(--color-gold-dark)] hover:underline"
                  >
                    已有账号？去登录
                  </button>
                </div>
              </form>
            )}

            {/* Forgot Password View */}
            {passwordView === "forgot_password" && (
              <form onSubmit={handleForgotPassword} className="space-y-4 pt-4">
                <p className="text-sm text-[var(--text-muted)]">
                  输入您的邮箱，我们将发送密码重置链接。
                </p>

                <div className="space-y-2">
                  <Label htmlFor="forgot-email">邮箱</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="请输入邮箱"
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
                    ? "发送中..."
                    : emailCooldownSecondsLeft > 0
                      ? `请稍候（${emailCooldownSecondsLeft}s）`
                      : "发送重置邮件"}
                </Button>

                <div className="flex justify-center text-sm">
                  <button
                    type="button"
                    onClick={() => handlePasswordViewChange("sign_in")}
                    className="text-[var(--color-gold-dark)] hover:underline"
                  >
                    返回登录
                  </button>
                </div>
              </form>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
