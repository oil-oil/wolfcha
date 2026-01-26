"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DayIcon,
  GuardIcon,
  HunterIcon,
  NightIcon,
  SeerIcon,
  VillagerIcon,
  WerewolfIcon,
  WitchIcon,
} from "@/components/icons/FlatIcons";
import type { Phase, Role } from "@/types/game";
import { Switch } from "@/components/ui/switch";
import { useTranslations } from "next-intl";

export type TutorialKind = "night_intro" | "day_intro" | "role";

export interface TutorialPayload {
  kind: TutorialKind;
  role?: Role;
  phase?: Phase;
}

interface TutorialOverlayProps {
  open: boolean;
  tutorial: TutorialPayload | null;
  onOpenChange: (open: boolean) => void;
  autoPromptEnabled: boolean;
  onAutoPromptChange?: (enabled: boolean) => void;
}

const ROLE_META: Record<Role, { accent: string; bg: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  Werewolf: { accent: "var(--color-wolf)", bg: "var(--color-wolf-bg)", Icon: WerewolfIcon },
  Seer: { accent: "var(--color-seer)", bg: "var(--color-seer-bg)", Icon: SeerIcon },
  Witch: { accent: "var(--color-witch)", bg: "var(--color-witch-bg)", Icon: WitchIcon },
  Hunter: { accent: "var(--color-hunter)", bg: "var(--color-hunter-bg)", Icon: HunterIcon },
  Guard: { accent: "var(--color-guard)", bg: "var(--color-guard-bg)", Icon: GuardIcon },
  Villager: { accent: "var(--color-villager)", bg: "var(--color-villager-bg)", Icon: VillagerIcon },
};

