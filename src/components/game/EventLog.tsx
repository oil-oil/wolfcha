import { useCallback, useMemo, type ComponentType } from "react";
import {
  ClipboardText,
  Crosshair,
  MoonStars,
  Shield,
  Skull,
  Users,
  Warning,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import type { GameState } from "@/types/game";
import { cn } from "@/lib/utils";

type PublicEventTone = "default" | "danger" | "warning" | "success";
type PublicEventIcon = "night" | "death" | "shot" | "vote" | "badge" | "end";

interface PublicEventEntry {
  id: string;
  day: number;
  order: number;
  text: string;
  tone: PublicEventTone;
  icon: PublicEventIcon;
}

interface EventLogProps {
  gameState: GameState;
}

const toneClassNames: Record<PublicEventTone, string> = {
  default: "border-[var(--glass-border)] bg-[var(--glass-bg-weak)] text-[var(--text-primary)]",
  danger: "border-[var(--glass-border)] bg-[var(--glass-bg-weak)] text-[var(--text-primary)]",
  warning: "border-[var(--glass-border)] bg-[var(--glass-bg-weak)] text-[var(--text-primary)]",
  success: "border-[var(--glass-border)] bg-[var(--glass-bg-weak)] text-[var(--text-primary)]",
};

const iconClassNames: Record<PublicEventTone, string> = {
  default: "text-[var(--color-gold)]",
  danger: "text-[var(--color-gold)]",
  warning: "text-[var(--color-gold)]",
  success: "text-[var(--color-gold)]",
};

const eventIcons: Record<PublicEventIcon, ComponentType<{ size?: number; className?: string }>> = {
  night: MoonStars,
  death: Skull,
  shot: Crosshair,
  vote: Warning,
  badge: Shield,
  end: Users,
};

function getKnownDays(state: GameState): number[] {
  const days = new Set<number>();
  Object.keys(state.nightHistory || {}).forEach((day) => days.add(Number(day)));
  Object.keys(state.dayHistory || {}).forEach((day) => days.add(Number(day)));
  return Array.from(days)
    .filter((day) => Number.isFinite(day) && day > 0)
    .sort((a, b) => a - b);
}

export function EventLog({ gameState }: EventLogProps) {
  const t = useTranslations();

  const formatSeat = useCallback((seat: number) => {
    const player = gameState.players.find((p) => p.seat === seat);
    if (!player) return t("eventLog.seat", { seat: seat + 1 });
    return t("eventLog.seatWithName", { seat: seat + 1, name: player.displayName });
  }, [gameState.players, t]);

  const events = useMemo<PublicEventEntry[]>(() => {
    const entries: PublicEventEntry[] = [];

    getKnownDays(gameState).forEach((day) => {
      const nightRecord = gameState.nightHistory?.[day];
      if (nightRecord && Array.isArray(nightRecord.deaths)) {
        const deathSeats = Array.from(
          new Set(
            nightRecord.deaths
              .map((death) => death.seat)
              .filter((seat) => Number.isInteger(seat))
          )
        );

        if (deathSeats.length > 0) {
          entries.push({
            id: `night-deaths-${day}`,
            day,
            order: 10,
            text: t("eventLog.nightDeaths", {
              players: deathSeats.map(formatSeat).join(t("eventLog.separator")),
            }),
            tone: "danger",
            icon: "death",
          });
        } else {
          entries.push({
            id: `peaceful-night-${day}`,
            day,
            order: 10,
            text: t("eventLog.peacefulNight"),
            tone: "success",
            icon: "night",
          });
        }
      }

      if (nightRecord?.hunterShot) {
        entries.push({
          id: `night-hunter-shot-${day}`,
          day,
          order: 20,
          text: t("eventLog.hunterShot", {
            hunter: formatSeat(nightRecord.hunterShot.hunterSeat),
            target: formatSeat(nightRecord.hunterShot.targetSeat),
          }),
          tone: "warning",
          icon: "shot",
        });
      }

      const dayRecord = gameState.dayHistory?.[day];
      if (!dayRecord) return;

      if (dayRecord.whiteWolfKingBoom) {
        entries.push({
          id: `white-wolf-king-boom-${day}`,
          day,
          order: 30,
          text: t("eventLog.whiteWolfKingBoom", {
            boom: formatSeat(dayRecord.whiteWolfKingBoom.boomSeat),
            target: formatSeat(dayRecord.whiteWolfKingBoom.targetSeat),
          }),
          tone: "danger",
          icon: "shot",
        });
      }

      const idiotSeat = dayRecord.idiotRevealed?.seat;
      if (dayRecord.executed && dayRecord.executed.seat !== idiotSeat) {
        entries.push({
          id: `executed-${day}`,
          day,
          order: 40,
          text: t("eventLog.executed", {
            player: formatSeat(dayRecord.executed.seat),
            votes: dayRecord.executed.votes,
          }),
          tone: "danger",
          icon: "vote",
        });
      } else if (dayRecord.voteTie) {
        entries.push({
          id: `vote-tie-${day}`,
          day,
          order: 40,
          text: t("eventLog.voteTie"),
          tone: "warning",
          icon: "vote",
        });
      }

      if (dayRecord.idiotRevealed) {
        entries.push({
          id: `idiot-revealed-${day}`,
          day,
          order: 50,
          text: t("eventLog.idiotRevealed", {
            player: formatSeat(dayRecord.idiotRevealed.seat),
          }),
          tone: "warning",
          icon: "badge",
        });
      }

      if (dayRecord.hunterShot) {
        entries.push({
          id: `day-hunter-shot-${day}`,
          day,
          order: 60,
          text: t("eventLog.hunterShot", {
            hunter: formatSeat(dayRecord.hunterShot.hunterSeat),
            target: formatSeat(dayRecord.hunterShot.targetSeat),
          }),
          tone: "warning",
          icon: "shot",
        });
      }
    });

    if (gameState.winner) {
      const day = Math.max(gameState.day, 1);
      entries.push({
        id: "game-end",
        day,
        order: 100,
        text: gameState.winner === "village" ? t("eventLog.gameEndVillage") : t("eventLog.gameEndWolf"),
        tone: gameState.winner === "village" ? "success" : "danger",
        icon: "end",
      });
    }

    return entries.sort((a, b) => a.day - b.day || a.order - b.order);
  }, [formatSeat, gameState, t]);

  const currentSheriff =
    gameState.badge.holderSeat !== null && gameState.badge.holderSeat !== undefined
      ? formatSeat(gameState.badge.holderSeat)
      : null;

  const groupedEvents = events.reduce<Array<{ day: number; events: PublicEventEntry[] }>>((groups, event) => {
    const group = groups[groups.length - 1];
    if (group?.day === event.day) {
      group.events.push(event);
      return groups;
    }
    groups.push({ day: event.day, events: [event] });
    return groups;
  }, []);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col">
      <div className="mb-3 flex items-center justify-between border-b border-[var(--border-color)] pb-2">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          <ClipboardText size={16} />
          <span>{t("eventLog.title")}</span>
        </div>
        <span className="text-xs text-[var(--text-muted)]">{t("eventLog.eventCount", { count: events.length })}</span>
      </div>

      <div className="flex-1">
        {currentSheriff && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-weak)] px-3 py-2 text-sm text-[var(--text-primary)]">
            <Shield size={15} className="shrink-0 text-[var(--color-gold)]" />
            <span>{t("eventLog.currentSheriff", { player: currentSheriff })}</span>
          </div>
        )}

        {groupedEvents.length > 0 ? (
          <div className="space-y-5">
            {groupedEvents.map((group) => (
              <section key={group.day} className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
                  <span className="h-px flex-1 bg-[var(--border-color)]" />
                  {t("eventLog.dayLabel", { day: group.day })}
                  <span className="h-px flex-1 bg-[var(--border-color)]" />
                </div>
                <div className="space-y-2">
                  {group.events.map((event) => {
                    const Icon = eventIcons[event.icon];
                    return (
                      <div
                        key={event.id}
                        className={cn(
                          "flex gap-2 rounded-lg border px-3 py-2 text-sm leading-relaxed shadow-sm backdrop-blur-sm",
                          toneClassNames[event.tone]
                        )}
                      >
                        <Icon size={15} className={cn("mt-0.5 shrink-0 opacity-80", iconClassNames[event.tone])} />
                        <span>{event.text}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            {t("eventLog.empty")}
          </div>
        )}
      </div>
    </div>
  );
}
