"use client";

import { useId, useLayoutEffect, useRef, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";
import type { RoleSkillEvent } from "@/lib/role-skill-effects";

export function HunterAvatarMarks({ event, locked, hit = false }: { event: RoleSkillEvent | null; locked: boolean; hit?: boolean }) {
  const bullet = useRef<HTMLSpanElement>(null);
  const holeId = useId();
  const shot = event?.type === "hunter-shot";
  useLayoutEffect(() => {
    if (event?.type !== "hunter-shot" || !bullet.current) return;
    const animation = bullet.current.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 120, delay: event.startedAt - performance.now(), fill: "none" },
    );
    return () => animation.cancel();
  }, [event]);
  return <>
    {locked && !hit && !shot && <span className="wc-hunter-lock" data-hunter-lock aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="21" opacity="0.65" /><circle cx="32" cy="32" r="17" /><path d="M32 6v15m0 22v15M6 32h15m22 0h15M19 17l3 3m20 24 3 3m0-30-3 3M22 44l-3 3" /><circle cx="32" cy="32" r="2" fill="currentColor" stroke="none" /></svg></span>}
    {(hit || shot) && <span ref={bullet} className="wc-hunter-bullet" data-hunter-hit data-hunter-shot-id={shot ? event.id : undefined} aria-hidden="true"><svg viewBox="0 0 64 64">
      <defs><radialGradient id={holeId + "-rim"}><stop offset="0.4" stopColor="#40342c" /><stop offset="0.68" stopColor="#aa8863" /><stop offset="0.82" stopColor="#f0d9b0" /><stop offset="1" stopColor="#695343" /></radialGradient><radialGradient id={holeId + "-bore"} cx="40%" cy="36%"><stop stopColor="#241b17" /><stop offset="1" stopColor="#070605" /></radialGradient></defs>
      <path d="m32 16 4 6 6-4-2 7 8 3-6 5 5 6-8-1-3 9-4-7-7 4 1-8-7-3 7-5-4-5 7-1z" fill={"url(#" + holeId + "-rim)"} stroke="#3b2d24" strokeWidth="0.8" />
      <path d="m28 25 7-1 6 7-3 7-9 2-6-8z" fill={"url(#" + holeId + "-bore)"} stroke="#c6a47c" strokeWidth="0.8" />
      <path d="m28 23-3-8m15 11 10-8m-7 17 11 5m-19 2 3 12m-13-17-12 7m10-15-10-6" fill="none" stroke="#32261f" strokeWidth="0.7" strokeLinecap="round" />
      <path d="m27 25 6-1m6 12-4 4m-12-9 2-5" fill="none" stroke="#f3ddb7" strokeWidth="0.8" strokeLinecap="round" opacity="0.8" />
    </svg></span>}
  </>;
}

