import { isWolfRole, type GameState, type Player } from "@/types/game";
import {
  ROLE_SKILL_AUDIO, RoleSkillCueTracker, getVisibleHunterHitSeats, isHunterAiming,
  type RoleSkillType,
} from "./role-skill-effects";
import {
  WOLF_STRIKE_TIMING, WolfStrikeController, getNewWolfStrikeTarget,
  type StrikeClock, type WolfStrikeEvent, type WolfStrikeSound,
} from "./wolf-strike";

export type GameSkillType = "wolf" | RoleSkillType;
export interface GameSkillCue {
  type: GameSkillType;
  targetSeat: number;
  gameId: string;
  day: number;
  viewerId: string | null;
  devMutationId?: number;
}
export interface GameSkillEvent extends WolfStrikeEvent, GameSkillCue {}

function canPresent(state: GameState, enabled: boolean) {
  return enabled && !state.isPaused && !["LOBBY", "SETUP", "GAME_END"].includes(state.phase);
}

/** Recheck privacy while a sound loads and while queued cues wait their turn. */
export function isGameSkillCueVisible(cue: GameSkillCue, state: GameState, human: Player | null, enabled: boolean) {
  if (!canPresent(state, enabled) || state.gameId !== cue.gameId || state.devMutationId !== cue.devMutationId ||
      !state.players.some((player) => player.seat === cue.targetSeat)) return false;
  switch (cue.type) {
    case "idiot": return state.roleAbilities.idiotRevealed;
    case "white-wolf-king": return state.roleAbilities.whiteWolfKingBoomUsed;
    case "hunter-shot": return getVisibleHunterHitSeats(state, human).has(cue.targetSeat);
    case "hunter-ready": return cue.viewerId === human?.playerId && isHunterAiming(state, human);
  }
  if (cue.day !== state.day || cue.viewerId !== human?.playerId || !human?.alive ||
      !state.phase.startsWith("NIGHT_") || state.phase === "NIGHT_START") return false;
  switch (cue.type) {
    case "wolf": return isWolfRole(human.role) && state.nightActions.wolfTarget === cue.targetSeat;
    case "seer": return human.role === "Seer" && state.nightActions.seerTarget === cue.targetSeat;
    case "guard": return human.role === "Guard" && state.nightActions.guardTarget === cue.targetSeat;
    case "witch-save": return human.role === "Witch" && state.nightActions.witchSave === true && state.nightActions.wolfTarget === cue.targetSeat;
    case "witch-poison": return human.role === "Witch" && state.nightActions.witchPoison === cue.targetSeat;
  }
}

/** Opening/recovering a table establishes a baseline; only later committed actions animate. */
export class GameSkillCueTracker {
  private readonly roles = new RoleSkillCueTracker();
  private previous: {
    gameId: string; devMutationId?: number; viewer: string; active: boolean;
    wolfTarget?: number; wolfDay: number;
  } | null = null;

  observe(state: GameState, human: Player | null, enabled: boolean) {
    const active = canPresent(state, enabled);
    const viewer = human ? `${human.playerId}:${human.role}` : "spectator";
    const previous = this.previous;
    const boundary = !previous || previous.gameId !== state.gameId ||
      previous.devMutationId !== state.devMutationId || previous.viewer !== viewer;
    if (boundary) this.roles.reset();
    const roleCues = this.roles.observe(state, human);
    this.previous = {
      gameId: state.gameId, devMutationId: state.devMutationId, viewer, active,
      wolfTarget: state.nightActions.wolfTarget, wolfDay: state.day,
    };
    if (boundary || !active || !previous?.active) return { reset: true, cues: [] as GameSkillCue[] };
    const target = getNewWolfStrikeTarget(state, human, previous);
    const actions: Array<{ type: GameSkillType; targetSeat: number; day?: number }> = [
      ...(target === null ? [] : [{ type: "wolf" as const, targetSeat: target }]), ...roleCues,
    ];
    const cues = actions.map((action) => ({ ...action, gameId: state.gameId, day: action.day ?? state.day, viewerId: human?.playerId ?? null,
      ...(state.devMutationId === undefined ? {} : { devMutationId: state.devMutationId }),
    }))
      .filter((cue) => isGameSkillCueVisible(cue, state, human, enabled));
    return { reset: false, cues };
  }

  suspend() {
    if (this.previous) this.previous.active = false;
  }
}

/** One audio clock owns the live game's visuals; simultaneous committed actions play in order. */
export class GameSkillPlayback {
  private active: GameSkillCue | null = null;
  private queue: GameSkillCue[] = [];
  private readonly controller: WolfStrikeController;

  constructor(publish: (event: GameSkillEvent | null) => void, sounds: ReadonlyMap<GameSkillType, WolfStrikeSound>, clock?: StrikeClock) {
    this.controller = new WolfStrikeController((event) => {
      publish(event && this.active ? { ...this.active, ...event } : null);
    }, {
      play: (isCurrent) => this.active ? sounds.get(this.active.type)!.play(isCurrent) : Promise.resolve(null),
      stop: () => sounds.forEach((sound) => sound.stop()),
    }, clock);
  }

  enqueue(cues: GameSkillCue[]) {
    this.queue.push(...cues.filter((cue) => Number.isInteger(cue.targetSeat) && cue.targetSeat >= 0));
    // Firing takes ownership immediately from a still-loading ready cue.
    if (cues.some((cue) => cue.type === "hunter-shot")) {
      this.queue = this.queue.filter((cue) => cue.type !== "hunter-ready");
      if (this.active?.type === "hunter-ready") this.stopActive();
    }
    this.startNext();
  }

  retain(isVisible: (cue: GameSkillCue) => boolean) {
    this.queue = this.queue.filter(isVisible);
    if (this.active && !isVisible(this.active)) this.stopActive();
    this.startNext();
  }

  cancel(publish = true) {
    this.queue = [];
    this.active = null;
    this.controller.cancel(publish);
  }

  private stopActive() {
    this.active = null;
    this.controller.cancel();
  }

  private startNext() {
    if (this.active) return;
    const cue = this.queue.shift();
    if (!cue) return;
    this.active = cue;
    const duration = cue.type === "wolf" ? WOLF_STRIKE_TIMING.durationMs : ROLE_SKILL_AUDIO[cue.type].durationMs;
    void this.controller.play(cue.targetSeat, duration, () => {
      this.active = null;
      this.startNext();
    });
  }
}
