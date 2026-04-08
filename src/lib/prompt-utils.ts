import type { DifficultyLevel, GameState, Player } from "@/types/game";
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
 * Role-specific strategy tips (know-how) to help AI make better decisions
 * These tips are tailored to each role to prevent homogenization
 */
export const getRoleKnowHow = (role: string): string => {
  const { t } = getI18n();
  switch (role) {
    case "Werewolf":
      return t.raw("promptUtils.roleKnowHow.werewolf");
    case "WhiteWolfKing":
      return t.raw("promptUtils.roleKnowHow.whiteWolfKing");
    case "Seer":
      return t.raw("promptUtils.roleKnowHow.seer");
    case "Witch":
      return t.raw("promptUtils.roleKnowHow.witch");
    case "Hunter":
      return t.raw("promptUtils.roleKnowHow.hunter");
    case "Guard":
      return t.raw("promptUtils.roleKnowHow.guard");
    case "Idiot":
      return t.raw("promptUtils.roleKnowHow.idiot");
    default:
      return t.raw("promptUtils.roleKnowHow.villager");
  }
};

/**
 * Build situational strategy based on current game state.
 * Provides context-aware tactical suggestions without being overly restrictive.
 */
export const buildSituationalStrategy = (state: GameState, player: Player): string => {
  const lines: string[] = [];

  // === Part 1: Role-specific private info strategy ===
  if (player.role === "Seer") {
    const checks = state.nightActions.seerHistory || [];
    if (checks.length === 0) {
      // no checks yet — skip role-specific tips
    } else {
      const hasWolfCheck = checks.some(c => c.isWolf);
      const hasGoodCheck = checks.some(c => !c.isWolf);

      lines.push("<situational_tips>");
      if (hasWolfCheck && state.day === 1) {
        lines.push("【当前情境】你首验查杀！这是强信息。");
        lines.push("【可选策略】");
        lines.push("- 跳身份带节奏，报出查杀的座位号");
        lines.push("- 给出今日归票建议");
        lines.push("- 准备好应对可能的狼人对跳");
      } else if (hasGoodCheck && !hasWolfCheck) {
        lines.push("【当前情境】你目前只有金水（好人验），信息量有限。");
        lines.push("【可选策略】");
        lines.push("- 潜水观察，等待更多信息后再跳");
        lines.push("- 或跳身份报金水，争取话语权");
        lines.push("- 观察是否有人对跳，判断真假预言家");
      } else if (hasWolfCheck && state.day > 1) {
        lines.push("【当前情境】你有查杀记录。");
        lines.push("【可选策略】");
        lines.push("- 继续推进查杀目标出局");
        lines.push("- 结合新的查验结果分析局势");
      }
      lines.push("</situational_tips>");
    }
  }

  if (isWolfRole(player.role)) {
    const aliveWolves = state.players.filter(p => isWolfRole(p.role) && p.alive);
    const isLastWolf = aliveWolves.length === 1;

    lines.push("<situational_tips>");
    if (isLastWolf) {
      lines.push("【当前情境】你是最后一只狼！");
      lines.push("【可选策略】");
      lines.push("- 低调发言，避免被集火");
      lines.push("- 引导好人内斗");
      lines.push("- 寻找机会翻盘");
    } else if (state.day === 1) {
      lines.push("【当前情境】首日发言，建立信任很关键。");
      lines.push("【可选策略】");
      lines.push("- 像好人一样分析局势");
      lines.push("- 不要过早站边或暴露狼视角");
      lines.push("- 可以适当质疑可疑发言");
    }
    lines.push("</situational_tips>");
  }

  if (player.role === "Witch") {
    const hasHeal = !state.roleAbilities.witchHealUsed;
    const hasPoison = !state.roleAbilities.witchPoisonUsed;

    if (hasHeal || hasPoison) {
      lines.push("<situational_tips>");
      lines.push("【当前情境】你是女巫。");
      if (hasHeal && hasPoison) {
        lines.push("- 解药和毒药都还在，谨慎使用");
      } else if (hasHeal) {
        lines.push("- 解药还在，留给关键好人");
      } else if (hasPoison) {
        lines.push("- 毒药还在，留给确认的狼人");
      }
      lines.push("- 你知道谁被刀了，这是重要信息");
      lines.push("</situational_tips>");
    }
  }

  // === Part 2: Public-info perspective hint (all roles) ===
  // Give each player a unique analytical angle based on their observable game situation.
  // This creates speech diversity without prescribing output format.
  const perspectiveHint = buildPerspectiveHint(state, player);
  if (perspectiveHint) {
    lines.push(perspectiveHint);
  }

  return lines.join("\n");
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
    hints.push(`你被${who}点名提到了——考虑是否需要回应或反驳`);
  }

  // --- 2. Adjacent to a dead player: you have a spatial observation ---
  const deadToday = state.players.filter(p => !p.alive);
  const totalSeats = state.players.length;
  const isAdjacentToDead = deadToday.some(d => {
    const diff = Math.abs(d.seat - player.seat);
    return diff === 1 || diff === totalSeats - 1;
  });
  if (isAdjacentToDead && deadToday.length > 0) {
    hints.push("你和出局的玩家座位相邻——你可以聊聊你对这个刀口的看法");
  }

  // --- 3. Sheriff-related: different angles depending on badge status ---
  const sheriffSeat = state.badge.holderSeat;
  if (sheriffSeat !== null && sheriffSeat === player.seat) {
    hints.push("你是警长，你的归票建议有引导力——给出明确的方向");
  } else if (sheriffSeat !== null) {
    // Non-sheriff: randomly suggest either supporting or questioning the sheriff
    // Use seat number as a deterministic "random" seed for consistency
    if (player.seat % 2 === 0) {
      hints.push("关注警长的归票建议，想想你是否认同");
    } else {
      hints.push("不要盲从警长——如果你有不同看法，可以质疑他的判断");
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
          hints.push(`昨天${names}和你投了同一个目标——思考一下这意味着什么`);
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
    hints.push("你是第一个发言——没有人可以参考，大胆抛出你自己的分析");
  } else if (spokenRatio >= 0.7) {
    // Late speaker
    hints.push("你已经听了大部分人的发言——可以指出前面发言中你发现的矛盾或破绽");
  }

  if (hints.length === 0) return "";

  // Pick at most 2 hints to keep it focused (use seat + day as deterministic selector)
  const selected = hints.length <= 2 ? hints : [
    hints[(player.seat + state.day) % hints.length],
    hints[(player.seat + state.day + 1) % hints.length],
  ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  return `<focus_angle>\n【你的视角】\n${selected.map(h => `- ${h}`).join("\n")}\n</focus_angle>`;
}

/**
 * Build difficulty hint for speech generation.
 * Now always uses "hard" level strategy for better AI performance.
 * The difficulty parameter is kept for backward compatibility but ignored.
 */
export const buildDifficultySpeechHint = (_difficulty?: DifficultyLevel): string => {
  const { t } = getI18n();
  // Always use hard difficulty for better strategic depth
  return t("promptUtils.difficultySpeech.hard");
};

/**
 * Build difficulty hint for decision making.
 * Now always uses "hard" level strategy for better AI performance.
 * The difficulty parameter is kept for backward compatibility but ignored.
 */
export const buildDifficultyDecisionHint = (_difficulty?: DifficultyLevel, role?: string): string => {
  const { t } = getI18n();
  const roleNote =
    isWolfRole(role)
      ? t("promptUtils.difficultyDecision.roleNoteWerewolf")
      : t("promptUtils.difficultyDecision.roleNoteGood");

  // Always use hard difficulty for better strategic depth
  return t("promptUtils.difficultyDecision.hard", { roleNote });
};

export const buildPersonaSection = (player: Player, isGenshinMode: boolean = false): string => {
  if (isGenshinMode || !player.agentProfile) return "";
  const { t } = getI18n();
  const { persona } = player.agentProfile;
  const separator = t("promptUtils.gameContext.listSeparator");

  const base = t("promptUtils.persona.section", {
    voiceRules: persona.voiceRules.join(separator),
    riskLabel: t("promptUtils.persona.riskBalanced")
  });
  const extraInfo = persona.basicInfo?.trim()
    ? `\n${t("promptUtils.persona.basicInfo", { basicInfo: persona.basicInfo.trim() })}`
    : "";
  return `${base}${extraInfo}`;
};

export const buildAliveCountsSection = (state: GameState): string => {
  const { t } = getI18n();
  const alive = state.players.filter((p) => p.alive);

  return t("promptUtils.aliveCounts", { count: alive.length });
};


/**
 * Build past days' transcripts using a rotation/budget approach.
 * Instead of AI-generated summaries, includes actual past-day messages.
 * Allocates budget from most recent day backward, dropping oldest days first.
 * Each day gets a structured event header (deaths, executions) that is always preserved.
 */
export const buildPastDaysTranscript = (state: GameState, maxChars: number = 15000): string => {
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
      const deathSeats: number[] = [];
      if (nightHistory.deaths && Array.isArray(nightHistory.deaths)) {
        nightHistory.deaths.forEach((d) => {
          if (d && typeof d.seat === "number") deathSeats.push(d.seat);
        });
      } else {
        if (nightHistory.wolfTarget !== undefined) {
          const p = state.players.find((pl) => pl.seat === nightHistory.wolfTarget);
          if (p && !p.alive) deathSeats.push(nightHistory.wolfTarget);
        }
        if (nightHistory.witchPoison !== undefined) {
          const p = state.players.find((pl) => pl.seat === nightHistory.witchPoison);
          if (p && !p.alive) deathSeats.push(nightHistory.witchPoison);
        }
      }
      if (deathSeats.length > 0) {
        const names = deathSeats.map((s) => {
          const p = state.players.find((pl) => pl.seat === s);
          return `${s + 1}号${p?.displayName || ""}`;
        });
        parts.push(`夜晚出局: ${names.join("、")}`);
      } else {
        parts.push("平安夜");
      }
    }
    const dayHistory = state.dayHistory?.[day];
    const executed = dayHistory?.executed;
    if (executed) {
      const p = state.players.find((pl) => pl.seat === executed.seat);
      parts.push(`投票出局: ${executed.seat + 1}号${p?.displayName || ""} (${executed.votes}票)`);
    } else if (dayHistory?.voteTie) {
      parts.push("投票平票，无人出局");
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
    const transcript = dayMessages.map(formatMsg).join("\n");
    dayGroups.push({ day: d, header, transcript });
  }

  if (dayGroups.length === 0) return "";

  // Allocate budget from most recent day backward
  const sections: string[] = [];
  let remaining = maxChars;

  for (let i = dayGroups.length - 1; i >= 0; i--) {
    const { day, header, transcript } = dayGroups[i];
    const dayLabel = t("promptUtils.gameContext.dayLabel", { day });
    const headerLine = header ? `${dayLabel}${header}` : dayLabel;

    // Header is always included (small cost)
    const headerCost = headerLine.length + 2; // +2 for newlines
    if (remaining < headerCost) break;

    // Try to fit transcript within remaining budget
    const availableForTranscript = remaining - headerCost;
    if (transcript.length <= availableForTranscript) {
      sections.unshift(`${headerLine}\n${transcript}`);
      remaining -= headerLine.length + 1 + transcript.length + 1;
    } else if (availableForTranscript > 200) {
      // Partial transcript: take the most recent part (sliding window)
      const partial = transcript.slice(-availableForTranscript);
      sections.unshift(`${headerLine}\n...${partial}`);
      remaining = 0;
      break;
    } else {
      // Only header fits
      sections.unshift(headerLine);
      remaining -= headerCost;
    }
  }

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
  if (transcript.length <= maxChars) return transcript;

  // Prioritize last words, then use sliding window for regular speech
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

  const slice = state.messages.slice(dayStartIndex);
  const systemLines = slice
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

  const limit = Math.max(0, maxLines);
  if (limit === 0 || systemLines.length === 0) return "";
  const recentLines = systemLines.length > limit ? systemLines.slice(-limit) : systemLines;
  return recentLines.join("\n");
};

