import { isWolfRole, type GameState, type Player } from "@/types/game";
import { areNightResultsVisible } from "./night-visibility";
import type { WolfStrikeEvent } from "./wolf-strike";

export const ROLE_SKILL_AUDIO = {
  seer: { file: "seer-skill.wav", durationMs: 2500 },
  "witch-save": { file: "witch-antidote-b-compact.wav", durationMs: 1600 },
  "witch-poison": { file: "witch-poison-a.wav", durationMs: 1480 },
  "hunter-ready": { file: "hunter-ready.wav", durationMs: 513 },
  "hunter-shot": { file: "hunter-shot.wav", durationMs: 1918 },
  idiot: { file: "idiot-skill.wav", durationMs: 2000 },
  guard: { file: "guard-block.wav", durationMs: 1819 },
  "white-wolf-king": { file: "white-wolf-king-howl.wav", durationMs: 2719 },
} as const;

export type RoleSkillType = keyof typeof ROLE_SKILL_AUDIO;
export interface RoleSkillEvent extends WolfStrikeEvent { type: RoleSkillType }
export interface RoleSkillCue { type: RoleSkillType; targetSeat: number; day?: number }

export function roleSkillForSeat(event: RoleSkillEvent | null, seat: number) {
  return event?.targetSeat === seat ? event : null;
}

/** Reads existing actions; does not make decisions, publish identities, or resolve deaths. */
export class RoleSkillCueTracker {
  private gameId: string | null = null;
  private readonly seen = new Set<string>();
  private idiotRevealed = false;
  private whiteWolfBoomUsed = false;

  reset() { this.gameId = null; this.seen.clear(); this.idiotRevealed = false; this.whiteWolfBoomUsed = false; }

  observe(state: GameState, human: Player | null): RoleSkillCue[] {
    if (this.gameId !== state.gameId) {
      this.reset();
      this.gameId = state.gameId;
      // A recovered public identity gets its hat, without celebrating again.
      this.idiotRevealed = state.roleAbilities.idiotRevealed;
      this.whiteWolfBoomUsed = state.roleAbilities.whiteWolfKingBoomUsed;
    }
    const cues: RoleSkillCue[] = [];
    const add = (type: RoleSkillType, seat: number | undefined, suffix = "", day = state.day) => {
      if (seat === undefined || !state.players.some((p) => p.seat === seat)) return;
      const key = `${day}:${type}:${seat}:${suffix}`;
      if (this.seen.has(key)) return;
      this.seen.add(key);
      cues.push({ type, targetSeat: seat, ...(day === state.day ? {} : { day }) });
    };
    const night = state.phase.startsWith("NIGHT_") && state.phase !== "NIGHT_START";
    if (human?.alive && night) {
      if (human.role === "Seer") add("seer", state.nightActions.seerTarget);
      if (human.role === "Guard") add("guard", state.nightActions.guardTarget);
      if (human.role === "Witch") {
        if (state.nightActions.witchSave) add("witch-save", state.nightActions.wolfTarget);
        add("witch-poison", state.nightActions.witchPoison);
      }
    }
    if (isHunterAiming(state, human)) add("hunter-ready", human!.seat);
    for (const [history, isNight] of [[state.dayHistory, false], [state.nightHistory, true]] as const) {
      for (const [day, record] of Object.entries(history ?? {})) {
        const shot = record.hunterShot;
        if (Number(day) <= state.day && shot &&
            state.players.some((player) => player.seat === shot.hunterSeat && player.role === "Hunter") &&
            (!isNight || human?.role === "Hunter" || areNightResultsVisible(state, Number(day)))) {
          add("hunter-shot", shot.targetSeat, String(shot.hunterSeat), Number(day));
        }
      }
    }
    // A vote result may advance to the next night within one React commit.
    const publicDays = Object.entries(state.dayHistory ?? {}).filter(([day]) => Number(day) <= state.day)
      .sort(([a], [b]) => Number(b) - Number(a));
    const revealRecord = publicDays.find(([, record]) => record.idiotRevealed);
    const reveal = revealRecord?.[1].idiotRevealed;
    if (!this.idiotRevealed && state.roleAbilities.idiotRevealed && reveal &&
        state.players.some((player) => player.seat === reveal.seat && player.role === "Idiot")) add("idiot", reveal.seat, "", Number(revealRecord![0]));
    this.idiotRevealed = state.roleAbilities.idiotRevealed;
    // Entering the choice phase is not a boom. The existing rule's actual execution flips this flag.
    if (!this.whiteWolfBoomUsed && state.roleAbilities.whiteWolfKingBoomUsed) {
      const boomRecord = publicDays.find(([, record]) => record.whiteWolfKingBoom);
      const boom = boomRecord?.[1].whiteWolfKingBoom;
      const actor = state.players.find(player => player.role === "WhiteWolfKing" && !player.alive && (!boom || player.seat === boom.boomSeat));
      if (actor) add("white-wolf-king", boom && getVisibleWhiteWolfHitSeats(state).has(boom.targetSeat) ? boom.targetSeat : actor.seat, String(actor.seat), boomRecord ? Number(boomRecord[0]) : state.day);
    }
    this.whiteWolfBoomUsed = state.roleAbilities.whiteWolfKingBoomUsed;
    return cues;
  }
}

