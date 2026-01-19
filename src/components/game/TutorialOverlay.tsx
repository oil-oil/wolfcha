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

// Role content configuration
const ROLE_CONFIG: Record<Role, {
  title: string;
  desc: string;
  points: string[];
  action: string;
  tips: string[];
  accent: string;
  bg: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}> = {
  Werewolf: {
    title: "狼人",
    desc: "你的目标是消灭所有好人",
    points: [
      "夜晚与其他狼人商议，选择一名好人击杀",
      "白天伪装成好人，误导其他玩家的判断",
    ],
    action: "点击好人头像选择击杀目标",
    tips: ["和队友配合好", "说话要像好人，但别太完美"],
    accent: "var(--color-wolf)",
    bg: "var(--color-wolf-bg)",
    Icon: WerewolfIcon,
  },
  Seer: {
    title: "预言家",
    desc: "你可以查验玩家的真实身份",
    points: [
      "夜晚查验一名玩家，系统告诉你是好人还是狼人",
      "白天通过发言传递查验信息，引导投票",
    ],
    action: "点击玩家头像进行查验",
    tips: ["慢慢建立信任再公布信息", "先让别人相信你是预言家"],
    accent: "var(--color-seer)",
    bg: "var(--color-seer-bg)",
    Icon: SeerIcon,
  },
  Witch: {
    title: "女巫",
    desc: "你有解药和毒药各一瓶",
    points: [
      "解药：可以救活当晚被狼人击杀的玩家（一次）",
      "毒药：可以毒杀任意一名玩家（一次）",
    ],
    action: "选择救人、毒人或跳过",
    tips: ["药很珍贵，不要随便用", "信息不够时等一等"],
    accent: "var(--color-witch)",
    bg: "var(--color-witch-bg)",
    Icon: WitchIcon,
  },
  Hunter: {
    title: "猎人",
    desc: "你出局时可以开枪带走一人",
    points: [
      "夜晚不需要行动，等待天亮",
      "当你死亡或被放逐时，可以开枪带走一人",
    ],
    action: "点击玩家头像开枪",
    tips: ["不要轻易暴露身份", "出局前想清楚谁最可疑"],
    accent: "var(--color-hunter)",
    bg: "var(--color-hunter-bg)",
    Icon: HunterIcon,
  },
  Guard: {
    title: "守卫",
    desc: "你可以保护玩家免受狼人击杀",
    points: [
      "夜晚守护一名玩家，他当晚不会被狼人击杀",
      "不能连续两晚守护同一人",
    ],
    action: "点击玩家头像进行守护",
    tips: ["守住关键时刻比守关键人更重要", "不要暴露守了谁"],
    accent: "var(--color-guard)",
    bg: "var(--color-guard-bg)",
    Icon: GuardIcon,
  },
  Villager: {
    title: "村民",
    desc: "你没有特殊能力，但判断同样重要",
    points: [
      "夜晚不需要行动，等待天亮",
      "白天认真听发言，找出逻辑漏洞，投票可疑的人",
    ],
    action: "投票时点击玩家头像",
    tips: ["说话要有依据", "多听多想"],
    accent: "var(--color-villager)",
    bg: "var(--color-villager-bg)",
    Icon: VillagerIcon,
  },
};

export function TutorialOverlay({
  open,
  tutorial,
  onOpenChange,
  autoPromptEnabled,
  onAutoPromptChange,
}: TutorialOverlayProps) {
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
        title: "夜晚我们可以做什么？",
        body: (
          <div className="space-y-4">
            <p>夜晚只有<strong>狼人和神职</strong>会行动，村民与猎人等待天亮。</p>
            <p>系统会依次提示对应职业睁眼。轮到你时，屏幕会显示你的职业立绘。</p>
            <p className="text-amber-300/90">操作方式：点击玩家头像选择目标，再点击确认即可。</p>
          </div>
        ),
        accent: "var(--color-accent-light)",
        bg: "rgba(8,10,20,0.9)",
      };
    }

    if (renderTutorial.kind === "day_intro") {
      return {
        icon: DayIcon,
        title: "白天我们做什么？",
        body: (
          <div className="space-y-4">
            <p>白天所有存活的玩家都会参与，通过发言和投票找出狼人。</p>
            <div className="space-y-2">
              <p><strong>① 公布昨夜结果</strong> - 系统公布谁出局了</p>
              <p><strong>② 依次发言</strong> - 轮到你时说出推理和怀疑</p>
              <p><strong>③ 投票放逐</strong> - 得票最多的人出局</p>
            </div>
            <p className="text-amber-300/90">发言时说出你的推理依据，好人要团结起来找到真正的狼人。</p>
          </div>
        ),
        accent: "var(--color-gold)",
        bg: "rgba(24,18,10,0.88)",
      };
    }

    // Role tutorial
    const role = renderTutorial.role ? ROLE_CONFIG[renderTutorial.role] : ROLE_CONFIG.Villager;
    return {
      icon: role.Icon,
      title: `${role.title}可以做什么？`,
      body: (
        <div className="space-y-4">
          <p className="text-white/90">{role.desc}</p>
          
          <div className="space-y-2">
            {role.points.map((point, i) => (
              <p key={i} className="flex items-start gap-2">
                <span className="text-amber-300/90 shrink-0">•</span>
                <span>{point}</span>
              </p>
            ))}
          </div>

          <p className="text-amber-300/90 font-medium">
            操作：{role.action}
          </p>

          {role.tips.length > 0 && (
            <div className="pt-2 border-t border-white/10 space-y-1">
              <p className="text-white/60 text-xs uppercase tracking-wider">提示</p>
              {role.tips.map((tip, i) => (
                <p key={i} className="text-white/70 text-sm">• {tip}</p>
              ))}
            </div>
          )}
        </div>
      ),
      accent: role.accent,
      bg: role.bg,
    };
  }, [renderTutorial]);

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
                    <div className="text-xs uppercase tracking-[0.3em] text-white/55">Guide</div>
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
                        <span>不再自动提示</span>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => onOpenChange(false)}
                    className="px-5 py-2 rounded-lg text-sm font-semibold text-white/90 bg-white/10 hover:bg-white/15 border border-white/15 transition-colors"
                    style={{ boxShadow: `0 10px 24px rgba(0,0,0,0.35), 0 0 0 2px ${content.accent}22` }}
                  >
                    我知道了
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
