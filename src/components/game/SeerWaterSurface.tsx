"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import type { RoleSkillEvent } from "@/lib/role-skill-effects";
import { createSeerWaterMaps, SEER_WATER_UPDATE_MS, SEER_WATER_VISUAL_MS, seerWaterFrame } from "@/lib/seer-water";

const WATER_MAPS = createSeerWaterMaps();
let waterTextures: { normals: string; light: string } | null = null;

function getWaterTextures() {
  if (waterTextures) return waterTextures;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = WATER_MAPS.size;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const pixels = context.createImageData(WATER_MAPS.size, WATER_MAPS.size);
  pixels.data.set(WATER_MAPS.normals);
  context.putImageData(pixels, 0, 0);
  const normals = canvas.toDataURL();
  pixels.data.set(WATER_MAPS.light);
  context.putImageData(pixels, 0, 0);
  return waterTextures = { normals, light: canvas.toDataURL() };
}

export function SeerWaterSurface({ event }: { event: RoleSkillEvent }) {
  const id = "seer-water-" + useId();
  const root = useRef<SVGSVGElement>(null);
  const filter = useRef<SVGFilterElement>(null);
  const normal = useRef<SVGFEImageElement>(null);
  const displacement = useRef<SVGFEDisplacementMapElement>(null);
  const lighting = useRef<SVGImageElement>(null);
  const wash = useRef<SVGRectElement>(null);
  const lightTransform = useRef<SVGGElement>(null);
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const surface = document.querySelector<HTMLElement>("[data-skill-surface]");
    const previousFilter = surface?.style.filter ?? "";
    const waterFilter = (previousFilter && previousFilter !== "none" ? previousFilter + " " : "") + "url(#" + id + ")";
    const duration = SEER_WATER_VISUAL_MS;
    let appliedFilter: string | null = null;
    let frame = 0;
    let stopped = false;
    let lastPaint = -Infinity;
    let nextPaint = -Infinity;
    let width = 0;
    let height = 0;
    let updates = 0;
    let maxWorkMs = 0;
    let totalWorkMs = 0;
    let maxFrameGapMs = 0;
    let longTasks = 0;
    let reported = false;
    const observer = process.env.NODE_ENV === "development" && typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("longtask")
      ? new PerformanceObserver((entries) => { longTasks += entries.getEntries().length; }) : null;
    observer?.observe({ type: "longtask", buffered: false });
    const recordStats = () => {
      if (reported) return;
      reported = true;
      if (process.env.NODE_ENV === "development" && surface) {
        const stats = { width, height, visualDurationMs: duration, updateHz: 60, waveCycles: 2.5, updates, meanWorkMs: updates ? totalWorkMs / updates : 0, maxWorkMs, maxFrameGapMs, longTasks, reducedMotion: !!reducedMotion, elapsedMs: performance.now() - event.startedAt };
        surface.dataset.seerWaterStats = JSON.stringify(stats);
      }
    };
    const restore = () => {
      // CSSOM normalizes url(#id) to url("#id") in Chrome. Compare its actual assigned value.
      if (surface && appliedFilter !== null && surface.style.filter === appliedFilter) surface.style.filter = previousFilter;
    };
    const resize = () => {
      const bounds = surface?.getBoundingClientRect();
      width = bounds?.width || window.innerWidth;
      height = bounds?.height || window.innerHeight;
      root.current?.setAttribute("viewBox", "0 0 " + width + " " + height);
      filter.current?.setAttribute("width", String(width + 20));
      filter.current?.setAttribute("height", String(height + 20));
    };
    resize();
    if (!reducedMotion) {
      const textures = getWaterTextures();
      if (textures) {
        normal.current?.setAttribute("href", textures.normals);
        lighting.current?.setAttribute("href", textures.light);
        if (surface) {
          surface.style.filter = waterFilter;
          appliedFilter = surface.style.filter;
        }
      }
    }
    const tick = (now: number) => {
      if (stopped) return;
      if (now + 0.5 >= nextPaint) {
        const start = performance.now();
        const wave = seerWaterFrame(now - event.startedAt, duration, Math.hypot(width, height) / 2, !!reducedMotion);
        if (Number.isFinite(lastPaint)) maxFrameGapMs = Math.max(maxFrameGapMs, now - lastPaint);
        lastPaint = now;
        nextPaint = Number.isFinite(nextPaint) ? nextPaint + SEER_WATER_UPDATE_MS : now + SEER_WATER_UPDATE_MS;
        if (nextPaint < now) nextPaint = now + SEER_WATER_UPDATE_MS;
        normal.current?.setAttribute("x", String(width / 2 - wave.radius));
        normal.current?.setAttribute("y", String(height / 2 - wave.radius));
        normal.current?.setAttribute("width", String(wave.radius * 2));
        normal.current?.setAttribute("height", String(wave.radius * 2));
        lightTransform.current?.setAttribute("transform", `translate(${width / 2} ${height / 2}) scale(${wave.radius})`);
        displacement.current?.setAttribute("scale", String(wave.displacement * Math.min(1, width / 768)));
        lighting.current?.setAttribute("opacity", String(wave.lightOpacity));
        wash.current?.setAttribute("opacity", String(wave.washOpacity));
        updates++;
        const work = performance.now() - start;
        totalWorkMs += work;
        maxWorkMs = Math.max(maxWorkMs, work);
        if (wave.done) {
          stopped = true;
          restore();
          window.removeEventListener("resize", resize);
          observer?.disconnect();
          root.current?.setAttribute("data-visual-finished", "true");
          // Diagnostic only; never rendered as game UI or persisted in GameState.
          recordStats();
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      observer?.disconnect();
      restore();
      recordStats();
    };
  }, [event, id, reducedMotion]);

  return <svg ref={root} className="wc-seer-water" data-role-skill="seer" data-role-skill-id={event.id} aria-hidden="true">
    <defs><filter ref={filter} id={id} x="-10" y="-10" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
      <feFlood floodColor="#808080" result="flat" />
      <feImage ref={normal} preserveAspectRatio="none" result="normals" />
      <feComposite in="normals" in2="flat" operator="over" result="surface" />
      <feDisplacementMap ref={displacement} in="SourceGraphic" in2="surface" scale="0" xChannelSelector="R" yChannelSelector="G" />
    </filter></defs>
    <rect ref={wash} width="100%" height="100%" fill="#6aa8bd" opacity="0" />
    <g ref={lightTransform}><image ref={lighting} x="-1" y="-1" width="2" height="2" opacity="0" preserveAspectRatio="none" /></g>
  </svg>;
}
