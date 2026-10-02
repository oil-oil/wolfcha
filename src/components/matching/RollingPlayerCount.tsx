"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";

interface RollingPlayerCountProps {
  current: number;
  total: number;
}

export function RollingPlayerCount({ current, total }: RollingPlayerCountProps) {
  const t = useTranslations();
  const reducedMotion = useReducedMotion();
  const digits = String(current).padStart(2, "0").split("");

  return (
    <div className="relative flex flex-col items-center gap-1.5" data-entered-count={current} data-total-players={total} role="status" aria-label={t("dialog.emptyState.enteredCount", { current, total })}>
      <div className="flex items-center gap-1.5 font-serif tabular-nums leading-none" aria-hidden="true">
        <div className="flex text-[32px] text-[var(--text-primary)]">
          {digits.map((digit, index) => (
            <span key={index} className="relative block h-[1em] w-[0.65em] overflow-hidden">
              <AnimatePresence initial={false}>
                <motion.span
                  key={digit}
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ y: reducedMotion ? 0 : "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: reducedMotion ? 0 : "-100%" }}
                  transition={{ duration: reducedMotion ? 0 : 0.38, ease: [0.22, 0.7, 0.3, 1] }}
                >{digit}</motion.span>
              </AnimatePresence>
            </span>
          ))}
        </div>
        <span className="text-sm text-[var(--text-muted)]/60">/</span>
        <span className="text-sm text-[var(--text-secondary)]">{total}</span>
      </div>
    </div>
  );
}
