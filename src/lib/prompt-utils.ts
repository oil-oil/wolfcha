import type { ChatMessage, GameState, Persona, Phase, Player, Role } from "@/types/game";
import { isWolfRole } from "@/types/game";
import type { SystemPromptPart } from "@/game/core/types";
import type { LLMMessage } from "./llm";
import { getSystemMessages, getSystemPatterns } from "./game-texts";
import { getI18n } from "@/i18n/translator";
import { getRoleName } from "./game-constants";
import { getRoleConfiguration } from "./role-configuration";
import {
  resolveBadgeElectionWinner,
  resolveSheriffSeatAtVote,
} from "./historical-vote-snapshots";

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

const PUBLIC_ROLE_ORDER: Role[] = [
  "Werewolf",
  "WhiteWolfKing",
  "Seer",
  "Witch",
  "Hunter",
  "Guard",
  "Idiot",
  "Villager",
];

/**
 * Build the role composition shown publicly before the game starts.
 * This deliberately reads the public player-count configuration instead of
 * state.players, so no seat-to-role or alive-role information can leak.
 */
export const buildPublicRoleConfiguration = (playerCount: number): string => {
  const { t } = getI18n();
  const counts = new Map<Role, number>();
  getRoleConfiguration(playerCount).forEach((role) => {
    counts.set(role, (counts.get(role) ?? 0) + 1);
  });

  const items = PUBLIC_ROLE_ORDER
    .map((role) => ({ role, count: counts.get(role) ?? 0 }))
    .filter(({ count }) => count > 0)
    .map(({ role, count }) =>
      t("promptUtils.gameContext.publicRoleConfigurationItem", {
        role: getRoleName(role),
        count,
      })
    );

  return `<public_role_configuration>
${t("promptUtils.gameContext.publicRoleConfigurationTitle")}
${items.join("\n")}
${t("promptUtils.gameContext.publicRoleConfigurationScope")}
${t("promptUtils.gameContext.publicRoleConfigurationCheckRule")}
${t("promptUtils.gameContext.publicWinRule")}
${t("promptUtils.gameContext.publicIdentityRule")}
</public_role_configuration>`;
};

