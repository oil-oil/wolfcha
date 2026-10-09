"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { ROLE_SKILL_AUDIO, type RoleSkillEvent } from "@/lib/role-skill-effects";

const SHIELD_PIECES = [
  { points: "125,110 211,110 211,181 172,198 125,170", x: -55, y: -60, angle: -16 },
  { points: "211,110 295,110 295,174 253,193 211,181", x: 55, y: -60, angle: 16 },
  { points: "125,170 172,198 183,237 125,254", x: -78, y: -5, angle: -22 },
  { points: "172,198 211,181 232,215 213,253 183,237", x: -18, y: -34, angle: -12 },
  { points: "211,181 253,193 295,174 295,254 249,242 232,215", x: 78, y: -5, angle: 22 },
  { points: "125,254 183,237 213,253 211,312 125,312", x: -48, y: 62, angle: 15 },
  { points: "213,253 232,215 249,242 295,254 295,312 211,312", x: 48, y: 62, angle: -15 },
] as const;

const ROAR_RAYS = [
  [[157, 143], [109, 75], 5.5], [[146, 161], [66, 135], 7],
  [[133, 185], [48, 178], 8], [[128, 214], [40, 242], 7.5],
  [[145, 259], [74, 301], 5], [[185, 102], [169, 48], 4],
  [[264, 142], [312, 78], 5], [[278, 163], [358, 132], 7.5],
  [[286, 187], [374, 182], 7], [[293, 219], [381, 245], 8],
  [[274, 262], [347, 307], 5.5], [[233, 101], [249, 45], 4.5],
] as const;
const ROAR_ECHOES = [
  "M151 130c-26-10-37-36-60-32-18 4-10 25 7 23",
  "M130 183c-31-15-70-6-70 18 0 15 18 23 26 13",
  "M153 277c-29 26-46 11-58 2-12-8-29-3-34 9",
  "M272 130c26-13 38-36 58-30 17 5 10 25-6 22",
  "M292 187c30-14 68-2 67 19-1 17-18 22-27 13",
  "M269 280c25 26 45 11 58 2 13-9 28-1 32 10",
] as const;
const ROAR_GRAINS = [[87, 150], [91, 81], [135, 65], [174, 320], [78, 267], [54, 211], [112, 310], [282, 59], [330, 98], [348, 158], [368, 214], [348, 284], [277, 321], [317, 315]] as const;

function pressureBrush(from: readonly [number, number], to: readonly [number, number], width: number) {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  const nx = -dy / length * width, ny = dx / length * width;
  const mx = from[0] + dx * 0.48, my = from[1] + dy * 0.48;
  return `M${from[0]} ${from[1]}Q${mx + nx} ${my + ny} ${to[0]} ${to[1]}Q${mx - nx * 0.35} ${my - ny * 0.35} ${from[0]} ${from[1]}z`;
}