export function TutorialOverlay({
  open,
  tutorial,
  onOpenChange,
  autoPromptEnabled,
  onAutoPromptChange,
}: TutorialOverlayProps) {
  const t = useTranslations();
  const [renderTutorial, setRenderTutorial] = useState<TutorialPayload | null>(tutorial);

  useEffect(() => {
    if (tutorial) {
      setRenderTutorial(tutorial);
    }
  }, [tutorial]);

  const content = useMemo(() => {
    if (!renderTutorial) return null;

    if (renderTutorial.kind === "night_intro") {
      return {
        icon: NightIcon,
        title: t("tutorialOverlay.nightIntro.title"),
        body: (
          <div className="space-y-4">
            <p>
              {t.rich("tutorialOverlay.nightIntro.line1", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <p>{t("tutorialOverlay.nightIntro.line2")}</p>
            <p className="text-amber-300/90">{t("tutorialOverlay.nightIntro.line3")}</p>
          </div>
        ),
        accent: "var(--color-accent-light)",
        bg: "rgba(8,10,20,0.9)",
      };
    }

    if (renderTutorial.kind === "day_intro") {
      return {
        icon: DayIcon,
        title: t("tutorialOverlay.dayIntro.title"),
        body: (
          <div className="space-y-4">
            <p>{t("tutorialOverlay.dayIntro.line1")}</p>
            <div className="space-y-2">
              <p><strong>{t("tutorialOverlay.dayIntro.step1.title")}</strong> - {t("tutorialOverlay.dayIntro.step1.desc")}</p>
              <p><strong>{t("tutorialOverlay.dayIntro.step2.title")}</strong> - {t("tutorialOverlay.dayIntro.step2.desc")}</p>
              <p><strong>{t("tutorialOverlay.dayIntro.step3.title")}</strong> - {t("tutorialOverlay.dayIntro.step3.desc")}</p>
            </div>
            <p className="text-amber-300/90">{t("tutorialOverlay.dayIntro.line3")}</p>
          </div>
        ),
        accent: "var(--color-gold)",
        bg: "rgba(24,18,10,0.88)",
      };
    }

    // Role tutorial
    const roleKey = renderTutorial.role ?? "Villager";
    const roleLabelMap: Record<Role, string> = {
      Werewolf: t("roles.werewolf"),
      Seer: t("roles.seer"),
      Witch: t("roles.witch"),
      Hunter: t("roles.hunter"),
      Guard: t("roles.guard"),
      Villager: t("roles.villager"),
    };
    const roleDataMap = t.raw("tutorialOverlay.roles" as any) as Record<Role, {
      desc: string;
      points: string[];
      action: string;
      tips: string[];
    }>;
    const roleData = roleDataMap[roleKey];
    const roleMeta = ROLE_META[roleKey];
    return {
      icon: roleMeta.Icon,
      title: t("tutorialOverlay.roleTitle", { role: roleLabelMap[roleKey] }),
      body: (
        <div className="space-y-4">
          <p className="text-white/90">{roleData.desc}</p>
          
          <div className="space-y-2">
            {roleData.points.map((point, i) => (
              <p key={i} className="flex items-start gap-2">
                <span className="text-amber-300/90 shrink-0">•</span>
                <span>{point}</span>
              </p>
            ))}
          </div>

          <p className="text-amber-300/90 font-medium">
            {t("tutorialOverlay.actionLabel")}{roleData.action}
          </p>

          {roleData.tips.length > 0 && (
            <div className="pt-2 border-t border-white/10 space-y-1">
              <p className="text-white/60 text-xs uppercase tracking-wider">{t("tutorialOverlay.tipsLabel")}</p>
              {roleData.tips.map((tip, i) => (
                <p key={i} className="text-white/70 text-sm">• {tip}</p>
              ))}
            </div>
          )}
        </div>
      ),
      accent: roleMeta.accent,
      bg: roleMeta.bg,
    };
  }, [renderTutorial, t]);

  if (!renderTutorial || !content) return null;

  const IconComponent = content.icon;
  const surfaceGradient = `linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.66) 55%, rgba(0,0,0,0.28) 100%), linear-gradient(135deg, ${content.bg} 0%, rgba(255,255,255,0.04) 55%, rgba(0,0,0,0.12) 100%)`;

  return (
    <AnimatePresence
      onExitComplete={() => {
        if (!open) {
          setRenderTutorial(null);
        }
      }}
    >
      {open && (
        <motion.div
          key="tutorial-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[65] flex items-center justify-center px-4 py-6"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            style={{
              background:
                "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.65) 55%, rgba(0,0,0,0.78) 100%)",
            }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="relative w-full max-w-[560px]"
            style={{
              filter: "drop-shadow(0 24px 80px rgba(0,0,0,0.75))",
            }}
          >
            <div
              className="rounded-2xl p-[1px]"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.04))",
              }}
            >
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  background: surfaceGradient,
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {/* Header */}
                <div className="px-6 pt-6 pb-4 flex items-center gap-4 border-b border-white/10">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                    style={{
                      background: "rgba(0,0,0,0.28)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      boxShadow: `0 0 0 1px rgba(255,255,255,0.06) inset, 0 10px 30px rgba(0,0,0,0.35)`,
                    }}
                  >
                    <IconComponent size={28} style={{ color: content.accent }} />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.3em] text-white/55">{t("tutorialOverlay.guideLabel")}</div>
                    <div className="text-2xl font-bold text-white font-serif">{content.title}</div>
                  </div>
                </div>

                {/* Body */}
                <div className="px-6 py-5 text-white/88 text-[15px] leading-relaxed bg-black/20">
                  {content.body}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between bg-black/30">
                  <div className="flex items-center gap-3 text-xs text-white/55">
                    {onAutoPromptChange && (
                      <>
                        <Switch
                          checked={!autoPromptEnabled}
                          onCheckedChange={(checked) => onAutoPromptChange(!checked)}
                        />
                        <span>{t("tutorialOverlay.autoPromptOff")}</span>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => onOpenChange(false)}
                    className="px-5 py-2 rounded-lg text-sm font-semibold text-white/90 bg-white/10 hover:bg-white/15 border border-white/15 transition-colors"
                    style={{ boxShadow: `0 10px 24px rgba(0,0,0,0.35), 0 0 0 2px ${content.accent}22` }}
                  >
                    {t("tutorialOverlay.confirm")}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