const buildPublicRoleReveals = (state: GameState): string => {
  const { t } = getI18n();
  const facts: string[] = [];

  Object.entries(state.nightHistory || {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([day, history]) => {
      if (!history.hunterShot) return;
      facts.push(t("promptUtils.gameContext.hunterRoleReveal", {
        day: Number(day),
        hunter: formatSeatName(state, history.hunterShot.hunterSeat),
        target: formatSeatName(state, history.hunterShot.targetSeat),
      }));
    });

  Object.entries(state.dayHistory || {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([day, history]) => {
      if (history.hunterShot) {
        facts.push(t("promptUtils.gameContext.hunterRoleReveal", {
          day: Number(day),
          hunter: formatSeatName(state, history.hunterShot.hunterSeat),
          target: formatSeatName(state, history.hunterShot.targetSeat),
        }));
      }
      if (history.whiteWolfKingBoom) {
        facts.push(t("promptUtils.gameContext.whiteWolfKingRoleReveal", {
          day: Number(day),
          player: formatSeatName(state, history.whiteWolfKingBoom.boomSeat),
          target: formatSeatName(state, history.whiteWolfKingBoom.targetSeat),
        }));
      }
      if (history.idiotRevealed) {
        facts.push(t("promptUtils.gameContext.idiotRoleReveal", {
          day: Number(day),
          player: formatSeatName(state, history.idiotRevealed.seat),
        }));
      }
    });

  return `<public_role_reveals>
${t("promptUtils.gameContext.publicRoleRevealsTitle")}
${facts.length > 0 ? facts.join("\n") : t("promptUtils.gameContext.publicRoleRevealsNone")}
</public_role_reveals>`;
};

/**
 * 汇总与当前玩家直接相关的公开事实。这里只陈述已发生的记录，不给出回应或发言建议。
 */
export const buildPublicFactsForPlayer = (state: GameState, player: Player): string => {
  // 只在白天阶段附带这些公开事实。
  const isDaySpeech = state.phase.startsWith("DAY_");
  if (!isDaySpeech) return "";

  const facts: string[] = [];

  // --- 1. 当天其他玩家公开点名当前玩家 ---
  const dayStartIndex = getDayStartIndex(state);
  const mentionedBy: number[] = [];
  const seatStr = `${player.seat + 1}号`;
  for (let i = dayStartIndex; i < state.messages.length; i++) {
    const m = state.messages[i];
    if (m.isSystem || m.playerId === player.playerId) continue;
    if (m.content.includes(seatStr)) {
      // 这是对"今天谁点名了我"的历史回读：发言已经发生，与说话人此刻是否存活无关。
      // 若按当前 alive 过滤，会吞掉"当天先发言点名、随后被票出/枪杀"玩家的点名。
      const speaker = state.players.find(p => p.playerId === m.playerId);
      if (speaker) mentionedBy.push(speaker.seat);
    }
  }
  if (mentionedBy.length > 0) {
    const who = [...new Set(mentionedBy)].map(s => `${s + 1}号`).join("、");
    facts.push(`今天已有公开发言中，${who}点名提到过你`);
  }

  // --- 2. 当前玩家与本日已公布出局玩家相邻 ---
  // 必须只取"当天"出局者，而非全程累计死者：否则到第 3、4 天后几乎人人都"与出局者相邻"，
  // 这条空间观察会被永久误触发，并把跨天旧死者当成可聊的相邻死亡。
  // 另外：警长竞选(报名/发言/投票/警徽PK)发生在夜间死亡公布之前，此时不得据"当晚死者"给相邻提示，否则提前泄露死讯。
  const deathsAnnounced = !(
    state.phase === "DAY_BADGE_SIGNUP" ||
    state.phase === "DAY_BADGE_SPEECH" ||
    state.phase === "DAY_BADGE_ELECTION" ||
    (state.phase === "DAY_PK_SPEECH" && state.pkSource === "badge")
  );
  const deadTodaySeats = new Set<number>();
  if (deathsAnnounced) {
    getRecordedNightDeaths(state.nightHistory?.[state.day]).forEach((d) => deadTodaySeats.add(d.seat));
    const todayDayHistory = state.dayHistory?.[state.day];
    if (todayDayHistory?.executed) deadTodaySeats.add(todayDayHistory.executed.seat);
    if (todayDayHistory?.hunterShot) deadTodaySeats.add(todayDayHistory.hunterShot.targetSeat);
    if (todayDayHistory?.whiteWolfKingBoom) {
      deadTodaySeats.add(todayDayHistory.whiteWolfKingBoom.boomSeat);
      deadTodaySeats.add(todayDayHistory.whiteWolfKingBoom.targetSeat);
    }
  }
  const deadToday = state.players.filter((p) => deadTodaySeats.has(p.seat));
  const totalSeats = state.players.length;
  const adjacentDeadSeats = deadToday.filter(d => {
    const diff = Math.abs(d.seat - player.seat);
    return diff === 1 || diff === totalSeats - 1;
  }).map((deadPlayer) => deadPlayer.seat);
  if (adjacentDeadSeats.length > 0) {
    facts.push(`本日已公布出局的${adjacentDeadSeats.map((seat) => `${seat + 1}号`).join("、")}与你座位相邻`);
  }

  // 立场类提示（警长支持/质疑）已移除：与对局事实无关的方向性暗示会推动同一玩家前后立场漂移。
  // 只保留基于真实对局状态的事实类提示。

  // --- 3. 昨日公开票型中与当前玩家同票的人 ---
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
          facts.push(`昨天你与${names}都投给了${myVote + 1}号`);
        }
      }
    }
  }

  if (facts.length === 0) return "";

  return `<public_facts_for_player>\n【与你有关的公开事实】\n${facts.map((fact) => `- ${fact}`).join("\n")}\n</public_facts_for_player>`;
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
    return `\n<hidden_communication_profile>\n这些信息只用于塑造你的狼人杀水平、词汇和发言长度，不要向其他玩家明说。其中的缺陷和不确定倾向偶尔体现即可，不要每次发言都表现出来。\n${lines.map((line) => `- ${line}`).join("\n")}\n</hidden_communication_profile>`;
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
  return `\n<hidden_communication_profile>\nUse this only to shape your Werewolf skill, vocabulary, and speech length. Do not state it to other players. Let the flaws and uncertainty show only occasionally, not in every speech.\n${lines.map((line) => `- ${line}`).join("\n")}\n</hidden_communication_profile>`;
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
    return `\n<hidden_player_mind>\n这些信息是你稳定的玩家心智，只用于塑造你如何判断、站边、承压和发言，不要向其他玩家明说。\n${lines.map((line) => `- ${line}`).join("\n")}\n</hidden_player_mind>`;
  }

  const lines: string[] = [
    `Courage: ${mind.courage}`,
    `Memory bias: ${mind.memoryBias}`,
    `Suspicion threshold: ${mind.suspicionThreshold}`,
    `Self-protection: ${mind.selfProtection}`,
    `Logic depth: ${mind.logicDepth}`,
    `Table presence: ${mind.tablePresence}`,
  ];
  return `\n<hidden_player_mind>\nUse this as your stable player mind. It shapes how you judge, take sides, handle pressure, and speak. Do not state it to other players.\n${lines.map((line) => `- ${line}`).join("\n")}\n</hidden_player_mind>`;
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
  sheriffPlayerId?: string,
  includeVoteCount: boolean = true
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
      const voterList = voters.map((seat) => seat + 1).join(",");
      if (!includeVoteCount) {
        return `  ${formatSeatName(state, targetSeat)}: {${t("promptUtils.gameContext.voters")}: [${voterList}]}`;
      }
      const voteLabel = Number.isInteger(weightedVotes) ? `${weightedVotes}` : weightedVotes.toFixed(1);
      return `  ${formatSeatName(state, targetSeat)}: {${t("promptUtils.gameContext.voteCount")}: ${voteLabel}, ${t("promptUtils.gameContext.voters")}: [${voterList}]}`;
    });
};