function GuardShield({ id }: { id: string }) {
  return <>
    <defs>
      <linearGradient id={id + "-wood"} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d0b184" /><stop offset="0.3" stopColor="#a38661" /><stop offset="0.64" stopColor="#735a3f" /><stop offset="1" stopColor="#4f4131" /></linearGradient>
      <linearGradient id={id + "-rim"} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f8e3b5" /><stop offset="0.32" stopColor="#bba072" /><stop offset="0.54" stopColor="#71604b" /><stop offset="0.75" stopColor="#ddc49a" /><stop offset="1" stopColor="#887252" /></linearGradient>
      <radialGradient id={id + "-boss"} cx="35%" cy="25%"><stop stopColor="#fff2ca" /><stop offset="0.45" stopColor="#bd9e69" /><stop offset="1" stopColor="#61513c" /></radialGradient>
      <symbol id={id + "-shield"} viewBox="0 0 420 420">
        <path d="M139 127q71-25 142 0v87c-5 45-32 72-71 92-39-20-66-47-71-92z" fill={"url(#" + id + "-wood)"} stroke="#30281f" strokeWidth="12" />
        <path d="M139 127q71-25 142 0v87c-5 45-32 72-71 92-39-20-66-47-71-92z" fill="none" stroke={"url(#" + id + "-rim)"} strokeWidth="7" />
        <path d="M148 137q62-20 124 0v76c-5 38-28 64-62 82-34-18-57-44-62-82z" fill="none" stroke="#443627" strokeWidth="1.8" />
        <path d="M173 129v125m25-130v167m26-167v158m24-153v125" fill="none" stroke="#443627" strokeWidth="2.2" />
        <path d="m164 151 1 36-4 12 2 21m17-82 2 19-3 21 2 34-1 45m13-108-2 19 2 16m38-38-2 32 3 14-2 16m14-42 3 19-2 38m10-83 2 30-4 28 2 17m-43 5-2 19 3 23m-18-48 1 16-3 22" fill="none" stroke="#e4cea5" strokeWidth="1" opacity="0.62" strokeLinecap="round" />
        <circle cx="210" cy="202" r="32" fill="#504333" stroke="#30281f" strokeWidth="2" />
        <circle cx="210" cy="202" r="28" fill={"url(#" + id + "-rim)"} stroke="#f1d8a7" strokeWidth="1" />
        <circle cx="210" cy="202" r="22" fill={"url(#" + id + "-boss)"} stroke="#65513a" strokeWidth="1.6" />
        <path d="M192 201q0-17 18-17m10 13q5 13-10 20" fill="none" stroke="#f9e6bc" strokeWidth="1.4" strokeLinecap="round" />
        <path d="m202 198 3-4m12 15 3-4" stroke="#66513b" strokeWidth="0.9" />
        {[151, 269].flatMap((x) => [143, 180, 217].map(y => <circle key={x + ":" + y} cx={x} cy={y} r="2.6" fill="#dbc298" stroke="#403528" strokeWidth="1" />))}
        <path d="M151 132q59-20 118 0M148 226q15 43 48 61" fill="none" stroke="#fff0ce" strokeWidth="1.5" opacity="0.75" />
        <path d="m154 140 4 2m105-2-4 2m-91 106 3-1m-2 11 4-2m62 0-4-2m-31 30 4-3" stroke="#3d3023" strokeWidth="1.1" strokeLinecap="round" />
      </symbol>
      {SHIELD_PIECES.map((piece, index) => <clipPath key={index} id={id + "-piece-" + index}><polygon points={piece.points} /></clipPath>)}
    </defs>
    {SHIELD_PIECES.map((_, index) => <g key={index} data-shield-piece={index} className="wc-shield-piece"><use href={"#" + id + "-shield"} width="420" height="420" clipPath={"url(#" + id + "-piece-" + index + ")"} /></g>)}
    <path data-shield-seam className="wc-shield-seam" d="M210 121v60l-38 17 11 39 30 16-2 47m-66-121 27 19m39-17 21 34 17 27 28 7m-94-12-32 10m81-32 21-22 24-10" fill="none" stroke="#f5dfb2" strokeWidth="1.3" />
  </>;
}

