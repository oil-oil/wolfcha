import type { GameState, Persona, Player } from "@/types/game";
import { isWolfRole } from "@/types/game";
import type { SystemPromptPart } from "@/game/core/types";
import type { LLMMessage } from "./llm";
import { getSystemMessages, getSystemPatterns } from "./game-texts";
import { getI18n } from "@/i18n/translator";

/**
 * Prompt helper utilities used by Phase prompts.
 */

export const getRoleText = (role: string) => {
  const { t } = getI18n();
  switch (role) {
    case "Werewolf":
      return t("promptUtils.roleText.werewolf");
    case "WhiteWolfKing":
      return t("promptUtils.roleText.whiteWolfKing");
    case "Seer":
      return t("promptUtils.roleText.seer");
    case "Witch":
      return t("promptUtils.roleText.witch");
    case "Hunter":
      return t("promptUtils.roleText.hunter");
    case "Guard":
      return t("promptUtils.roleText.guard");
    case "Idiot":
      return t("promptUtils.roleText.idiot");
    default:
      return t("promptUtils.roleText.villager");
  }
};

export const getWinCondition = (role: string) => {
  const { t } = getI18n();
  switch (role) {
    case "Werewolf":
      return t("promptUtils.winCondition.werewolf");
    case "WhiteWolfKing":
      return t("promptUtils.winCondition.whiteWolfKing");
    case "Seer":
      return t("promptUtils.winCondition.seer");
    case "Witch":
      return t("promptUtils.winCondition.witch");
    case "Hunter":
      return t("promptUtils.winCondition.hunter");
    case "Guard":
      return t("promptUtils.winCondition.guard");
    case "Idiot":
      return t("promptUtils.winCondition.idiot");
    default:
      return t("promptUtils.winCondition.villager");
  }
};

/**
 * Build a light public-info angle based on current game state.
 */
export const buildFocusAngle = (state: GameState, player: Player): string => {
  return buildPerspectiveHint(state, player);
};

/**
 * Generate a unique "perspective hint" for a player based on public game information.
 * Each player gets a different analytical angle to think from, producing natural diversity
 * in AI speeches without prescriptive output formatting.
 */