/** A public, completed boom record is a cause-of-death mark, never a selected target prediction. */
export function getVisibleWhiteWolfHitSeats(state: GameState): Set<number> {
  const seats = new Set<number>();
  for (const [day, record] of Object.entries(state.dayHistory ?? {})) {
    const boom = record.whiteWolfKingBoom;
    if (Number(day) <= state.day && boom && boom.targetSeat !== boom.boomSeat &&
        state.players.some(player => player.seat === boom.boomSeat && player.role === "WhiteWolfKing" && !player.alive) &&
        state.players.some(player => player.seat === boom.targetSeat && !player.alive)) seats.add(boom.targetSeat);
  }
  return seats;
}

export function isHunterAiming(state: Pick<GameState, "phase" | "roleAbilities">, human: Player | null) {
  return state.phase === "HUNTER_SHOOT" && human?.role === "Hunter" && state.roleAbilities.hunterCanShoot;
}

/** Presentation follows the unresolved choice, not just the role's nominal phase. */
export function getSkillTargetCursor(state: Pick<GameState, "phase" | "nightActions">, human: Player | null, enabled = true): "seer" | "guard" | null {
  if (!enabled || !human?.alive) return null;
  if (state.phase === "NIGHT_SEER_ACTION" && human.role === "Seer" && state.nightActions.seerTarget === undefined) return "seer";
  if (state.phase === "NIGHT_GUARD_ACTION" && human.role === "Guard" && state.nightActions.guardTarget === undefined) return "guard";
  return null;
}

/** Private shield lasts for this protection cycle, and never becomes a public identity hint. */
export function getVisibleGuardTarget(state: GameState, human: Player | null): number | null {
  if (!human?.alive || human.role !== "Guard" || !state.phase.startsWith("NIGHT_") || state.phase === "NIGHT_START") return null;
  const target = state.nightActions.guardTarget;
  return target !== undefined && state.players.some(player => player.seat === target && player.alive) ? target : null;
}

export function isKnownNightWolf(player: Player, human: Player | null | undefined, night: boolean) {
  return night && player.alive && isWolfRole(human?.role) && isWolfRole(player.role);
}

/** Durable presentation comes only from this game's confirmed, visible shot records. */
export function getVisibleHunterHitSeats(state: GameState, human: Player | null): Set<number> {
  const seats = new Set<number>();
  const add = (shot: { hunterSeat: number; targetSeat: number } | undefined) => {
    if (shot && state.players.some((player) => player.seat === shot.hunterSeat && player.role === "Hunter") &&
        state.players.some((player) => player.seat === shot.targetSeat)) seats.add(shot.targetSeat);
  };
  for (const [day, record] of Object.entries(state.dayHistory ?? {})) {
    if (Number(day) <= state.day) add(record.hunterShot);
  }
  for (const [day, record] of Object.entries(state.nightHistory ?? {})) {
    if (Number(day) <= state.day && (human?.role === "Hunter" || areNightResultsVisible(state, Number(day)))) add(record.hunterShot);
  }
  return seats;
}
