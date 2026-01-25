import type { DifficultyLevel, GameState, Player, DailySummaryVoteData } from "@/types/game";
import type { SystemPromptPart } from "@/game/core/types";
import type { LLMMessage } from "./llm";
import { getSystemMessages } from "./game-texts";
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

/**
 * Role-specific strategy tips (know-how) to help AI make better decisions
 * These tips are tailored to each role to prevent homogenization
 */
export const getRoleKnowHow = (role: string): string => {
  const { t } = getI18n();
  switch (role) {
    case "Werewolf":
      return t.raw("promptUtils.roleKnowHow.werewolf");
    case "Seer":
      return t.raw("promptUtils.roleKnowHow.seer");
    case "Witch":
      return t.raw("promptUtils.roleKnowHow.witch");
    case "Hunter":
      return t.raw("promptUtils.roleKnowHow.hunter");
    case "Guard":
      return t.raw("promptUtils.roleKnowHow.guard");
    default:
      return t.raw("promptUtils.roleKnowHow.villager");
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
  const { t } = getI18n();
  const { persona } = player.agentProfile;
  const separator = t("promptUtils.gameContext.listSeparator");

  return t("promptUtils.persona.section", {
    styleLabel: persona.styleLabel,
    voiceRules: persona.voiceRules.join(separator),
    riskLabel: t("promptUtils.persona.riskBalanced")
  });
};

export const buildAliveCountsSection = (state: GameState): string => {
  const { t } = getI18n();
  const alive = state.players.filter((p) => p.alive);

  return t("promptUtils.aliveCounts", { count: alive.length });
};

/** Format structured vote_data into readable text for <history>. Seat numbers in vote_data are 0-based. */
function formatVoteDataForHistory(v: DailySummaryVoteData): string {
  const { t } = getI18n();
  const separator = t("promptUtils.gameContext.listSeparator");
  const parts: string[] = [];
  const fmt = (votes: Record<string, number[]>) =>
    Object.entries(votes)
      .map(([target, arr]) => {
        const voters = (arr as number[]).map((s) => t("promptUtils.gameContext.seatLabel", { seat: s + 1 })).join(separator);
        const targetNum = Number.parseInt(target, 10);
        return t("promptUtils.gameContext.votersVotedFor", { voters, target: Number.isFinite(targetNum) ? targetNum + 1 : target });
      })
      .filter(Boolean)
      .join(t("promptUtils.gameContext.semicolon"));
  if (v.sheriff_election) {
    const { winner, votes } = v.sheriff_election;
    const base = t("promptUtils.gameContext.sheriffVote", { seat: winner + 1 });
    const detail = fmt(votes);
    parts.push(detail ? `${base}${t("promptUtils.gameContext.semicolon")}${detail}` : base);
  }
  if (v.execution_vote) {
    const { eliminated, votes } = v.execution_vote;
    const base = t("promptUtils.gameContext.executionVote", { seat: eliminated + 1 });
    const detail = fmt(votes);
    parts.push(detail ? `${base}${t("promptUtils.gameContext.semicolon")}${detail}` : base);
  }
  return parts.join(" ");
}

export const buildDailySummariesSection = (state: GameState): string => {
  const { t } = getI18n();
  // Get summaries from dailySummaries (new format: single paragraph text)
  const entries = Object.entries(state.dailySummaries || {})
    .map(([day, bullets]) => ({ day: Number(day), bullets }))
    .filter((x) => Number.isFinite(x.day) && Array.isArray(x.bullets));

  if (entries.length === 0) return "";

  const lines: string[] = [];
  for (const { day, bullets } of entries.sort((a, b) => a.day - b.day)) {
    const summaryTexts = bullets
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);

    if (summaryTexts.length === 0) continue;

    // Narrative from LLM
    const fullSummary = summaryTexts.join(" ");
    // Append structured vote_data so "who voted for whom" is never lost
    const voteData = state.dailySummaryVoteData?.[day];
    const voteText = voteData ? formatVoteDataForHistory(voteData) : "";
    const dayLabel = t("promptUtils.gameContext.dayLabel", { day });
    const line = voteText ? `${dayLabel}${fullSummary} ${voteText}` : `${dayLabel}${fullSummary}`;
    lines.push(line);
  }

  if (lines.length === 0) return "";
  return `<history>\n${lines.join("\n\n")}\n</history>`;
};