function buildPerspectiveHint(state: GameState, player: Player): string {
  // Only generate perspective hints during day speech phases (not night actions)
  const isDaySpeech = state.phase.startsWith("DAY_");
  if (!isDaySpeech) return "";

  const hints: string[] = [];

  // --- 1. Mentioned by others: if other players named you, react to it ---
  const dayStartIndex = getDayStartIndex(state);
  const mentionedBy: number[] = [];
  const seatStr = `${player.seat + 1}号`;
  for (let i = dayStartIndex; i < state.messages.length; i++) {
    const m = state.messages[i];
    if (m.isSystem || m.playerId === player.playerId) continue;
    if (m.content.includes(seatStr)) {
      const speaker = state.players.find(p => p.playerId === m.playerId);
      if (speaker && speaker.alive) mentionedBy.push(speaker.seat);
    }
  }
  if (mentionedBy.length > 0) {
    const who = [...new Set(mentionedBy)].map(s => `${s + 1}号`).join("、");
    hints.push(`你被${who}点名提到了，可以考虑是否回应`);
  }

  // --- 2. Adjacent to a dead player: you have a spatial observation ---
  const deadToday = state.players.filter(p => !p.alive);
  const totalSeats = state.players.length;
  const isAdjacentToDead = deadToday.some(d => {
    const diff = Math.abs(d.seat - player.seat);
    return diff === 1 || diff === totalSeats - 1;
  });
  if (isAdjacentToDead && deadToday.length > 0) {
    hints.push("你和出局的玩家座位相邻，可以从这个角度聊一句");
  }

  // --- 3. Sheriff-related: different angles depending on badge status ---
  const sheriffSeat = state.badge.holderSeat;
  if (sheriffSeat !== null && sheriffSeat === player.seat) {
    hints.push("你是警长，你的发言会影响别人，可以自然给出你的方向");
  } else if (sheriffSeat !== null) {
    // Non-sheriff: randomly suggest either supporting or questioning the sheriff
    // Use seat number as a deterministic "random" seed for consistency
    if (player.seat % 2 === 0) {
      hints.push("可以回应一下警长的方向，说明你是否认同");
    } else {
      hints.push("如果你不认同警长，可以自然提出疑问");
    }
  }

  // --- 4. Voting pattern awareness (day 2+): who voted together yesterday? ---
  if (state.day >= 2 && state.voteHistory) {
    const yesterdayVotes = state.voteHistory[state.day - 1];
    if (yesterdayVotes) {
      // Find who voted the same target as the player yesterday
      const myVote = yesterdayVotes[player.playerId];
      if (myVote !== undefined) {
        const sameVoters = Object.entries(yesterdayVotes)
          .filter(([id, target]) => target === myVote && id !== player.playerId)
          .map(([id]) => state.players.find(p => p.playerId === id))
          .filter((p): p is Player => !!p && p.alive);
        if (sameVoters.length > 0) {
          const names = sameVoters.slice(0, 2).map(p => `${p.seat + 1}号`).join("、");
          hints.push(`昨天${names}和你投了同一个目标，可以想想这件事要不要提`);
        }
      }
    }
  }

  // --- 5. First speaker vs late speaker: different information burden ---
  // Count how many have already spoken today
  const todaySpeakers = new Set<string>();
  for (let i = dayStartIndex; i < state.messages.length; i++) {
    const m = state.messages[i];
    if (!m.isSystem && m.playerId && m.playerId !== player.playerId) {
      todaySpeakers.add(m.playerId);
    }
  }
  const aliveCount = state.players.filter(p => p.alive).length;
  const spokenRatio = todaySpeakers.size / Math.max(1, aliveCount - 1);

  if (spokenRatio === 0) {
    // First speaker
    hints.push("你是第一个发言，没有人可以参考，可以先抛出一个起手判断");
  } else if (spokenRatio >= 0.7) {
    // Late speaker
    hints.push("你已经听了大部分人的发言，可以挑你最在意的一点回应");
  }

  if (hints.length === 0) return "";

  // Pick at most 2 hints to keep it focused (use seat + day as deterministic selector)
  const selected = hints.length <= 2 ? hints : [
    hints[(player.seat + state.day) % hints.length],
    hints[(player.seat + state.day + 1) % hints.length],
  ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  return `<focus_angle>\n【你的视角】\n${selected.map(h => `- ${h}`).join("\n")}\n</focus_angle>`;
}

const buildHiddenCommunicationProfileSection = (persona: Persona, locale: string): string => {
  if (locale === "zh") {
    const lines: string[] = [];
    if (persona.werewolfExperience) lines.push(`狼人杀理解：${persona.werewolfExperience}`);
    if (persona.vocabularyStyle) lines.push(`词汇习惯：${persona.vocabularyStyle}`);
    if (persona.reasoningStyle) lines.push(`推理方式：${persona.reasoningStyle}`);
    if (persona.speechLengthHabit) lines.push(`发言长短：${persona.speechLengthHabit}`);
    if (persona.pressureStyle) lines.push(`压力反应：${persona.pressureStyle}`);
    if (persona.uncertaintyStyle) lines.push(`不确定性：${persona.uncertaintyStyle}`);
    if (persona.mistakePattern) lines.push(`常见误判：${persona.mistakePattern}`);
    if (persona.wolfDeceptionStyle) lines.push(`拿狼伪装：${persona.wolfDeceptionStyle}`);
    if (lines.length === 0) return "";
    return `\n<hidden_communication_profile>\n这些信息只用于塑造你的狼人杀水平、词汇和发言长度，不要向其他玩家明说。\n${lines.map((line) => `- ${line}`).join("\n")}\n</hidden_communication_profile>`;
  }

  const lines: string[] = [];
  if (persona.werewolfExperience) lines.push(`Werewolf understanding: ${persona.werewolfExperience}`);
  if (persona.vocabularyStyle) lines.push(`Vocabulary habit: ${persona.vocabularyStyle}`);
  if (persona.reasoningStyle) lines.push(`Reasoning style: ${persona.reasoningStyle}`);
  if (persona.speechLengthHabit) lines.push(`Speech length habit: ${persona.speechLengthHabit}`);
  if (persona.pressureStyle) lines.push(`Pressure response: ${persona.pressureStyle}`);
  if (persona.uncertaintyStyle) lines.push(`Uncertainty style: ${persona.uncertaintyStyle}`);
  if (persona.mistakePattern) lines.push(`Common wrong reads: ${persona.mistakePattern}`);
  if (persona.wolfDeceptionStyle) lines.push(`Wolf disguise habit: ${persona.wolfDeceptionStyle}`);
  if (lines.length === 0) return "";
  return `\n<hidden_communication_profile>\nUse this only to shape your Werewolf skill, vocabulary, and speech length. Do not state it to other players.\n${lines.map((line) => `- ${line}`).join("\n")}\n</hidden_communication_profile>`;
};

const buildHiddenPlayerMindSection = (player: Player, locale: string): string => {
  const mind = player.agentProfile?.playerMind;
  if (!mind) return "";

  if (locale === "zh") {
    const lines: string[] = [
      `胆量：${mind.courage}`,
      `记忆偏好：${mind.memoryBias}`,
      `怀疑阈值：${mind.suspicionThreshold}`,
      `自保倾向：${mind.selfProtection}`,
      `逻辑水平：${mind.logicDepth}`,
      `桌面存在感：${mind.tablePresence}`,
    ];
    return `\n<hidden_player_mind>\n这些信息是你稳定的玩家心智，只用于塑造你如何判断、站边、改口、承压和发言，不要向其他玩家明说。\n${lines.map((line) => `- ${line}`).join("\n")}\n</hidden_player_mind>`;
  }

  const lines: string[] = [
    `Courage: ${mind.courage}`,
    `Memory bias: ${mind.memoryBias}`,
    `Suspicion threshold: ${mind.suspicionThreshold}`,
    `Self-protection: ${mind.selfProtection}`,
    `Logic depth: ${mind.logicDepth}`,
    `Table presence: ${mind.tablePresence}`,
  ];
  return `\n<hidden_player_mind>\nUse this as your stable player mind. It shapes how you judge, take sides, change reads, handle pressure, and speak. Do not state it to other players.\n${lines.map((line) => `- ${line}`).join("\n")}\n</hidden_player_mind>`;
};

export const buildPersonaSection = (player: Player, isGenshinMode: boolean = false): string => {
  if (isGenshinMode || !player.agentProfile) return "";
  const { t, locale } = getI18n();
  const { persona } = player.agentProfile;
  const separator = t("promptUtils.gameContext.listSeparator");

  const base = t("promptUtils.persona.section", {
    voiceRules: persona.voiceRules.join(separator),
    riskLabel: t("promptUtils.persona.riskBalanced")
  });
  const extraInfo = persona.basicInfo?.trim()
    ? `\n${t("promptUtils.persona.basicInfo", { basicInfo: persona.basicInfo.trim() })}`
    : "";
  const hiddenCommunicationProfile = buildHiddenCommunicationProfileSection(persona, locale);
  const hiddenPlayerMind = buildHiddenPlayerMindSection(player, locale);
  return `${base}${extraInfo}${hiddenCommunicationProfile}${hiddenPlayerMind}`;
};

export const buildAliveCountsSection = (state: GameState): string => {
  const { t } = getI18n();
  const alive = state.players.filter((p) => p.alive);

  return t("promptUtils.aliveCounts", { count: alive.length });
};

type NightHistoryRecord = NonNullable<GameState["nightHistory"]>[number];
type NightDeathRecord = NonNullable<NightHistoryRecord["deaths"]>[number];

const getRecordedNightDeaths = (history: NightHistoryRecord | undefined): NightDeathRecord[] => {
  return Array.isArray(history?.deaths)
    ? history.deaths.filter((death): death is NightDeathRecord => death && typeof death.seat === "number")
    : [];
};

const formatSeatName = (state: GameState, seat: number): string => {
  const player = state.players.find((p) => p.seat === seat);
  return `${seat + 1}号${player?.displayName || ""}`;
};

const buildVoteGroupLines = (
  state: GameState,
  voteGroups: Record<number, number[]>,
  sheriffPlayerId?: string
): string[] => {
  const { t } = getI18n();
  return Object.entries(voteGroups)
    .map(([target, voters]) => {
      const targetSeat = Number(target);
      const weightedVotes = voters.reduce((sum, seat) => {
        const voter = state.players.find((p) => p.seat === seat);
        if (!voter) return sum;
        return sum + (voter.playerId === sheriffPlayerId ? 1.5 : 1);
      }, 0);
      return { targetSeat, voters, weightedVotes };
    })
    .sort((a, b) => b.weightedVotes - a.weightedVotes)
    .map(({ targetSeat, voters, weightedVotes }) => {
      const voteLabel = Number.isInteger(weightedVotes) ? `${weightedVotes}` : weightedVotes.toFixed(1);
      const voterList = voters.map((seat) => seat + 1).join(",");
      return `  ${formatSeatName(state, targetSeat)}: {${t("promptUtils.gameContext.voteCount")}: ${voteLabel}, ${t("promptUtils.gameContext.voters")}: [${voterList}]}`;
    });
};

const buildVoteGroupsFromPlayerTargets = (
  state: GameState,
  votes: Record<string, number>
): Record<number, number[]> => {
  const voteGroups: Record<number, number[]> = {};
  Object.entries(votes).forEach(([voterId, targetSeat]) => {
    const voter = state.players.find((p) => p.playerId === voterId);
    if (!voter) return;
    if (!voteGroups[targetSeat]) voteGroups[targetSeat] = [];
    voteGroups[targetSeat].push(voter.seat);
  });
  return voteGroups;
};

const buildVoteGroupsFromSeatTargets = (
  votes: Record<string, number[]>
): Record<number, number[]> => {
  const voteGroups: Record<number, number[]> = {};
  Object.entries(votes).forEach(([target, voters]) => {
    const targetSeat = Number(target);
    if (!Number.isFinite(targetSeat)) return;
    voteGroups[targetSeat] = voters
      .map((seat) => Number(seat))
      .filter((seat) => Number.isFinite(seat));
  });
  return voteGroups;
};

const getHistoricalSystemLines = (state: GameState, day: number): string[] => {
  const systemMessages = getSystemMessages();
  const systemPatterns = getSystemPatterns();
  const excluded = new Set([
    "天亮了",
    "Dawn breaks, please open your eyes",
    "进入投票环节",
    "发言结束，开始投票。",
    "Discussion ends, voting begins.",
    systemMessages.dayBreak,
    systemMessages.voteStart,
    systemMessages.badgeSpeechStart,
    systemMessages.badgeElectionStart,
    systemMessages.badgeRevote,
    systemMessages.dayDiscussion,
    systemMessages.summarizingDay,
    systemMessages.peacefulNight,
    systemMessages.guardActionStart,
    systemMessages.wolfActionStart,
    systemMessages.witchActionStart,
    systemMessages.seerActionStart,
  ]);

  return state.messages
    .filter((m) => m.day === day && m.isSystem)
    .map((m) => String(m.content || "").trim())
    .filter((content) => {
      if (!content) return false;
      if (content.startsWith("[VOTE_RESULT]")) return false;
      if (excluded.has(content)) return false;
      if (
        systemPatterns.nightFall.test(content) ||
        systemPatterns.playerKilled.test(content) ||
        systemPatterns.playerPoisoned.test(content) ||
        systemPatterns.playerMilkKilled.test(content) ||
        systemPatterns.playerExecuted.test(content) ||
        systemPatterns.voteTie.test(content)
      ) {
        return false;
      }
      return true;
    });
};


/**
 * Build full past days' transcripts.
 * The current default model has enough context for complete game history, so do not trim old speeches here.
 */
export const buildPastDaysTranscript = (state: GameState): string => {
  const { t } = getI18n();
  if (state.day <= 1) return "";

  const playerAliveMap = new Map<string, boolean>();
  state.players.forEach((p) => playerAliveMap.set(p.playerId, p.alive));

  const formatMsg = (m: { playerId: string; playerName: string; content: string; isLastWords?: boolean }) => {
    const player = state.players.find((p) => p.playerId === m.playerId);
    const speaker = player ? t("mentions.seatLabel", { seat: player.seat + 1 }) : m.playerName;
    const lastWordsLabel = m.isLastWords ? t("promptUtils.gameContext.lastWordsLabel") : "";
    return `${lastWordsLabel}${speaker}: ${m.content}`;
  };

  // Build structured event header for a given day (deaths, executions — always preserved)
  const buildDayHeader = (day: number): string => {
    const parts: string[] = [];
    const nightHistory = state.nightHistory?.[day];
    if (nightHistory) {
      const deathSeats = getRecordedNightDeaths(nightHistory).map((death) => death.seat);
      if (deathSeats.length > 0) {
        const names = deathSeats.map((s) => {
          return formatSeatName(state, s);
        });
        parts.push(`夜晚出局: ${names.join("、")}`);
      } else if (Array.isArray(nightHistory.deaths)) {
        parts.push("平安夜");
      }
    }
    const dayHistory = state.dayHistory?.[day];
    const executed = dayHistory?.executed;
    if (executed) {
      parts.push(`投票出局: ${formatSeatName(state, executed.seat)} (${executed.votes}票)`);
    } else if (dayHistory?.voteTie) {
      parts.push("投票平票，无人出局");
    }
    if (dayHistory?.hunterShot) {
      parts.push(`猎人开枪: ${formatSeatName(state, dayHistory.hunterShot.hunterSeat)} 带走 ${formatSeatName(state, dayHistory.hunterShot.targetSeat)}`);
    }
    if (dayHistory?.whiteWolfKingBoom) {
      parts.push(`白狼王自爆: ${formatSeatName(state, dayHistory.whiteWolfKingBoom.boomSeat)} 带走 ${formatSeatName(state, dayHistory.whiteWolfKingBoom.targetSeat)}`);
    }
    if (dayHistory?.idiotRevealed) {
      parts.push(`白痴翻牌: ${formatSeatName(state, dayHistory.idiotRevealed.seat)} 免疫放逐并失去投票权`);
    }
    return parts.length > 0 ? `[${parts.join(" | ")}]` : "";
  };

  // Group past-day messages by day (excluding current day)
  const dayGroups: { day: number; header: string; transcript: string }[] = [];
  for (let d = 1; d < state.day; d++) {
    const dayMessages = state.messages.filter(
      (m) => m.day === d && !m.isSystem
    );
    const header = buildDayHeader(d);
    const publicSystemLines = getHistoricalSystemLines(state, d).map((line) => `系统: ${line}`);
    const transcript = [...publicSystemLines, ...dayMessages.map(formatMsg)].join("\n");
    dayGroups.push({ day: d, header, transcript });
  }

  if (dayGroups.length === 0) return "";

  const sections = dayGroups.map(({ day, header, transcript }) => {
    const dayLabel = t("promptUtils.gameContext.dayLabel", { day });
    const headerLine = header ? `${dayLabel}${header}` : dayLabel;
    return transcript ? `${headerLine}\n${transcript}` : headerLine;
  });

  if (sections.length === 0) return "";
  return `<history>\n${sections.join("\n\n")}\n</history>`;
};

export const getDayStartIndex = (state: GameState): number => {
  const systemMessages = getSystemMessages();
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m.isSystem && m.content === systemMessages.dayBreak) return i;
  }
  return 0;
};