function RoaringWolf({ id }: { id: string }) {
  return <>
    <defs>
      <linearGradient id={id + "-fur"} x1="0.18" y1="0" x2="0.75" y2="1"><stop stopColor="#fff7e6" /><stop offset="0.32" stopColor="#e7dcc6" /><stop offset="0.7" stopColor="#b2a48b" /><stop offset="1" stopColor="#796953" /></linearGradient>
      <linearGradient id={id + "-muzzle"} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff6df" /><stop offset="0.6" stopColor="#d0c0a2" /><stop offset="1" stopColor="#928067" /></linearGradient>
      <linearGradient id={id + "-mouth"} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#131c20" /><stop offset="1" stopColor="#3b2732" /></linearGradient>
      <radialGradient id={id + "-eye"}><stop stopColor="#fff2b9" /><stop offset="0.4" stopColor="#e6b05c" /><stop offset="1" stopColor="#8d4e29" /></radialGradient>
      <linearGradient id={id + "-pressure"} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f1dfb6" /><stop offset="0.45" stopColor="#c2a77d" /><stop offset="1" stopColor="#756146" stopOpacity="0.25" /></linearGradient>
    </defs>
    <g data-roar-layer="pressure">
      {ROAR_RAYS.map(([from, to, width], index) => <g key={index} data-roar-ray={index} className="wc-roar-ray">
        <path d={pressureBrush(from, to, width)} fill={"url(#" + id + "-pressure)"} stroke="#5b4a35" strokeWidth="0.8" />
        <path d={`M${from[0]} ${from[1]}Q${from[0] * 0.45 + to[0] * 0.55} ${from[1] * 0.45 + to[1] * 0.55 - 2} ${to[0]} ${to[1]}`} fill="none" stroke="#f4e4be" strokeWidth="0.9" opacity="0.7" />
      </g>)}
    </g>
    <g data-roar-layer="echo" fill="none" strokeLinecap="round">
      {ROAR_ECHOES.map((path, index) => <path key={index} data-roar-echo={index} className="wc-roar-echo" d={path} pathLength="1" strokeDasharray="1" stroke="#e4cfa5" strokeWidth={index % 3 === 1 ? 2.3 : 1.7} />)}
    </g>
    <g data-roar-layer="grain">
      {ROAR_GRAINS.map(([x, y], index) => <g key={index} data-roar-grain={index} className="wc-roar-grain"><g transform={`translate(${x} ${y}) rotate(${index * 37})`}>
        <path d={index % 2 ? "m-1-3 3 2-1 5-2-2z" : "m-3-1 4-2 2 2-3 2z"} fill={index % 3 ? "#c7ad7f" : "#f0dfb9"} />
        <path d="m4 3 2 1" stroke="#aa9169" strokeWidth="0.9" strokeLinecap="round" />
      </g></g>)}
    </g>
    <g data-wolf-head className="wc-roaring-wolf">
      <path d="M148 132q-10-25-12-56 23 9 43 30l13-10-3 11 21-15 14 13 3-7 14 8q20-21 43-30-2 31-12 56l19 22-9 3q8 11 19 30l-14-3q4 21 11 35l-15-5q2 23 8 35l-18-6q4 17-2 31l-18-7q-2 15-10 25l-13-7-24 14-24-14-13 7q-8-10-10-25l-18 7q-6-14-2-31l-18 6q6-12 8-35l-15 5q7-14 11-35l-14 3q11-19 19-30l-9-3z" fill={"url(#" + id + "-fur)"} stroke="#352d24" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M144 90q2 25 10 39l16-17zm132 0q-2 25-10 39l-16-17z" fill="#796d5e" stroke="#392f25" strokeWidth="1.4" />
      <path d="m150 99 6 23 8-9m106-14-6 23-8-9" fill="none" stroke="#e0ceb0" strokeWidth="1.1" />
      <path d="m210 104-7 18 7 14 7-14z" fill="#b19b76" stroke="#483828" strokeWidth="1.1" /><path d="m198 123 4 12 8 9 8-9 4-12" fill="none" stroke="#4f3d2b" strokeWidth="1.4" />
      <path d="m187 119 10 24-17 19-23-8-7 12 9-27zm46 0-10 24 17 19 23-8 7 12-9-27z" fill="#897962" opacity="0.6" />
      <path d="m163 160 31 10-6 10-14-3zm94 0-31 10 6 10 14-3z" fill="#202b2c" />
      <path d="m171 166 17 6-4 4-8-2zm78 0-17 6 4 4 8-2z" fill={"url(#" + id + "-eye)"} />
      <path d="m180 168 1 7m58-7-1 7" stroke="#171c1b" strokeWidth="1.5" />
      <path d="m160 156 36 12m64-12-36 12" fill="none" stroke="#382b22" strokeWidth="2.3" strokeLinecap="round" />
      <path d="M184 202q26-23 52 0l9 22-4 36q-31 32-62 0l-4-36z" fill={"url(#" + id + "-mouth)"} stroke="#6b706c" strokeWidth="1.2" />
      <g data-wolf-jaw className="wc-wolf-jaw">
        <path d="M183 259q27 13 54 0l-10 23-17 8-17-8z" fill={"url(#" + id + "-muzzle)"} stroke="#48392b" strokeWidth="1.4" />
        <path d="M198 260q12-11 24 0l-2 9h-20z" fill="#936472" />
        <path d="m184 258 4-14 5 18m34 0 5-18 4 14" fill="#f4eed6" stroke="#a9a996" strokeWidth="0.8" />
        <path d="m199 271 3-5 4 6m8 0 4-6 3 5" fill="#dedecd" />
        <path d="M194 278q16 8 32 0" fill="none" stroke="#f6edcf" strokeWidth="1.1" />
      </g>
      <path d="M181 200q9-22 29-23 20 1 29 23l10 19-17-3-8-10h-28l-8 10-17 3z" fill={"url(#" + id + "-muzzle)"} stroke="#4d3e2f" strokeWidth="1.6" />
      <path d="m184 218 3 27 10-28m26 0 10 28 3-27" fill="#fff9e4" stroke="#a2ab9a" strokeWidth="0.8" />
      <path d="m201 215 2 8 5-8m4 0 5 8 2-8" fill="#eee8d6" />
      <path d="M195 193q15-10 30 0l-3 11-12 6-12-6z" fill="#29231e" stroke="#675544" strokeWidth="1.1" />
      <path d="M200 192q10-4 20 0m-10 18v7" fill="none" stroke="#c7b394" strokeWidth="1" />
      <path d="M153 183q9 5 18 1m96-1q-9 5-18 1M155 207q9 1 17-5m93 5q-9 1-17-5" fill="none" stroke="#68563f" strokeWidth="1.35" strokeLinecap="round" opacity="0.65" />
    </g>
  </>;
}