function GraffitiClown({ id }: { id: string }) {
  return <svg data-idiot-clown data-clown-style="ink-doodle" viewBox="0 0 240 240">
    <defs><pattern id={id + "-grain"} width="11" height="9" patternUnits="userSpaceOnUse"><path d="m1 2 1.7-.6m4 5 1.2.5m2-5 .9 1.1" stroke="#705c43" strokeWidth="0.65" opacity="0.18" /></pattern></defs>
    <g stroke="#302920" strokeLinecap="round" strokeLinejoin="round">
      <path d="m35 78-12-8m8 27-15 2m189-34 12-12m-2 32 15-3m-194 85-11 8m185-13 13 9" fill="none" strokeWidth="3" />
      <path d="m45 92-12-8-8 13 6 12-8 12 10 13 13-2m145-43 17-3 8 13-8 12 10 11-10 16-14-3" fill="#b97978" strokeWidth="4" />
      <path d="m34 95 8 7-8 9 7 10m160-24 8 7-10 8 8 10" fill="none" strokeWidth="2.5" />
      <path d="M53 83c-8 23-7 61 6 80 14 26 39 36 65 31 28 0 52-18 63-45 11-23 8-46 0-65-42-16-90-14-134-1z" fill="#f0dfbb" strokeWidth="4.5" />
      <path d="M53 83c-8 23-7 61 6 80 14 26 39 36 65 31 28 0 52-18 63-45 11-23 8-46 0-65-42-16-90-14-134-1z" fill={"url(#" + id + "-grain)"} stroke="none" />
      <path d="M53 87c-6 25-4 47 2 60m116 26c-15 15-35 22-55 21" fill="none" stroke="#7c6448" strokeWidth="1.6" />
      <path d="m42 83-6-42 44 19 33-44 23 48 54-25-4 48c-44 12-95 12-144-4z" fill="#d4b369" strokeWidth="4.3" />
      <path d="m80 60 33-44 8 54-21 17z" fill="#b87d8d" strokeWidth="2.6" />
      <path d="m136 64 54-25-14 42-31 9z" fill="#7faca4" strokeWidth="2.6" />
      <path d="m46 76 24 4m-23-21 21 11m77-1 28-13m-65-25 5 18m-29 20 9 5" fill="none" stroke="#7a5944" strokeWidth="2" />
      <path d="M42 83q77 18 145 2l-2 11c-43 8-95 8-141-1z" fill="#edd8a0" strokeWidth="3.2" />
      <path d="m50 90 51 7m34-1 43-4" fill="none" stroke="#fbefd2" strokeWidth="2.1" />
      <path d="m31 39 6-5 7 7-5 7-8-3zm77-25 6-5 7 6-4 7-9-1zm78 24 7-4 6 7-5 7-8-3z" fill="#ead29b" strokeWidth="2.5" />
      <path d="M71 111q12-13 25-3m45-1q15-14 29 1" fill="none" strokeWidth="5" />
      <path d="m76 112 5 6m8-8 5 6m55-8-4 7m17-5-3 7" fill="none" strokeWidth="2.2" />
      <path d="m62 127 20 2-5 11-18-4zm96-2 24-3 2 12-22 5z" fill="#c3837c" stroke="none" />
      <path d="m63 128 9 7m-2-8 9 7m90-9 9 5m-15 1 9 5" fill="none" stroke="#815952" strokeWidth="1.3" />
      <path d="M80 141q44 13 89-5c-4 30-24 44-45 43-21 0-37-15-44-38z" fill="#604047" strokeWidth="3.9" />
      <path d="M84 143q39 13 80-3l-6 14-17 2-16 3-19-3-16-4z" fill="#faf0d4" strokeWidth="2" />
      <path d="m106 149-1 8m19-6 1 8m19-10-3 7" fill="none" strokeWidth="1.6" />
      <path d="M107 171q18-15 34-1l-4 6-13 4-14-3z" fill="#b57582" strokeWidth="1.5" />
      <path d="M108 119q4-12 17-11 16 2 15 16-1 13-17 12-17-1-15-17z" fill="#b9505b" strokeWidth="3.1" />
      <path d="m116 115 7-2m-15 25 6 2m30-3 7-3" fill="none" stroke="#efc6a2" strokeWidth="2.3" />
      <path d="m78 181-16 19 24 2-3 18 28-12 12 18 13-20 24 10-2-18 19-1-15-18c-25 15-58 17-84 2z" fill="#ece0c2" strokeWidth="3.4" />
      <path d="m95 194 5 12m43-14-5 13m-18-4 4 13" fill="none" stroke="#8c7656" strokeWidth="1.6" />
      <path d="m98 211 21-9 24 7-8 14-13-10-18 8z" fill="#81a69d" strokeWidth="2.8" />
      <path d="m104 216 9-6m17-2 7 7" fill="none" stroke="#e6d5a6" strokeWidth="1.5" />
      <path d="m55 165-3 7m141-18 4 7m-23 60 6-2m-136-81-5 1" fill="none" strokeWidth="2" />
    </g>
  </svg>;
}