export const getVoteStartIndex = (state: GameState): number => {
  const systemMessages = getSystemMessages();
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m.isSystem && m.content === systemMessages.voteStart) return i;
  }
  return state.messages.length;
};


export const buildTodayTranscript = (
  state: GameState,
  options?: { includeDeadSpeech?: boolean; excludePlayerId?: string }
): string => {
  const { t } = getI18n();
  const slice = state.messages.filter((m) => m.day === state.day);

  // Build a map of playerId -> alive status for quick lookup
  const playerAliveMap = new Map<string, boolean>();
  state.players.forEach((p) => {
    playerAliveMap.set(p.playerId, p.alive);
  });
  const includeDeadSpeech = options?.includeDeadSpeech === true;

  // Separate last words from regular speech for priority handling
  const regularMessages = slice.filter((m) => {
    if (m.isSystem || m.isLastWords) return false;
    if (options?.excludePlayerId && m.playerId === options.excludePlayerId) return false;
    const isAlive = playerAliveMap.get(m.playerId) ?? true;
    return includeDeadSpeech || isAlive;
  });
  const lastWordsMessages = slice.filter((m) => {
    if (options?.excludePlayerId && m.playerId === options.excludePlayerId) return false;
    return !m.isSystem && m.isLastWords;
  });

  const formatMessage = (m: typeof slice[0]) => {
    const player = state.players.find((p) => p.playerId === m.playerId);
    // Only use seat number for prompt, no player name (to anonymize for model)
    const speaker = player ? t("mentions.seatLabel", { seat: player.seat + 1 }) : m.playerName;
    const isAlive = playerAliveMap.get(m.playerId) ?? true;
    const statusLabel = isAlive ? "" : t("promptUtils.gameContext.eliminated");
    const lastWordsLabel = m.isLastWords ? t("promptUtils.gameContext.lastWordsLabel") : "";
    return `${lastWordsLabel}${speaker}${statusLabel}: ${m.content}`;
  };

  // Last words are always preserved (they're important)
  const lastWordsText = lastWordsMessages.map(formatMessage).join("\n");
  const regularText = regularMessages.map(formatMessage).join("\n");

  const transcript = [lastWordsText, regularText].filter(Boolean).join("\n");

  if (!transcript) return "";
  return transcript;
};

