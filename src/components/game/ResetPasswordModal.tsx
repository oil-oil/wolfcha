"use client";

import { useState, useEffect } from "react";
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
import { LockKey } from "@phosphor-icons/react";

interface ResetPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ResetPasswordModal({ open, onOpenChange, onSuccess }: ResetPasswordModalProps) {
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
      toast.error("请输入新密码");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("密码长度至少为 6 位");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        // Translate common error messages
        let message = error.message;
        if (message.includes("New password should be different")) {
          message = "新密码不能与旧密码相同";
        } else if (message.includes("Password should be at least")) {
          message = "密码长度至少为 6 位";
        } else if (message.includes("Auth session missing")) {
          message = "重置链接已过期，请重新发起重置请求";
        }
        toast.error("重置失败", { description: message });
      } else {
        toast.success("密码重置成功", { description: "您现在可以使用新密码登录" });
        setNewPassword("");
        setConfirmPassword("");
        onOpenChange(false);
        onSuccess?.();
      }
    } catch (err) {
      toast.error("重置失败", { description: "发生未知错误" });
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
            重置密码
          </DialogTitle>
          <DialogDescription>
            请输入您的新密码。密码长度至少为 6 位。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-new-password">新密码</Label>
            <Input
              id="reset-new-password"
              type="password"
              placeholder="请输入新密码"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              minLength={6}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-confirm-password">确认新密码</Label>
            <Input
              id="reset-confirm-password"
              type="password"
              placeholder="请再次输入新密码"
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
            {loading ? "重置中..." : "确认重置密码"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
