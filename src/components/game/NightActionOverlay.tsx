"use client";

import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { ROLE_SKILL_AUDIO, type RoleSkillEvent } from "@/lib/role-skill-effects";
import { IdiotConfetti } from "./PlayerSkillMarks";
import { SeerWaterSurface } from "./SeerWaterSurface";
import { PoisonSkull } from "./PoisonSkull";
import { POISON_BUBBLES } from "@/lib/poison-skill";
import { RoyalSkillOverlay } from "./RoyalSkillOverlay";
import { SkillEdgeAtmosphere } from "./SkillEdgeAtmosphere";

function CentralSkill({ event }: { event: RoleSkillEvent }) {
  const root = useRef<SVGSVGElement>(null);
  const reducedMotion = useReducedMotion();
  const id = "role-skill-" + event.id;
  useLayoutEffect(() => {
    const animations: Animation[] = [];
    const delay = event.startedAt - performance.now();
    const duration = ROLE_SKILL_AUDIO[event.type].durationMs;
    root.current?.querySelectorAll<SVGElement>("[data-skill-core]").forEach((node) => {
      animations.push(node.animate([
        { opacity: 0, transform: reducedMotion ? "none" : "scale(0.94)" },
        { opacity: 1, transform: reducedMotion ? "none" : "scale(1)", offset: 0.14 },
        { opacity: 0.95, transform: reducedMotion ? "none" : "scale(1)", offset: 0.64 },
        { opacity: 0, transform: reducedMotion ? "none" : "scale(1.04)" },
      ], { duration, delay, fill: "none" }));
    });
    root.current?.querySelectorAll<SVGElement>("[data-fog]").forEach((node, index) => {
      animations.push(node.animate([
        { opacity: 0, transform: reducedMotion ? "none" : "translate(0, 12px) scale(0.85)" },
        { opacity: 0.6, transform: reducedMotion ? "none" : "translate(0, 0) scale(1)", offset: 0.25 },
        { opacity: 0, transform: reducedMotion ? "none" : "translate(" + (index % 2 ? 40 : -40) + "px, -40px) scale(1.35)" },
      ], { duration: duration - index * 45, delay: delay + index * 45, fill: "none" }));
    });
    root.current?.querySelectorAll<SVGElement>("[data-vine]").forEach((node) => {
      animations.push(node.animate([{ strokeDashoffset: reducedMotion ? "0" : "1" }, { strokeDashoffset: "0" }], { duration: 650, delay, fill: "forwards", easing: "ease-out" }));
    });
    if (!reducedMotion) root.current?.querySelectorAll<SVGElement>("[data-skull-sway]").forEach(node => {
      animations.push(node.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(-2.2deg)", offset: 0.28 }, { transform: "rotate(2deg)", offset: 0.62 }, { transform: "rotate(0deg)" }], { duration, delay, fill: "none", easing: "ease-in-out" }));
    });
    root.current?.querySelectorAll<SVGElement>("[data-poison-bubble]").forEach((node, index) => {
      const bubble = POISON_BUBBLES[index];
      animations.push(node.animate(reducedMotion ? [{ opacity: 0 }, { opacity: 0.55, offset: 0.25 }, { opacity: 0 }] : [
        { opacity: 0, transform: "translate(0, 8px) scale(0.7)" },
        { opacity: 0.8, transform: `translate(${bubble.drift * 0.3}px, -20px) scale(1)`, offset: 0.3 },
        { opacity: 0, transform: `translate(${bubble.drift}px, -100px) scale(1.1)` },
      ], { duration: 1130 - index * 30, delay: delay + 100 + index * 35, fill: "none", easing: "ease-out" }));
    });
    return () => animations.forEach((animation) => animation.cancel());
  }, [event, reducedMotion]);
  return <svg ref={root} className="wc-role-skill-central" data-role-skill={event.type} data-role-skill-id={event.id} viewBox="0 0 420 420" aria-hidden="true">
    <defs>
      <radialGradient id={id + "-mist"}><stop stopColor="#c18bef" stopOpacity="0.8" /><stop offset="0.6" stopColor="#8952bf" stopOpacity="0.5" /><stop offset="1" stopColor="#623094" stopOpacity="0" /></radialGradient>
      <radialGradient id={id + "-heal"}><stop stopColor="#d8ffd3" stopOpacity="0.65" /><stop offset="0.45" stopColor="#7fed9a" stopOpacity="0.3" /><stop offset="1" stopColor="#49c973" stopOpacity="0" /></radialGradient>
      <linearGradient id={id + "-cross"} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e5ffdf" /><stop offset="0.5" stopColor="#99efad" /><stop offset="1" stopColor="#4fb779" /></linearGradient>
      <filter id={id + "-soft"} x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation="8" /></filter>
      <filter id={id + "-glow"} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    </defs>
    {event.type === "witch-poison" && <>
      {[0, 1, 2].map((fog) => <ellipse key={fog} data-fog className="wc-skill-fog" cx={160 + fog % 2 * 95} cy={185 + Math.floor(fog / 2) * 65} rx="92" ry="62" fill={"url(#" + id + "-mist)"} filter={"url(#" + id + "-soft)"} />)}
      <PoisonSkull id={id} />
      {POISON_BUBBLES.map((bubble, index) => <g key={index} data-poison-bubble className="wc-poison-bubble" style={{ transformOrigin: `${bubble.x}px ${bubble.y}px` }}>
        <circle cx={bubble.x} cy={bubble.y} r={bubble.radius} fill={"url(#" + id + "-bubble)"} stroke="#c790f0" strokeOpacity="0.55" strokeWidth="0.8" />
        <path d={`M${bubble.x - bubble.radius * 0.56} ${bubble.y - bubble.radius * 0.08}q0 ${-bubble.radius * 0.5} ${bubble.radius * 0.46} ${-bubble.radius * 0.5}`} fill="none" stroke="#f0dfff" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      </g>)}
    </>}
    {event.type === "witch-save" && <g data-skill-core className="wc-skill-core">
      <circle cx="210" cy="210" r="130" fill={"url(#" + id + "-heal)"} />
      <g filter={"url(#" + id + "-glow)"}><path d="M191 149h38v42h42v38h-42v42h-38v-42h-42v-38h42z" fill={"url(#" + id + "-cross)"} stroke="#d8ffd0" strokeWidth="1.2" />
        <path data-vine pathLength="1" strokeDasharray="1" strokeDashoffset="1" d="M153 295c-89-71 35-119 104-166s-53-72-83-5 152 112 89 162" fill="none" stroke="#a0f4b0" strokeWidth="2.2" />
        <path data-vine pathLength="1" strokeDasharray="1" strokeDashoffset="1" d="M270 300c71-77-34-121-103-165s25-69 62-15-122 114-87 150" fill="none" stroke="#66d99b" strokeWidth="1.4" />
        <path d="M158 244q-20-21-29-12 4 22 29 12M248 164q22-13 30-2-14 16-30 2M218 293q-8 18-24 18 0-21 24-18" fill="#b4f4bb" fillOpacity="0.75" />
      </g>
    </g>}
  </svg>;
}

export function NightActionOverlay({ event }: { event: RoleSkillEvent | null }) {
  if (event?.type === "guard" || event?.type === "white-wolf-king") return createPortal(<><SkillEdgeAtmosphere key={"edge-" + event.id} event={event} /><RoyalSkillOverlay key={event.id} event={event} /></>, document.body);
  if (event?.type === "seer") return createPortal(<SeerWaterSurface key={event.id} event={event} />, document.body);
  if (event?.type === "idiot") return createPortal(<IdiotConfetti key={event.id} event={event} />, document.body);
  if (!event || !["witch-poison", "witch-save"].includes(event.type)) return null;
  return createPortal(<><SkillEdgeAtmosphere key={"edge-" + event.id} event={event} /><CentralSkill key={event.id} event={event} /></>, document.body);
}
