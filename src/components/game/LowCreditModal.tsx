"use client";

import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Key, CreditCard, Play } from "@phosphor-icons/react";

const ZENMUX_URL = "https://zenmux.ai/aboutus?ref=wolfcha";
const LOW_CREDIT_THRESHOLD = 3;

interface LowCreditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credits: number;
  onStartGame: () => void;
  onOpenPayAsYouGo: () => void;
}

export function LowCreditModal({
  open,
  onOpenChange,
  credits,
  onStartGame,
  onOpenPayAsYouGo,
}: LowCreditModalProps) {
  const t = useTranslations("lowCreditModal");

  const handleBuyApiKey = () => {
    window.open(ZENMUX_URL, "_blank", "noopener,noreferrer");
  };

  const handleRecharge = () => {
    onOpenChange(false);
    onOpenPayAsYouGo();
  };

  const handleStartGame = () => {
    if (credits === 0) {
      onOpenChange(false);
      onOpenPayAsYouGo();
    } else {
      onOpenChange(false);
      onStartGame();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-primary)]">
            {t("title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="relative rounded-xl border border-[var(--color-gold)]/30 bg-gradient-to-b from-[var(--color-gold)]/5 to-transparent p-5 text-center overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,var(--color-gold)_0%,transparent_50%)] opacity-10" />
            <p className="relative text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
              {t("currentCredits")}
            </p>
            <p className="relative mt-2 text-5xl font-bold text-[var(--color-gold)]">
              {credits}
            </p>
            <p className="relative mt-1 text-sm text-[var(--text-secondary)]">
              {t("unit")}
            </p>
          </div>

          <p className="text-sm text-[var(--text-secondary)] leading-relaxed text-center px-2">
            {t("guidance")}
          </p>

          <div className="space-y-3 pt-1">
            <Button
              type="button"
              onClick={handleBuyApiKey}
              className="w-full h-11 gap-2 bg-[var(--color-gold)] text-[var(--bg-primary)] hover:brightness-110 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 font-medium shadow-lg shadow-[var(--color-gold)]/20"
            >
              <Key size={18} weight="duotone" />
              {t("buyApiKey")}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleRecharge}
              className="w-full h-11 gap-2 font-medium"
            >
              <CreditCard size={18} />
              {t("recharge")}
            </Button>

            <button
              type="button"
              onClick={handleStartGame}
              className="w-full py-2 text-sm text-[var(--text-muted)] hover:text-[var(--color-gold)] transition-colors flex items-center justify-center gap-2"
            >
              <Play size={16} />
              {credits === 0 ? t("startGameNoCredits") : t("startGame")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { LOW_CREDIT_THRESHOLD };
