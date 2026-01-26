"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslations } from "next-intl";

interface SharePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referralCode: string | null;
  totalReferrals: number;
}

export function SharePanel({
  open,
  onOpenChange,
  referralCode,
  totalReferrals,
}: SharePanelProps) {
  const t = useTranslations();
  const [copying, setCopying] = useState(false);

  const shareUrl = useMemo(() => {
    if (!referralCode || typeof window === "undefined") return "";
    return `${window.location.origin}?ref=${referralCode}`;
  }, [referralCode]);

  const handleCopy = async () => {
    if (!shareUrl) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t("sharePanel.toasts.copySuccess"));
    } catch {
      toast.error(t("sharePanel.toasts.copyFail"));
    } finally {
      setCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sharePanel.title")}</DialogTitle>
          <DialogDescription>
            {t("sharePanel.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm break-all">
            {shareUrl || t("sharePanel.loading")}
          </div>
          <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
            <span>{t("sharePanel.invitedCount", { count: totalReferrals })}</span>
            <Button type="button" onClick={handleCopy} disabled={!shareUrl || copying}>
              {copying ? t("sharePanel.actions.copying") : t("sharePanel.actions.copy")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
