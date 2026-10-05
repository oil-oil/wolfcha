import { gsap } from "gsap";
import { getAvatarScaleX, type AvatarFacing } from "@/lib/avatar-config";
import type { MatchingPlayer, MatchedPlayer } from "./matching-characters";
import { loadMatchingImage } from "./matching-assets";
import { createCrowdStopSlots, createWalkingRoute, walkingRouteX, type CrowdStopSlot } from "./matching-motion";

export interface CrowdSnapshot {
  variant: "original" | "matching";
  matchedCount: number;
  matchedPlayerIds?: readonly string[];
  totalSeats: number;
  status: "searching" | "matched";
}

interface SceneOptions {
  src: string;
  rows: number;
  cols: number;
  players: readonly MatchingPlayer[];
  compact: boolean;
  initial: CrowdSnapshot;
  onReady: () => void;
  onError: () => void;
  onMatchedCountChange: (count: number) => void;
  onPlayersMatched: (players: readonly MatchedPlayer[]) => void;
  transferEnabled: boolean;
  avatarForSeat: (seat: number) => HTMLDivElement | undefined;
  onSeatArrived: (seat: number) => void;
  onTransitionComplete: () => void;
}

interface CrowdScene {
  update: (snapshot: CrowdSnapshot) => void;
  updatePlayers: (players: readonly MatchingPlayer[]) => void;
  destroy: () => void;
}

interface Sprite {
  image: HTMLImageElement;
  player?: MatchingPlayer;
  rect: [number, number, number, number];
  width: number;
  height: number;
}

interface Peep {
  sprite: Sprite;
  x: number;
  y: number;
  anchorY: number;
  scale: number;
  scaleX: number;
  facing: AvatarFacing;
  frontRow: boolean;
  matched: boolean;
  seat?: number;
  stopSlot?: number;
  stopY?: number;
  approach?: { progress: number; bob: number; update: () => void };
  flight?: {
    progress: number;
    arrived: boolean;
    startX: number;
    startCenterY: number;
    startScale: number;
    avatar: HTMLDivElement;
    portrait: HTMLImageElement;
  };
  walk?: gsap.core.Timeline;
  turn?: gsap.core.Tween;
}

const randomRange = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Adapted from Skiper UI 39 and Zadvorsky's Crowd Simulator.
 * The original mode uses Open Peeps; matching uses the game's own Notionists.
 * Attribution also appears on the preview page.
 * The source calls its 15 horizontal cells `rows` and its 7 vertical cells
 * `cols`; these prop names stay compatible with the supplied source.
 */
