"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DifficultyLevel } from "@/types/game";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

interface DifficultySelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: DifficultyLevel;
  onChange: (value: DifficultyLevel) => void;
}

type DifficultyOption = {
  id: DifficultyLevel;
  title: string;
  subtitle: string;
  description: string;
  tag: string;
};

export function DifficultySelector({
  open,
  onOpenChange,
  value,
  onChange,
}: DifficultySelectorProps) {
  const t = useTranslations();
  const options = useMemo<DifficultyOption[]>(() => ([
    {
      id: "easy",
      title: t("difficultySelector.options.easy.title"),
      subtitle: t("difficultySelector.options.easy.subtitle"),
      description: t("difficultySelector.options.easy.description"),
      tag: t("difficultySelector.options.easy.tag"),
    },
    {
      id: "normal",
      title: t("difficultySelector.options.normal.title"),
      subtitle: t("difficultySelector.options.normal.subtitle"),
      description: t("difficultySelector.options.normal.description"),
      tag: t("difficultySelector.options.normal.tag"),
    },
    {
      id: "hard",
      title: t("difficultySelector.options.hard.title"),
      subtitle: t("difficultySelector.options.hard.subtitle"),
      description: t("difficultySelector.options.hard.description"),
      tag: t("difficultySelector.options.hard.tag"),
    },
  ]), [t]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="wc-difficulty-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif text-[var(--text-primary)]">{t("difficultySelector.title")}</DialogTitle>
          <DialogDescription className="text-[var(--text-muted)]">
            {t("difficultySelector.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="wc-difficulty-grid">
          {options.map((option) => {
            const active = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                className="wc-difficulty-card"
                data-active={active ? "true" : "false"}
                aria-pressed={active}
                onClick={() => onChange(option.id)}
              >
                <div className="wc-difficulty-card-head">
                  <div>
                    <div className="wc-difficulty-title">{option.title}</div>
                    <div className="wc-difficulty-subtitle">{option.subtitle}</div>
                  </div>
                  <div className="wc-difficulty-pill">
                    <span>{option.tag}</span>
                    {active ? <CheckCircle size={16} weight="fill" /> : null}
                  </div>
                </div>
                <div className="wc-difficulty-desc">{option.description}</div>
              </button>
            );
          })}
        </div>

        <div className="wc-difficulty-footer">
          {t("difficultySelector.footer")}
        </div>
      </DialogContent>
    </Dialog>
  );
}
