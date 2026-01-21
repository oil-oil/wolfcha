"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { translateAuthError } from "@/lib/auth-errors";
import { useTranslations } from "next-intl";
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
import { LockKey } from "@phosphor-icons/react";

interface ResetPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ResetPasswordModal({ open, onOpenChange, onSuccess }: ResetPasswordModalProps) {
  const t = useTranslations();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [open]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!newPassword.trim()) {
      toast.error(t("resetPassword.errors.newPasswordRequired"));
      return;
    }

    if (newPassword.length < 6) {
      toast.error(t("resetPassword.errors.passwordTooShort"));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t("resetPassword.errors.passwordMismatch"));
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        let message = translateAuthError(error.message);
        if (error.message.includes("Auth session missing")) {
          message = t("resetPassword.errors.linkExpired");
        }
        toast.error(t("resetPassword.toasts.resetFail.title"), { description: message });
      } else {
        toast.success(t("resetPassword.toasts.resetSuccess.title"), {
          description: t("resetPassword.toasts.resetSuccess.description"),
        });
        setNewPassword("");
        setConfirmPassword("");
        onOpenChange(false);
        onSuccess?.();
      }
    } catch (err) {
      toast.error(t("resetPassword.toasts.resetFail.title"), {
        description: t("resetPassword.toasts.resetFail.description"),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockKey size={20} />
            {t("resetPassword.title")}
          </DialogTitle>
          <DialogDescription>
            {t("resetPassword.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-new-password">{t("resetPassword.fields.newPassword")}</Label>
            <Input
              id="reset-new-password"
              type="password"
              placeholder={t("resetPassword.placeholders.newPassword")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              minLength={6}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-confirm-password">{t("resetPassword.fields.confirmPassword")}</Label>
            <Input
              id="reset-confirm-password"
              type="password"
              placeholder={t("resetPassword.placeholders.confirmPassword")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              minLength={6}
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full"
          >
            {loading ? t("resetPassword.actions.resetting") : t("resetPassword.actions.confirm")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