export function IdiotConfetti({ event }: { event: RoleSkillEvent }) {
  const burst = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const clownId = "idiot-clown-" + useId();
  useLayoutEffect(() => {
    if (event.type !== "idiot" || !burst.current) return;
    const spreadX = Math.min(320, window.innerWidth * 0.25);
    const spreadY = Math.min(250, window.innerHeight * 0.26);
    const animations = [...burst.current.querySelectorAll<HTMLSpanElement>("[data-confetti-piece]")].map((piece, index) => {
      const corner = Math.floor(index / 12);
      const fan = index % 12;
      const spoke = fan % 6;
      const depth = Math.floor(fan / 6);
      const angle = (12 + spoke * 13 + depth * 5) * Math.PI / 180;
      const reach = depth ? [0.42, 0.57, 0.39, 0.63, 0.5, 0.46][spoke] : [0.72, 0.84, 0.67, 0.9, 0.78, 0.86][spoke];
      const x = (corner === 1 || corner === 2 ? -1 : 1) * Math.cos(angle) * spreadX * reach;
      const y = (corner >= 2 ? -1 : 1) * Math.sin(angle) * spreadY * reach;
      const fall = corner >= 2 ? Math.min(42, Math.abs(y) * 0.6) : 48;
      return piece.animate(reducedMotion ? [{ opacity: 0 }, { opacity: 0.8, offset: 0.1 }, { opacity: 0 }] : [
        { opacity: 0, transform: "translate(0, 0) rotate(0deg)" },
        { opacity: 1, transform: `translate(${x * 0.2}px, ${y * 0.2}px) rotate(${index * 19}deg)`, offset: 0.05, easing: "cubic-bezier(0.18, 0.65, 0.35, 1)" },
        { opacity: 1, transform: `translate(${x * 0.82}px, ${y * 0.82}px) rotate(${index * 31}deg)`, offset: 0.24 },
        { opacity: 0.95, transform: `translate(${x * 0.94}px, ${y + fall * 0.4}px) rotate(${index * 41}deg)`, offset: 0.7 },
        { opacity: 0, transform: `translate(${x}px, ${y + fall}px) rotate(${index * 51}deg)` },
      ], { duration: reducedMotion ? 200 : 1820, delay: event.startedAt + fan % 4 * 8 - performance.now(), fill: "none", easing: "linear" });
    });
    const clown = burst.current.querySelector<SVGSVGElement>("[data-idiot-clown]");
    if (clown) {
      const delay = event.startedAt - performance.now();
      animations.push(clown.animate(
        [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }],
        { duration: 1960, delay, fill: "none", easing: "linear" },
      ));
      if (!reducedMotion) animations.push(clown.animate(
        [
          { transform: "translateX(0) rotate(0deg)", offset: 0 },
          { transform: "translateX(-6px) rotate(-4.5deg)", offset: 0.2 },
          { transform: "translateX(6px) rotate(4.5deg)", offset: 0.6 },
          { transform: "translateX(0) rotate(0deg)", offset: 1 },
        ].map(frame => ({ ...frame, easing: "ease-in-out" })),
        { duration: 1720, delay, fill: "none" },
      ));
    }
    return () => animations.forEach((animation) => animation.cancel());
  }, [event, reducedMotion]);
  return <div ref={burst} className="wc-idiot-confetti" data-role-skill="idiot" data-idiot-burst-id={event.id} aria-hidden="true">
    {Array.from({ length: 48 }, (_, i) => <span key={i} data-confetti-piece data-confetti-kind={i % 3 === 0 ? "ribbon" : i % 3 === 1 ? "paper" : "chip"} data-confetti-corner={["top-left", "top-right", "bottom-right", "bottom-left"][Math.floor(i / 12)]} style={{ "--piece-color": ["#e6c67c", "#e78b9c", "#8bd2c6", "#ba9ee9"][i % 4] } as CSSProperties}>
      {i % 3 === 0 && <svg viewBox="0 0 18 42"><path d="M5 2C-2 12 20 13 12 23S-2 32 9 40" fill="none" stroke="currentColor" strokeWidth="3.8" strokeLinecap="round" /></svg>}
    </span>)}
    <div className="wc-idiot-clown">
      <GraffitiClown id={clownId} />
    </div>
  </div>;
}

