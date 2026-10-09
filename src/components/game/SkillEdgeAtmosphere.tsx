"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";
import { ROLE_SKILL_AUDIO, type RoleSkillEvent } from "@/lib/role-skill-effects";
import { WOLF_STRIKE_TIMING, type WolfStrikeEvent } from "@/lib/wolf-strike";

const COLORS = { wolf: "151, 36, 48", "witch-poison": "126, 61, 162", "witch-save": "70, 126, 86", guard: "132, 127, 72" } as const;

export function SkillEdgeAtmosphere({ event }: { event: WolfStrikeEvent | RoleSkillEvent }) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const type = "type" in event ? event.type : "wolf";
  const color = type in COLORS ? COLORS[type as keyof typeof COLORS] : null;
  useLayoutEffect(() => {
    if (!color || !root.current) return;
    const duration = type === "wolf" ? WOLF_STRIKE_TIMING.durationMs : ROLE_SKILL_AUDIO[type].durationMs;
    const animation = root.current.animate([{ opacity: 0 }, { opacity: reduced ? 0.5 : 0.92, offset: 0.18 }, { opacity: 0.7, offset: 0.6 }, { opacity: 0 }], { duration, delay: event.startedAt - performance.now(), fill: "none" });
    return () => animation.cancel();
  }, [event, type, color, reduced]);
  return color ? <div ref={root} className="wc-skill-edge" data-skill-atmosphere={type} data-skill-atmosphere-id={event.id} style={{ "--wc-aura-rgb": color } as CSSProperties} aria-hidden="true" /> : null;
}
