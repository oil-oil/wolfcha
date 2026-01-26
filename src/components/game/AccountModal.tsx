"use client";

import { useState } from "react";
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
import { Key } from "@phosphor-icons/react";

interface AccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountModal({ open, onOpenChange }: AccountModalProps) {
  const t = useTranslations();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!newPassword.trim()) {
      toast.error(t("accountModal.errors.newPasswordRequired"));
      return;
    }

    if (newPassword.length < 6) {
      toast.error(t("accountModal.errors.passwordTooShort"));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t("accountModal.errors.passwordMismatch"));
      return;
    }

    setLoading(true);

    try {
      // Update password using Supabase
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        toast.error(t("accountModal.toasts.updateFail.title"), {
          description: translateAuthError(error.message),
        });
      } else {
        toast.success(t("accountModal.toasts.updateSuccess"));
        // Reset form
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(t("accountModal.toasts.updateFail.title"), {
        description: t("accountModal.toasts.updateFail.description"),
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
            <Key size={20} />
            {t("accountModal.title")}
          </DialogTitle>
          <DialogDescription>
            {t("accountModal.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">{t("accountModal.fields.newPassword")}</Label>
            <Input
              id="new-password"
              type="password"
              placeholder={t("accountModal.placeholders.newPassword")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              minLength={6}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t("accountModal.fields.confirmPassword")}</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder={t("accountModal.placeholders.confirmPassword")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              minLength={6}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1"
            >
              {t("accountModal.actions.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1"
            >
              {loading ? t("accountModal.actions.updating") : t("accountModal.actions.update")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