export function IdiotCelebration({ revealed }: { revealed: boolean }) {
  const id = "party-hat-" + useId();
  return revealed ? <svg className="wc-idiot-party-hat" data-idiot-party-hat viewBox="0 0 64 64" aria-label="白痴已发动技能">
    <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f2e4c8" /><stop offset="0.5" stopColor="#d1b890" /><stop offset="1" stopColor="#947952" /></linearGradient></defs>
    <path d="m32.5 2 12 17q-12 5-24 0z" fill={"url(#" + id + ")"} stroke="#443529" strokeWidth="0.85" strokeLinejoin="round" />
    <path d="m32.5 2 1 19q6-0.5 11-2z" fill="#947888" fillOpacity="0.75" />
    <path d="m28.5 8 8 3.5m-12 3.5 14.5 4" stroke="#7c5368" strokeWidth="1.8" />
    <ellipse cx="32.5" cy="19.2" rx="11.7" ry="2.2" fill="#c8a568" stroke="#503d28" strokeWidth="0.75" />
    <path d="M23 19q9.5 3 19 0" fill="none" stroke="#f1d9a5" strokeWidth="0.8" />
    <path d="m30 12 1 1.5 1.8-0.2-1 1.5 0.5 1.6-1.6-0.5-1.3 1-0.1-1.8-1.3-1z" fill="#ead09a" stroke="#6c5539" strokeWidth="0.4" />
    <circle cx="32.5" cy="2.4" r="2" fill="#d9b976" stroke="#58442d" strokeWidth="0.6" /><path d="m31.3 1.5 1 0.6" stroke="#fff1c6" strokeWidth="0.7" />
  </svg> : null;
}

export function GuardProtectionMark({ protected: active }: { protected: boolean }) {
  return active ? <span className="wc-guard-protection" data-guard-protected aria-hidden="true"><svg viewBox="0 0 64 64">
    <path d="M35 34q10-4 20 0v10q-2 8-10 13-8-5-10-13z" fill="#d9c29a" stroke="#372c21" strokeWidth="1.8" />
    <path d="M37.5 36q7.5-2.5 15 0v8q-1.5 6-7.5 10-6-4-7.5-10z" fill="#6e8065" stroke="#f0d7a0" strokeWidth="1.1" />
    <path d="M42 36v12m6-12v12" stroke="#c4c2a0" strokeOpacity="0.45" strokeWidth="0.6" />
    <circle cx="45" cy="43" r="3.6" fill="#d5b478" stroke="#4c422e" strokeWidth="0.8" /><path d="m43.5 41.5 3 3" stroke="#fff1c1" strokeWidth="0.8" />
  </svg></span> : null;
}

export function WhiteWolfClawMark({ hit, event }: { hit: boolean; event: RoleSkillEvent | null }) {
  const root = useRef<SVGSVGElement>(null);
  const id = "white-wolf-scars-" + useId();
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    if (!hit || event?.type !== "white-wolf-king") return;
    const animations = [...(root.current?.querySelectorAll<SVGElement>("[data-avatar-claw]") ?? [])].map((path, index) => path.animate(
      reduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
      { duration: reduced ? 100 : 300, delay: event.startedAt + 400 + index * 25 - performance.now(), fill: "backwards", easing: "ease-out" },
    ));
    return () => animations.forEach(animation => animation.cancel());
  }, [hit, event, reduced]);
  return hit ? <span className="wc-white-wolf-claws" data-white-wolf-hit aria-hidden="true"><svg ref={root} viewBox="0 0 64 64">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0.7" y2="1"><stop stopColor="#fff3dc" /><stop offset="0.45" stopColor="#efd5b6" /><stop offset="1" stopColor="#bd8d6c" /></linearGradient>
      {["M27 10q-3 17-12 36", "M41 11q-6 20-12 41", "M54 17q-7 18-11 35"].map((path, index) => <mask key={index} id={id + "-" + index} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><path data-avatar-claw d={path} pathLength="1" strokeDasharray="1" strokeDashoffset="0" stroke="#fff" strokeWidth="12" fill="none" /></mask>)}
    </defs>
    {["M27 10q-1 14-7 23l-2 4 1 3-4 6 1-9-1-2 4-6q5-11 8-19z", "M41 11q-2 13-7 24l-1 4 1 3-5 10 1-10-1-3 3-7q5-14 9-21z", "M54 17q-2 12-6 20l-1 4 1 3-5 8 1-9-1-2 3-8q4-11 8-16z"].map((path, index) => <g key={index} mask={"url(#" + id + "-" + index + ")"}>
      <path d={path} fill="#f6e7cd" stroke="#fff2d4" strokeWidth="3.2" strokeLinejoin="round" />
      <path d={path} fill={"url(#" + id + ")"} stroke="#38271d" strokeWidth="1.1" strokeLinejoin="round" />
    </g>)}
  </svg></span> : null;
}
