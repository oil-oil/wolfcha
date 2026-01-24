import type { DifficultyLevel, GameState, Player, DailySummaryVoteData } from "@/types/game";
import type { SystemPromptPart } from "@/game/core/types";
import type { LLMMessage } from "./llm";
import { SYSTEM_MESSAGES } from "./game-texts";

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

/**
 * Role-specific strategy tips (know-how) to help AI make better decisions
 * These tips are tailored to each role to prevent homogenization
 */
export const getRoleKnowHow = (role: string): string => {
  switch (role) {
    case "Werewolf":
      return `<role_tips>
- 刀人优先级：预言家 > 女巫 > 猎人 > 守卫 > 有威胁的村民
- 悍跳时机：真预言家暴露后可考虑悍跳，分散好人火力
- 站边技巧：适度踩队友制造分歧，但关键投票要保队友
- 发言策略：不要过于沉默也不要太激进，保持自然节奏
- 投票陷阱：避免多狼抱团投票暴露狼坑，可以分散投票
- 躲刀意识：如果你状态好，可以让队友先被关注
- 关注死亡信息：若有玩家夜晚出局，发言时需对死因做出反应
</role_tips>`;
    case "Seer":
      return `<role_tips>
- 跳身份时机：首验狼可考虑首天跳带节奏；首验好人可先观察
- 报验顺序：先报狼后报好人，信息价值更高
- 首验策略：可验边缘位或发言有问题的人，避免验明显好人
- 应对对跳：要求对方先报验，观察对方查验逻辑是否合理
- 自保意识：你是狼人首刀目标，注意暗示守卫保护
- 遗言准备：如果感觉要死，提前想好遗言报验内容
- 关注死亡信息：若有玩家夜晚出局，发言时需对死因做出反应
</role_tips>`;
    case "Witch":
      return `<role_tips>
- 首夜用药：通常建议首夜不救，除非被刀的是明确的神职
- 解药原则：救确定的好人或关键神职，不要救身份不明的人
- 毒药时机：留给确认的狼人，不要冲动毒人
- 信息隐藏：不要轻易暴露你的用药情况，这是重要信息
- 自救规则：记住你不能自救，被刀就是死
- 站边价值：你知道谁被刀了，这是判断狼人的重要线索
- 关注死亡信息：若有玩家夜晚出局，发言时需对死因做出反应
</role_tips>`;
    case "Hunter":
      return `<role_tips>
- 开枪时机：死亡时可开枪，优先带走确认的狼人
- 诈身份：可以适当诈身份试探，但不要太早暴露
- 被毒规则：被女巫毒死无法开枪，注意这个限制
- 遗言价值：如果被投票出局，遗言后可以开枪
- 威慑作用：狼人知道你是猎人会有顾虑，可以利用这点
- 保命意识：你的开枪权很有价值，尽量活到关键时刻
- 关注死亡信息：若有玩家夜晚出局，发言时需对死因做出反应
</role_tips>`;
    case "Guard":
      return `<role_tips>
- 保护优先级：预言家 > 女巫 > 其他神职 > 关键好人
- 连续保护：不能连续两晚保护同一人，注意规划
- 读刀意识：根据场上局势判断狼人今晚会刀谁
- 空刀判断：如果你保护的人没死，狼人可能刀了别人
- 信息隐藏：不要轻易暴露你保护过谁，这是重要信息
- 配合预言家：如果预言家跳了，优先考虑保护
- 关注死亡信息：若有玩家夜晚出局，发言时需对死因做出反应
</role_tips>`;
    default: // Villager
      return `<role_tips>
- 听牌技巧：认真听每个人的发言，找矛盾和破绽
- 站边时机：有足够信息后再站边，不要盲目跟风
- 归票配合：配合神职的归票指令，形成票型优势
- 发言价值：作为村民也要积极发言，提供你的判断
- 投票谨慎：不要轻易投票给没有证据的人
- 认清局势：理解当前是几狼几好人的局面
- 关注死亡信息：若有玩家夜晚出局，发言时需对死因做出反应
</role_tips>`;
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

/** Format structured vote_data into readable text for <history>. Seat numbers in vote_data are 0-based. */
function formatVoteDataForHistory(v: DailySummaryVoteData): string {
  const parts: string[] = [];
  const fmt = (votes: Record<string, number[]>) =>
    Object.entries(votes)
      .map(([target, arr]) => {
        const voters = (arr as number[]).map((s) => `${s + 1}号`).join("、");
        const t = Number.parseInt(target, 10);
        return `${voters}投给${Number.isFinite(t) ? t + 1 : target}号`;
      })
      .filter(Boolean)
      .join("；");
  if (v.sheriff_election) {
    const { winner, votes } = v.sheriff_election;
    const base = `【警长投票】${winner + 1}号当选`;
    const detail = fmt(votes);
    parts.push(detail ? `${base}；${detail}` : base);
  }
  if (v.execution_vote) {
    const { eliminated, votes } = v.execution_vote;
    const base = `【公投】${eliminated + 1}号出局`;
    const detail = fmt(votes);
    parts.push(detail ? `${base}；${detail}` : base);
  }
  return parts.join(" ");
}

export const buildDailySummariesSection = (state: GameState): string => {
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
    const line = voteText ? `【第${day}天】${fullSummary} ${voteText}` : `【第${day}天】${fullSummary}`;
    lines.push(line);
  }

  if (lines.length === 0) return "";
  return `<history>\n${lines.join("\n\n")}\n</history>`;
};

export const getDayStartIndex = (state: GameState): number => {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m.isSystem && (m.content === "天亮了" || m.content === SYSTEM_MESSAGES.dayBreak)) return i;
  }
  return 0;
};