const buildVoteGroupsFromPlayerTargets = (
  state: GameState,
  votes: Record<string, number>
): Record<number, number[]> => {
  const voteGroups: Record<number, number[]> = {};
  const validSeats = new Set(state.players.map((player) => player.seat));
  Object.entries(votes).forEach(([voterId, targetSeat]) => {
    const voter = state.players.find((p) => p.playerId === voterId);
    if (!voter || !validSeats.has(targetSeat)) return;
    if (!voteGroups[targetSeat]) voteGroups[targetSeat] = [];
    voteGroups[targetSeat].push(voter.seat);
  });
  return voteGroups;
};

const buildVoteGroupsFromSeatTargets = (
  state: GameState,
  votes: Record<string, number[]>
): Record<number, number[]> => {
  const voteGroups: Record<number, number[]> = {};
  const validSeats = new Set(state.players.map((player) => player.seat));
  Object.entries(votes).forEach(([target, voters]) => {
    const targetSeat = Number(target);
    if (!Number.isFinite(targetSeat) || !validSeats.has(targetSeat)) return;
    voteGroups[targetSeat] = voters
      .map((seat) => Number(seat))
      .filter((seat) => Number.isFinite(seat) && validSeats.has(seat));
  });
  return voteGroups;
};

const shouldIncludeHistoricalSystemLine = (content: string): boolean => {
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
    systemMessages.guardActionStart,
    systemMessages.wolfActionStart,
    systemMessages.witchActionStart,
    systemMessages.seerActionStart,
  ]);

  if (!content || content.startsWith("[VOTE_RESULT]") || excluded.has(content)) return false;
  return !systemPatterns.nightFall.test(content);
};


/**
 * Build full past days' transcripts.
 * The current default model has enough context for complete game history, so do not trim old speeches here.
 */
