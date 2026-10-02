"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { GearSix } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { WerewolfIcon } from "@/components/icons/FlatIcons";

interface GameTopBarProps {
  day: number;
  aliveCount: number;
  totalCount: number;
  phaseIcon: ReactNode;
  phaseLabel: string;
  roleLabel?: string;
  badgeSeat?: number | null;
  showWaitingIndicator?: boolean;
  needsHumanAction?: boolean;
  onSettingsOpen: () => void;
  actions?: ReactNode;
  brandHref?: string;
}

export function GameTopBar({ day, aliveCount, totalCount, phaseIcon, phaseLabel, roleLabel, badgeSeat = null, showWaitingIndicator = false, needsHumanAction = false, onSettingsOpen, actions, brandHref }: GameTopBarProps) {
  const t = useTranslations();
  const brand = <><WerewolfIcon size={22} className="text-[var(--color-blood)]" /><span>WOLFCHA</span></>;

  return (
    <header className="wc-topbar wc-topbar--responsive relative shrink-0 transition-all duration-300">
      <div className={`wc-topbar__row-1 flex items-center justify-between w-full md:w-auto md:contents ${actions ? "max-md:min-h-8" : ""}`}>
        {brandHref ? (
          <Link href={brandHref} className="wc-topbar__title" aria-label="WOLFCHA">{brand}</Link>
        ) : (
          <div className="wc-topbar__title">{brand}</div>
        )}
        {!actions && (
          <button type="button" onClick={onSettingsOpen} title={t("page.audioSettings")} aria-label={t("page.audioSettings")} className="md:hidden inline-flex items-center justify-center w-8 h-8 rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-bg)]">
            <GearSix size={16} />
          </button>
        )}
      </div>

      <div className="wc-topbar__info">
        <div className="wc-topbar__item">
          <span className="text-xs uppercase tracking-wider opacity-60">Day</span>
          <span className="font-serif text-lg font-bold">{String(day).padStart(2, "0")}</span>
        </div>
        <div className="wc-topbar__item">
          <span className="text-xs uppercase tracking-wider opacity-60">Alive</span>
          <span className="font-serif text-lg font-bold">{aliveCount}/{totalCount}</span>
        </div>
        {badgeSeat !== null && (
          <div className="wc-topbar__item">
            <span className="text-xs uppercase tracking-wider opacity-60">{t("page.badgeLabel")}</span>
            <span className="font-serif text-lg font-bold text-[var(--color-gold)]">{t("mentions.seatLabel", { seat: badgeSeat + 1 })}</span>
          </div>
        )}
        <div className="wc-phase-badge">
          <span className="opacity-90">{phaseIcon}</span>
          <span>{phaseLabel}</span>
          {showWaitingIndicator && (
            <span className="flex items-center gap-1 ml-1">
              {[0, 0.15, 0.3].map((delay) => <motion.span key={delay} animate={{ scale: [1, 1.25, 1] }} transition={{ repeat: Infinity, duration: 0.7, delay }} className="w-1.5 h-1.5 rounded-full bg-current" />)}
            </span>
          )}
          {needsHumanAction && (
            <span className="flex items-center gap-1.5 font-semibold text-xs px-2 py-0.5 rounded-full ml-1 bg-[var(--color-gold)]/20 text-[var(--color-gold)]">
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse" />
              {t("ui.waitingAction")}
            </span>
          )}
        </div>
      </div>

      <div className={actions ? "flex items-center gap-3 max-md:absolute max-md:right-3 max-md:top-2" : "hidden md:flex items-center gap-3"}>
        <div className={`wc-topbar__item wc-topbar__item--role ${actions ? "hidden md:flex" : ""}`}>
          <span className="text-xs uppercase tracking-wider opacity-60">{t("page.roleLabel")}</span>
          <span className="font-bold text-[var(--color-gold)]">{roleLabel ?? t("page.rolePending")}</span>
        </div>
        {actions}
        <button type="button" onClick={onSettingsOpen} title={t("page.audioSettings")} aria-label={t("page.audioSettings")} className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1 text-xs text-[var(--text-primary)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] max-md:w-8 max-md:h-8 max-md:p-0 max-md:border">
          <GearSix size={16} />
          <span className={actions ? "hidden md:inline" : undefined}>{t("page.settings")}</span>
        </button>
      </div>
    </header>
  );
}
