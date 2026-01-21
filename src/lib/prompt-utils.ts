import type { DifficultyLevel, GameState, Player } from "@/types/game";
import type { SystemPromptPart } from "@/game/core/types";
import type { OpenRouterMessage } from "./openrouter";
import { getI18n } from "@/i18n/translator";

/**
 * Prompt helper utilities used by Phase prompts.
 */

export const getRoleText = (role: string) => {
  const { t } = getI18n();
  switch (role) {
    case "Werewolf":
      return t("promptUtils.roleText.werewolf");
    case "Seer":
      return t("promptUtils.roleText.seer");
    case "Witch":
      return t("promptUtils.roleText.witch");
    case "Hunter":
      return t("promptUtils.roleText.hunter");
    case "Guard":
      return t("promptUtils.roleText.guard");
    default:
      return t("promptUtils.roleText.villager");
  }
};

export const getWinCondition = (role: string) => {
  const { t } = getI18n();
  switch (role) {
    case "Werewolf":
      return t("promptUtils.winCondition.werewolf");
    case "Seer":
      return t("promptUtils.winCondition.seer");
    case "Witch":
      return t("promptUtils.winCondition.witch");
    case "Hunter":
      return t("promptUtils.winCondition.hunter");
    case "Guard":
      return t("promptUtils.winCondition.guard");
    default:
      return t("promptUtils.winCondition.villager");
  }
};

export const buildDifficultySpeechHint = (difficulty: DifficultyLevel): string => {
  const { t } = getI18n();
  switch (difficulty) {
    case "easy":
      return t("promptUtils.difficultySpeech.easy");
    case "hard":
      return t("promptUtils.difficultySpeech.hard");
    default:
      return t("promptUtils.difficultySpeech.normal");
  }
};

export const buildDifficultyDecisionHint = (difficulty: DifficultyLevel, role: string): string => {
  const { t } = getI18n();
  const roleNote =
    role === "Werewolf"
      ? t("promptUtils.difficultyDecision.roleNoteWerewolf")
      : t("promptUtils.difficultyDecision.roleNoteGood");

  switch (difficulty) {
    case "easy":
      return t("promptUtils.difficultyDecision.easy", { roleNote });
    case "hard":
      return t("promptUtils.difficultyDecision.hard", { roleNote });
    default:
      return t("promptUtils.difficultyDecision.normal", { roleNote });
  }
};

export const buildPersonaSection = (player: Player, isGenshinMode: boolean = false): string => {
  if (isGenshinMode || !player.agentProfile) return "";
  const { persona } = player.agentProfile;
  const { t } = getI18n();

  const riskLabel =
    persona.riskBias === "aggressive"
      ? t("promptUtils.persona.riskAggressive")
      : persona.riskBias === "safe"
        ? t("promptUtils.persona.riskSafe")
        : t("promptUtils.persona.riskBalanced");

  return t("promptUtils.persona.section", {
    styleLabel: persona.styleLabel,
    voiceRules: persona.voiceRules.join("、"),
    riskLabel,
  });
};

export const buildAliveCountsSection = (state: GameState): string => {
  const alive = state.players.filter((p) => p.alive);
  const { t } = getI18n();

  return t("promptUtils.aliveCounts", { count: alive.length });
};

export const buildDailySummariesSection = (state: GameState): string => {
  const { t } = getI18n();
  const entries = Object.entries(state.dailySummaries || {})
    .map(([day, bullets]) => ({ day: Number(day), bullets }))
    .filter((x) => Number.isFinite(x.day) && Array.isArray(x.bullets))
    .sort((a, b) => a.day - b.day);

  if (entries.length === 0) return "";

  const lines: string[] = [];
  for (const e of entries) {
    const cleaned = e.bullets
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    if (cleaned.length === 0) continue;
    lines.push(t("promptUtils.dailySummaryItem", { day: e.day, summary: cleaned.join("；") }));
  }

  if (lines.length === 0) return "";
  return t("promptUtils.dailySummarySection", { lines: lines.join("\n") });
};

