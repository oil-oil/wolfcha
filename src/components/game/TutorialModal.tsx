"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

interface TutorialModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TutorialModal({ open, onOpenChange }: TutorialModalProps) {
  const t = useTranslations();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="wc-tutorial-modal max-w-[720px] p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">{t("tutorialModal.title")}</DialogTitle>
          </DialogHeader>
          <div className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
            {t("tutorialModal.intro")}
          </div>
        </div>

        <ScrollArea className="wc-tutorial-scroll max-h-[70vh]">
          <div className="px-6 py-5 space-y-6 bg-[var(--bg-main)]">
            <section className="space-y-2">
              <div className="text-sm font-bold text-[var(--text-primary)]">{t("tutorialModal.sections.factions.title")}</div>
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                - {t("tutorialModal.sections.factions.line1")}
                <br />
                - {t("tutorialModal.sections.factions.line2")}
              </div>
            </section>

            <section className="space-y-2">
              <div className="text-sm font-bold text-[var(--text-primary)]">{t("tutorialModal.sections.flow.title")}</div>
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                - {t("tutorialModal.sections.flow.line1")}
                <br />
                - {t("tutorialModal.sections.flow.line2")}
                <br />
                - {t("tutorialModal.sections.flow.line3")}
              </div>
            </section>

            <section className="space-y-2">
              <div className="text-sm font-bold text-[var(--text-primary)]">{t("tutorialModal.sections.speech.title")}</div>
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                - {t("tutorialModal.sections.speech.line1")}
                <br />
                - {t("tutorialModal.sections.speech.line2")}
                <br />
                - {t("tutorialModal.sections.speech.line3")}
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-bold text-[var(--text-primary)]">{t("tutorialModal.sections.roles.title")}</div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/70 p-4">
                <div className="font-semibold text-[var(--text-primary)] mb-1">{t("tutorialModal.sections.roles.werewolf.title")}</div>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {t("tutorialModal.sections.roles.werewolf.description")}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/70 p-4">
                <div className="font-semibold text-[var(--text-primary)] mb-1">{t("tutorialModal.sections.roles.seer.title")}</div>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {t("tutorialModal.sections.roles.seer.description")}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/70 p-4">
                <div className="font-semibold text-[var(--text-primary)] mb-1">{t("tutorialModal.sections.roles.witch.title")}</div>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {t("tutorialModal.sections.roles.witch.description")}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/70 p-4">
                <div className="font-semibold text-[var(--text-primary)] mb-1">{t("tutorialModal.sections.roles.hunter.title")}</div>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {t("tutorialModal.sections.roles.hunter.description")}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/70 p-4">
                <div className="font-semibold text-[var(--text-primary)] mb-1">{t("tutorialModal.sections.roles.guard.title")}</div>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {t("tutorialModal.sections.roles.guard.description")}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/70 p-4">
                <div className="font-semibold text-[var(--text-primary)] mb-1">{t("tutorialModal.sections.roles.villager.title")}</div>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {t("tutorialModal.sections.roles.villager.description")}
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <div className="text-sm font-bold text-[var(--text-primary)]">{t("tutorialModal.sections.tips.title")}</div>
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                - {t("tutorialModal.sections.tips.line1")}
                <br />
                - {t("tutorialModal.sections.tips.line2")}
              </div>
            </section>
          </div>
        </ScrollArea>

        <div className="px-6 py-4 border-t border-[var(--border-color)] bg-[var(--bg-card)] flex items-center justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("tutorialModal.actions.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