export const buildPastDaysTranscript = (state: GameState): string => {
  const { t } = getI18n();
  if (state.day <= 1) return "";

  const formatMsg = (m: { playerId: string; playerName: string; content: string; isLastWords?: boolean }) => {
    const player = state.players.find((p) => p.playerId === m.playerId);
    const speaker = player ? t("mentions.seatLabel", { seat: player.seat + 1 }) : m.playerName;
    const lastWordsLabel = m.isLastWords ? t("promptUtils.gameContext.lastWordsLabel") : "";
    return `${lastWordsLabel}${speaker}: ${m.content}`;
  };

  // Group past-day messages by day (excluding current day)
  const dayGroups: { day: number; transcript: string }[] = [];
  for (let d = 1; d < state.day; d++) {
    const transcript = state.messages
      .filter((message) => message.day === d)
      .flatMap((message) => {
        if (!message.isSystem) return [formatMsg(message)];
        const content = String(message.content || "").trim();
        return shouldIncludeHistoricalSystemLine(content) ? [`系统: ${content}`] : [];
      })
      .join("\n");
    dayGroups.push({ day: d, transcript });
  }

  if (dayGroups.length === 0) return "";

  const sections = dayGroups.map(({ day, transcript }) => {
    const dayLabel = t("promptUtils.gameContext.dayLabel", { day });
    return transcript ? `${dayLabel}\n${transcript}` : dayLabel;
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

const getTranscriptPhaseLabel = (phase: Phase | undefined): string | null => {
  if (!phase) return null;
  const { t } = getI18n();
  switch (phase) {
    case "DAY_BADGE_SPEECH":
      return t("promptUtils.gameContext.transcriptPhaseBadgeSpeech");
    case "DAY_PK_SPEECH":
      return t("promptUtils.gameContext.transcriptPhasePkSpeech");
    case "DAY_SPEECH":
      return t("promptUtils.gameContext.transcriptPhaseDaySpeech");
    case "DAY_LAST_WORDS":
      return t("promptUtils.gameContext.transcriptPhaseLastWords");
    default:
      return null;
  }
};

const formatTranscriptMessages = (
  state: GameState,
  messages: ChatMessage[]
): string => {
  const { t } = getI18n();
  const playerAliveMap = new Map<string, boolean>();
  state.players.forEach((p) => playerAliveMap.set(p.playerId, p.alive));

  const lines: string[] = [];
  let previousPhase: Phase | undefined;

  messages.forEach((m) => {
    if (m.phase !== previousPhase) {
      const phaseLabel = getTranscriptPhaseLabel(m.phase);
      if (phaseLabel) {
        lines.push(t("promptUtils.gameContext.transcriptPhaseHeader", { phase: phaseLabel }));
      }
      previousPhase = m.phase;
    }

    const player = state.players.find((p) => p.playerId === m.playerId);
    const speaker = player ? t("mentions.seatLabel", { seat: player.seat + 1 }) : m.playerName;
    const isAlive = playerAliveMap.get(m.playerId) ?? true;
    const statusLabel = isAlive ? "" : t("promptUtils.gameContext.eliminated");
    const lastWordsLabel = m.isLastWords ? t("promptUtils.gameContext.lastWordsLabel") : "";
    lines.push(`${lastWordsLabel}${speaker}${statusLabel}: ${m.content}`);
  });

  return lines.join("\n");
};


export const buildTodayTranscript = (
  state: GameState,
  options?: { excludePlayerId?: string }
): string => {
  const messages = state.messages.filter((m) => {
    if (m.day !== state.day || m.isSystem) return false;
    return !options?.excludePlayerId || m.playerId !== options.excludePlayerId;
  });
  const transcript = formatTranscriptMessages(state, messages);

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
const buildRolePrivateInfo = (
  state: GameState,
  player: Player,
  options?: { excludePendingDeaths?: boolean }
): string | null => {
  // 夜间"结果"(刀/守/救是否致死)在天亮公布前不得泄露给当前行动者。目标"身份"(刀谁/守谁/夜里看到的刀口)
  // 本就属于该角色夜间合法所知，可照常展示；这里只对"当晚(state.day)结果"在死亡公布前做门控，过往夜次已公开。
  const outcomeKnownForDay = (day: number): boolean =>
    !options?.excludePendingDeaths || day < state.day;
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

    // 女巫只有在"当晚仍持有解药"时才会被告知刀口（与 NightPhase.buildWitchPrompt 的夜间逻辑一致）。
    // 解药在 witchSave 为 true 的那一晚用掉，因此该晚（含）之前可见刀口，之后不再可见，
    // 否则女巫用完解药后白天仍会拿到本不该知道的历史刀口（上帝视角）。
    let healUsedNight: number | null = null;
    if (state.nightHistory) {
      Object.entries(state.nightHistory).forEach(([day, history]) => {
        if (history.witchSave) healUsedNight = Number(day);
      });
    }

    if (state.nightHistory) {
      Object.entries(state.nightHistory).forEach(([day, history]) => {
        // 收集狼人刀口信息：仅在女巫当晚仍可使用解药时才可见
        const witchHadAntidoteThatNight = healUsedNight === null || Number(day) <= healUsedNight;
        if (history.wolfTarget !== undefined && witchHadAntidoteThatNight) {
          const targetPlayer = state.players.find(p => p.seat === history.wolfTarget);
          if (targetPlayer) {
            wolfTargetInfo.push(`  第${day}夜：狼目标为 ${history.wolfTarget + 1}号${targetPlayer.displayName}`);
          }
        }

        if (history.witchSave && history.wolfTarget !== undefined) {
          const savedPlayer = state.players.find(p => p.seat === history.wolfTarget);
          if (savedPlayer) {
            // 守+救叠加(milk)等情形下被救者当晚仍会出局，需据当晚结算标注救援是否生效，避免女巫误以为救活了人。
            // 救援"结果"在天亮公布前不展示，与狼/守卫一致显示"结果待天亮公布"（当晚 outcome 门控）。
            const saveNote = !outcomeKnownForDay(Number(day))
              ? "（结果待天亮公布）"
              : getRecordedNightDeaths(history).some((d) => d.seat === history.wolfTarget)
                ? "（救援未生效，仍出局）"
                : "";
            witchActions.push(`  第${day}夜：救了 ${history.wolfTarget + 1}号${savedPlayer.displayName}${saveNote}`);
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
      // 守护结果必须基于"昨晚结算"，而不是当前存活状态：
      // 否则被守玩家若是白天被投票/猎人/自爆带走，会被误判为"昨晚没守住"。
      const lastNightDay = Object.keys(state.nightHistory || {})
        .map(Number)
        .filter((d) => Number.isFinite(d))
        .sort((a, b) => b - a)[0];
      const lastNightRecord =
        lastNightDay !== undefined ? state.nightHistory?.[lastNightDay] : undefined;
      const guardOutcomeKnown = lastNightDay !== undefined && outcomeKnownForDay(lastNightDay);
      const diedThatNight = getRecordedNightDeaths(lastNightRecord).some(
        (d) => d.seat === guardedSeat
      );
      const protectionResult = !guardOutcomeKnown
        ? `${guardedSeat + 1}号${lastTarget.displayName} 守护结果待天亮公布`
        : diedThatNight
          ? `${guardedSeat + 1}号${lastTarget.displayName} 昨晚未能守住，已出局`
          : `${guardedSeat + 1}号${lastTarget.displayName} 昨晚平安无事`;

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
    const allWolves = state.players.filter((p) => isWolfRole(p.role));
    const aliveWolves = allWolves.filter((p) => p.alive);
    const formatWolfList = (wolves: Player[]) => wolves.length > 0
      ? wolves.map((wolf) => `${wolf.seat + 1}号${wolf.displayName}`).join("、")
      : "无";

    // 狼队历次出刀记录：这是狼阵营自己的夜间行动，属于合法私有信息。
    // 缺失它会导致狼人白天对死者归因/悍跳/自爆时与自己真实刀法脱节。
    const killRecords: string[] = [];
    if (state.nightHistory) {
      Object.entries(state.nightHistory)
        .sort(([a], [b]) => Number(a) - Number(b))
        .forEach(([day, history]) => {
          if (history.wolfTarget === undefined) return;
          const target = state.players.find((p) => p.seat === history.wolfTarget);
          if (!target) return;
          // 目标当晚是否出局（基于夜间结算，公开可知，不泄露被守/被救的具体原因）；
          // 当晚结果在天亮公布前不展示（避免狼在竞选发言阶段提前得知刀法是否成功）。
          const outcome = !outcomeKnownForDay(Number(day))
            ? "结果待天亮公布"
            : getRecordedNightDeaths(history).some((d) => d.seat === history.wolfTarget)
              ? "目标当晚出局"
              : "目标当晚存活（被守护或被解药救下）";
          killRecords.push(`  第${day}夜：刀 ${history.wolfTarget + 1}号${target.displayName} → ${outcome}`);
        });
    }

    let wolfInfo = `<your_wolf_team>
【存活狼队】${formatWolfList(aliveWolves)}
【已出局狼队】${formatWolfList(allWolves.filter((wolf) => !wolf.alive))}
【狼人存活】${aliveWolves.length}/${allWolves.length}`;
    if (killRecords.length > 0) {
      wolfInfo += `\n【狼队出刀记录】\n${killRecords.join("\n")}`;
    }
    wolfInfo += `\n</your_wolf_team>`;
    return wolfInfo;
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
  const publicHunterShotCause = t("promptUtils.gameContext.deathCauseHunterShot");
  const publicWhiteWolfKingCause = t("promptUtils.gameContext.deathCauseWhiteWolfKing");

  // === 第一优先级：角色私有信息（放在最前面） ===
  const privateInfo = buildRolePrivateInfo(state, player, options);
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
      if (history.hunterShot?.targetSeat === p.seat) { cause = publicHunterShotCause; deathDay = Number(day); }
    }
    for (const [day, history] of Object.entries(state.dayHistory || {})) {
      if (history.executed?.seat === p.seat) { cause = publicExecutionCause; deathDay = Number(day); }
      if (history.hunterShot?.targetSeat === p.seat) { cause = publicHunterShotCause; deathDay = Number(day); }
      if (history.whiteWolfKingBoom?.boomSeat === p.seat || history.whiteWolfKingBoom?.targetSeat === p.seat) {
        cause = publicWhiteWolfKingCause;
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
phase_code: ${state.phase}
game_status: ${state.winner ? `ended_${state.winner}` : "ongoing"}
you: {seat: ${player.seat + 1}, name: ${player.displayName}}
total_seats: ${totalSeats}
alive: [${aliveSeats.join(", ")}]
dead: [${deadInfo.join(", ")}]
sheriff: ${sheriffInfo}
alive_count: ${alivePlayers.length}
</game_state>`;

  // Public setup information only: aggregate role counts and public rules.
  // Never derive this section from seat assignments in state.players.
  context += `\n\n${buildPublicRoleConfiguration(totalSeats)}`;

  const publicRoleReveals = buildPublicRoleReveals(state);
  if (publicRoleReveals) {
    context += `\n\n${publicRoleReveals}`;
  }

  if (options?.excludePendingDeaths) {
    context += `\n\n<unannounced_night_result>\n${t("promptUtils.gameContext.unannouncedNightResult")}\n</unannounced_night_result>`;
  }

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
          currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: ${publicHunterShotCause}}`);
        }
      }
      if (nightHistory?.hunterShot && typeof nightHistory.hunterShot.targetSeat === "number") {
        const p = state.players.find(p => p.seat === nightHistory.hunterShot?.targetSeat);
        if (p && !p.alive) {
          currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: ${publicHunterShotCause}}`);
        }
      }
      if (dayHistory?.whiteWolfKingBoom) {
        [dayHistory.whiteWolfKingBoom.boomSeat, dayHistory.whiteWolfKingBoom.targetSeat].forEach((seat) => {
          const p = state.players.find((player) => player.seat === seat);
          if (p && !p.alive) {
            currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: ${publicWhiteWolfKingCause}}`);
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
    Object.keys(state.badge.electionWinners || {}).length > 0 ||
    Object.values(state.dailySummaryVoteData || {}).some((voteData) => !!voteData?.sheriff_election);

  if (hasExecutionVotes || hasBadgeVotes) {
    context += `\n\n<votes>`;

    const badgeVoteDays = new Set<number>();
    Object.keys(state.badge.history || {}).forEach((day) => badgeVoteDays.add(Number(day)));
    Object.keys(state.badge.electionWinners || {}).forEach((day) => badgeVoteDays.add(Number(day)));
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
          ? buildVoteGroupsFromSeatTargets(state, summaryBadgeVote.votes)
          : badgeHistoryVotes
            ? buildVoteGroupsFromPlayerTargets(state, badgeHistoryVotes)
            : {};
        const voteLines = buildVoteGroupLines(state, voteGroups);
        const winner = resolveBadgeElectionWinner(state, day, voteGroups);
        if (voteLines.length === 0 && winner === undefined) return;
        context += `\nbadge_day_${day}:`;
        voteLines.forEach((line) => {
          context += `\n${line}`;
        });
        if (typeof winner === "number") {
          context += `\n  ${t("promptUtils.gameContext.result")}: ${formatSeatName(state, winner)} 当选警长`;
        }
      });

    Object.entries(state.voteHistory)
      .sort(([a], [b]) => Number(a) - Number(b))
      .forEach(([day, votes]) => {
        const dayNum = Number(day);
        const voteGroups = buildVoteGroupsFromPlayerTargets(state, votes);
        const sheriffSeatAtVote = resolveSheriffSeatAtVote(state, dayNum);
        const sheriffPlayerId = typeof sheriffSeatAtVote === "number"
          ? state.players.find((p) => p.seat === sheriffSeatAtVote)?.playerId
          : undefined;
        const voteLines = buildVoteGroupLines(
          state,
          voteGroups,
          sheriffPlayerId,
          sheriffSeatAtVote !== undefined
        );
        
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
