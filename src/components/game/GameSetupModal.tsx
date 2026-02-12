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
import { SoundSettingsSection } from "@/components/game/SettingsModal";
import { useTranslations } from "next-intl";
import type { Role } from "@/types/game";

/** Return the unique roles present in the default configuration for a given player count. */
function getAvailableRoles(playerCount: number): Role[] {
  const configs: Record<number, Role[]> = {
    8: ["Werewolf", "Seer", "Witch", "Hunter", "Villager"],
    9: ["Werewolf", "Seer", "Witch", "Hunter", "Villager"],
    10: ["Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Villager"],
    11: ["Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Idiot", "Villager"],
    12: ["Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Idiot", "Villager"],
  };
  return configs[playerCount] ?? configs[10];
}

interface GameSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerCount: number;
  onPlayerCountChange: (value: number) => void;
  preferredRole: Role | "";
  onPreferredRoleChange: (value: Role | "") => void;
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
  playerCount,
  onPlayerCountChange,
  preferredRole,
  onPreferredRoleChange,
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

  const PLAYER_COUNT_OPTIONS = [
    { value: 8, label: t("gameSetup.playerCount.8.title"), description: t("gameSetup.playerCount.8.description"), roles: t("gameSetup.playerCount.8.roles") },
    { value: 9, label: t("gameSetup.playerCount.9.title"), description: t("gameSetup.playerCount.9.description"), roles: t("gameSetup.playerCount.9.roles") },
    { value: 10, label: t("gameSetup.playerCount.10.title"), description: t("gameSetup.playerCount.10.description"), roles: t("gameSetup.playerCount.10.roles") },
    { value: 11, label: t("gameSetup.playerCount.11.title"), description: t("gameSetup.playerCount.11.description"), roles: t("gameSetup.playerCount.11.roles") },
    { value: 12, label: t("gameSetup.playerCount.12.title"), description: t("gameSetup.playerCount.12.description"), roles: t("gameSetup.playerCount.12.roles") },
  ];

  const roleLabels = useMemo<Record<Role, string>>(
    () => ({
      Villager: t("roles.villager"),
      Werewolf: t("roles.werewolf"),
      WhiteWolfKing: t("roles.whiteWolfKing"),
      Seer: t("roles.seer"),
      Witch: t("roles.witch"),
      Hunter: t("roles.hunter"),
      Guard: t("roles.guard"),
      Idiot: t("roles.idiot"),
    }),
    [t]
  );

  const roleDescriptions = useMemo<Record<Role, string>>(
    () => ({
      Villager: t("gameSetup.rolePreference.desc.villager"),
      Werewolf: t("gameSetup.rolePreference.desc.werewolf"),
      WhiteWolfKing: t("gameSetup.rolePreference.desc.whiteWolfKing"),
      Seer: t("gameSetup.rolePreference.desc.seer"),
      Witch: t("gameSetup.rolePreference.desc.witch"),
      Hunter: t("gameSetup.rolePreference.desc.hunter"),
      Guard: t("gameSetup.rolePreference.desc.guard"),
      Idiot: t("gameSetup.rolePreference.desc.idiot"),
    }),
    [t]
  );

  const availableRoles = useMemo(() => getAvailableRoles(playerCount), [playerCount]);

  // Reset preferred role if it's no longer available for the current player count
  const effectivePreferredRole = preferredRole && availableRoles.includes(preferredRole) ? preferredRole : "";

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

          {!isSpectatorMode && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-[var(--text-primary)]">{t("gameSetup.rolePreference.label")}</div>
              <Select
                value={effectivePreferredRole || "_random"}
                onValueChange={(value) => onPreferredRoleChange(value === "_random" ? "" : (value as Role))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("gameSetup.rolePreference.random")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="_random"
                    label={t("gameSetup.rolePreference.random")}
                    description={t("gameSetup.rolePreference.randomDesc")}
                  />
                  {availableRoles.map((role) => (
                    <SelectItem
                      key={role}
                      value={role}
                      label={roleLabels[role]}
                      description={roleDescriptions[role]}
                    />
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-[var(--text-muted)]">
                {t("gameSetup.rolePreference.hint")}
              </div>
            </div>
          )}

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
