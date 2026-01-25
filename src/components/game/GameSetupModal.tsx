"use client";

import { useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { DifficultyLevel } from "@/types/game";
import { SoundSettingsSection } from "@/components/game/SettingsModal";
import { useTranslations } from "next-intl";

interface DifficultyOption {
  value: DifficultyLevel;
  label: string;
  description: string;
}

interface PlayerCountOption {
  value: number;
  label: string;
  description: string;
  roles: string;
}

interface GameSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  difficulty: DifficultyLevel;
  onDifficultyChange: (value: DifficultyLevel) => void;
  playerCount: number;
  onPlayerCountChange: (value: number) => void;
  isGenshinMode: boolean;
  onGenshinModeChange: (value: boolean) => void;
  bgmVolume: number;
  isSoundEnabled: boolean;
  isAiVoiceEnabled: boolean;
  onBgmVolumeChange: (value: number) => void;
  onSoundEnabledChange: (value: boolean) => void;
  onAiVoiceEnabledChange: (value: boolean) => void;
}

const DIFFICULTY_OPTIONS: Array<{ value: DifficultyLevel; label: string; description: string }> = [
  { value: "easy", label: "新手局", description: "轻松氛围，适合初次体验" },
  { value: "normal", label: "标准局", description: "均衡推理，逻辑与表演平衡" },
  { value: "hard", label: "高阶局", description: "深度对抗，推理更复杂" },
];

const PLAYER_COUNT_OPTIONS: Array<{ value: number; label: string; description: string; roles: string }> = [
  { value: 8, label: "8人局", description: "3狼 3神 2民", roles: "神职：预言家、女巫、猎人" },
  { value: 9, label: "9人局", description: "3狼 3神 3民", roles: "神职：预言家、女巫、猎人" },
  { value: 10, label: "10人局", description: "3狼 4神 3民", roles: "神职：预言家、女巫、猎人、守卫" },
  { value: 11, label: "11人局", description: "4狼 4神 3民", roles: "神职：预言家、女巫、猎人、守卫" },
  { value: 12, label: "12人局", description: "4狼 4神 4民", roles: "神职：预言家、女巫、猎人、守卫" },
];

export function GameSetupModal({
  open,
  onOpenChange,
  difficulty,
  onDifficultyChange,
  playerCount,
  onPlayerCountChange,
  isGenshinMode,
  onGenshinModeChange,
  bgmVolume,
  isSoundEnabled,
  isAiVoiceEnabled,
  onBgmVolumeChange,
  onSoundEnabledChange,
  onAiVoiceEnabledChange,
}: GameSetupModalProps) {
  const t = useTranslations();
  const difficultyOptions = useMemo<DifficultyOption[]>(() => ([
    {
      value: "easy",
      label: t("difficultySelector.options.easy.title"),
      description: t("difficultySelector.options.easy.description"),
    },
    {
      value: "normal",
      label: t("difficultySelector.options.normal.title"),
      description: t("difficultySelector.options.normal.description"),
    },
    {
      value: "hard",
      label: t("difficultySelector.options.hard.title"),
      description: t("difficultySelector.options.hard.description"),
    },
  ]), [t]);
  const playerOptions = useMemo<PlayerCountOption[]>(() => ([
    {
      value: 8,
      label: t("playerCount.options.8.title"),
      description: t("playerCount.options.8.description"),
      roles: t("playerCount.options.8.roles"),
    },
    {
      value: 9,
      label: t("playerCount.options.9.title"),
      description: t("playerCount.options.9.description"),
      roles: t("playerCount.options.9.roles"),
    },
    {
      value: 10,
      label: t("playerCount.options.10.title"),
      description: t("playerCount.options.10.description"),
      roles: t("playerCount.options.10.roles"),
    },
    {
      value: 11,
      label: t("playerCount.options.11.title"),
      description: t("playerCount.options.11.description"),
      roles: t("playerCount.options.11.roles"),
    },
    {
      value: 12,
      label: t("playerCount.options.12.title"),
      description: t("playerCount.options.12.description"),
      roles: t("playerCount.options.12.roles"),
    },
  ]), [t]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-[var(--text-primary)]">{t("gameSetup.title")}</DialogTitle>
          <DialogDescription className="text-[var(--text-muted)]">
            {t("gameSetup.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="text-sm font-medium text-[var(--text-primary)]">{t("gameSetup.difficulty")}</div>
            <Select
              value={difficulty}
              onValueChange={(value) => onDifficultyChange(value as DifficultyLevel)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("gameSetup.difficultyPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {difficultyOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    label={option.label}
                    description={option.description}
                  />
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-[var(--text-primary)]">{t("gameSetup.playerCount")}</div>
            <Select
              value={String(playerCount)}
              onValueChange={(value) => onPlayerCountChange(Number(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("gameSetup.playerCountPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {playerOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={String(option.value)}
                    label={option.label}
                    description={`${option.description}｜${option.roles}`}
                  />
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--text-primary)]">{t("gameSetup.genshin.title")}</div>
            <div className="text-xs text-[var(--text-muted)]">
              {t("gameSetup.genshin.description")}
            </div>
            </div>
            <Switch className="shrink-0 mt-1" checked={isGenshinMode} onCheckedChange={onGenshinModeChange} />
          </div>

          <div className="border-t border-[var(--border-color)] pt-4">
            <div className="text-sm font-medium text-[var(--text-primary)] mb-3">声音</div>
            <SoundSettingsSection
              bgmVolume={bgmVolume}
              isSoundEnabled={isSoundEnabled}
              isAiVoiceEnabled={isAiVoiceEnabled}
              onBgmVolumeChange={onBgmVolumeChange}
              onSoundEnabledChange={onSoundEnabledChange}
              onAiVoiceEnabledChange={onAiVoiceEnabledChange}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
