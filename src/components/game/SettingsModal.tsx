import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useCallback, useMemo, useState } from "react";
import type { GameState } from "@/types/game";

interface SoundSettingsSectionProps {
  bgmVolume: number;
  isSoundEnabled: boolean;
  isAiVoiceEnabled: boolean;
  onBgmVolumeChange: (value: number) => void;
  onSoundEnabledChange: (value: boolean) => void;
  onAiVoiceEnabledChange: (value: boolean) => void;
}

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bgmVolume: number;
  isSoundEnabled: boolean;
  isAiVoiceEnabled: boolean;
  gameState: GameState;
  onBgmVolumeChange: (value: number) => void;
  onSoundEnabledChange: (value: boolean) => void;
  onAiVoiceEnabledChange: (value: boolean) => void;
}

export function SoundSettingsSection({
  bgmVolume,
  isSoundEnabled,
  isAiVoiceEnabled,
  onBgmVolumeChange,
  onSoundEnabledChange,
  onAiVoiceEnabledChange,
}: SoundSettingsSectionProps) {
  const volumePercent = Math.round(bgmVolume * 100);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm text-[var(--text-primary)]">
          <span>背景音量</span>
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
          <div className="text-sm font-medium text-[var(--text-primary)]">总开关</div>
          <div className="text-xs text-[var(--text-muted)]">关闭后将静音所有音效</div>
        </div>
        <Switch checked={isSoundEnabled} onCheckedChange={onSoundEnabledChange} />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-[var(--text-primary)]">角色配音</div>
          <div className="text-xs text-[var(--text-muted)]">控制 AI 角色语音播放</div>
        </div>
        <Switch
          checked={isAiVoiceEnabled}
          onCheckedChange={onAiVoiceEnabledChange}
          disabled={!isSoundEnabled}
        />
      </div>
    </div>
  );
}

export function SettingsModal({
  open,
  onOpenChange,
  bgmVolume,
  isSoundEnabled,
  isAiVoiceEnabled,
  gameState,
  onBgmVolumeChange,
  onSoundEnabledChange,
  onAiVoiceEnabledChange,
}: SettingsModalProps) {
  const [view, setView] = useState<"settings" | "about">("settings");
  const [groupImgOk, setGroupImgOk] = useState<boolean | null>(null);

  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

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
      },
      gameState,
    };

    return JSON.stringify(payload, null, 2);
  }, [appVersion, bgmVolume, gameState, isAiVoiceEnabled, isSoundEnabled]);

  const handleCopyLog = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(logJsonText);
      toast("已复制日志 JSON");
    } catch {
      toast("复制失败", { description: "当前环境不支持剪贴板或权限被拒绝" });
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
      toast("已导出日志文件");
    } catch {
      toast("导出失败");
    }
  }, [gameState.gameId, logJsonText]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-[var(--text-primary)]">
            {view === "about" ? "关于我们" : "设置"}
          </DialogTitle>
          <DialogDescription className="text-[var(--text-muted)]">
            {view === "about" ? "了解 Wolfcha" : "调整偏好并导出日志"}
          </DialogDescription>
        </DialogHeader>

        {view === "about" ? (
          <div className="space-y-5">
            <div className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-card)] p-3">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="Wolfcha"
                  className="h-12 w-12 shrink-0 rounded-xl border-2 border-[var(--border-color)] bg-[var(--bg-card)] object-cover"
                />
                <div className="min-w-0">
                  <div className="text-sm text-[var(--text-primary)] font-medium leading-tight">Wolfcha（猹人杀）</div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">版本号：v{appVersion}</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
              <div className="text-sm font-medium text-[var(--text-primary)]">加入用户群</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">扫码入群，反馈问题与建议</div>
              <div className="mt-3 flex items-center justify-center">
                {groupImgOk !== false && (
                  <img
                    src="/group.png"
                    alt="Wolfcha 用户群"
                    className="w-full max-w-[260px] max-h-[34vh] sm:max-w-[300px] sm:max-h-[42vh] rounded-md border-2 border-[var(--border-color)] bg-white object-contain"
                    onLoad={() => setGroupImgOk(true)}
                    onError={() => setGroupImgOk(false)}
                  />
                )}
                {groupImgOk === false && (
                  <div className="text-xs text-[var(--text-muted)]">未找到群组图片（public/group.png）</div>
                )}
              </div>
            </div>

            <Button type="button" variant="outline" onClick={() => setView("settings")} className="w-full">
              返回设置
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <SoundSettingsSection
              bgmVolume={bgmVolume}
              isSoundEnabled={isSoundEnabled}
              isAiVoiceEnabled={isAiVoiceEnabled}
              onBgmVolumeChange={onBgmVolumeChange}
              onSoundEnabledChange={onSoundEnabledChange}
              onAiVoiceEnabledChange={onAiVoiceEnabledChange}
            />

            <div className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 space-y-3">
              <div>
                <div className="text-sm font-medium text-[var(--text-primary)]">日志</div>
                <div className="text-xs text-[var(--text-muted)]">遇到问题时，可导出 JSON 日志便于定位</div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => { void handleCopyLog(); }} className="flex-1">
                  复制 JSON
                </Button>
                <Button type="button" variant="default" onClick={handleDownloadLog} className="flex-1">
                  导出文件
                </Button>
              </div>
            </div>

            <div className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-card)] p-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-[var(--text-primary)]">关于我们</div>
                <div className="text-xs text-[var(--text-muted)]">Logo、版本号、入群二维码</div>
              </div>
              <Button type="button" variant="outline" onClick={() => setView("about")}>
                查看
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