export function createCrowdScene(canvas: HTMLCanvasElement, options: SceneOptions): CrowdScene {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    options.onError();
    return { update: () => {}, updatePlayers: () => {}, destroy: () => {} };
  }

  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sprites: Sprite[] = [];
  const crowd: Peep[] = [];
  const background = { opacity: 1 };
  const stage = { width: 0, height: 0, dpr: 1 };
  let snapshot = options.initial;
  let disposed = false;
  let loaded = false;
  let ticking = false;
  let reducedMotion = media.matches;
  let arrivalTimeline: gsap.core.Timeline | undefined;
  let arrivalOrder: Peep[] | undefined;
  let transitionStarted = false;
  let transitionComplete = false;
  let pendingFrame: number | undefined;
  let stopSlots: CrowdStopSlot[] = [];
  let activePlayers = options.players;
  let rosterVersion = 0;

  const peepScale = () => snapshot.variant === "original" ? 1 : options.compact ?
    Math.min(stage.width < 640 ? 0.5 : 0.72, stage.height / 1100) : stage.width < 640 ? 0.55 : 0.95;

  const stopPeep = (peep: Peep) => {
    peep.walk?.kill();
    peep.walk = undefined;
    peep.turn?.kill();
    peep.turn = undefined;
    peep.approach = undefined;
    if (!peep.matched) {
      peep.stopSlot = undefined;
      peep.stopY = undefined;
    }
  };
  const matchCount = () => crowd.filter((peep) => peep.matched).length;

  function render() {
    if (disposed || !loaded) return;
    selectMatches();
    startArrival();
    ctx!.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
    ctx!.clearRect(0, 0, stage.width, stage.height);

    // Keep the crowd's depth order through the entire flight, even when
    // people start at different times or their paths cross.
    const sorted = arrivalOrder ?? [...crowd].sort((a, b) => a.anchorY - b.anchorY);
    for (const peep of sorted) {
      let x = peep.x;
      let y = peep.y;
      let scale = peep.scale;
      let clip = 0;
      if (peep.flight) {
        const flight = peep.flight;
        if (flight.arrived && transitionComplete) continue;
        // Use the image's content box, excluding the avatar frame's border.
        // Its square framing stays identical from the crowd to the game card.
        // A responsive layout change can replace the avatar DOM while a
        // flight is active. Follow the current seat rather than a detached image.
        const avatar = options.avatarForSeat(peep.seat!);
        const portrait = avatar?.querySelector("img");
        if (avatar && portrait) {
          flight.avatar = avatar;
          flight.portrait = portrait;
        }
        const target = flight.portrait.getBoundingClientRect();
        const bounds = canvas.getBoundingClientRect();
        const endX = target.left - bounds.left + target.width / 2;
        const endCenterY = target.top - bounds.top + target.height / 2;
        const endScale = target.width / peep.sprite.width;
        const p = flight.progress;
        const controlX = flight.startX + (endX - flight.startX) * 0.75;
        const controlY = Math.min(flight.startCenterY, endCenterY) - Math.min(100, stage.height * 0.12);
        x = (1 - p) ** 2 * flight.startX + 2 * (1 - p) * p * controlX + p ** 2 * endX;
        const centerY = (1 - p) ** 2 * flight.startCenterY + 2 * (1 - p) * p * controlY + p ** 2 * endCenterY;
        scale = flight.startScale + (endScale - flight.startScale) * p;
        y = centerY - peep.sprite.height * 0.5 * scale;
        clip = Math.max(0, Math.min(1, (p - 0.55) / 0.45));
      }
      ctx!.save();
      ctx!.globalAlpha = peep.matched || peep.approach ? 1 : background.opacity;
      ctx!.translate(x, y);
      ctx!.scale(peep.scaleX * scale, scale);
      if (clip > 0) {
        const radius = peep.sprite.height * (1 - clip) + peep.sprite.width * 0.5 * clip;
        ctx!.beginPath();
        ctx!.arc(0, peep.sprite.height * 0.5, radius, 0, Math.PI * 2);
        ctx!.clip();
        if (peep.sprite.player) {
          ctx!.save();
          ctx!.globalAlpha *= clip;
          ctx!.fillStyle = peep.sprite.player.backgroundColor;
          ctx!.beginPath();
          ctx!.arc(0, peep.sprite.height * 0.5, peep.sprite.width * 0.5, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.restore();
        }
      }
      const originX = snapshot.variant === "original" ? 0 : -peep.sprite.width / 2;
      if (peep.sprite.player) {
        // SVGs without intrinsic dimensions need whole-image drawing. The
        // sprite-cropping overload can use different source bounds in Chromium.
        ctx!.drawImage(peep.sprite.image, originX, 0, peep.sprite.width, peep.sprite.height);
      } else {
        ctx!.drawImage(peep.sprite.image, ...peep.sprite.rect, originX, 0, peep.sprite.width, peep.sprite.height);
      }
      ctx!.restore();
    }
    canvas.dataset.matchedCount = String(matchCount());
    canvas.dataset.crowdCount = String(crowd.length);
    canvas.dataset.matchedPlayerIds = JSON.stringify(crowd.filter((peep) => peep.matched).map((peep) => peep.sprite.player?.id));
    canvas.dataset.walkingCount = String(crowd.filter((peep) => !!peep.walk).length);
    canvas.dataset.settlingCount = String(crowd.filter((peep) => !!peep.approach).length);
    canvas.dataset.transition = transitionComplete ? "complete" : transitionStarted ? "moving" : "waiting";
    canvas.dataset.arrivedCount = String(crowd.filter((peep) => peep.flight?.arrived).length);
    canvas.dataset.characterSource = snapshot.variant === "original" ? "open-peeps" : "game-avatars";
  }

  function syncTicker() {
    const moving = crowd.some((peep) => peep.walk?.isActive());
    const shouldTick = loaded && !disposed && !document.hidden && !reducedMotion &&
      (moving || gsap.isTweening(background) || (transitionStarted && !transitionComplete));
    if (shouldTick && !ticking) {
      gsap.ticker.add(render);
      ticking = true;
    } else if (!shouldTick && ticking) {
      gsap.ticker.remove(render);
      ticking = false;
    }
    render();
  }

  function resetWalk(peep: Peep, randomProgress = false, initialDirection?: 1 | -1, keepPosition = false) {
    const previous = { x: peep.x, y: peep.y, scaleX: peep.scaleX, speed: peep.walk?.timeScale() };
    stopPeep(peep);
    if (peep.matched) return;
    const direction = initialDirection ?? (Math.random() > 0.5 ? 1 : -1);
    const width = peep.sprite.width * peep.scale;
    const height = peep.sprite.height * peep.scale;
    peep.x = keepPosition ? previous.x : direction === 1 ? -width : stage.width + width;
    peep.facing = direction === 1 ? "right" : "left";
    const scaleX = snapshot.variant === "original" ? direction : getAvatarScaleX(peep.facing);
    peep.scaleX = keepPosition && !reducedMotion ? previous.scaleX : scaleX;
    if (peep.scaleX !== scaleX) {
      // Turn an existing person in place when its actual seat is assigned;
      // do not move it to a new position or change its face.
      peep.turn = gsap.to(peep, { scaleX, duration: 0.24, ease: "power2.inOut" });
      if (document.hidden) peep.turn.pause();
    }

    if (keepPosition) {
      peep.y = previous.y;
    } else if (snapshot.variant === "original") {
      // Preserve the source's depth distribution and 10-second crossing.
      const offsetY = 100 - 250 * gsap.parseEase("power2.in")(Math.random());
      peep.y = stage.height - height + offsetY;
    } else {
      const depth = options.compact ? Math.min(70, stage.height * 0.1) : 170;
      const back = Math.max(0, stage.height - height - depth);
      const front = Math.max(back + 25, stage.height - height + 12);
      // Keep a foreground row slightly beyond the edge, including its bob,
      // so the torso cutouts meet the page bottom instead of floating above it.
      peep.y = peep.frontRow ? front + randomRange(4, 10) :
        back + (front - back) * (1 - Math.random() ** 2);
    }
    peep.anchorY = peep.y + height;

    if (reducedMotion) {
      const inset = width * (snapshot.variant === "matching" ? 0.4 : 0.3);
      if (!keepPosition) peep.x = randomRange(inset, stage.width - inset);
      return;
    }

    const endX = snapshot.variant === "original" ? (direction === 1 ? stage.width : 0) :
      direction === 1 ? stage.width + width : -width;
    const duration = keepPosition ? Math.max(0.25, 10 * Math.abs(endX - peep.x) / (stage.width + width * 2)) : 10;
    peep.walk = gsap.timeline({
      onComplete: () => {
        if (disposed || peep.matched) return;
        if (snapshot.variant === "original" || snapshot.status === "searching" || matchCount() < snapshot.totalSeats) {
          resetWalk(peep, false, snapshot.variant === "matching" ? (peep.facing === "right" ? 1 : -1) : undefined);
        } else {
          stopPeep(peep);
          syncTicker();
        }
      },
    });
    peep.walk.timeScale(keepPosition && previous.speed ? previous.speed : randomRange(0.5, 1.5));
    peep.walk.to(peep, {
      x: endX,
      duration,
      ease: "none",
    }, 0);
    peep.walk.to(peep, {
      y: peep.y - 10,
      duration: 0.25,
      repeat: keepPosition ? Math.max(0, Math.ceil(duration / 0.25) - 1) : 40,
      yoyo: true,
      ease: "power1.inOut",
    }, 0);
    if (randomProgress) peep.walk.progress(Math.random());
    if (document.hidden) peep.walk.pause();
  }

  function createCrowd() {
    crowd.forEach(stopPeep);
    crowd.length = 0;
    const count = snapshot.variant === "original" ? sprites.length : Math.min(60, sprites.length);
    const available = [...sprites];
    for (let i = 0; i < count; i++) {
      const sprite = available.splice(Math.floor(Math.random() * available.length), 1)[0];
      const peep: Peep = {
        sprite, x: 0, y: 0, anchorY: 0, scaleX: 1, facing: "right", frontRow: i % 3 === 0,
        scale: peepScale(),
        matched: false,
      };
      crowd.push(peep);
      // Initially balance the two directions, also for static reduced-motion
      // crowds, where a missing direction cannot walk into view later.
      const seat = sprite.player?.seat;
      const direction = seat !== undefined ? (seat < Math.ceil(snapshot.totalSeats / 2) ? 1 : -1) : (i % 2 ? -1 : 1);
      resetWalk(peep, !sprite.player?.enterFromEdge, snapshot.variant === "matching" ? direction : undefined);
      if (snapshot.variant === "matching" && seat !== undefined && !sprite.player?.enterFromEdge) {
        // A fixed roster starts visibly spread out, with one figure per ID.
        const width = sprite.width * peep.scale;
        const inset = width * 0.4;
        const x = inset + Math.max(0, stage.width - inset * 2) * (i + 0.5) / count;
        if (peep.walk) {
          const progress = direction === 1 ? (x + width) / (stage.width + width * 2) : (stage.width + width - x) / (stage.width + width * 2);
          peep.walk.time(progress * 10);
        } else peep.x = x;
      }
    }
  }

  function publishMatches() {
    options.onPlayersMatched(crowd.filter((peep) => peep.matched)
      .sort((a, b) => a.seat! - b.seat!).map((peep) => ({
        ...peep.sprite.player!, seat: peep.seat!, facing: peep.facing,
      })));
    options.onMatchedCountChange(matchCount());
    syncBackground();
  }

  function placeAtStop(peep: Peep) {
    const slot = stopSlots[peep.stopSlot!];
    peep.x = slot.x;
    peep.y = peep.stopY!;
    peep.anchorY = peep.y + peep.sprite.height * peep.scale;
  }

  function approachStop(peep: Peep, slot: CrowdStopSlot, seat: number) {
    const direction = peep.facing === "right" ? 1 : -1;
    const baselineY = peep.anchorY - peep.sprite.height * peep.scale;
    const figureWidth = peep.sprite.width * peep.scale;
    const route = createWalkingRoute(peep.x, slot.x, stage.width, figureWidth, direction, Math.min(stage.width * 0.14, figureWidth * 0.75));
    const entering = direction === 1 ? peep.x < -figureWidth * 0.25 : peep.x > stage.width + figureWidth * 0.25;
    const half = Math.ceil(snapshot.totalSeats / 2);
    const delay = entering ? (seat % half) * 0.14 + (direction === -1 ? 0.06 : 0) : (seat % 3) * 0.08;
    const duration = 3.1 + Math.min(1, route.distance / (stage.width + figureWidth * 2)) * 1.9 + (seat % 3) * 0.08;
    stopPeep(peep);
    peep.seat = seat;
    peep.stopSlot = slot.index;
    peep.stopY = baselineY;
    if (reducedMotion) {
      placeAtStop(peep);
      peep.matched = true;
      return;
    }
    const motion = { progress: 0, bob: peep.y + peep.sprite.height * peep.scale - peep.anchorY, update: () => {} };
    motion.update = () => {
      const p = motion.progress;
      peep.x = walkingRouteX(route, p);
      // Keep the original walking height and size. Only its small walking
      // bob fades out as the horizontal movement slows to a stop.
      const strength = Math.min(1, Math.max(0, (1 - p) / 0.16));
      peep.y = baselineY + motion.bob * strength;
    };
    peep.approach = motion;
    const timeline = gsap.timeline({
      delay,
      onUpdate: motion.update,
      onComplete: () => {
        if (disposed || peep.approach !== motion) return;
        peep.walk = undefined;
        peep.approach = undefined;
        placeAtStop(peep);
        peep.matched = true;
        publishMatches();
        syncTicker();
      },
    });
    peep.walk = timeline;
    // Match velocity at the join: power1.out starts at twice its average
    // speed, so reserve only this final fraction for the braking phase.
    const cruiseProgress = 1 - 0.7 / (2 * duration - 0.7);
    timeline.to(motion, { progress: cruiseProgress, duration: duration - 0.7, ease: "none" }, 0);
    timeline.to(motion, { progress: 1, duration: 0.7, ease: "power1.out" }, duration - 0.7);
    const steps = Math.max(2, Math.round(duration / 0.5) * 2);
    timeline.to(motion, { bob: -7, duration: duration / steps, repeat: steps - 1, yoyo: true, ease: "power1.inOut" }, 0);
    if (document.hidden) timeline.pause();
  }

  function selectMatches() {
    if (snapshot.variant !== "matching" || !stage.width || transitionStarted) return;
    const requestedIds = snapshot.matchedPlayerIds === undefined ? undefined : new Set(snapshot.matchedPlayerIds);
    const requested = Math.min(requestedIds?.size ?? snapshot.matchedCount, snapshot.totalSeats);
    const reserved = () => crowd.filter((peep) => peep.matched || peep.approach);
    const half = Math.ceil(snapshot.totalSeats / 2);
    const seatFor = (peep: Peep): number | undefined => {
      if (peep.sprite.player?.seat !== undefined) return peep.sprite.player.seat;
      const start = peep.facing === "right" ? 0 : half;
      const end = peep.facing === "right" ? half : snapshot.totalSeats;
      for (let seat = start; seat < end; seat++) if (!reserved().some((other) => other.seat === seat)) return seat;
    };
    const before = matchCount();
    while (reserved().length < requested) {
      const occupied = reserved();
      const freeSlots = stopSlots.filter((slot) => !occupied.some((peep) => peep.stopSlot === slot.index));
      const candidates = crowd.filter((peep) => {
        const seat = seatFor(peep);
        return !peep.matched && !peep.approach && peep.sprite.player &&
          (!requestedIds || requestedIds.has(peep.sprite.player.id)) &&
          !occupied.some((other) => other.sprite.player?.id === peep.sprite.player!.id) &&
          seat !== undefined && !occupied.some((other) => other.seat === seat) &&
          Math.abs(peep.scaleX - getAvatarScaleX(peep.facing)) < 0.001;
      });
      if (!candidates.length || !freeSlots.length) break;
      const plans = candidates.flatMap((peep) => freeSlots.map((slot) => {
        const width = peep.sprite.width * peep.scale;
        const route = createWalkingRoute(peep.x, slot.x, stage.width, width, peep.facing === "right" ? 1 : -1, Math.min(stage.width * 0.14, width * 0.75));
        const headY = peep.anchorY - peep.sprite.height * peep.scale * 0.74;
        const crowding = occupied.reduce((penalty, other) => {
          const size = (width + other.sprite.width * other.scale) / 2;
          const otherX = other.stopSlot === undefined ? other.x : stopSlots[other.stopSlot].x;
          const otherHeadY = other.anchorY - other.sprite.height * other.scale * 0.74;
          const gap = Math.hypot((slot.x - otherX) / (size * 0.6), (headY - otherHeadY) / (size * 0.4));
          return penalty + Math.max(0, 1 - gap);
        }, 0);
        // Favor less crowded stops on the person's own path. Overlap is a
        // soft preference, never a reason to change height or shrink them.
        return { peep, slot, score: route.distance + crowding * stage.width * 0.28 };
      })).sort((a, b) => a.score - b.score);
      const { peep, slot } = plans[0];
      approachStop(peep, slot, seatFor(peep)!);
    }
    if (reducedMotion && matchCount() !== before) publishMatches();
  }

  function startArrival() {
    if (transitionStarted || !options.transferEnabled || document.hidden || snapshot.variant !== "matching" ||
      snapshot.status !== "matched" || matchCount() !== snapshot.totalSeats) return;
    const selected = crowd.filter((peep) => peep.matched).sort((a, b) => a.seat! - b.seat!);
    const avatars = selected.map((peep) => options.avatarForSeat(peep.seat!));
    const portraits = avatars.map((avatar) => avatar?.querySelector("img"));
    // Selection updates React's roster. Wait for the exact same characters
    // and decoded images before moving; this also works with reduced motion.
    if (avatars.some((avatar, index) => !avatar ||
      avatar.dataset.playerId !== selected[index].sprite.player!.id ||
      avatar.dataset.avatarFacing !== selected[index].facing ||
      !portraits[index]?.complete || !portraits[index]?.naturalWidth ||
      portraits[index]?.getAttribute("src") !== selected[index].sprite.player!.figureUrl)) {
      if (pendingFrame === undefined) pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = undefined;
        if (!disposed) syncTicker();
      });
      return;
    }
    arrivalOrder = [...crowd].sort((a, b) => a.anchorY - b.anchorY);
    transitionStarted = true;
    const half = Math.ceil(snapshot.totalSeats / 2);
    selected.forEach((peep, index) => {
      peep.flight = {
        progress: reducedMotion ? 1 : 0,
        arrived: reducedMotion,
        startX: peep.x,
        startCenterY: peep.y + peep.sprite.height * 0.5 * peep.scale,
        startScale: peep.scale,
        avatar: avatars[index]!,
        portrait: portraits[index]!,
      };
      if (reducedMotion) {
        avatars[index]!.style.setProperty("--arrival-progress", "1");
        options.onSeatArrived(peep.seat!);
      }
    });
    if (reducedMotion) {
      transitionComplete = true;
      options.onTransitionComplete();
      return;
    }
    arrivalTimeline = gsap.timeline({
      delay: 0.32,
      onComplete: () => {
        if (disposed) return;
        // Keep early arrivals on the same canvas until every flight ends.
        // Hand all portraits to the sidebar in one frame, so an arrived
        // portrait cannot jump behind someone still passing its seat.
        selected.forEach((peep) => peep.flight!.avatar.style.setProperty("--arrival-progress", "1"));
        transitionComplete = true;
        options.onTransitionComplete();
        syncTicker();
      },
    });
    selected.forEach((peep) => {
      const row = peep.seat! % half;
      const sideDelay = peep.seat! >= half ? 0.04 : 0;
      const offset = row * 0.085 + sideDelay;
      arrivalTimeline!.to(peep.flight!, {
        progress: 1,
        duration: 1.45,
        ease: "power3.inOut",
        onComplete: () => {
          if (disposed) return;
          // Stay at the destination in the original drawing order until the
          // shared handoff. Names can reveal as each participant arrives.
          peep.flight!.arrived = true;
          options.onSeatArrived(peep.seat!);
          render();
        },
      }, offset);
    });
    if (document.hidden) arrivalTimeline.pause();
  }

  function syncBackground() {
    gsap.killTweensOf(background);
    const complete = snapshot.status === "matched" && matchCount() === snapshot.totalSeats;
    const opacity = snapshot.variant === "original" ? 1 : complete ? 0 :
      Math.max(0.3, 1 - matchCount() / snapshot.totalSeats * 0.65);
    if (reducedMotion) {
      background.opacity = opacity;
      if (complete) crowd.filter((peep) => !peep.matched).forEach(stopPeep);
    } else {
      gsap.to(background, {
        opacity, duration: complete ? 0.7 : 0.6,
        onComplete: () => {
          if (complete) crowd.filter((peep) => !peep.matched).forEach(stopPeep);
          syncTicker();
        },
      });
    }
  }

  function resize(force = false) {
    if (disposed || !loaded) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!force && crowd.length && bounds.width === stage.width && bounds.height === stage.height && dpr === stage.dpr) return;
    const previous = { width: stage.width, height: stage.height, scale: peepScale() };
    stage.width = bounds.width;
    stage.height = bounds.height;
    stage.dpr = dpr;
    canvas.width = Math.round(stage.width * stage.dpr);
    canvas.height = Math.round(stage.height * stage.dpr);
    stopSlots = createCrowdStopSlots(stage.width, snapshot.totalSeats);
    if (!crowd.length) {
      createCrowd();
    } else {
      for (const peep of crowd) {
        if (peep.matched) {
          // Reflow stopped participants; keep an active flight continuous.
          peep.x *= stage.width / previous.width;
          peep.y *= stage.height / previous.height;
          if (peep.stopY !== undefined) peep.stopY *= stage.height / previous.height;
          if (peep.flight) {
            peep.flight.startX *= stage.width / previous.width;
            peep.flight.startCenterY *= stage.height / previous.height;
            peep.flight.startScale *= peepScale() / peep.scale;
          }
          peep.scale = peepScale();
          if (peep.stopSlot !== undefined) placeAtStop(peep);
          else {
            const inset = peep.sprite.width * peep.scale * 0.4;
            peep.x = Math.min(stage.width - inset, Math.max(inset, peep.x));
            peep.anchorY = peep.y + peep.sprite.height * peep.scale;
          }
        } else if (peep.approach) {
          // Continue from the visible position when the viewport changes.
          // Reservations are replanned together at the new responsive scale.
          peep.x *= stage.width / previous.width;
          peep.y *= stage.height / previous.height;
          peep.scale *= peepScale() / previous.scale;
          resetWalk(peep, false, peep.facing === "right" ? 1 : -1, true);
        } else {
          peep.scale = peepScale();
          resetWalk(peep, true, snapshot.variant === "matching" ? (peep.facing === "right" ? 1 : -1) : undefined);
        }
      }
    }
    selectMatches();
    syncBackground();
    syncTicker();
  }

  function onVisibility() {
    if (document.hidden) arrivalTimeline?.pause();
    else arrivalTimeline?.resume();
    for (const peep of crowd) {
      if (document.hidden) { peep.walk?.pause(); peep.turn?.pause(); }
      else { peep.walk?.resume(); peep.turn?.resume(); }
    }
    syncTicker();
  }

  function onMotionPreference() {
    reducedMotion = media.matches;
    if (reducedMotion) arrivalTimeline?.progress(1);
    resize(true);
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas);
  document.addEventListener("visibilitychange", onVisibility);
  media.addEventListener("change", onMotionPreference);

  function reconcileSprites(nextSprites: Sprite[]) {
    const available = [...crowd];
    const nextCrowd: Peep[] = [];
    sprites.splice(0, sprites.length, ...nextSprites);
    for (const sprite of nextSprites) {
      let index = available.findIndex((peep) => peep.sprite.player?.id === sprite.player!.id && peep.sprite.player?.figureUrl === sprite.player!.figureUrl);
      if (index < 0) index = available.findIndex((peep) => !peep.matched && peep.sprite.player?.figureUrl === sprite.player!.figureUrl);
      const peep = index >= 0 ? available.splice(index, 1)[0] : undefined;
      const direction = sprite.player?.seat !== undefined ? (sprite.player.seat < Math.ceil(snapshot.totalSeats / 2) ? 1 : -1) : (nextCrowd.length % 2 ? -1 : 1);
      if (peep) {
        peep.sprite = sprite;
        if (!peep.matched && sprite.player?.seat !== undefined && peep.facing !== (direction === 1 ? "right" : "left")) {
          resetWalk(peep, false, direction, true);
        }
        nextCrowd.push(peep);
      } else {
        const entrant: Peep = { sprite, x: 0, y: 0, anchorY: 0, scaleX: 1, facing: "right", frontRow: nextCrowd.length % 3 === 0, scale: peepScale(), matched: false };
        nextCrowd.push(entrant);
        resetWalk(entrant, false, direction);
      }
    }
    available.forEach(stopPeep);
    crowd.splice(0, crowd.length, ...nextCrowd);
    syncBackground();
    syncTicker();
  }

  async function loadMatchingSprites(players: readonly MatchingPlayer[]) {
    const version = ++rosterVersion;
    try {
      const unique = [...new Map(players.map((player) => [player.id, player])).values()];
      const results = await Promise.allSettled(unique.map(async (player): Promise<Sprite> => {
        const image = await loadMatchingImage(player.figureUrl);
        return { image, player, rect: [0, 0, image.naturalWidth, image.naturalHeight], width: 300, height: 300 };
      }));
      if (disposed || version !== rosterVersion) return;
      const nextSprites = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const loadedIds = new Set(nextSprites.map((sprite) => sprite.player!.id));
      const missingParticipant = unique.some((player) => player.seat !== undefined && !loadedIds.has(player.id));
      if (missingParticipant || !nextSprites.length || (snapshot.matchedPlayerIds === undefined && nextSprites.length < snapshot.totalSeats)) {
        throw new Error("Required game avatars could not load");
      }
      if (loaded) {
        reconcileSprites(nextSprites);
      } else {
        sprites.push(...nextSprites);
        loaded = true;
        resize();
      }
      options.onReady();
    } catch {
      if (!disposed && version === rosterVersion) options.onError();
    }
  }

  async function loadSprites() {
    try {
      if (options.initial.variant === "original") {
        const image = await loadMatchingImage(options.src);
        if (disposed) return;
        const width = image.naturalWidth / options.rows;
        const height = image.naturalHeight / options.cols;
        for (let i = 0; i < options.rows * options.cols; i++) {
          sprites.push({
            image,
            rect: [(i % options.rows) * width, Math.floor(i / options.rows) * height, width, height],
            width, height,
          });
        }
      } else {
        await loadMatchingSprites(activePlayers);
        return;
      }
      loaded = true;
      resize();
      options.onReady();
    } catch {
      if (!disposed) options.onError();
    }
  }
  void loadSprites();

  return {
    updatePlayers(players: readonly MatchingPlayer[]) {
      if (disposed || snapshot.variant !== "matching" || players === activePlayers) return;
      activePlayers = players;
      void loadMatchingSprites(players);
    },
    update(next: CrowdSnapshot) {
      const previous = snapshot;
      snapshot = next;
      if (!loaded || disposed) return;
      const removedParticipant = next.matchedPlayerIds !== undefined && crowd.some((peep) => (peep.matched || peep.approach) && !next.matchedPlayerIds!.includes(peep.sprite.player!.id));
      if (previous.variant !== next.variant || (next.matchedPlayerIds === undefined && next.matchedCount < crowd.filter((peep) => peep.matched || peep.approach).length) || removedParticipant) {
        arrivalTimeline?.kill();
        arrivalOrder = undefined;
        transitionStarted = false;
        transitionComplete = false;
        crowd.forEach(stopPeep);
        crowd.length = 0;
        background.opacity = 1;
        options.onMatchedCountChange(0);
        resize();
      } else {
        selectMatches();
        syncBackground();
        syncTicker();
      }
    },
    destroy() {
      disposed = true;
      if (pendingFrame !== undefined) window.cancelAnimationFrame(pendingFrame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      media.removeEventListener("change", onMotionPreference);
      gsap.ticker.remove(render);
      gsap.killTweensOf(background);
      arrivalTimeline?.kill();
      arrivalOrder = undefined;
      crowd.forEach(stopPeep);
      crowd.length = 0;
    },
  };
}
