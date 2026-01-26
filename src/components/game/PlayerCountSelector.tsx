"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

interface PlayerCountSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: number;
  onChange: (value: number) => void;
}

type PlayerCountOption = {
  count: number;
  title: string;
  subtitle: string;
  description: string;
  roles: string;
};

export function PlayerCountSelector({
  open,
  onOpenChange,
  value,
  onChange,
}: PlayerCountSelectorProps) {
  const t = useTranslations();
  const options = useMemo<PlayerCountOption[]>(() => ([
    {
      count: 8,
      title: t("playerCount.options.8.title"),
      subtitle: t("playerCount.options.8.subtitle"),
      description: t("playerCount.options.8.description"),
      roles: t("playerCount.options.8.roles"),
    },
    {
      count: 9,
      title: t("playerCount.options.9.title"),
      subtitle: t("playerCount.options.9.subtitle"),
      description: t("playerCount.options.9.description"),
      roles: t("playerCount.options.9.roles"),
    },
    {
      count: 10,
      title: t("playerCount.options.10.title"),
      subtitle: t("playerCount.options.10.subtitle"),
      description: t("playerCount.options.10.description"),
      roles: t("playerCount.options.10.roles"),
    },
    {
      count: 11,
      title: t("playerCount.options.11.title"),
      subtitle: t("playerCount.options.11.subtitle"),
      description: t("playerCount.options.11.description"),
      roles: t("playerCount.options.11.roles"),
    },
    {
      count: 12,
      title: t("playerCount.options.12.title"),
      subtitle: t("playerCount.options.12.subtitle"),
      description: t("playerCount.options.12.description"),
      roles: t("playerCount.options.12.roles"),
    },
  ]), [t]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="wc-difficulty-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif text-[var(--text-primary)]">{t("playerCount.title")}</DialogTitle>
          <DialogDescription className="text-[var(--text-muted)]">
            {t("playerCount.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="wc-difficulty-grid">
          {options.map((option) => {
            const active = option.count === value;
            return (
              <button
                key={option.count}
                type="button"
                className="wc-difficulty-card"
                data-active={active ? "true" : "false"}
                aria-pressed={active}
                onClick={() => onChange(option.count)}
              >
                <div className="wc-difficulty-card-head">
                  <div>
                    <div className="wc-difficulty-title">{option.title}</div>
                    <div className="wc-difficulty-subtitle">{option.subtitle}</div>
                  </div>
                  <div className="wc-difficulty-pill">
                    <span>{t("playerCount.countLabel", { count: option.count })}</span>
                    {active ? <CheckCircle size={16} weight="fill" /> : null}
                  </div>
                </div>
                <div className="wc-difficulty-desc">{option.description}</div>
                <div className="wc-difficulty-desc text-[var(--text-muted)]">{option.roles}</div>
              </button>
            );
          })}
        </div>

        <div className="wc-difficulty-footer">
          {t("playerCount.footer")}
        </div>
      </DialogContent>
    </Dialog>
  );
}
