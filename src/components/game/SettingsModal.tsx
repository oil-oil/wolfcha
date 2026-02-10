import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useCallback, useState, useEffect, useMemo } from "react";
import type { GameState } from "@/types/game";
import { aiLogger, type AILogEntry } from "@/lib/ai-logger";
import { useTranslations } from "next-intl";
import { useAppLocale } from "@/i18n/useAppLocale";

interface SoundSettingsSectionProps {
  bgmVolume: number;
  isSoundEnabled: boolean;
  isAiVoiceEnabled: boolean;
  isAutoAdvanceDialogueEnabled?: boolean;
  onBgmVolumeChange: (value: number) => void;
  onSoundEnabledChange: (value: boolean) => void;
  onAiVoiceEnabledChange: (value: boolean) => void;
  onAutoAdvanceDialogueEnabledChange?: (value: boolean) => void;
}

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bgmVolume: number;
  isSoundEnabled: boolean;
  isAiVoiceEnabled: boolean;
  isAutoAdvanceDialogueEnabled: boolean;
  gameState: GameState;
  onBgmVolumeChange: (value: number) => void;
  onSoundEnabledChange: (value: boolean) => void;
  onAiVoiceEnabledChange: (value: boolean) => void;
  onAutoAdvanceDialogueEnabledChange: (value: boolean) => void;
  // Exit game functionality
  isGameInProgress?: boolean;
  onExitGame?: () => void;
}

export function SoundSettingsSection({
  bgmVolume,
  isSoundEnabled,
  isAiVoiceEnabled,
  isAutoAdvanceDialogueEnabled = false,
  onBgmVolumeChange,
  onSoundEnabledChange,
  onAiVoiceEnabledChange,
  onAutoAdvanceDialogueEnabledChange,
}: SoundSettingsSectionProps) {
  const t = useTranslations();
  const volumePercent = Math.round(bgmVolume * 100);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm text-[var(--text-primary)]">
          <span>{t("settings.audio.bgmVolume")}</span>
          <span className="text-[var(--text-secondary)]">{volumePercent}%</span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={volumePercent}
          onValueChange={(value) => onBgmVolumeChange(value / 100)}
          disabled={!isSoundEnabled}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-[var(--text-primary)]">{t("settings.audio.masterSwitch")}</div>
          <div className="text-xs text-[var(--text-muted)]">{t("settings.audio.masterDescription")}</div>
        </div>
        <Switch checked={isSoundEnabled} onCheckedChange={onSoundEnabledChange} />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-[var(--text-primary)]">{t("settings.audio.aiVoice")}</div>
          <div className="text-xs text-[var(--text-muted)]">{t("settings.audio.aiVoiceDescription")}</div>
        </div>
        <Switch
          checked={isAiVoiceEnabled}
          onCheckedChange={onAiVoiceEnabledChange}
          disabled={!isSoundEnabled}
        />
      </div>

      {onAutoAdvanceDialogueEnabledChange && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[var(--text-primary)]">{t("settings.audio.autoAdvance")}</div>
            <div className="text-xs text-[var(--text-muted)]">{t("settings.audio.autoAdvanceDesc")}</div>
          </div>
          <Switch
            checked={isAutoAdvanceDialogueEnabled}
            onCheckedChange={onAutoAdvanceDialogueEnabledChange}
          />
        </div>
      )}
    </div>
  );
}

