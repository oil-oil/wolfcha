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

interface GameSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  difficulty: DifficultyLevel;
  onDifficultyChange: (value: DifficultyLevel) => void;
  playerCount: number;
  onPlayerCountChange: (value: number) => void;
  isGenshinMode: boolean;
  onGenshinModeChange: (value: boolean) => void;
  isSpectatorMode: boolean;
  onSpectatorModeChange: (value: boolean) => void;
  bgmVolume: number;
  isSoundEnabled: boolean;
  isAiVoiceEnabled: boolean;
  isAutoAdvanceDialogueEnabled: boolean;
  onBgmVolumeChange: (value: number) => void;
  onSoundEnabledChange: (value: boolean) => void;
  onAiVoiceEnabledChange: (value: boolean) => void;
  onAutoAdvanceDialogueEnabledChange: (value: boolean) => void;
}


export function GameSetupModal({
  open,
  onOpenChange,
  difficulty,
  onDifficultyChange,
  playerCount,
  onPlayerCountChange,
  isGenshinMode,
  onGenshinModeChange,
  isSpectatorMode,
  onSpectatorModeChange,
  bgmVolume,
  isSoundEnabled,
  isAiVoiceEnabled,
  isAutoAdvanceDialogueEnabled,
  onBgmVolumeChange,
  onSoundEnabledChange,
  onAiVoiceEnabledChange,
  onAutoAdvanceDialogueEnabledChange,
}: GameSetupModalProps) {
  const t = useTranslations();
  
  const DIFFICULTY_OPTIONS = [
    { value: "easy" as DifficultyLevel, label: t("difficulty.easy"), description: t("gameSetup.difficulty.easyDesc") },
    { value: "normal" as DifficultyLevel, label: t("difficulty.normal"), description: t("gameSetup.difficulty.normalDesc") },
    { value: "hard" as DifficultyLevel, label: t("difficulty.hard"), description: t("gameSetup.difficulty.hardDesc") },
  ];

  const PLAYER_COUNT_OPTIONS = [
    { value: 8, label: t("gameSetup.playerCount.8.title"), description: t("gameSetup.playerCount.8.description"), roles: t("gameSetup.playerCount.8.roles") },
    { value: 9, label: t("gameSetup.playerCount.9.title"), description: t("gameSetup.playerCount.9.description"), roles: t("gameSetup.playerCount.9.roles") },
    { value: 10, label: t("gameSetup.playerCount.10.title"), description: t("gameSetup.playerCount.10.description"), roles: t("gameSetup.playerCount.10.roles") },
    { value: 11, label: t("gameSetup.playerCount.11.title"), description: t("gameSetup.playerCount.11.description"), roles: t("gameSetup.playerCount.11.roles") },
    { value: 12, label: t("gameSetup.playerCount.12.title"), description: t("gameSetup.playerCount.12.description"), roles: t("gameSetup.playerCount.12.roles") },
  ];

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
            <div className="text-sm font-medium text-[var(--text-primary)]">{t("gameSetup.difficultyLabel")}</div>
            <Select
              value={difficulty}
              onValueChange={(value) => onDifficultyChange(value as DifficultyLevel)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("gameSetup.selectDifficulty")} />
              </SelectTrigger>
              <SelectContent>
                {DIFFICULTY_OPTIONS.map((option) => (
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
            <div className="text-sm font-medium text-[var(--text-primary)]">{t("gameSetup.playerCountLabel")}</div>
            <Select
              value={String(playerCount)}
              onValueChange={(value) => onPlayerCountChange(Number(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("gameSetup.selectPlayerCount")} />
              </SelectTrigger>
              <SelectContent>
                {PLAYER_COUNT_OPTIONS.map((option) => (
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
            <div className="text-sm font-medium text-[var(--text-primary)]">{t("gameSetup.genshinMode.title")}</div>
            <div className="text-xs text-[var(--text-muted)]">
              {t("gameSetup.genshinMode.description")}
            </div>
            </div>
            <Switch className="shrink-0 mt-1" checked={isGenshinMode} onCheckedChange={onGenshinModeChange} />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--text-primary)]">{t("gameSetup.spectatorMode.title")}</div>
            <div className="text-xs text-[var(--text-muted)]">
              {t("gameSetup.spectatorMode.description")}
            </div>
            </div>
            <Switch className="shrink-0 mt-1" checked={isSpectatorMode} onCheckedChange={onSpectatorModeChange} />
          </div>

          <div className="border-t border-[var(--border-color)] pt-4">
            <div className="text-sm font-medium text-[var(--text-primary)] mb-3">{t("gameSetup.soundLabel")}</div>
            <SoundSettingsSection
              bgmVolume={bgmVolume}
              isSoundEnabled={isSoundEnabled}
              isAiVoiceEnabled={isAiVoiceEnabled}
              isAutoAdvanceDialogueEnabled={isAutoAdvanceDialogueEnabled}
              onBgmVolumeChange={onBgmVolumeChange}
              onSoundEnabledChange={onSoundEnabledChange}
              onAiVoiceEnabledChange={onAiVoiceEnabledChange}
              onAutoAdvanceDialogueEnabledChange={onAutoAdvanceDialogueEnabledChange}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