export const buildPlayerTodaySpeech = (state: GameState, player: Player): string => {
  const speech = state.messages
    .filter((m) => m.day === state.day)
    .filter((m) => !m.isSystem && m.playerId === player.playerId)
    .map((m) => m.content)
    .join("\n");

  if (!speech) return "";
  return speech;
};

export const buildSystemAnnouncementsSinceDawn = (state: GameState, maxLines?: number): string => {
  const systemMessages = getSystemMessages();
  const systemPatterns = getSystemPatterns();
  const excluded = [
    "天亮了",
    "Dawn breaks, please open your eyes",
    systemMessages.dayBreak,
    "进入投票环节",
    "发言结束，开始投票。",
    "Discussion ends, voting begins.",
    systemMessages.voteStart,
  ];

  const systemLines = state.messages
    .filter((m) => m.day === state.day)
    .filter((m) => m.isSystem)
    .map((m) => String(m.content || "").trim())
    .filter((c) => {
      if (!c) return false;
      // 过滤掉带有 0-based 索引的原始 JSON 数据，避免混淆 AI
      if (c.startsWith("[VOTE_RESULT]")) return false;
      // Filter out dawn and vote start messages in both locales
      if (excluded.includes(c)) return false;
      if (
        systemPatterns.playerKilled.test(c) ||
        systemPatterns.playerPoisoned.test(c) ||
        systemPatterns.playerMilkKilled.test(c)
      ) {
        return false;
      }
      return true;
    });

  if (systemLines.length === 0) return "";
  if (maxLines === undefined || !Number.isFinite(maxLines)) return systemLines.join("\n");
  const limit = Math.max(0, maxLines);
  if (limit === 0) return "";
  return (systemLines.length > limit ? systemLines.slice(-limit) : systemLines).join("\n");
};