export const getDayStartIndex = (state: GameState): number => {
  const systemMessages = getSystemMessages();
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    // Match both Chinese and English versions
    if (m.isSystem && (m.content === "天亮了" || m.content === "Dawn breaks, please open your eyes" || m.content === systemMessages.dayBreak)) return i;
  }
  return 0;
};

export const getVoteStartIndex = (state: GameState): number => {
  const systemMessages = getSystemMessages();
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    // Match both Chinese and English versions
    if (m.isSystem && (m.content === "进入投票环节" || m.content === "发言结束，开始投票。" || m.content === "Discussion ends, voting begins." || m.content === systemMessages.voteStart)) return i;
  }
  return state.messages.length;
};

/**
 * Check if today's transcript is long enough to warrant a mid-day summary
 * Returns the transcript length and whether summary is needed
 */
export const checkNeedsMidDaySummary = (state: GameState, threshold: number = 6000): {
  transcriptLength: number;
  needsSummary: boolean;
  hasSummary: boolean;
} => {
  const dayStartIndex = getDayStartIndex(state);
  const voteStartIndex = getVoteStartIndex(state);

  const slice = state.messages.slice(
    dayStartIndex,
    voteStartIndex > dayStartIndex ? voteStartIndex : state.messages.length
  );

  const transcript = slice
    .filter((m) => !m.isSystem)
    .map((m) => m.content)
    .join("\n");

  const hasSummary = !!(
    (state.dailySummaryFacts?.[state.day]?.length ?? 0) > 0 ||
    (state.dailySummaries?.[state.day]?.length ?? 0) > 0
  );

  return {
    transcriptLength: transcript.length,
    needsSummary: transcript.length > threshold && !hasSummary,
    hasSummary,
  };
};

