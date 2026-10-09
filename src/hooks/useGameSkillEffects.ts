"use client";

import { useEffect, useRef, useState } from "react";
import type { GameState, Player } from "@/types/game";
import { ROLE_SKILL_AUDIO, type RoleSkillEvent } from "@/lib/role-skill-effects";
import { WolfStrikeAudio } from "@/lib/wolf-strike";
import {
  GameSkillCueTracker, GameSkillPlayback, isGameSkillCueVisible,
  type GameSkillEvent, type GameSkillType,
} from "@/lib/game-skill-effects";

export function useGameSkillEffects(state: GameState, human: Player | null, enabled: boolean, soundEnabled: boolean, volume: number) {
  const [event, setEvent] = useState<GameSkillEvent | null>(null);
  const [visible, setVisible] = useState(true);
  const runtime = useRef<{
    tracker: GameSkillCueTracker; playback: GameSkillPlayback; audios: Map<GameSkillType, WolfStrikeAudio>;
  } | null>(null);

  useEffect(() => {
    const audios = new Map<GameSkillType, WolfStrikeAudio>([["wolf", new WolfStrikeAudio()]]);
    for (const type of Object.keys(ROLE_SKILL_AUDIO) as Array<keyof typeof ROLE_SKILL_AUDIO>) {
      audios.set(type, new WolfStrikeAudio(`/audio/sfx/${ROLE_SKILL_AUDIO[type].file}`));
    }
    const current = { tracker: new GameSkillCueTracker(), playback: new GameSkillPlayback(setEvent, audios), audios };
    runtime.current = current;
    const hide = () => {
      current.tracker.suspend();
      current.playback.cancel();
      setVisible(false);
    };
    const visibility = () => document.hidden ? hide() : setVisible(true);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", visibility);
      current.playback.cancel(false);
      audios.forEach((audio) => audio.dispose());
      runtime.current = null;
    };
  }, []);

  useEffect(() => {
    runtime.current?.audios.forEach((audio) => audio.setSettings(soundEnabled, volume));
  }, [soundEnabled, volume]);

  useEffect(() => {
    const current = runtime.current;
    if (!current) return;
    const available = enabled && visible && !document.hidden;
    const update = current.tracker.observe(state, human, available);
    if (update.reset) current.playback.cancel();
    else current.playback.retain((cue) => isGameSkillCueVisible(cue, state, human, available));
    current.playback.enqueue(update.cues);
  }, [state, human, enabled, visible]);

  const available = event && isGameSkillCueVisible(event, state, human, enabled && visible);
  return {
    wolfStrike: available && event?.type === "wolf" ? event : null,
    roleSkillEvent: available && event && event.type !== "wolf" ? event as RoleSkillEvent : null,
  };
}