export const buildTodayTranscript = (state: GameState, maxChars: number): string => {
  const { t } = getI18n();
  const aliveIds = new Set(state.players.filter((p) => p.alive).map((p) => p.playerId));
  const dayStartIndex = (() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.isSystem && m.content === t("system.dayBreakShort")) return i;
    }
    return 0;
  })();

  const voteStartIndex = (() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.isSystem && m.content === t("system.voteStartShort")) return i;
    }
    return state.messages.length;
  })();

  const slice = state.messages.slice(
    dayStartIndex,
    voteStartIndex > dayStartIndex ? voteStartIndex : state.messages.length
  );

  const transcript = slice
    .filter((m) => !m.isSystem && aliveIds.has(m.playerId))
    .map((m) => `${m.playerName}: ${m.content}`)
    .join("\n");

  if (!transcript) return "";
  return transcript.slice(0, maxChars);
};

export const buildPlayerTodaySpeech = (state: GameState, player: Player, maxChars: number): string => {
  const { t } = getI18n();
  const dayStartIndex = (() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.isSystem && m.content === t("system.dayBreakShort")) return i;
    }
    return 0;
  })();

  const voteStartIndex = (() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.isSystem && m.content === t("system.voteStartShort")) return i;
    }
    return state.messages.length;
  })();

  const slice = state.messages.slice(
    dayStartIndex,
    voteStartIndex > dayStartIndex ? voteStartIndex : state.messages.length
  );

  const speech = slice
    .filter((m) => !m.isSystem && m.playerId === player.playerId)
    .map((m) => m.content)
    .join("\n");

  if (!speech) return "";
  return speech.slice(0, maxChars);
};

export const buildSystemAnnouncementsSinceDawn = (state: GameState, maxLines: number): string => {
  const { t } = getI18n();
  const dayStartIndex = (() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.isSystem && m.content === t("system.dayBreakShort")) return i;
    }
    return 0;
  })();

  const slice = state.messages.slice(dayStartIndex);
  const systemLines = slice
    .filter((m) => m.isSystem)
    .map((m) => String(m.content || "").trim())
    .filter((c) => c && c !== t("system.dayBreakShort") && c !== t("system.voteStartShort"))
    .slice(0, Math.max(0, maxLines));

  if (systemLines.length === 0) return "";
  return systemLines.join("\n");
};

