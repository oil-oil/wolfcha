"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WolfStrikeAudio, WolfStrikeController, type WolfStrikeEvent } from "@/lib/wolf-strike";

export function useWolfStrike(soundEnabled: boolean, volume: number) {
  const [strike, setStrike] = useState<WolfStrikeEvent | null>(null);
  const playback = useRef<{ controller: WolfStrikeController; audio: WolfStrikeAudio } | null>(null);

  useEffect(() => {
    const audio = new WolfStrikeAudio();
    const controller = new WolfStrikeController(setStrike, audio);
    playback.current = { audio, controller };
    return () => {
      controller.cancel(false);
      audio.dispose();
      playback.current = null;
    };
  }, []);

  useEffect(() => {
    playback.current?.audio.setSettings(soundEnabled, volume);
  }, [soundEnabled, volume]);

  const play = useCallback((targetSeat: number) => {
    void playback.current?.controller.play(targetSeat);
  }, []);
  const cancel = useCallback(() => playback.current?.controller.cancel(), []);

  return { strike, play, cancel };
}