/**
 * Build role-specific private information section.
 * This is placed at the TOP of the context to ensure AI sees it first.
 */
const buildRolePrivateInfo = (state: GameState, player: Player): string | null => {
  if (player.role === "Seer") {
    const history = state.nightActions.seerHistory || [];
    if (history.length === 0) return null;
    
    const checks = history.map((record) => {
      const target = state.players.find((p) => p.seat === record.targetSeat);
      const resultEmoji = record.isWolf ? "🐺 狼人" : "✓ 好人";
      return `  第${record.day}夜 → ${record.targetSeat + 1}号${target?.displayName || ""} = ${resultEmoji}`;
    });
    
    return `<your_seer_checks>
【你的查验记录】
${checks.join("\n")}
</your_seer_checks>`;
  }
  
  if (player.role === "Witch") {
    const healStatus = state.roleAbilities.witchHealUsed ? "已用" : "可用";
    const poisonStatus = state.roleAbilities.witchPoisonUsed ? "已用" : "可用";
    const witchActions: string[] = [];
    const wolfTargetInfo: string[] = [];

    if (state.nightHistory) {
      Object.entries(state.nightHistory).forEach(([day, history]) => {
        // 收集狼人刀口信息，只有当解药未使用或已被使用但未救人时才显示刀口
        if (history.wolfTarget !== undefined) {
          const targetPlayer = state.players.find(p => p.seat === history.wolfTarget);
          if (targetPlayer) {
            wolfTargetInfo.push(`  第${day}夜：狼目标为 ${history.wolfTarget + 1}号${targetPlayer.displayName}`);
          }
        }

        if (history.witchSave && history.wolfTarget !== undefined) {
          const savedPlayer = state.players.find(p => p.seat === history.wolfTarget);
          if (savedPlayer) {
            witchActions.push(`  第${day}夜：救了 ${history.wolfTarget + 1}号${savedPlayer.displayName}`);
          }
        }
        if (history.witchPoison !== undefined) {
          const poisonedPlayer = state.players.find(p => p.seat === history.witchPoison);
          if (poisonedPlayer) {
            witchActions.push(`  第${day}夜：毒了 ${history.witchPoison + 1}号${poisonedPlayer.displayName}`);
          }
        }
      });
    }
    let witchInfo = `<your_potions>
【你的药水状态】解药: ${healStatus} | 毒药: ${poisonStatus}`;
    if (wolfTargetInfo.length > 0) {
      witchInfo += `\n【刀口信息】\n${wolfTargetInfo.join('\n')}`;
    }
    if (witchActions.length > 0) {
      witchInfo += `\n【用药记录】\n${witchActions.join("\n")}`;
    }
    witchInfo += `\n</your_potions>`;
    return witchInfo;
  }
  
  if (player.role === "Guard") {
    const lastTarget = state.nightActions.lastGuardTarget !== undefined 
      ? state.players.find((p) => p.seat === state.nightActions.lastGuardTarget)
      : null;
    const guardedSeat = state.nightActions.lastGuardTarget;
    
    if (guardedSeat !== undefined && lastTarget) {
      const wasProtectionEffective = lastTarget.alive;
      const protectionResult = wasProtectionEffective 
        ? `${guardedSeat + 1}号${lastTarget.displayName} 今天仍然存活`
        : `${guardedSeat + 1}号${lastTarget.displayName} 已出局`;
      
      return `<your_guard_info>
【昨晚守护】${guardedSeat + 1}号${lastTarget.displayName}
【守护结果】${protectionResult}
【今晚限制】不能连续守护 ${guardedSeat + 1}号
</your_guard_info>`;
    } else {
      return `<your_guard_info>
【首次行动】你之前没有守护过任何人
【今晚限制】无，可以守护任何存活玩家
</your_guard_info>`;
    }
  }
  
  if (isWolfRole(player.role)) {
    const teammates = state.players.filter(
      (p) => isWolfRole(p.role) && p.alive && p.playerId !== player.playerId
    );
    const allWolves = state.players.filter((p) => isWolfRole(p.role));
    const aliveWolves = allWolves.filter((p) => p.alive);
    const teammateList = teammates.length > 0 
      ? teammates.map((tm) => `${tm.seat + 1}号${tm.displayName}`).join("、")
      : "无存活队友";
    
    return `<your_wolf_team>
【狼队友】${teammateList}
【狼人存活】${aliveWolves.length}/${allWolves.length}
</your_wolf_team>`;
  }
  
  return null;
};