export function SettingsModal({
  open,
  onOpenChange,
  bgmVolume,
  isSoundEnabled,
  isAiVoiceEnabled,
  isAutoAdvanceDialogueEnabled,
  gameState,
  onBgmVolumeChange,
  onSoundEnabledChange,
  onAiVoiceEnabledChange,
  onAutoAdvanceDialogueEnabledChange,
  isGameInProgress = false,
  onExitGame,
}: SettingsModalProps) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const discordInviteUrl = "https://discord.gg/ETkdZWgy";
  const [view, setView] = useState<"settings" | "about" | "exitConfirm">("settings");
  const [groupImgOk, setGroupImgOk] = useState<boolean | null>(null);
  const [aiLogs, setAiLogs] = useState<AILogEntry[]>([]);

  // Handle exit game confirmation
  const handleExitConfirm = useCallback(() => {
    onExitGame?.();
    onOpenChange(false);
    setView("settings");
  }, [onExitGame, onOpenChange]);

  const handleExitCancel = useCallback(() => {
    setView("settings");
  }, []);

  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

  // Reset view to settings when modal closes
  useEffect(() => {
    if (!open) {
      // Use a small delay to avoid visual flicker during close animation
      const timer = window.setTimeout(() => setView("settings"), 200);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const logs = await aiLogger.getLogs();
        if (!cancelled) setAiLogs(Array.isArray(logs) ? (logs as AILogEntry[]) : []);
      } catch {
        if (!cancelled) setAiLogs([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const logJsonText = useMemo(() => {
    return JSON.stringify(aiLogs, null, 2);
  }, [aiLogs]);

  const handleCopyLog = useCallback(async () => {
    try {
      const freshLogs = await aiLogger.getLogs();
      const freshJsonText = JSON.stringify(freshLogs, null, 2);
      await navigator.clipboard.writeText(freshJsonText);
      toast(t("settings.toast.copySuccess"));
    } catch {
      toast(t("settings.toast.copyFail.title"), { description: t("settings.toast.copyFail.description") });
    }
  }, [t]);

  const handleDownloadLog = useCallback(async () => {
    try {
      const freshLogs = await aiLogger.getLogs();
      const freshJsonText = JSON.stringify(freshLogs, null, 2);
      const blob = new Blob([freshJsonText], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeGameId = (gameState.gameId || "").replace(/[^a-zA-Z0-9_-]/g, "");
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `wolfcha-log-${safeGameId || "game"}-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(t("settings.toast.exportSuccess"));
    } catch {
      toast(t("settings.toast.exportFail"));
    }
  }, [gameState.gameId, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-[var(--text-primary)]">
            {view === "about" ? t("settings.about.title") : view === "exitConfirm" ? t("settings.game.exitConfirmTitle") : t("settings.title")}
          </DialogTitle>
          <DialogDescription className="text-[var(--text-muted)]">
            {view === "about" ? t("settings.about.description") : view === "exitConfirm" ? t("settings.game.exitConfirmDescription") : t("settings.description")}
          </DialogDescription>
        </DialogHeader>

        {view === "exitConfirm" ? (
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-red-500/30 bg-red-500/10 p-4">
              <div className="text-sm text-[var(--text-primary)]">
                {t("settings.game.exitConfirmDescription")}
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleExitCancel}
                className="flex-1"
              >
                {t("settings.game.exitCancelButton")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleExitConfirm}
                className="flex-1"
              >
                {t("settings.game.exitConfirmButton")}
              </Button>
            </div>
          </div>
        ) : view === "about" ? (
          <div className="space-y-5">
            <div className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-card)] p-3">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt={t("settings.about.appName")}
                  className="h-12 w-12 shrink-0 rounded-xl border-2 border-[var(--border-color)] bg-[var(--bg-card)] object-cover"
                />
                <div className="min-w-0">
                  <div className="text-sm text-[var(--text-primary)] font-medium leading-tight">{t("settings.about.appName")}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">{t("settings.about.version", { version: appVersion })}</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
              <div className="text-sm font-medium text-[var(--text-primary)]">{t("settings.about.group.title")}</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">{t("settings.about.group.description")}</div>
              <div className="mt-3 flex items-center justify-center">
                {locale === "en" ? (
                  <Button asChild variant="outline">
                    <a href={discordInviteUrl} target="_blank" rel="noopener noreferrer">
                      Discord
                    </a>
                  </Button>
                ) : (
                  <>
                    {groupImgOk !== false && (
                      <img
                        src="/group.png"
                        alt={t("settings.about.group.alt")}
                        className="w-full max-w-[260px] max-h-[34vh] sm:max-w-[300px] sm:max-h-[42vh] rounded-md border-2 border-[var(--border-color)] bg-white object-contain"
                        onLoad={() => setGroupImgOk(true)}
                        onError={() => setGroupImgOk(false)}
                      />
                    )}
                    {groupImgOk === false && (
                      <div className="text-xs text-[var(--text-muted)]">{t("settings.about.group.missing")}</div>
                    )}
                  </>
                )}
              </div>
            </div>

            <Button type="button" variant="outline" onClick={() => setView("settings")} className="w-full">
              {t("settings.about.back")}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
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

            <div className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 space-y-3">
              <div>
                <div className="text-sm font-medium text-[var(--text-primary)]">{t("settings.logs.title")}</div>
                <div className="text-xs text-[var(--text-muted)]">{t("settings.logs.description")}</div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => { void handleCopyLog(); }} className="flex-1">
                  {t("settings.logs.copy")}
                </Button>
                <Button type="button" variant="default" onClick={handleDownloadLog} className="flex-1">
                  {t("settings.logs.export")}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-card)] p-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-[var(--text-primary)]">{t("settings.about.cardTitle")}</div>
                <div className="text-xs text-[var(--text-muted)]">{t("settings.about.cardDescription")}</div>
              </div>
              <Button type="button" variant="outline" onClick={() => setView("about")}>
                {t("settings.about.view")}
              </Button>
            </div>

            {/* Exit Game Button - only show when game is in progress */}
            {isGameInProgress && onExitGame && (
              <div className="rounded-lg border-2 border-red-500/30 bg-red-500/5 p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">{t("settings.game.exitGame")}</div>
                  <div className="text-xs text-[var(--text-muted)]">{t("settings.game.exitGameDescription")}</div>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setView("exitConfirm")}
                >
                  {t("settings.game.exitGame")}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
