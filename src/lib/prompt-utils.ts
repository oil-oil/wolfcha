import type { DifficultyLevel, GameState, Player } from "@/types/game";
import type { SystemPromptPart } from "@/game/core/types";
import type { LLMMessage } from "./llm";

/**
 * Prompt helper utilities used by Phase prompts.
 */

export const getRoleText = (role: string) => {
  switch (role) {
    case "Werewolf":
      return "狼人（坏人阵营）";
    case "Seer":
      return "预言家（好人阵营，每晚可查验一人身份）";
    case "Witch":
      return "女巫（好人阵营，有一瓶解药可救人，一瓶毒药可毒人）";
    case "Hunter":
      return "猎人（好人阵营，死亡时可开枪带走一人）";
    case "Guard":
      return "守卫（好人阵营，每晚可保护一人不被狼人杀害）";
    default:
      return "村民（好人阵营）";
  }
};

export const getWinCondition = (role: string) => {
  switch (role) {
    case "Werewolf":
      return `【获胜条件】狼人数量 >= 好人数量 时狼人胜利
【核心目标】
- 每晚与狼队友商议击杀目标，优先杀神职（预言家>女巫>猎人>守卫）
- 白天伪装好人，引导论放逐好人
- 保护狼队友，避免被集火`;
    case "Seer":
      return `【获胜条件】放逐所有狼人时好人胜利
【核心目标】
- 每晚查验可疑玩家，積累信息
- 选择合适时机公开身份，带领好人放逐狼人
- 注意保护自己，预言家是狼人首要击杀目标`;
    case "Witch":
      return `【获胜条件】放逐所有狼人时好人胜利
【核心目标】
- 解药谨慎使用，救关键神职或确定的好人
- 毒药留给确认的狼人或危险玩家
- 注意：女巫不能自救，每晚最多用一瓶药`;
    case "Hunter":
      return `【获胜条件】放逐所有狼人时好人胜利
【核心目标】
- 白天積极发言，分析局势
- 死亡时可开枪带走一人，留给确认的狼人
- 注意：被毒死无法开枪`;
    case "Guard":
      return `【获胜条件】放逐所有狼人时好人胜利
【核心目标】
- 每晚保护可能被狼人击杀的玩家
- 不能连续两晚保护同一人
- 根据场上信息判断狼人的击杀目标`;
    default:
      return `【获胜条件】放逐所有狼人时好人胜利
【核心目标】
- 白天认真听发言，分析每个人的行为
- 通过投票放逐狼人
- 配合神职的引导`;
  }
};

export const buildDifficultySpeechHint = (difficulty: DifficultyLevel): string => {
  switch (difficulty) {
    case "easy":
      return `【难度】新手局（轻松、直觉）
【风格指令】
- 以直觉和情绪为主，少做复杂推理或多轮逻辑链
- 更容易相信他人或随主流观点
- 狼人：更谨慎保命，少用高阶战术，可出现小破绽
- 好人：更多跟随信息位，少强推`;
    case "hard":
      return `【难度】高阶局（深度对抗）
【风格指令】
- 记录并对照发言顺序、立场变化、投票链条、收益关系
- 主动构建论点与反证，识别搅局、钓鱼、伪逻辑
- 狼人：分工掩护、软站边+关键时刻转向、制造信息差与误导
- 好人：强势质询、反制带节奏、精准点狼`;
    default:
      return `【难度】标准局（均衡推理）
【风格指令】
- 关注发言矛盾、站边变化、投票去向
- 观点清晰但不过度武断
- 狼人：以自然逻辑自证，适度带节奏
- 好人：必要时强势归票`;
  }
};

export const buildDifficultyDecisionHint = (difficulty: DifficultyLevel, role: string): string => {
  const roleNote =
    role === "Werewolf"
      ? "狼人侧更关注击杀收益与神职威胁。"
      : "好人侧更关注信息价值与可信度。";

  switch (difficulty) {
    case "easy":
      return `【难度策略】偏直觉与从众，不追求最优解。${roleNote}`;
    case "hard":
      return `【难度策略】追求最优策略，结合投票链、发言动机与收益关系决策。${roleNote}`;
    default:
      return `【难度策略】平衡风险与收益，避免明显逆逻辑选择。${roleNote}`;
  }
};