export function RoyalSkillOverlay({ event }: { event: RoleSkillEvent }) {
  const root = useRef<SVGSVGElement>(null);
  const id = "royal-skill-" + useId();
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const animations: Animation[] = [];
    const delay = event.startedAt - performance.now();
    const duration = ROLE_SKILL_AUDIO[event.type].durationMs;
    const animate = (selector: string, frames: (index: number) => Keyframe[], options: (index: number) => KeyframeAnimationOptions) => {
      root.current?.querySelectorAll<SVGElement>(selector).forEach((node, index) => animations.push(node.animate(frames(index), options(index))));
    };
    animate("[data-shield-piece]", (index) => [
      { opacity: 0, transform: reduced ? "none" : `translate(${SHIELD_PIECES[index].x}px, ${SHIELD_PIECES[index].y}px) rotate(${SHIELD_PIECES[index].angle}deg)` },
      { opacity: 1, transform: reduced ? "none" : `translate(${SHIELD_PIECES[index].x * 0.8}px, ${SHIELD_PIECES[index].y * 0.8}px) rotate(${SHIELD_PIECES[index].angle * 0.8}deg)`, offset: 0.07, easing: "cubic-bezier(0.18, 0.75, 0.3, 1)" },
      { opacity: 1, transform: "none", offset: 0.32 },
      { opacity: 1, transform: "none", offset: 0.76 },
      { opacity: 0, transform: "none" },
    ], () => ({ duration, delay, fill: "none" }));
    animate("[data-shield-seam]", () => [{ opacity: 0 }, { opacity: reduced ? 0.4 : 0.85, offset: 0.32 }, { opacity: 0, offset: 0.66 }, { opacity: 0 }], () => ({ duration, delay, fill: "none" }));
    animate("[data-wolf-head]", () => [{ opacity: 0, transform: reduced ? "none" : "scale(0.94)" }, { opacity: 1, transform: reduced ? "none" : "scale(1.025)", offset: 0.4 }, { opacity: 0.95, transform: reduced ? "none" : "scale(1)", offset: 0.78 }, { opacity: 0, transform: reduced ? "none" : "scale(0.98)" }], () => ({ duration, delay, fill: "none", easing: "ease-out" }));
    animate("[data-roar-ray]", () => [
      { opacity: 0, transform: reduced ? "none" : "scale(0.78)" },
      { opacity: 0.85, transform: reduced ? "none" : "scale(0.93)", offset: 0.16 },
      { opacity: 0.65, transform: "none", offset: 0.5 },
      { opacity: 0, transform: reduced ? "none" : "scale(1.1)" },
    ], index => ({ duration: reduced ? 700 : 1500, delay: delay + 330 + index % 4 * 60, fill: "none", easing: "ease-out" }));
    animate("[data-roar-echo]", () => [
      { opacity: 0, strokeDashoffset: reduced ? 0 : 1 },
      { opacity: 0.8, strokeDashoffset: 0, offset: 0.3 },
      { opacity: 0.55, strokeDashoffset: 0, offset: 0.62 },
      { opacity: 0, strokeDashoffset: 0 },
    ], index => ({ duration: reduced ? 600 : 1050, delay: delay + 610 + index % 3 * 110 + (index > 2 ? 70 : 0), fill: "none", easing: "ease-out" }));
    animate("[data-roar-grain]", index => {
      const [x, y] = ROAR_GRAINS[index];
      return [
        { opacity: 0, transform: "none" },
        { opacity: 0.85, transform: reduced ? "none" : `translate(${(x - 210) * 0.04}px, ${(y - 220) * 0.04}px)`, offset: 0.2 },
        { opacity: 0, transform: reduced ? "none" : `translate(${(x - 210) * 0.12}px, ${(y - 220) * 0.12}px)` },
      ];
    }, index => ({ duration: reduced ? 350 : 950, delay: delay + 700 + index % 5 * 70, fill: "none", easing: "ease-out" }));
    if (!reduced) {
      animate("[data-wolf-jaw]", () => [{ transform: "translateY(0)" }, { transform: "translateY(9px)", offset: 0.41 }, { transform: "translateY(3px)", offset: 0.75 }, { transform: "translateY(0)" }], () => ({ duration, delay, fill: "none", easing: "ease-in-out" }));
    }
    return () => animations.forEach(animation => animation.cancel());
  }, [event, reduced]);
  return <svg ref={root} className="wc-role-skill-central wc-royal-skill" data-role-skill={event.type} data-role-skill-id={event.id} viewBox="0 0 420 420" aria-hidden="true">
    {event.type === "guard" ? <GuardShield id={id} /> : <RoaringWolf id={id} />}
  </svg>;
}
