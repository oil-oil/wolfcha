"use client";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-[var(--text-primary)]">游戏设置</DialogTitle>
          <DialogDescription className="text-[var(--text-muted)]">
            在开局前调整难度与人数
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="text-sm font-medium text-[var(--text-primary)]">难度</div>
            <Select
              value={difficulty}
              onValueChange={(value) => onDifficultyChange(value as DifficultyLevel)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择难度" />
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
            <div className="text-sm font-medium text-[var(--text-primary)]">人数</div>
            <Select
              value={String(playerCount)}
              onValueChange={(value) => onPlayerCountChange(Number(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择人数" />
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
            <div className="text-sm font-medium text-[var(--text-primary)]">大模型原神模式</div>
            <div className="text-xs text-[var(--text-muted)]">
              默认情况下会为每位 AI 生成接近真实用户的角色背景与名字。开启后不再生成角色背景与名字，直接使用模型原名；如有重名会自动在后面加序号
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
