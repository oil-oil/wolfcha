import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { DifficultyLevel } from "@/types/game";

export interface AudioSettings {
  bgmVolume: number;
  isSoundEnabled: boolean;
  isAiVoiceEnabled: boolean;
  isGenshinMode: boolean;
  isAutoAdvanceDialogueEnabled: boolean;
  isSpectatorMode: boolean;
}

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  bgmVolume: 0.35,
  isSoundEnabled: true,
  isAiVoiceEnabled: false,
  isGenshinMode: false,
  isAutoAdvanceDialogueEnabled: false,
  isSpectatorMode: false,
};

const clampVolume = (value: number) => Math.min(1, Math.max(0, value));

const normalizeAudioSettings = (value: Partial<AudioSettings>): AudioSettings => ({
  bgmVolume: clampVolume(
    typeof value.bgmVolume === "number" ? value.bgmVolume : DEFAULT_AUDIO_SETTINGS.bgmVolume
  ),
  isSoundEnabled:
    typeof value.isSoundEnabled === "boolean" ? value.isSoundEnabled : DEFAULT_AUDIO_SETTINGS.isSoundEnabled,
  isAiVoiceEnabled:
    typeof value.isAiVoiceEnabled === "boolean" ? value.isAiVoiceEnabled : DEFAULT_AUDIO_SETTINGS.isAiVoiceEnabled,
  isGenshinMode:
    typeof value.isGenshinMode === "boolean" ? value.isGenshinMode : DEFAULT_AUDIO_SETTINGS.isGenshinMode,
  isAutoAdvanceDialogueEnabled:
    typeof value.isAutoAdvanceDialogueEnabled === "boolean"
      ? value.isAutoAdvanceDialogueEnabled
      : DEFAULT_AUDIO_SETTINGS.isAutoAdvanceDialogueEnabled,
  isSpectatorMode:
    typeof value.isSpectatorMode === "boolean" ? value.isSpectatorMode : DEFAULT_AUDIO_SETTINGS.isSpectatorMode,
});

const rawAudioSettingsAtom = atomWithStorage<AudioSettings>("wolfcha.settings.audio", DEFAULT_AUDIO_SETTINGS);

export const audioSettingsAtom = atom(
  (get) => normalizeAudioSettings(get(rawAudioSettingsAtom)),
  (get, set, update: AudioSettings | ((prev: AudioSettings) => AudioSettings)) => {
    const prev = normalizeAudioSettings(get(rawAudioSettingsAtom));
    const next = typeof update === "function" ? update(prev) : update;
    set(rawAudioSettingsAtom, normalizeAudioSettings(next));
  }
);

const DEFAULT_PLAYER_COUNT = 10;
const MIN_PLAYER_COUNT = 8;
const MAX_PLAYER_COUNT = 12;

const normalizePlayerCount = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_PLAYER_COUNT;
  return Math.min(MAX_PLAYER_COUNT, Math.max(MIN_PLAYER_COUNT, Math.round(value)));
};

const rawPlayerCountAtom = atomWithStorage<number>("wolfcha.settings.player_count", DEFAULT_PLAYER_COUNT);

export const playerCountAtom = atom(
  (get) => normalizePlayerCount(get(rawPlayerCountAtom)),
  (get, set, update: number | ((prev: number) => number)) => {
    const prev = normalizePlayerCount(get(rawPlayerCountAtom));
    const next = typeof update === "function" ? update(prev) : update;
    set(rawPlayerCountAtom, normalizePlayerCount(next));
  }
);

const DEFAULT_DIFFICULTY: DifficultyLevel = "normal";
const DIFFICULTY_OPTIONS: DifficultyLevel[] = ["easy", "normal", "hard"];

const normalizeDifficulty = (value: DifficultyLevel) =>
  DIFFICULTY_OPTIONS.includes(value) ? value : DEFAULT_DIFFICULTY;

const rawDifficultyAtom = atomWithStorage<DifficultyLevel>("wolfcha.settings.difficulty", DEFAULT_DIFFICULTY);

export const difficultyAtom = atom(
  (get) => normalizeDifficulty(get(rawDifficultyAtom)),
  (get, set, update: DifficultyLevel | ((prev: DifficultyLevel) => DifficultyLevel)) => {
    const prev = normalizeDifficulty(get(rawDifficultyAtom));
    const next = typeof update === "function" ? update(prev) : update;
    set(rawDifficultyAtom, normalizeDifficulty(next));
  }
);
