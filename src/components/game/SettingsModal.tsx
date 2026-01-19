import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bgmVolume: number;
  isSoundEnabled: boolean;
  isAiVoiceEnabled: boolean;
  onBgmVolumeChange: (value: number) => void;
  onSoundEnabledChange: (value: boolean) => void;
  onAiVoiceEnabledChange: (value: boolean) => void;
}

export function SettingsModal({
  open,
  onOpenChange,
  bgmVolume,
  isSoundEnabled,
  isAiVoiceEnabled,
  onBgmVolumeChange,
  onSoundEnabledChange,
  onAiVoiceEnabledChange,
}: SettingsModalProps) {
  const volumePercent = Math.round(bgmVolume * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-[var(--text-primary)]">声音设置</DialogTitle>
          <DialogDescription className="text-[var(--text-muted)]">
            调整背景音量与语音播放偏好
          </DialogDescription>
        </DialogHeader>

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
      </DialogContent>
    </Dialog>
  );
}
