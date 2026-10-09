import { isWolfRole, type GameState, type Player } from "@/types/game";

/** Cue positions in the approved, unmodified V4 A recording. */
export const WOLF_STRIKE_TIMING = {
  slashMs: 45,
  impactMs: 235,
  drawMs: 190,
  clawMs: 650,
  hitMs: 420,
  shakeMs: 300,
  durationMs: 1100,
} as const;

export const WOLF_STRIKE_AUDIO_URL = "/audio/sfx/wolf-strike-v4a.wav";

/** Transient presentation only: never persisted in the game state. */
export interface WolfStrikeEvent {
  id: number;
  targetSeat: number;
  startedAt: number;
}

export function wolfStrikeForSeat(strike: WolfStrikeEvent | null, seat: number) {
  return strike?.targetSeat === seat ? strike : null;
}

/** A private attack cue conveys the chosen target, never the night's outcome. */
export function getNewWolfStrikeTarget(
  state: Pick<GameState, "day" | "phase" | "nightActions" | "players">,
  humanPlayer: Player | null,
  previous: { wolfTarget?: number; wolfDay?: number },
) {
  const target = state.nightActions.wolfTarget;
  if (!humanPlayer?.alive || !isWolfRole(humanPlayer.role) || state.phase !== "NIGHT_WOLF_ACTION" ||
      typeof target !== "number" || !state.players.some((player) => player.seat === target)) return null;
  return target !== previous.wolfTarget || state.day !== previous.wolfDay ? target : null;
}

export interface WolfStrikeSound {
  play: (isCurrent: () => boolean) => Promise<number | null>;
  stop: () => void;
}

export interface StrikeClock {
  now: () => number;
  schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clear: (timer: ReturnType<typeof setTimeout>) => void;
}

const browserClock: StrikeClock = {
  now: () => performance.now(),
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (timer) => clearTimeout(timer),
};

/** Latest request owns the sound, both visual cues, and their cleanup. */
export class WolfStrikeController {
  private requestId = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly publish: (strike: WolfStrikeEvent | null) => void,
    private readonly sound: WolfStrikeSound,
    private readonly clock: StrikeClock = browserClock,
  ) {}

  async play(targetSeat: number, durationMs: number = WOLF_STRIKE_TIMING.durationMs, onComplete?: () => void) {
    if (!Number.isInteger(targetSeat) || targetSeat < 0) return;
    const id = ++this.requestId;
    this.clearPlayback();
    this.publish(null);
    const isCurrent = () => id === this.requestId;
    const audioStartedAt = await this.sound.play(isCurrent);
    if (!isCurrent()) return;
    const startedAt = audioStartedAt ?? this.clock.now();
    this.publish({ id, targetSeat, startedAt });
    this.timer = this.clock.schedule(() => {
      if (!isCurrent()) return;
      this.timer = null;
      this.sound.stop();
      this.publish(null);
      onComplete?.();
    }, Math.max(0, startedAt + durationMs - this.clock.now()));
  }

  cancel(publish = true) {
    this.requestId += 1;
    this.clearPlayback();
    if (publish) this.publish(null);
  }

  private clearPlayback() {
    if (this.timer !== null) this.clock.clear(this.timer);
    this.timer = null;
    this.sound.stop();
  }
}

/** Use the actual media playhead as the origin, including on the first play. */
export class WolfStrikeAudio implements WolfStrikeSound {
  private readonly audio: HTMLAudioElement;
  private enabled = true;
  private disposed = false;

  constructor(url: string = WOLF_STRIKE_AUDIO_URL) {
    this.audio = new Audio(url);
    this.audio.preload = "auto";
    this.audio.load();
  }

  setSettings(enabled: boolean, volume: number) {
    this.enabled = enabled && volume > 0;
    this.audio.volume = Math.max(0, Math.min(1, volume));
    if (!this.enabled) this.stop();
  }

  async play(isCurrent: () => boolean) {
    if (!this.enabled || this.disposed) return null;
    try {
      await this.audio.play();
      if (!isCurrent() || this.disposed) return null;
      return performance.now() - this.audio.currentTime * 1000;
    } catch (error) {
      // A replaced request can reject with AbortError; it owns no visible cue.
      if (isCurrent() && !this.disposed) {
        console.warn("[wolfcha] V4 A playback unavailable; using the silent visual cue", error);
      }
      return null;
    }
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.audio.removeAttribute("src");
    this.audio.load();
  }
}
