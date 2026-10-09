"use client";

import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { WOLF_STRIKE_TIMING, type WolfStrikeEvent } from "@/lib/wolf-strike";
import { SkillEdgeAtmosphere } from "./SkillEdgeAtmosphere";

const CLAWS = [
  { draw: "M94 28 C127 75 183 124 253 181 L282 215", scar: "M94 28 C126 69 166 108 205 143 L214 148 211 152 253 183 282 215 249 189 207 157 194 151 195 146 C153 114 119 73 94 28z" },
  { draw: "M61 49 C97 101 153 152 223 209 L248 240", scar: "M61 49 C93 94 130 132 168 165 L180 173 176 175 225 210 248 240 220 217 171 181 159 178 160 173 C120 142 83 100 61 49z" },
  { draw: "M35 82 C70 130 123 179 190 233 L210 258", scar: "M35 82 C64 121 95 153 132 185 L143 190 139 194 191 235 210 258 186 242 132 200 120 194 122 189 C87 163 53 120 35 82z" },
];

function WolfClaws({ strike }: { strike: WolfStrikeEvent }) {
  const svg = useRef<SVGSVGElement>(null);
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const animations: Animation[] = [];
    svg.current?.querySelectorAll<SVGGElement>("[data-claw]").forEach((mark, index) => {
      const delay = strike.startedAt + WOLF_STRIKE_TIMING.slashMs + index * 12 - performance.now();
      animations.push(mark.animate(
        [{ opacity: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 0.95, offset: 0.45 }, { opacity: 0 }],
        { duration: WOLF_STRIKE_TIMING.clawMs, delay, fill: "none" },
      ));
      svg.current?.querySelectorAll<SVGPathElement>(`[data-claw-draw="${index}"]`).forEach((path) => {
        animations.push(path.animate(
          [{ strokeDashoffset: reducedMotion ? "0" : "1" }, { strokeDashoffset: "0" }],
          { duration: reducedMotion ? 1 : WOLF_STRIKE_TIMING.drawMs - index * 12, delay, fill: "forwards", easing: "cubic-bezier(0.16, 0.7, 0.3, 1)" },
        ));
      });
    });
    return () => animations.forEach((animation) => animation.cancel());
  }, [strike, reducedMotion]);

  return (
    <svg ref={svg} className="wc-wolf-strike" viewBox="0 0 320 290" data-wolf-strike-id={strike.id} aria-hidden="true">
      <defs>
        <linearGradient id={`wolf-cut-${strike.id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#863238" /><stop offset="0.35" stopColor="#fa9b83" /><stop offset="0.6" stopColor="#d0434b" /><stop offset="1" stopColor="#791723" /></linearGradient>
        {CLAWS.map((claw, index) => <mask key={claw.draw} id={`wolf-mask-${strike.id}-${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width="320" height="290"><path d={claw.draw} data-claw-draw={index} pathLength={1} fill="none" stroke="white" strokeWidth="24" strokeDasharray="1" strokeDashoffset="1" /></mask>)}
      </defs>
      {CLAWS.map((claw, index) => (
        <g key={claw.draw} data-claw={index} className="wc-wolf-strike__mark" mask={`url(#wolf-mask-${strike.id}-${index})`}>
          <path d={claw.scar} fill={`url(#wolf-cut-${strike.id})`} stroke="#52151c" strokeWidth="1.5" />
          <path d={claw.draw} fill="none" stroke="#ffd0af" strokeWidth="0.75" opacity="0.75" />
        </g>
      ))}
    </svg>
  );
}

export function WolfStrikeOverlay({ strike }: { strike: WolfStrikeEvent | null }) {
  return strike ? createPortal(<><SkillEdgeAtmosphere key={"edge-" + strike.id} event={strike} /><WolfClaws key={strike.id} strike={strike} /></>, document.body) : null;
}
