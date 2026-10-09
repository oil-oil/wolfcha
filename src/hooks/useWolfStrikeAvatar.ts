"use client";

import { useLayoutEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { WOLF_STRIKE_TIMING, wolfStrikeForSeat, type WolfStrikeEvent } from "@/lib/wolf-strike";
import type { RoleSkillEvent } from "@/lib/role-skill-effects";
import { POISON_HIT_TIMING } from "@/lib/poison-skill";

export function useWolfStrikeAvatar(strike: WolfStrikeEvent | null, seat: number, poison: RoleSkillEvent | null = null) {
  const avatarRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const hitBackgroundRef = useRef<HTMLSpanElement>(null);
  const hitFrameRef = useRef<HTMLSpanElement>(null);
  const portraitRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const hit = wolfStrikeForSeat(strike, seat) ?? (poison?.type === "witch-poison" && poison.targetSeat === seat ? poison : null);
  const isPoisonHit = hit !== null && hit === poison;

  useLayoutEffect(() => {
    if (!hit || !cardRef.current || !hitFrameRef.current || !hitBackgroundRef.current) return;
    const timing = isPoisonHit ? POISON_HIT_TIMING : WOLF_STRIKE_TIMING;
    const options: KeyframeAnimationOptions = {
      duration: timing.hitMs,
      delay: hit.startedAt + timing.impactMs - performance.now(),
      fill: "none",
    };
    const animations = [hitFrameRef.current.animate(
      isPoisonHit
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.24 }, { opacity: 0.7, offset: 0.5 }, { opacity: 0 }]
        : [{ opacity: 0 }, { opacity: 1, offset: 0.04 }, { opacity: 0.8, offset: 0.74 }, { opacity: 0 }],
      options,
    ), hitBackgroundRef.current.animate(
      isPoisonHit
        ? [{ opacity: 0 }, { opacity: 0.9, offset: 0.24 }, { opacity: 0.55, offset: 0.5 }, { opacity: 0 }]
        : [{ opacity: 0 }, { opacity: 1, offset: 0.04 }, { opacity: 1, offset: 0.74 }, { opacity: 0 }],
      options,
    )];
    if (!reducedMotion) {
      animations.push(cardRef.current.animate(
        (isPoisonHit ? [0, -3, 3, -2, 1, 0] : [0, -4, 3, -2, 1.2, 0]).map((x) => ({ translate: `${x}px 0px` })),
        { ...options, duration: isPoisonHit ? POISON_HIT_TIMING.shakeMs : WOLF_STRIKE_TIMING.shakeMs },
      ));
      if (portraitRef.current) {
        // This wrapper is outside the facing mirror. Its world-space movement opposes the card.
        animations.push(portraitRef.current.animate(
          (isPoisonHit ? [0, 7, -7, 4.5, -2.5, 0] : [0, 9, -7, 4.5, -2.5, 0]).map((x) => ({ translate: `${x}px 0px` })),
          { ...options, duration: isPoisonHit ? POISON_HIT_TIMING.shakeMs : WOLF_STRIKE_TIMING.shakeMs },
        ));
      }
    }
    return () => animations.forEach((animation) => animation.cancel());
  }, [hit, reducedMotion, isPoisonHit]);

  return { avatarRef, cardRef, portraitRef, hitFrameRef, hitBackgroundRef, hit, isPoisonHit };
}