export const getVoteStartIndex = (state: GameState): number => {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m.isSystem && (m.content === "进入投票环节" || m.content === SYSTEM_MESSAGES.voteStart)) return i;
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

export const buildTodayTranscript = (state: GameState, maxChars: number): string => {
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

  // Separate last words from regular speech for priority handling
  const regularMessages = slice.filter((m) => !m.isSystem && !m.isLastWords);
  const lastWordsMessages = slice.filter((m) => !m.isSystem && m.isLastWords);

  const formatMessage = (m: typeof slice[0]) => {
    const isAlive = playerAliveMap.get(m.playerId) ?? true;
    const statusLabel = isAlive ? "" : "（已出局）";
    const lastWordsLabel = m.isLastWords ? "【遗言】" : "";
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
      .join("；");
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
    .filter((c) => c && c !== "天亮了" && c !== SYSTEM_MESSAGES.dayBreak && c !== "进入投票环节" && c !== SYSTEM_MESSAGES.voteStart);

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
  const totalSeats = state.players.length;

  // Build YAML-formatted game state
  const aliveSeats = alivePlayers.map((p) => p.seat + 1);
  const deadInfo = deadPlayers.map((p) => {
    // Find death info
    let cause = "unknown";
    let deathDay = 0;
    for (const [day, history] of Object.entries(state.nightHistory || {})) {
      if (history.wolfTarget === p.seat) { cause = "狼杀"; deathDay = Number(day); }
      if (history.witchPoison === p.seat) { cause = "毒杀"; deathDay = Number(day); }
    }
    for (const [day, history] of Object.entries(state.dayHistory || {})) {
      if (history.executed?.seat === p.seat) { cause = "投票"; deathDay = Number(day); }
    }
    return `{seat: ${p.seat + 1}, name: ${p.displayName}, day: ${deathDay}, cause: ${cause}}`;
  });

  const sheriffSeat = state.badge.holderSeat;
  const sheriffInfo = sheriffSeat !== null ? sheriffSeat + 1 : "无";

  let context = `<game_state>
day: ${state.day}
phase: ${state.phase.includes("NIGHT") ? "夜晚" : "白天"}
you: {seat: ${player.seat + 1}, name: ${player.displayName}}
total_seats: ${totalSeats}
alive: [${aliveSeats.join(", ")}]
dead: [${deadInfo.join(", ")}]
sheriff: ${sheriffInfo}
alive_count: ${alivePlayers.length}
</game_state>`;

  // Add alive players list for reference
  const playerList = alivePlayers
    .map((p) => `  - ${p.seat + 1}号 ${p.displayName}${p.playerId === player.playerId ? " (你)" : ""}`)
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
        currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: 狼杀}`);
      }
    }
    if (nightHistory?.witchPoison !== undefined) {
      const p = state.players.find(p => p.seat === nightHistory.witchPoison);
      if (p && !p.alive) {
        currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: 毒杀}`);
      }
    }
    if (nightHistory?.deaths && Array.isArray(nightHistory.deaths)) {
      nightHistory.deaths.forEach(death => {
        if (death && typeof death.seat === 'number') {
          const p = state.players.find(p => p.seat === death.seat);
          if (p && !p.alive) {
            const cause = death.reason === 'wolf' ? '狼杀' : death.reason === 'poison' ? '毒杀' : '死亡';
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
        currentDayDeaths.push(`{seat: ${p.seat + 1}, name: ${p.displayName}, cause: 投票}`);
      }
    }

    if (currentDayDeaths.length > 0) {
      context += `\n\n<today_deaths>\n${currentDayDeaths.join("\n")}\n</today_deaths>`;
    }

    // Dead players warning
    context += `\n\n<banned_discussion>严禁讨论已出局玩家: [${deadPlayers.map((p) => p.seat + 1).join(", ")}]</banned_discussion>`;
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
            context += `\n  ${target + 1}号${targetPlayer?.displayName || ''}: {票数: ${voteLabel}, 投票者: [${voterList}]}`;
          });
        } else {
          // Older days: compressed summary
          const dayHistory = state.dayHistory?.[dayNum];
          if (dayHistory?.executed) {
            const executedSeat = dayHistory.executed.seat;
            const executedPlayer = state.players.find(p => p.seat === executedSeat);
            const topVoter = sortedTargets[0]?.voters[0];
            const leaderSeat = topVoter !== undefined ? topVoter + 1 : null;
            context += `\nday_${day}: {出局: ${executedSeat + 1}号${executedPlayer?.displayName || ''}, 票数: ${dayHistory.executed.votes}${leaderSeat ? `, 主归: ${leaderSeat}号` : ''}}`;
          } else if (dayHistory?.voteTie) {
            context += `\nday_${day}: {结果: 平票}`;
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
        return `  - {day: ${record.day}, target: ${record.targetSeat + 1}号${target?.displayName || ''}, result: ${record.isWolf ? "狼人" : "好人"}}`;
      });
      context += `\n\n<your_checks>\n${checks.join("\n")}\n</your_checks>`;
    }
  }

  if (player.role === "Witch") {
    const potionStatus = `heal: ${state.roleAbilities.witchHealUsed ? "已用" : "可用"}, poison: ${state.roleAbilities.witchPoisonUsed ? "已用" : "可用"}`;
    const witchActions: string[] = [];
    if (state.nightHistory) {
      Object.entries(state.nightHistory).forEach(([day, history]) => {
        if (history.witchSave && history.wolfTarget !== undefined) {
          const savedPlayer = state.players.find(p => p.seat === history.wolfTarget);
          if (savedPlayer) {
            witchActions.push(`  - {day: ${day}, action: 救, target: ${history.wolfTarget + 1}号${savedPlayer.displayName}}`);
          }
        }
        if (history.witchPoison !== undefined) {
          const poisonedPlayer = state.players.find(p => p.seat === history.witchPoison);
          if (poisonedPlayer) {
            witchActions.push(`  - {day: ${day}, action: 毒, target: ${history.witchPoison + 1}号${poisonedPlayer.displayName}}`);
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
    context += `\n\n<your_guard>\nlast_protected: ${state.nightActions.lastGuardTarget + 1}号${lastTarget?.displayName || ''}\nnote: 今晚不能连续保护此人\n</your_guard>`;
  }

  if (player.role === "Werewolf") {
    const teammates = state.players.filter(
      (p) => p.role === "Werewolf" && p.alive && p.playerId !== player.playerId
    );
    const allWolves = state.players.filter((p) => p.role === "Werewolf");
    const aliveWolves = allWolves.filter((p) => p.alive);
    context += `\n\n<wolf_team>\nalive_teammates: [${teammates.map((t) => `${t.seat + 1}号${t.displayName}`).join(", ")}]\nwolf_count: {total: ${allWolves.length}, alive: ${aliveWolves.length}}\n</wolf_team>`;
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
