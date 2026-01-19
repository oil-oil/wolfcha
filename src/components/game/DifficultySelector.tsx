"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DifficultyLevel } from "@/types/game";

interface DifficultySelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: DifficultyLevel;
  onChange: (value: DifficultyLevel) => void;
}

const DIFFICULTY_OPTIONS: Array<{
  id: DifficultyLevel;
  title: string;
  subtitle: string;
  description: string;
  tag: string;
}> = [
  {
    id: "easy",
    title: "新手局",
    subtitle: "轻松氛围",
    description: "更直觉、更容易信任他人，适合初次体验。",
    tag: "放松",
  },
  {
    id: "normal",
    title: "标准局",
    subtitle: "均衡推理",
    description: "信息量适中，逻辑与表演强度平衡。",
    tag: "经典",
  },
  {
    id: "hard",
    title: "高阶局",
    subtitle: "深度对抗",
    description: "推理更复杂，博弈更激烈，适合老玩家。",
    tag: "挑战",
  },
];

export function DifficultySelector({
  open,
  onOpenChange,
  value,
  onChange,
}: DifficultySelectorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="wc-difficulty-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif text-[var(--text-primary)]">难度设置</DialogTitle>
          <DialogDescription className="text-[var(--text-muted)]">
            选择 AI 的推理深度与话术强度
          </DialogDescription>
        </DialogHeader>

        <div className="wc-difficulty-grid">
          {DIFFICULTY_OPTIONS.map((option) => {
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
          难度只影响 AI 行为强度，游戏规则保持一致。
        </div>
      </DialogContent>
    </Dialog>
  );
}