export const buildGameContext = (
  state: GameState,
  player: Player
): string => {
  const { t } = getI18n();
  const alivePlayers = state.players.filter((p) => p.alive);
  const deadPlayers = state.players.filter((p) => !p.alive);
  const playerList = alivePlayers
    .map((p) =>
      t("promptUtils.gameContext.playerLine", {
        seat: p.seat + 1,
        name: p.displayName,
        youSuffix: p.playerId === player.playerId ? t("promptUtils.gameContext.youSuffix") : "",
      })
    )
    .join("\n");

  const totalSeats = state.players.length;

  let context = t("promptUtils.gameContext.header", {
    day: state.day,
    phase: state.phase.includes("NIGHT") ? t("promptUtils.gameContext.night") : t("promptUtils.gameContext.day"),
    totalSeats,
    playerList,
    youSuffix: t("promptUtils.gameContext.youSuffix"),
  });

    context += `\n\n${buildAliveCountsSection(state)}`;

  const summarySection = buildDailySummariesSection(state);
  if (summarySection) {
    context += `\n\n${summarySection}`;
  }

  const systemAnnouncements = buildSystemAnnouncementsSinceDawn(state, 8);
  if (systemAnnouncements) {
    context += `\n\n${t("promptUtils.gameContext.systemAnnouncements", { lines: systemAnnouncements })}`;
  }

  if (deadPlayers.length > 0) {
    context += `\n\n${t("promptUtils.gameContext.deadPlayers", {
      lines: deadPlayers
        .map((p) => t("promptUtils.gameContext.seatName", { seat: p.seat + 1, name: p.displayName }))
        .join("\n"),
    })}`;

    const currentDayDeaths = [];

    const nightHistory = state.nightHistory?.[state.day];
    if (nightHistory?.wolfTarget !== undefined) {
      const player = state.players.find(p => p.seat === nightHistory.wolfTarget);
      if (player && !player.alive) {
        currentDayDeaths.push(t("promptUtils.gameContext.death.wolf", { seat: player.seat + 1, name: player.displayName }));
      }
    }

    if (nightHistory?.witchPoison !== undefined) {
      const player = state.players.find(p => p.seat === nightHistory.witchPoison);
      if (player && !player.alive) {
        currentDayDeaths.push(t("promptUtils.gameContext.death.poison", { seat: player.seat + 1, name: player.displayName }));
      }
    }

    if (nightHistory?.deaths && Array.isArray(nightHistory.deaths)) {
      nightHistory.deaths.forEach(death => {
        if (death && typeof death.seat === 'number') {
          const player = state.players.find(p => p.seat === death.seat);
          if (player && !player.alive) {
          currentDayDeaths.push(t("promptUtils.gameContext.death.generic", {
            seat: player.seat + 1,
            name: player.displayName,
            reason: death.reason === "wolf"
              ? t("promptUtils.gameContext.deathReason.wolf")
              : death.reason === "poison"
                ? t("promptUtils.gameContext.deathReason.poison")
                : t("promptUtils.gameContext.deathReason.other"),
          }));
          }
        }
      });
    }

    const dayHistory = state.dayHistory?.[state.day];
    if (dayHistory?.executed && typeof dayHistory.executed.seat === 'number') {
      const executedSeat = dayHistory.executed.seat;
      const player = state.players.find(p => p.seat === executedSeat);
      if (player) {
        currentDayDeaths.push(t("promptUtils.gameContext.death.vote", { seat: player.seat + 1, name: player.displayName }));
      }
    }

    if (currentDayDeaths.length > 0) {
      context += `\n\n${t("promptUtils.gameContext.todayDeaths", { lines: currentDayDeaths.join("\n") })}`;
    }
  }

  if (state.voteHistory && Object.keys(state.voteHistory).length > 0) {
    context += `\n\n${t("promptUtils.gameContext.voteHistoryHeader")}`;
    Object.entries(state.voteHistory).forEach(([day, votes]) => {
      context += `\n${t("promptUtils.gameContext.voteDayHeader", { day })}`;
      const voteGroups: Record<number, number[]> = {};
      Object.entries(votes).forEach(([voterId, targetSeat]) => {
        const voter = state.players.find(p => p.playerId === voterId);
        if (voter) {
          if (!voteGroups[targetSeat]) voteGroups[targetSeat] = [];
          voteGroups[targetSeat].push(voter.seat);
        }
      });
      Object.entries(voteGroups)
        .sort(([, votersA], [, votersB]) => votersB.length - votersA.length)
        .forEach(([target, voters]) => {
          const targetPlayer = state.players.find(p => p.seat === Number(target));
          const voterNumbers = voters.map((s) => t("promptUtils.gameContext.seatLabel", { seat: s + 1 })).join(t("promptUtils.gameContext.listSeparator"));
          context += `\n  ${t("promptUtils.gameContext.voteGroup", {
            seat: Number(target) + 1,
            name: targetPlayer?.displayName ?? "",
            count: voters.length,
            voters: voterNumbers,
          })}`;
        });
    });
  }

  if (player.role === "Seer") {
    const history = state.nightActions.seerHistory || [];
    if (history.length > 0) {
      context += `\n\n${t("promptUtils.gameContext.seerHistoryHeader")}`;
      for (const record of history) {
        const target = state.players.find((p) => p.seat === record.targetSeat);
        context += `\n${t("promptUtils.gameContext.seerHistoryItem", {
          day: record.day,
          seat: record.targetSeat + 1,
          name: target?.displayName ?? "",
          result: record.isWolf ? t("alignments.wolf") : t("alignments.good"),
        })}`;
      }
    }
  }

  if (player.role === "Witch") {
    context += `\n\n${t("promptUtils.gameContext.witchStatusHeader")}`;
    context += `\n${t("promptUtils.gameContext.witchHeal", { status: state.roleAbilities.witchHealUsed ? t("promptUtils.gameContext.used") : t("promptUtils.gameContext.available") })}`;
    context += `\n${t("promptUtils.gameContext.witchPoison", { status: state.roleAbilities.witchPoisonUsed ? t("promptUtils.gameContext.used") : t("promptUtils.gameContext.available") })}`;

    const witchActions: string[] = [];
    if (state.nightHistory) {
      Object.entries(state.nightHistory).forEach(([day, history]) => {
        if (history.witchSave && history.wolfTarget !== undefined) {
          const savedPlayer = state.players.find(p => p.seat === history.wolfTarget);
          if (savedPlayer) {
            witchActions.push(t("promptUtils.gameContext.witchHealAction", {
              day,
              seat: history.wolfTarget + 1,
              name: savedPlayer.displayName,
            }));
          }
        }
        if (history.witchPoison !== undefined) {
          const poisonedPlayer = state.players.find(p => p.seat === history.witchPoison);
          if (poisonedPlayer) {
            witchActions.push(t("promptUtils.gameContext.witchPoisonAction", {
              day,
              seat: history.witchPoison + 1,
              name: poisonedPlayer.displayName,
            }));
          }
        }
      });
    }
    if (witchActions.length > 0) {
      context += `\n\n${t("promptUtils.gameContext.witchHistory", { lines: witchActions.join("\n") })}`;
    }
  }

  if (player.role === "Guard" && state.nightActions.lastGuardTarget !== undefined) {
    const lastTarget = state.players.find((p) => p.seat === state.nightActions.lastGuardTarget);
    context += `\n\n${t("promptUtils.gameContext.guardLast", {
      seat: state.nightActions.lastGuardTarget + 1,
      name: lastTarget?.displayName ?? "",
    })}`;
  }

  if (player.role === "Werewolf") {
    const teammates = state.players.filter(
      (p) => p.role === "Werewolf" && p.playerId !== player.playerId
    );
    if (teammates.length > 0) {
      context += `\n\n${t("promptUtils.gameContext.wolfTeammates", {
        list: teammates
          .map((teammate) =>
            t("promptUtils.gameContext.seatName", { seat: teammate.seat + 1, name: teammate.displayName })
          )
          .join(", "),
      })}`;
    }
  }

  const voteEntries = Object.entries(state.votes);
  if (voteEntries.length > 0) {
    const voteLines = voteEntries
      .map(([voterId, targetSeat]) => {
        const voter = state.players.find((p) => p.playerId === voterId);
        return t("promptUtils.gameContext.voteLine", {
          voter: voter
            ? t("promptUtils.gameContext.seatNameCompact", { seat: voter.seat + 1, name: voter.displayName })
            : t("common.unknown"),
          target: t("promptUtils.gameContext.seatLabel", { seat: targetSeat + 1 }),
        });
      })
      .join("\n");
    context += `\n\n${t("promptUtils.gameContext.currentVotes", { lines: voteLines })}`;
  }

  return context;
};