export const buildTodayTranscript = (
  state: GameState,
  maxChars: number,
  options?: { includeDeadSpeech?: boolean }
): string => {
  const { t } = getI18n();
  const dayStartIndex = getDayStartIndex(state);
  const voteStartIndex = getVoteStartIndex(state);

  const slice = state.messages.slice(
    dayStartIndex,
    voteStartIndex > dayStartIndex ? voteStartIndex : state.messages.length
  );

  // Build a map of playerId -> alive status for quick lookup
  const playerAliveMap = new Map<string, boolean>();
  state.players.forEach((p) => {
    playerAliveMap.set(p.playerId, p.alive);
  });
  const includeDeadSpeech = options?.includeDeadSpeech === true;

  // Separate last words from regular speech for priority handling
  const regularMessages = slice.filter((m) => {
    if (m.isSystem || m.isLastWords) return false;
    const isAlive = playerAliveMap.get(m.playerId) ?? true;
    return includeDeadSpeech || isAlive;
  });
  const lastWordsMessages = slice.filter((m) => {
    if (m.isSystem || !m.isLastWords) return false;
    const isAlive = playerAliveMap.get(m.playerId) ?? true;
    return includeDeadSpeech || isAlive;
  });

  const formatMessage = (m: typeof slice[0]) => {
    const isAlive = playerAliveMap.get(m.playerId) ?? true;
    const statusLabel = isAlive ? "" : t("promptUtils.gameContext.eliminated");
    const lastWordsLabel = m.isLastWords ? t("promptUtils.gameContext.lastWordsLabel") : "";
    return `${lastWordsLabel}${m.playerName}${statusLabel}: ${m.content}`;
  };

  // Last words are always preserved (they're important)
  const lastWordsText = lastWordsMessages.map(formatMessage).join("\n");
  const regularText = regularMessages.map(formatMessage).join("\n");
  
  const transcript = [lastWordsText, regularText].filter(Boolean).join("\n");

  if (!transcript) return "";
  if (transcript.length <= maxChars) return transcript;

  const summaryFacts = state.dailySummaryFacts?.[state.day];
  const summaryBullets = state.dailySummaries?.[state.day];
  const summaryItems =
    summaryFacts && summaryFacts.length > 0
      ? summaryFacts.map((f) => f.fact).filter(Boolean)
      : summaryBullets || [];
  
  if (summaryItems.length > 0) {
    // Use more summary items (up to 8), preserve more info
    const summaryText = summaryItems
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 8)
      .join(t("promptUtils.gameContext.semicolon"));
    const header = `<early_summary>${summaryText}</early_summary>\n<recent_speech>\n`;
    const footer = `\n</recent_speech>`;
    
    // Reserve space for last words (always include)
    const lastWordsReserve = lastWordsText ? lastWordsText.length + 50 : 0;
    const availableForRecent = maxChars - header.length - footer.length - lastWordsReserve;
    
    // Get recent regular messages
    const recentRegular = availableForRecent > 0 ? regularText.slice(-availableForRecent) : "";
    
    // Combine: summary + last words + recent regular
    const lastWordsPart = lastWordsText ? `<last_words>\n${lastWordsText}\n</last_words>\n` : "";
    return `${header}${lastWordsPart}${recentRegular}${footer}`.trim();
  }

  // No summary: prioritize last words, then use sliding window for regular
  if (lastWordsText) {
    const lastWordsPart = `<last_words>\n${lastWordsText}\n</last_words>\n`;
    const availableForRecent = maxChars - lastWordsPart.length;
    const recentRegular = availableForRecent > 0 ? regularText.slice(-availableForRecent) : "";
    return `${lastWordsPart}<recent_speech>\n${recentRegular}\n</recent_speech>`.trim();
  }

  // No last words, just sliding window
  return `<today_speech>\n${transcript.slice(-maxChars)}\n</today_speech>`;
};

export const buildPlayerTodaySpeech = (state: GameState, player: Player, maxChars: number): string => {
  const dayStartIndex = getDayStartIndex(state);
  const voteStartIndex = getVoteStartIndex(state);

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
  const dayStartIndex = getDayStartIndex(state);

  const slice = state.messages.slice(dayStartIndex);
  const systemLines = slice
    .filter((m) => m.isSystem)
    .map((m) => String(m.content || "").trim())
    .filter((c) => {
      if (!c) return false;
      const systemMessages = getSystemMessages();
      // Filter out dawn and vote start messages in both locales
      const excluded = ["天亮了", "Dawn breaks, please open your eyes", systemMessages.dayBreak, "进入投票环节", "发言结束，开始投票。", "Discussion ends, voting begins.", systemMessages.voteStart];
      return !excluded.includes(c);
    });

  const limit = Math.max(0, maxLines);
  if (limit === 0 || systemLines.length === 0) return "";
  const recentLines = systemLines.length > limit ? systemLines.slice(-limit) : systemLines;
  return recentLines.join("\n");
};