export const buildPersonaSection = (player: Player, isGenshinMode: boolean = false): string => {
  if (isGenshinMode || !player.agentProfile) return "";
  const { persona } = player.agentProfile;

  return `【角色设定】
性格: ${persona.styleLabel}
说话习惯: ${persona.voiceRules.join("、")}
风格: ${persona.riskBias === "aggressive" ? "激进型，喜欢主动质疑" : persona.riskBias === "safe" ? "保守型，喜欢观察" : "平衡型"}`;
};

export const buildAliveCountsSection = (state: GameState): string => {
  const alive = state.players.filter((p) => p.alive);

  return `【人数概况】
总存活: ${alive.length}`;
};

export const buildDailySummariesSection = (state: GameState): string => {
  const factEntries = Object.entries(state.dailySummaryFacts || {})
    .map(([day, facts]) => ({ day: Number(day), facts }))
    .filter((x) => Number.isFinite(x.day) && Array.isArray(x.facts));

  const entries = Object.entries(state.dailySummaries || {})
    .map(([day, bullets]) => ({ day: Number(day), bullets }))
    .filter((x) => Number.isFinite(x.day) && Array.isArray(x.bullets));

  const merged = new Map<number, { facts?: typeof factEntries[number]["facts"]; bullets?: string[] }>();
  factEntries.forEach((entry) => {
    merged.set(entry.day, { facts: entry.facts });
  });
  entries.forEach((entry) => {
    const prev = merged.get(entry.day) || {};
    merged.set(entry.day, { ...prev, bullets: entry.bullets });
  });

  if (merged.size === 0) return "";

  const lines: string[] = [];
  for (const [day, entry] of Array.from(merged.entries()).sort((a, b) => a[0] - b[0])) {
    const factTexts = (entry.facts || [])
      .map((f) => (typeof f.fact === "string" ? f.fact.trim() : ""))
      .filter(Boolean);
    const bulletTexts = (entry.bullets || [])
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
    const cleaned = (factTexts.length > 0 ? factTexts : bulletTexts).slice(0, 8);
    if (cleaned.length === 0) continue;
    lines.push(`第${day}天: ${cleaned.join("；")}`);
  }

  if (lines.length === 0) return "";
  return `【历史关键信息】\n${lines.join("\n")}`;
};

export const buildTodayTranscript = (state: GameState, maxChars: number): string => {
  const dayStartIndex = (() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.isSystem && m.content === "天亮了") return i;
    }
    return 0;
  })();

  const voteStartIndex = (() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.isSystem && m.content === "进入投票环节") return i;
    }
    return state.messages.length;
  })();

  const slice = state.messages.slice(
    dayStartIndex,
    voteStartIndex > dayStartIndex ? voteStartIndex : state.messages.length
  );

  const transcript = slice
    .filter((m) => !m.isSystem)
    .map((m) => `${m.playerName}: ${m.content}`)
    .join("\n");

  if (!transcript) return "";
  if (transcript.length <= maxChars) return transcript;

  const summaryFacts = state.dailySummaryFacts?.[state.day];
  const summaryBullets = state.dailySummaries?.[state.day];
  const summaryItems =
    summaryFacts && summaryFacts.length > 0
      ? summaryFacts.map((f) => f.fact).filter(Boolean)
      : summaryBullets || [];
  if (summaryItems.length > 0) {
    // 使用更多摘要条目（最多8条），保留更多信息
    const summaryText = summaryItems
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 8)
      .join("；");
    const header = `【早段摘要】${summaryText}\n【最近发言】\n`;
    // 保留更多最近发言（至少保留60%的空间给最近发言）
    const minRecentChars = Math.floor(maxChars * 0.6);
    const headerLength = header.length;
    const tailLimit = Math.max(minRecentChars, maxChars - headerLength);
    const tail = tailLimit > 0 ? transcript.slice(-tailLimit) : "";
    return `${header}${tail}`.trim();
  }

  // 如果没有摘要，使用滑动窗口策略：保留最后的内容
  return transcript.slice(-maxChars);
};