/**
 * Build a system message with cache control for static content.
 * Splits the system prompt into cacheable (static rules) and non-cacheable (dynamic state) parts.
 * 
 * @param cacheableContent - Static content that can be cached (role rules, win conditions, etc.)
 * @param dynamicContent - Dynamic content that changes per request (game state, player-specific info)
 * @param useCache - Whether to enable caching (default: true)
 * @param ttl - Cache TTL: "5m" (default) or "1h"
 * @returns OpenRouterMessage with cache_control breakpoints
 */
export function buildSystemTextFromParts(parts: SystemPromptPart[]): string {
  return parts
    .map((part) => part.text)
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function buildCachedSystemMessageFromParts(
  parts: SystemPromptPart[] | undefined,
  fallbackSystem: string,
  useCache: boolean = true
): OpenRouterMessage {
  if (!parts || parts.length === 0 || !useCache) {
    return { role: "system", content: fallbackSystem };
  }

  let cacheCount = 0;
  const contentParts: Array<{
    type: "text";
    text: string;
    cache_control?: { type: "ephemeral"; ttl?: "1h" };
  }> = [];

  parts.forEach((part) => {
    const text = part.text.trim();
    if (!text) return;
    const cacheable = part.cacheable === true;
    const allowCache = cacheable && cacheCount < 4;
    const cache_control = allowCache
      ? {
          type: "ephemeral" as const,
          ...(part.ttl === "1h" ? { ttl: "1h" as const } : {}),
        }
      : undefined;

    if (allowCache) cacheCount += 1;

    contentParts.push({
      type: "text",
      text,
      ...(cache_control ? { cache_control } : {}),
    });
  });

  if (contentParts.length === 0) {
    return { role: "system", content: fallbackSystem };
  }

  return {
    role: "system",
    content: contentParts,
  };
}