export const buildGameContext = (
  state: GameState,
  player: Player
): string => {
  const { t } = getI18n();
  const alivePlayers = state.players.filter((p) => p.alive);
  const deadPlayers = state.players.filter((p) => !p.alive);
  const totalSeats = state.players.length;

  // Build YAML-formatted game state
  const aliveSeats = alivePlayers.map((p) => p.seat + 1);
  const deadInfo = deadPlayers.map((p) => {
    // Find death info
    let cause = t("promptUtils.gameContext.deathCauseUnknown");
    let deathDay = 0;
    for (const [day, history] of Object.entries(state.nightHistory || {})) {
      if (history.wolfTarget === p.seat) { cause = t("promptUtils.gameContext.deathCauseWolf"); deathDay = Number(day); }
      if (history.witchPoison === p.seat) { cause = t("promptUtils.gameContext.deathCausePoison"); deathDay = Number(day); }
    }
    for (const [day, history] of Object.entries(state.dayHistory || {})) {
      if (history.executed?.seat === p.seat) { cause = t("promptUtils.gameContext.deathCauseVote"); deathDay = Number(day); }
    }
    return `{seat: ${p.seat + 1}, name: ${p.displayName}, day: ${deathDay}, cause: ${cause}}`;
  });

  const sheriffSeat = state.badge.holderSeat;
  const sheriffInfo = sheriffSeat !== null ? sheriffSeat + 1 : t("promptUtils.gameContext.noSheriff");

  let context = `<game_state>
day: ${state.day}
phase: ${state.phase.includes("NIGHT") ? t("promptUtils.gameContext.night") : t("promptUtils.gameContext.day")}
you: {seat: ${player.seat + 1}, name: ${player.displayName}}
total_seats: ${totalSeats}
alive: [${aliveSeats.join(", ")}]
dead: [${deadInfo.join(", ")}]
sheriff: ${sheriffInfo}
alive_count: ${alivePlayers.length}
</game_state>`;

  // Add alive players list for reference
  const playerList = alivePlayers
    .map((p) => `  - ${t("promptUtils.gameContext.seatLabel", { seat: p.seat + 1 })} ${p.displayName}${p.playerId === player.playerId ? t("promptUtils.gameContext.youSuffix") : ""}`)
    .join("\n");
  context += `\n\n<alive_players>\n${playerList}\n</alive_players>`;

  const summarySection = buildDailySummariesSection(state);
  if (summarySection) {
    context += `\n\n${summarySection}`;
  }

  const systemAnnouncements = buildSystemAnnouncementsSinceDawn(state, 8);
  if (systemAnnouncements) {
    context += `\n\n<announcements>\n${systemAnnouncements}\n</announcements>`;
  }

  if (deadPlayers.length > 0) {
    // Build today's deaths info
    const currentDayDeaths: string[] = [];
    const nightHistory = state.nightHistory?.[state.day];
    if (nightHistory?.wolfTarget !== undefined) {
      const p = state.players.find(p => p.seat === nightHistory.wolfTarget);
      if (p && !p.alive) {
        currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: ${t("promptUtils.gameContext.deathCauseWolf")}}`);
      }
    }
    if (nightHistory?.witchPoison !== undefined) {
      const p = state.players.find(p => p.seat === nightHistory.witchPoison);
      if (p && !p.alive) {
        currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: ${t("promptUtils.gameContext.deathCausePoison")}}`);
      }
    }
    if (nightHistory?.deaths && Array.isArray(nightHistory.deaths)) {
      nightHistory.deaths.forEach(death => {
        if (death && typeof death.seat === 'number') {
          const p = state.players.find(p => p.seat === death.seat);
          if (p && !p.alive) {
            const cause = death.reason === 'wolf' ? t("promptUtils.gameContext.deathCauseWolf") : death.reason === 'poison' ? t("promptUtils.gameContext.deathCausePoison") : t("promptUtils.gameContext.deathCauseDeath");
            currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: ${cause}}`);
          }
        }
      });
    }
    const dayHistory = state.dayHistory?.[state.day];
    if (dayHistory?.executed && typeof dayHistory.executed.seat === 'number') {
      const executedSeat = dayHistory.executed.seat;
      const p = state.players.find(p => p.seat === executedSeat);
      if (p) {
        currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: ${t("promptUtils.gameContext.deathCauseVote")}}`);
      }
    }

    if (currentDayDeaths.length > 0) {
      context += `\n\n<today_deaths>\n${currentDayDeaths.join("\n")}\n</today_deaths>`;
    }

    // Dead players warning
    context += `\n\n<banned_discussion>${t("promptUtils.gameContext.bannedDiscussion")}: [${deadPlayers.map((p) => p.seat + 1).join(", ")}]</banned_discussion>`;
  }

  if (state.voteHistory && Object.keys(state.voteHistory).length > 0) {
    context += `\n\n<votes>`;
    const sheriffSeat = state.badge.holderSeat;
    const sheriffPlayer =
      sheriffSeat !== null ? state.players.find((p) => p.seat === sheriffSeat) : null;
    const sheriffPlayerId = sheriffPlayer?.playerId;
    const currentDay = state.day;
    
    Object.entries(state.voteHistory)
      .sort(([a], [b]) => Number(a) - Number(b))
      .forEach(([day, votes]) => {
        const dayNum = Number(day);
        const isRecent = currentDay - dayNum <= 1; // Recent 2 days show details
        
        const voteGroups: Record<number, number[]> = {};
        Object.entries(votes).forEach(([voterId, targetSeat]) => {
          const voter = state.players.find(p => p.playerId === voterId);
          if (voter) {
            if (!voteGroups[targetSeat]) voteGroups[targetSeat] = [];
            voteGroups[targetSeat].push(voter.seat);
          }
        });
        
        // Sort by vote count descending
        const sortedTargets = Object.entries(voteGroups)
          .map(([target, voters]) => {
            const weightedVotes = voters.reduce((sum, seat) => {
              const voter = state.players.find((p) => p.seat === seat);
              if (!voter) return sum;
              return sum + (voter.playerId === sheriffPlayerId ? 1.5 : 1);
            }, 0);
            return { target: Number(target), voters, weightedVotes };
          })
          .sort((a, b) => b.weightedVotes - a.weightedVotes);
        
        if (isRecent) {
          // Recent days: show full details in YAML format
          context += `\nday_${day}:`;
          sortedTargets.forEach(({ target, voters, weightedVotes }) => {
            const targetPlayer = state.players.find(p => p.seat === target);
            const voteLabel = Number.isInteger(weightedVotes) ? `${weightedVotes}` : weightedVotes.toFixed(1);
            const voterList = voters.map(s => s + 1).join(',');
            context += `\n  ${t("promptUtils.gameContext.seatLabel", { seat: target + 1 })}${targetPlayer?.displayName || ''}: {${t("promptUtils.gameContext.voteCount")}: ${voteLabel}, ${t("promptUtils.gameContext.voters")}: [${voterList}]}`;
          });
        } else {
          // Older days: compressed summary
          const dayHistory = state.dayHistory?.[dayNum];
          if (dayHistory?.executed) {
            const executedSeat = dayHistory.executed.seat;
            const executedPlayer = state.players.find(p => p.seat === executedSeat);
            const topVoter = sortedTargets[0]?.voters[0];
            const leaderSeat = topVoter !== undefined ? topVoter + 1 : null;
            context += `\nday_${day}: {${t("promptUtils.gameContext.eliminated").trim()}: ${t("promptUtils.gameContext.seatLabel", { seat: executedSeat + 1 })}${executedPlayer?.displayName || ''}, ${t("promptUtils.gameContext.voteCount")}: ${dayHistory.executed.votes}${leaderSeat ? `, ${t("promptUtils.gameContext.mainVoter")}: ${t("promptUtils.gameContext.seatLabel", { seat: leaderSeat })}` : ''}}`;
          } else if (dayHistory?.voteTie) {
            context += `\nday_${day}: {${t("promptUtils.gameContext.result")}: ${t("promptUtils.gameContext.tie")}}`;
          }
        }
      });
    context += `\n</votes>`;
  }

  // Role-specific private information
  if (player.role === "Seer") {
    const history = state.nightActions.seerHistory || [];
    if (history.length > 0) {
      const checks = history.map((record) => {
        const target = state.players.find((p) => p.seat === record.targetSeat);
        return `  - {day: ${record.day}, target: ${t("promptUtils.gameContext.seatLabel", { seat: record.targetSeat + 1 })}${target?.displayName || ''}, result: ${record.isWolf ? t("promptUtils.gameContext.seerResultWolf") : t("promptUtils.gameContext.seerResultGood")}}`;
      });
      context += `\n\n<your_checks>\n${checks.join("\n")}\n</your_checks>`;
    }
  }

  if (player.role === "Witch") {
    const potionStatus = `heal: ${state.roleAbilities.witchHealUsed ? t("promptUtils.gameContext.used") : t("promptUtils.gameContext.available")}, poison: ${state.roleAbilities.witchPoisonUsed ? t("promptUtils.gameContext.used") : t("promptUtils.gameContext.available")}`;
    const witchActions: string[] = [];
    if (state.nightHistory) {
      Object.entries(state.nightHistory).forEach(([day, history]) => {
        if (history.witchSave && history.wolfTarget !== undefined) {
          const savedPlayer = state.players.find(p => p.seat === history.wolfTarget);
          if (savedPlayer) {
            witchActions.push(`  - {day: ${day}, action: heal, target: ${t("promptUtils.gameContext.seatLabel", { seat: history.wolfTarget + 1 })}${savedPlayer.displayName}}`);
          }
        }
        if (history.witchPoison !== undefined) {
          const poisonedPlayer = state.players.find(p => p.seat === history.witchPoison);
          if (poisonedPlayer) {
            witchActions.push(`  - {day: ${day}, action: poison, target: ${t("promptUtils.gameContext.seatLabel", { seat: history.witchPoison + 1 })}${poisonedPlayer.displayName}}`);
          }
        }
      });
    }
    context += `\n\n<your_potions>\nstatus: {${potionStatus}}`;
    if (witchActions.length > 0) {
      context += `\nhistory:\n${witchActions.join("\n")}`;
    }
    context += `\n</your_potions>`;
  }

  if (player.role === "Guard" && state.nightActions.lastGuardTarget !== undefined) {
    const lastTarget = state.players.find((p) => p.seat === state.nightActions.lastGuardTarget);
    context += `\n\n<your_guard>\nlast_protected: ${t("promptUtils.gameContext.seatLabel", { seat: state.nightActions.lastGuardTarget + 1 })}${lastTarget?.displayName || ''}\nnote: ${t("promptUtils.gameContext.guardLast", { seat: state.nightActions.lastGuardTarget + 1, name: lastTarget?.displayName || '' }).split("】")[1] || ''}\n</your_guard>`;
  }

  if (player.role === "Werewolf") {
    const teammates = state.players.filter(
      (p) => p.role === "Werewolf" && p.alive && p.playerId !== player.playerId
    );
    const allWolves = state.players.filter((p) => p.role === "Werewolf");
    const aliveWolves = allWolves.filter((p) => p.alive);
    context += `\n\n<wolf_team>\nalive_teammates: [${teammates.map((tm) => `${t("promptUtils.gameContext.seatLabel", { seat: tm.seat + 1 })}${tm.displayName}`).join(", ")}]\nwolf_count: {total: ${allWolves.length}, alive: ${aliveWolves.length}}\n</wolf_team>`;
  }

  const showCurrentVotes = state.phase === "DAY_VOTE" || state.phase === "DAY_RESOLVE";
  const voteEntries = showCurrentVotes ? Object.entries(state.votes) : [];
  if (voteEntries.length > 0) {
    const voteLines = voteEntries
      .map(([voterId, targetSeat]) => {
        const voter = state.players.find((p) => p.playerId === voterId);
        return `  - {voter: ${voter ? voter.seat + 1 : '?'}, target: ${targetSeat + 1}}`;
      })
      .join("\n");
    context += `\n\n<current_votes>\n${voteLines}\n</current_votes>`;
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
 * @returns LLMMessage with cache_control breakpoints
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
): LLMMessage {
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
