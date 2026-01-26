import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GameState } from "@/types/game";
import { aiLogger } from "@/lib/ai-logger";
import { useTranslations } from "next-intl";

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
}: SettingsModalProps) {
  const t = useTranslations();
  const [view, setView] = useState<"settings" | "about">("settings");
  const [groupImgOk, setGroupImgOk] = useState<boolean | null>(null);
  const [aiLogs, setAiLogs] = useState<unknown[]>([]);

  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const logs = await aiLogger.getLogs();
        if (!cancelled) setAiLogs(logs as unknown[]);
      } catch {
        if (!cancelled) setAiLogs([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const logJsonText = useMemo(() => {
    const exportedAt = new Date().toISOString();
    const env = typeof window === "undefined" ? undefined : {
      url: window.location.href,
      userAgent: window.navigator.userAgent,
      language: window.navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    const payload = {
      meta: {
        app: "wolfcha",
        appVersion,
        exportedAt,
      },
      env,
      settings: {
        bgmVolume,
        isSoundEnabled,
        isAiVoiceEnabled,
        isAutoAdvanceDialogueEnabled,
      },
      aiLogs,
      gameState,
    };

    return JSON.stringify(payload, null, 2);
  }, [aiLogs, appVersion, bgmVolume, gameState, isAiVoiceEnabled, isAutoAdvanceDialogueEnabled, isSoundEnabled]);

  const handleCopyLog = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(logJsonText);
      toast(t("settings.toast.copySuccess"));
    } catch {
      toast(t("settings.toast.copyFail.title"), { description: t("settings.toast.copyFail.description") });
    }
  }, [logJsonText]);

  const handleDownloadLog = useCallback(() => {
    try {
      const blob = new Blob([logJsonText], { type: "application/json;charset=utf-8" });
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
  }, [gameState.gameId, logJsonText]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-[var(--text-primary)]">
            {view === "about" ? t("settings.about.title") : t("settings.title")}
          </DialogTitle>
          <DialogDescription className="text-[var(--text-muted)]">
            {view === "about" ? t("settings.about.description") : t("settings.description")}
          </DialogDescription>
        </DialogHeader>

        {view === "about" ? (
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