export const buildPlayerTodaySpeech = (state: GameState, player: Player, maxChars: number): string => {
  const dayStartIndex = (() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.isSystem && m.content === "天亮了") return i;
    }
    return 0;
  })();

  const voteStartIndex = (() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.isSystem && m.content === "进入投票环节") return i;
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
  const dayStartIndex = (() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.isSystem && m.content === "天亮了") return i;
    }
    return 0;
  })();

  const slice = state.messages.slice(dayStartIndex);
  const systemLines = slice
    .filter((m) => m.isSystem)
    .map((m) => String(m.content || "").trim())
    .filter((c) => c && c !== "天亮了" && c !== "进入投票环节");

  const limit = Math.max(0, maxLines);
  if (limit === 0 || systemLines.length === 0) return "";
  const recentLines = systemLines.length > limit ? systemLines.slice(-limit) : systemLines;
  return recentLines.join("\n");
};

export const buildGameContext = (
  state: GameState,
  player: Player
): string => {
  const alivePlayers = state.players.filter((p) => p.alive);
  const deadPlayers = state.players.filter((p) => !p.alive);
  const playerList = alivePlayers
    .map((p) => `${p.seat + 1}号 ${p.displayName}${p.playerId === player.playerId ? " (你)" : ""}`)
    .join("\n");

  const totalSeats = state.players.length;

  let context = `【当前局势】
第${state.day}天 ${state.phase.includes("NIGHT") ? "夜晚" : "白天"}
有效座位号范围: 1号-${totalSeats}号（共${totalSeats}人），严禁提及范围外座位号
存活玩家:
${playerList}`;

  // Always include sheriff info as a stable field (do not rely on truncated announcements).
  const sheriffSeat = state.badge.holderSeat;
  if (sheriffSeat === null) {
    context += `\n\n【当前警长】无`;
  } else {
    const sheriffPlayer = state.players.find((p) => p.seat === sheriffSeat) || null;
    if (sheriffPlayer) {
      context += `\n\n【当前警长】${sheriffSeat + 1}号 ${sheriffPlayer.displayName}${sheriffPlayer.alive ? "" : "（已出局）"}`;
    } else {
      context += `\n\n【当前警长】${sheriffSeat + 1}号（未知）`;
    }
  }

  context += `\n\n${buildAliveCountsSection(state)}`;

  const summarySection = buildDailySummariesSection(state);
  if (summarySection) {
    context += `\n\n${summarySection}`;
  }

  const systemAnnouncements = buildSystemAnnouncementsSinceDawn(state, 8);
  if (systemAnnouncements) {
    context += `\n\n【系统公告】\n${systemAnnouncements}`;
  }

  if (deadPlayers.length > 0) {
    context += `\n\n【出局玩家】\n${deadPlayers
      .map((p) => `${p.seat + 1}号 ${p.displayName}`)
      .join("\n")}`;

    const currentDayDeaths = [];

    const nightHistory = state.nightHistory?.[state.day];
    if (nightHistory?.wolfTarget !== undefined) {
      const player = state.players.find(p => p.seat === nightHistory.wolfTarget);
      if (player && !player.alive) {
        currentDayDeaths.push(`${player.seat + 1}号 ${player.displayName} 被狼人杀死`);
      }
    }

    if (nightHistory?.witchPoison !== undefined) {
      const player = state.players.find(p => p.seat === nightHistory.witchPoison);
      if (player && !player.alive) {
        currentDayDeaths.push(`${player.seat + 1}号 ${player.displayName} 被女巫毒死`);
      }
    }

    if (nightHistory?.deaths && Array.isArray(nightHistory.deaths)) {
      nightHistory.deaths.forEach(death => {
        if (death && typeof death.seat === 'number') {
          const player = state.players.find(p => p.seat === death.seat);
          if (player && !player.alive) {
            currentDayDeaths.push(`${player.seat + 1}号 ${player.displayName} 被${death.reason === 'wolf' ? '狼人杀死' : death.reason === 'poison' ? '女巫毒死' : '杀死'}`);
          }
        }
      });
    }

    const dayHistory = state.dayHistory?.[state.day];
    if (dayHistory?.executed && typeof dayHistory.executed.seat === 'number') {
      const executedSeat = dayHistory.executed.seat;
      const player = state.players.find(p => p.seat === executedSeat);
      if (player) {
        currentDayDeaths.push(`${player.seat + 1}号 ${player.displayName} 被投票处决`);
      }
    }

    if (currentDayDeaths.length > 0) {
      context += `\n\n【今日死亡】\n${currentDayDeaths.join("\n")}`;
    }
  }

  if (state.voteHistory && Object.keys(state.voteHistory).length > 0) {
    context += `\n\n【历史投票】`;
    const sheriffSeat = state.badge.holderSeat;
    const sheriffPlayer =
      sheriffSeat !== null ? state.players.find((p) => p.seat === sheriffSeat) : null;
    const sheriffPlayerId = sheriffPlayer?.playerId;
    Object.entries(state.voteHistory).forEach(([day, votes]) => {
      context += `\n第${day}天投票:`;
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
          const voterNumbers = voters.map(s => `${s + 1}号`).join('、');
          const weightedVotes = voters.reduce((sum, seat) => {
            const voter = state.players.find((p) => p.seat === seat);
            if (!voter) return sum;
            return sum + (voter.playerId === sheriffPlayerId ? 1.5 : 1);
          }, 0);
          const voteLabel = Number.isInteger(weightedVotes)
            ? `${weightedVotes}`
            : weightedVotes.toFixed(1);
          context += `\n  ${Number(target) + 1}号${targetPlayer?.displayName}(共${voteLabel}票): ${voterNumbers}`;
        });
    });
  }

  if (player.role === "Seer") {
    const history = state.nightActions.seerHistory || [];
    if (history.length > 0) {
      context += `\n\n【查验记录】`;
      for (const record of history) {
        const target = state.players.find((p) => p.seat === record.targetSeat);
        context += `\n第${record.day}夜: ${record.targetSeat + 1}号 ${target?.displayName} - ${record.isWolf ? "狼人" : "好人"}`;
      }
    }
  }

  if (player.role === "Witch") {
    context += `\n\n【药水状态】`;
    context += `\n解药: ${state.roleAbilities.witchHealUsed ? "已使用" : "可用"}`;
    context += `\n毒药: ${state.roleAbilities.witchPoisonUsed ? "已使用" : "可用"}`;

    const witchActions: string[] = [];
    if (state.nightHistory) {
      Object.entries(state.nightHistory).forEach(([day, history]) => {
        if (history.witchSave && history.wolfTarget !== undefined) {
          const savedPlayer = state.players.find(p => p.seat === history.wolfTarget);
          if (savedPlayer) {
            witchActions.push(`第${day}夜: 你用解药救了 ${history.wolfTarget + 1}号 ${savedPlayer.displayName}`);
          }
        }
        if (history.witchPoison !== undefined) {
          const poisonedPlayer = state.players.find(p => p.seat === history.witchPoison);
          if (poisonedPlayer) {
            witchActions.push(`第${day}夜: 你用毒药毒了 ${history.witchPoison + 1}号 ${poisonedPlayer.displayName}`);
          }
        }
      });
    }
    if (witchActions.length > 0) {
      context += `\n\n【你的用药记录】\n${witchActions.join("\n")}`;
    }
  }

  if (player.role === "Guard" && state.nightActions.lastGuardTarget !== undefined) {
    const lastTarget = state.players.find((p) => p.seat === state.nightActions.lastGuardTarget);
    context += `\n\n【上晚保护】${state.nightActions.lastGuardTarget + 1}号 ${lastTarget?.displayName}（今晚不能连续保护）`;
  }

  if (player.role === "Werewolf") {
    const teammates = state.players.filter(
      (p) => p.role === "Werewolf" && p.alive && p.playerId !== player.playerId
    );
    if (teammates.length > 0) {
      context += `\n\n【狼队友】
${teammates.map((t) => `${t.seat + 1}号 ${t.displayName}`).join(", ")}`;
    }
  }

  const showCurrentVotes = state.phase === "DAY_VOTE" || state.phase === "DAY_RESOLVE";
  const voteEntries = showCurrentVotes ? Object.entries(state.votes) : [];
  if (voteEntries.length > 0) {
    const voteLines = voteEntries
      .map(([voterId, targetSeat]) => {
        const voter = state.players.find((p) => p.playerId === voterId);
        return `${voter ? `${voter.seat + 1}号${voter.displayName}` : "未知"} -> ${targetSeat + 1}号`;
      })
      .join("\n");
    context += `\n\n【当前投票】\n${voteLines}`;
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