/**
 * Build role-specific private information section.
 * This is placed at the TOP of the context to ensure AI sees it first.
 */
const buildRolePrivateInfo = (state: GameState, player: Player): string | null => {
  const { t } = getI18n();
  
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
            // 如果解药未被使用，则显示刀口信息；如果解药被使用并且确实救了人，也显示原本的刀口
            if (!state.roleAbilities.witchHealUsed || history.witchSave) {
              wolfTargetInfo.push(`  第${day}夜：狼目标为 ${history.wolfTarget + 1}号${targetPlayer.displayName}`);
            }
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
  const publicExecutionCause = publicGenericDeathCause;

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
      if (history.wolfTarget === p.seat) { cause = publicGenericDeathCause; deathDay = Number(day); }
      if (history.witchPoison === p.seat) { cause = publicGenericDeathCause; deathDay = Number(day); }
      if (Array.isArray(history.deaths)) {
        const match = history.deaths.find((d) => d.seat === p.seat);
        if (match) {
          cause = publicGenericDeathCause;
          deathDay = Number(day);
        }
      }
      if (history.hunterShot?.targetSeat === p.seat) { cause = publicGenericDeathCause; deathDay = Number(day); }
    }
    for (const [day, history] of Object.entries(state.dayHistory || {})) {
      if (history.executed?.seat === p.seat) { cause = publicExecutionCause; deathDay = Number(day); }
      if (history.hunterShot?.targetSeat === p.seat) { cause = publicGenericDeathCause; deathDay = Number(day); }
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
    !nightHistory.wolfTarget && 
    !nightHistory.witchPoison && 
    (!nightHistory.deaths || nightHistory.deaths.length === 0);
  
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

  const systemAnnouncements = buildSystemAnnouncementsSinceDawn(state, 8);
  if (systemAnnouncements) {
    context += `\n\n<announcements>\n${systemAnnouncements}\n</announcements>`;
  }

  if (deadPlayers.length > 0) {
    // Build today's deaths info (skip if excludePendingDeaths is true - deaths not announced yet)
    if (!options?.excludePendingDeaths) {
      const currentDayDeaths: string[] = [];
      const nightHistory = state.nightHistory?.[state.day];
      if (nightHistory?.wolfTarget !== undefined) {
        const p = state.players.find(p => p.seat === nightHistory.wolfTarget);
        if (p && !p.alive) {
          currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: ${publicGenericDeathCause}}`);
        }
      }
      if (nightHistory?.witchPoison !== undefined) {
        const p = state.players.find(p => p.seat === nightHistory.witchPoison);
        if (p && !p.alive) {
          currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: ${publicGenericDeathCause}}`);
        }
      }
      if (nightHistory?.deaths && Array.isArray(nightHistory.deaths)) {
        nightHistory.deaths.forEach(death => {
          if (death && typeof death.seat === 'number') {
            const p = state.players.find(p => p.seat === death.seat);
            if (p && !p.alive) {
              currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: ${publicGenericDeathCause}}`);
            }
          }
        });
      }
      const dayHistory = state.dayHistory?.[state.day];
      if (dayHistory?.executed && typeof dayHistory.executed.seat === 'number') {
        const executedSeat = dayHistory.executed.seat;
        const p = state.players.find(p => p.seat === executedSeat);
        if (p) {
          currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: ${publicExecutionCause}}`);
        }
      }

      if (currentDayDeaths.length > 0) {
        context += `\n\n<today_deaths>\n${currentDayDeaths.join("\n")}\n</today_deaths>`;
      }
    }

    // Dead players note - softer guideline, allow referencing death causes but focus on alive players
    context += `\n\n<focus_reminder>${t("promptUtils.gameContext.focusReminder")}</focus_reminder>`;
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
          } else if (sortedTargets.length > 0) {
            // 即使没有 dayHistory，也显示投票信息（防止投票信息丢失）
            const topTarget = sortedTargets[0];
            const targetPlayer = state.players.find(p => p.seat === topTarget.target);
            const topVoter = topTarget.voters[0];
            const leaderSeat = topVoter !== undefined ? topVoter + 1 : null;
            const voteLabel = Number.isInteger(topTarget.weightedVotes) ? `${topTarget.weightedVotes}` : topTarget.weightedVotes.toFixed(1);
            context += `\nday_${day}: {${t("promptUtils.gameContext.eliminated").trim()}: ${t("promptUtils.gameContext.seatLabel", { seat: topTarget.target + 1 })}${targetPlayer?.displayName || ''}, ${t("promptUtils.gameContext.voteCount")}: ${voteLabel}${leaderSeat ? `, ${t("promptUtils.gameContext.mainVoter")}: ${t("promptUtils.gameContext.seatLabel", { seat: leaderSeat })}` : ''}}`;
          }
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
