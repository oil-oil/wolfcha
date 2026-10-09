"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WolfStrikeAudio, WolfStrikeController } from "@/lib/wolf-strike";
import { ROLE_SKILL_AUDIO, type RoleSkillEvent, type RoleSkillType } from "@/lib/role-skill-effects";

export function useRoleSkillEffects(soundEnabled: boolean, volume: number) {
  const [event, setEvent] = useState<RoleSkillEvent | null>(null);
  const playback = useRef<{
    controller: WolfStrikeController;
    audios: Map<RoleSkillType, WolfStrikeAudio>;
    type: RoleSkillType;
  } | null>(null);

  useEffect(() => {
    const audios = new Map<RoleSkillType, WolfStrikeAudio>();
    for (const type of Object.keys(ROLE_SKILL_AUDIO) as RoleSkillType[]) {
      audios.set(type, new WolfStrikeAudio(`/audio/sfx/${ROLE_SKILL_AUDIO[type].file}`));
    }
    const state: { audios: Map<RoleSkillType, WolfStrikeAudio>; type: RoleSkillType; controller: WolfStrikeController } = {
      audios,
      type: "seer" as RoleSkillType,
      controller: new WolfStrikeController((strike) => setEvent(strike ? { ...strike, type: state.type } : null), {
        play: (isCurrent) => audios.get(state.type)!.play(isCurrent),
        stop: () => audios.forEach((audio) => audio.stop()),
      }),
    };
    playback.current = state;
    return () => {
      state.controller.cancel(false);
      audios.forEach((audio) => audio.dispose());
      playback.current = null;
    };
  }, []);

  useEffect(() => {
    playback.current?.audios.forEach((audio) => audio.setSettings(soundEnabled, volume));
  }, [soundEnabled, volume]);

  const play = useCallback((type: RoleSkillType, targetSeat: number) => {
    const state = playback.current;
    if (!state) return;
    state.type = type;
    void state.controller.play(targetSeat, ROLE_SKILL_AUDIO[type].durationMs);
  }, []);
  const cancel = useCallback(() => playback.current?.controller.cancel(), []);
  return { event, play, cancel };
}