export const buildGameContext = (
  state: GameState,
  player: Player,
  options?: { excludePendingDeaths?: boolean }
): string => {
  const { t } = getI18n();
  const alivePlayers = state.players.filter((p) => p.alive);
  const deadPlayers = state.players.filter((p) => !p.alive);
  const totalSeats = state.players.length;
  const publicGenericDeathCause = t("promptUtils.gameContext.deathCauseDeath");
  const publicExecutionCause = t("promptUtils.gameContext.deathCauseVote");

  // === 第一优先级：角色私有信息（放在最前面） ===
  const privateInfo = buildRolePrivateInfo(state, player);
  let context = privateInfo ? `${privateInfo}\n\n` : "";

  // Build YAML-formatted game state
  const aliveSeats = alivePlayers.map((p) => p.seat + 1);
  const deadInfo = deadPlayers.map((p) => {
    // Find death info
    let cause = publicGenericDeathCause;
    let deathDay = 0;
    for (const [day, history] of Object.entries(state.nightHistory || {})) {
      const match = getRecordedNightDeaths(history).find((death) => death.seat === p.seat);
      if (match) {
        cause = publicGenericDeathCause;
        deathDay = Number(day);
      }
      if (history.hunterShot?.targetSeat === p.seat) { cause = publicGenericDeathCause; deathDay = Number(day); }
    }
    for (const [day, history] of Object.entries(state.dayHistory || {})) {
      if (history.executed?.seat === p.seat) { cause = publicExecutionCause; deathDay = Number(day); }
      if (history.hunterShot?.targetSeat === p.seat) { cause = publicGenericDeathCause; deathDay = Number(day); }
      if (history.whiteWolfKingBoom?.boomSeat === p.seat || history.whiteWolfKingBoom?.targetSeat === p.seat) {
        cause = publicGenericDeathCause;
        deathDay = Number(day);
      }
    }
    return `{seat: ${p.seat + 1}, name: ${p.displayName}, day: ${deathDay}, cause: ${cause}}`;
  });

  const sheriffSeat = state.badge.holderSeat;
  const sheriffInfo = sheriffSeat !== null ? sheriffSeat + 1 : t("promptUtils.gameContext.noSheriff");

  // 明确的时间和身份提示，放在最前面
  const isNight = state.phase.includes("NIGHT");
  const phaseText = isNight ? t("promptUtils.gameContext.night") : t("promptUtils.gameContext.day");
  const timeReminder = t("promptUtils.gameContext.timeReminder", { 
    day: state.day, 
    phase: phaseText, 
    seat: player.seat + 1, 
    name: player.displayName 
  });

  context += `<current_status>\n${timeReminder}\n</current_status>

<game_state>
day: ${state.day}
phase: ${phaseText}
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

  const wolfFriendlyFireNote = t("promptUtils.gameContext.wolfFriendlyFireNote");
  const phaseOrderNote =
    state.day === 1
      ? t("promptUtils.gameContext.phaseOrderNoteDay1BadgeBeforeDeath")
      : t("promptUtils.gameContext.phaseOrderNote");
  const noSameDayCausalityNote =
    state.phase.includes("DAY")
      ? t("promptUtils.gameContext.noSameDayCausalityNote")
      : "";
  
  // Check if guard exists in this game
  const hasGuard = state.players.some(p => p.role === "Guard");
  
  // Check if it's a peaceful night (no deaths today)
  const nightHistory = state.nightHistory?.[state.day];
  const isPeacefulNight = !options?.excludePendingDeaths && 
    state.phase.includes("DAY") && 
    nightHistory && 
    Array.isArray(nightHistory.deaths) &&
    getRecordedNightDeaths(nightHistory).length === 0;
  
  // Build rules text with phase order note always included
  let rulesText = wolfFriendlyFireNote;
  if (isPeacefulNight) {
    // Use different peaceful night note based on whether guard exists
    const peacefulNightNote = hasGuard 
      ? t("promptUtils.gameContext.peacefulNightNote")
      : t("promptUtils.gameContext.peacefulNightNoteNoGuard");
    rulesText += `\n${peacefulNightNote}`;
  }
  rulesText += `\n${phaseOrderNote}`;
  if (noSameDayCausalityNote) {
    rulesText += `\n${noSameDayCausalityNote}`;
  }
  
  if (rulesText) {
    context += `\n\n<rules>\n${rulesText}\n</rules>`;
  }

  const pastDaysSection = buildPastDaysTranscript(state);
  if (pastDaysSection) {
    context += `\n\n${pastDaysSection}`;
  }

  const systemAnnouncements = buildSystemAnnouncementsSinceDawn(state);
  if (systemAnnouncements) {
    context += `\n\n<announcements>\n${systemAnnouncements}\n</announcements>`;
  }

  if (deadPlayers.length > 0) {
    // Build today's deaths info (skip if excludePendingDeaths is true - deaths not announced yet)
    if (!options?.excludePendingDeaths) {
      const currentDayDeaths: string[] = [];
      const nightHistory = state.nightHistory?.[state.day];
      getRecordedNightDeaths(nightHistory).forEach((death) => {
        const p = state.players.find(p => p.seat === death.seat);
        if (p && !p.alive) {
          currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: ${publicGenericDeathCause}}`);
        }
      });
      const dayHistory = state.dayHistory?.[state.day];
      if (dayHistory?.executed && typeof dayHistory.executed.seat === 'number') {
        const executedSeat = dayHistory.executed.seat;
        const p = state.players.find(p => p.seat === executedSeat);
        if (p) {
          currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: ${publicExecutionCause}}`);
        }
      }
      if (dayHistory?.hunterShot && typeof dayHistory.hunterShot.targetSeat === "number") {
        const p = state.players.find(p => p.seat === dayHistory.hunterShot?.targetSeat);
        if (p && !p.alive) {
          currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: ${publicGenericDeathCause}}`);
        }
      }
      if (dayHistory?.whiteWolfKingBoom) {
        [dayHistory.whiteWolfKingBoom.boomSeat, dayHistory.whiteWolfKingBoom.targetSeat].forEach((seat) => {
          const p = state.players.find((player) => player.seat === seat);
          if (p && !p.alive) {
            currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: ${publicGenericDeathCause}}`);
          }
        });
      }

      if (currentDayDeaths.length > 0) {
        context += `\n\n<today_deaths>\n${Array.from(new Set(currentDayDeaths)).join("\n")}\n</today_deaths>`;
      }
    }

    // Dead players note - softer guideline, allow referencing death causes but focus on alive players
    context += `\n\n<focus_reminder>${t("promptUtils.gameContext.focusReminder")}</focus_reminder>`;
  }

  const hasExecutionVotes = state.voteHistory && Object.keys(state.voteHistory).length > 0;
  const hasBadgeVotes = Object.keys(state.badge.history || {}).length > 0 ||
    Object.values(state.dailySummaryVoteData || {}).some((voteData) => !!voteData?.sheriff_election);

  if (hasExecutionVotes || hasBadgeVotes) {
    context += `\n\n<votes>`;
    const sheriffSeat = state.badge.holderSeat;
    const sheriffPlayer =
      sheriffSeat !== null ? state.players.find((p) => p.seat === sheriffSeat) : null;
    const sheriffPlayerId = sheriffPlayer?.playerId;

    const badgeVoteDays = new Set<number>();
    Object.keys(state.badge.history || {}).forEach((day) => badgeVoteDays.add(Number(day)));
    Object.entries(state.dailySummaryVoteData || {}).forEach(([day, voteData]) => {
      if (voteData?.sheriff_election) badgeVoteDays.add(Number(day));
    });

    Array.from(badgeVoteDays)
      .filter((day) => Number.isFinite(day))
      .sort((a, b) => a - b)
      .forEach((day) => {
        const summaryBadgeVote = state.dailySummaryVoteData?.[day]?.sheriff_election;
        const badgeHistoryVotes = state.badge.history?.[day];
        const voteGroups = summaryBadgeVote?.votes
          ? buildVoteGroupsFromSeatTargets(summaryBadgeVote.votes)
          : badgeHistoryVotes
            ? buildVoteGroupsFromPlayerTargets(state, badgeHistoryVotes)
            : {};
        const voteLines = buildVoteGroupLines(state, voteGroups);
        if (voteLines.length === 0 && !summaryBadgeVote) return;
        context += `\nbadge_day_${day}:`;
        voteLines.forEach((line) => {
          context += `\n${line}`;
        });
        if (summaryBadgeVote) {
          context += `\n  ${t("promptUtils.gameContext.result")}: ${formatSeatName(state, summaryBadgeVote.winner)} 当选警长`;
        }
      });

    Object.entries(state.voteHistory)
      .sort(([a], [b]) => Number(a) - Number(b))
      .forEach(([day, votes]) => {
        const dayNum = Number(day);
        const voteGroups = buildVoteGroupsFromPlayerTargets(state, votes);
        const voteLines = buildVoteGroupLines(state, voteGroups, sheriffPlayerId);
        
        context += `\nday_${day}:`;
        voteLines.forEach((line) => {
          context += `\n${line}`;
        });

        const dayHistory = state.dayHistory?.[dayNum];
        if (dayHistory?.executed) {
          const executedSeat = dayHistory.executed.seat;
          const executedPlayer = state.players.find(p => p.seat === executedSeat);
          context += `\n  ${t("promptUtils.gameContext.result")}: {${t("promptUtils.gameContext.eliminated").trim()}: ${t("promptUtils.gameContext.seatLabel", { seat: executedSeat + 1 })}${executedPlayer?.displayName || ''}, ${t("promptUtils.gameContext.voteCount")}: ${dayHistory.executed.votes}}`;
        } else if (dayHistory?.voteTie) {
          context += `\n  ${t("promptUtils.gameContext.result")}: ${t("promptUtils.gameContext.tie")}`;
        }
      });
    context += `\n</votes>`;
  }

  // NOTE: Role-specific private information is now at the TOP of the context
  // via buildRolePrivateInfo() to ensure AI sees it first.

  // NOTE: We intentionally do NOT include <current_votes> during DAY_VOTE phase.
  // Showing real-time votes to later voters causes a "bandwagon effect" where
  // AI players follow earlier votes instead of making independent decisions
  // based on their own analysis and speeches.

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
