"use client";

import { useCallback } from "react";
import { useAtom } from "jotai";
import { audioSettingsAtom } from "@/store/settings";

export function useSettings() {
  const [settings, setSettings] = useAtom(audioSettingsAtom);
  const isLoaded = true;

  const setBgmVolume = useCallback((value: number) => {
    setSettings((prev) => ({ ...prev, bgmVolume: value }));
  }, [setSettings]);

  const setSoundEnabled = useCallback((value: boolean) => {
    setSettings((prev) => ({ ...prev, isSoundEnabled: value }));
  }, [setSettings]);

  const setAiVoiceEnabled = useCallback((value: boolean) => {
    setSettings((prev) => ({ ...prev, isAiVoiceEnabled: value }));
  }, [setSettings]);

  const setAutoAdvanceDialogueEnabled = useCallback((value: boolean) => {
    setSettings((prev) => ({ ...prev, isAutoAdvanceDialogueEnabled: value }));
  }, [setSettings]);

  const setGenshinMode = useCallback((value: boolean) => {
    setSettings((prev) => ({ ...prev, isGenshinMode: value }));
  }, [setSettings]);

  const setSpectatorMode = useCallback((value: boolean) => {
    setSettings((prev) => ({ ...prev, isSpectatorMode: value }));
  }, [setSettings]);

  return {
    settings,
    isLoaded,
    setBgmVolume,
    setSoundEnabled,
    setAiVoiceEnabled,
    setGenshinMode,
    setSpectatorMode,
    setAutoAdvanceDialogueEnabled,
  };
}
