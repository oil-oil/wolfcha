"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { WerewolfIcon } from "@/components/icons/FlatIcons";
import LoadingMiniGame from "./MiniGame/LoadingMiniGame";

interface GameLoadingStateProps {
  showMiniGame?: boolean;
  showSupportingText?: boolean;
  miniGameVariant?: "classic" | "orb-rain";
  countDisplay?: ReactNode;
}

export function GameLoadingState({ showMiniGame = true, showSupportingText = true, miniGameVariant = "classic", countDisplay }: GameLoadingStateProps) {
  const t = useTranslations();

  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-[var(--text-muted)]">
      <div className="relative flex flex-col items-center">
        <div className="relative mb-6" data-slot="loading-orb">
          <motion.div className="absolute inset-0 rounded-full border border-[var(--color-gold)]/20" style={{ width: 180, height: 180 }} animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: "linear" }} />
          <motion.div className="absolute inset-5 rounded-full border border-dashed border-[var(--color-blood)]/30" animate={{ rotate: -360, opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 14, repeat: Infinity, ease: "linear" }} />
          <motion.div className="absolute inset-10 rounded-full border border-[var(--color-gold)]/20" animate={{ scale: [0.96, 1.04, 0.96], opacity: [0.35, 0.7, 0.35] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
          <motion.div className="relative flex items-center justify-center rounded-full" style={{ width: 180, height: 180 }} animate={{ y: [0, -6, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}>
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(197,160,89,0.12),rgba(0,0,0,0)_70%)]" />
            {countDisplay ? (
              <div className="relative flex flex-col items-center gap-2">
                <WerewolfIcon size={32} className="text-[var(--color-gold)]/60 drop-shadow-[0_0_18px_rgba(197,160,89,0.3)]" />
                {countDisplay}
              </div>
            ) : (
              <WerewolfIcon size={56} className="text-[var(--color-gold)]/60 drop-shadow-[0_0_18px_rgba(197,160,89,0.3)]" />
            )}
          </motion.div>
        </div>
        {showMiniGame && miniGameVariant === "orb-rain" && (
          <div data-slot="loading-minigame"><LoadingMiniGame variant="orb-rain" /></div>
        )}
        <motion.div className="flex flex-col items-center gap-2" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }}>
          {showSupportingText && <div className="text-sm font-serif tracking-[0.2em] text-[var(--color-gold)]/80 uppercase">{t("dialog.emptyState.summoning")}</div>}
          <div className="text-base font-semibold text-[var(--text-primary)]/85" data-slot="loading-message">{t("dialog.emptyState.playersEntering")}</div>
          {showSupportingText && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <motion.span className="inline-block w-2 h-2 rounded-full bg-[var(--color-gold)]/60" animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }} />
              <span>{t("dialog.emptyState.recruiting")}</span>
            </div>
          )}
          {showMiniGame && miniGameVariant === "classic" && <div className="mt-4" data-slot="loading-minigame"><LoadingMiniGame /></div>}
        </motion.div>
      </div>
    </div>
  );
}
