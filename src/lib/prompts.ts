/**
 * 所有 AI 提示词聚合文件
 * 方便统一管理和微调
 */

import type { GameState, Player } from "@/types/game";

// ============================================
// 角色生成提示词
// ============================================

export const CHARACTER_GENERATION_PROMPT = (count: number) => `你是一个狼人杀游戏的角色生成器。

为游戏生成 ${count} 个独特的角色，每个角色都有自然的个性。

【名字要求】
- 使用真实感的中文网名或昵称
- 风格多样化：游戏ID、日常昵称等
- 简洁自然，不要太奇怪

【说话风格要求】

【重要】
- 性格要自然真实，像普通玩家
- 说话规则要简单明了，不要太戏剧化

每个角色的 persona 包含：
- styleLabel: 2-3字的风格标签（如：直率、随和、谨慎）
- voiceRules: 2条简单的说话特点
- riskBias: "safe" | "balanced" | "aggressive"
- backgroundStory: 一句话简单背景

可选增强（用于增加人物差异，但仍要自然，不要尬演）：
- catchphrases: 1-3个口头禅（短）
- logicStyle: "intuition" | "logic" | "chaos"
- triggerTopics: 1-3个“被怀疑/被带节奏时”的常见反应关键词（短）
- socialHabit: 一句话描述TA在局里更像哪类人（带节奏/和事佬/沉默观察/爱提问等）
- humorStyle: 一句话描述幽默方式（冷幽默/碎碎念/网络梗克制使用等）

返回JSON格式：
{
  "characters": [
    {
      "displayName": "名字",
      "persona": {
        "styleLabel": "风格标签",
        "voiceRules": ["特点1", "特点2"],
        "riskBias": "balanced",
        "backgroundStory": "背景",
        "catchphrases": ["口头禅1", "口头禅2"],
        "logicStyle": "logic",
        "triggerTopics": ["被怀疑会急", "喜欢反问"],
        "socialHabit": "爱提问，喜欢逼别人表态",
        "humorStyle": "偶尔自嘲，梗不过量"
      }
    }
  ]
}`;

// ============================================
// 游戏流程提示词
// ============================================

const getRoleText = (role: string) => {
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

// 获胜条件和目标说明
const getWinCondition = (role: string) => {
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

const buildPersonaSection = (player: Player): string => {
  if (!player.agentProfile) return "";
  const { persona } = player.agentProfile;
  
  const logicStyleMap = {
    intuition: "直觉流 (凭感觉、看状态)",
    logic: "逻辑流 (盘坑位、抓语病)",
    chaos: "搅屎棍 (喜欢把水搅浑)"
  };

  return `【角色设定】
名字: ${player.displayName}
性格: ${persona.styleLabel}
说话风格:
${persona.voiceRules.map((r) => `- ${r}`).join("\n")}
口头禅: ${persona.catchphrases?.join("、") || "无"}
逻辑流派: ${persona.logicStyle ? logicStyleMap[persona.logicStyle] : "平衡"}
被怀疑时反应: ${persona.triggerTopics?.join("、") || "无"}
社交习惯: ${persona.socialHabit || "无"}
幽默方式: ${persona.humorStyle || "无"}
背景: ${persona.backgroundStory}
策略: ${persona.riskBias === "aggressive" ? "激进" : persona.riskBias === "safe" ? "保守" : "平衡"}`;
};

const buildAliveCountsSection = (state: GameState): string => {
  const alive = state.players.filter((p) => p.alive);

  return `【人数概况】
总存活: ${alive.length}`;
};

const buildDailySummariesSection = (state: GameState): string => {
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
    lines.push(`第${e.day}天: ${cleaned.join("；")}`);
  }

  if (lines.length === 0) return "";
  return `【历史关键信息】\n${lines.join("\n")}`;
};

const buildTodayTranscript = (state: GameState, maxChars: number): string => {
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
  return transcript.slice(0, maxChars);
};

const buildPlayerTodaySpeech = (state: GameState, player: Player, maxChars: number): string => {
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

const buildGameContext = (
  state: GameState,
  player: Player
): string => {
  const alivePlayers = state.players.filter((p) => p.alive);
  const deadPlayers = state.players.filter((p) => !p.alive);
  const playerList = alivePlayers
    .map((p) => `${p.seat + 1}号 ${p.displayName}${p.playerId === player.playerId ? " (你)" : ""}`)
    .join("\n");

  let context = `【当前局势】
第${state.day}天 ${state.phase.includes("NIGHT") ? "夜晚" : "白天"}
存活玩家:
${playerList}`;

  context += `\n\n${buildAliveCountsSection(state)}`;

  const summarySection = buildDailySummariesSection(state);
  if (summarySection) {
    context += `\n\n${summarySection}`;
  }

  if (deadPlayers.length > 0) {
    context += `\n\n【出局玩家】\n${deadPlayers
      .map((p) => `${p.seat + 1}号 ${p.displayName}`)
      .join("\n")}`;
  }

  // 历史投票记录
  if (state.voteHistory && Object.keys(state.voteHistory).length > 0) {
    context += `\n\n【历史投票】`;
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
      Object.entries(voteGroups).forEach(([target, voters]) => {
        const targetPlayer = state.players.find(p => p.seat === Number(target));
        const voterStr = voters.map(v => `${v + 1}号`).join("、");
        context += `\n  - 投给 ${Number(target) + 1}号(${targetPlayer?.displayName || "未知"}): ${voterStr}`;
      });
    });
  }

  // 预言家查验记录
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

  // 女巫能力状态
  if (player.role === "Witch") {
    context += `\n\n【药水状态】`;
    context += `\n解药: ${state.roleAbilities.witchHealUsed ? "已使用" : "可用"}`;
    context += `\n毒药: ${state.roleAbilities.witchPoisonUsed ? "已使用" : "可用"}`;
  }

  // 守卫上一晚保护记录
  if (player.role === "Guard" && state.nightActions.lastGuardTarget !== undefined) {
    const lastTarget = state.players.find((p) => p.seat === state.nightActions.lastGuardTarget);
    context += `\n\n【上晚保护】${state.nightActions.lastGuardTarget + 1}号 ${lastTarget?.displayName}（今晚不能连续保护）`;
  }

  // 狼队友
  if (player.role === "Werewolf") {
    const teammates = state.players.filter(
      (p) => p.role === "Werewolf" && p.playerId !== player.playerId
    );
    if (teammates.length > 0) {
      context += `\n\n【狼队友】
${teammates.map((t) => `${t.seat + 1}号 ${t.displayName}`).join(", ")}`;
    }
  }

  // 最近发言
  const recentMessages = state.messages.slice(-15);
  if (recentMessages.length > 0) {
    context += `\n\n【最近发言】
${recentMessages.map((m) => `${m.playerName}: ${m.content}`).join("\n")}`;
  }

  const voteEntries = Object.entries(state.votes);
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

// ============================================
// 发言阶段提示词
// ============================================

export const SPEECH_PROMPT = (state: GameState, player: Player) => {
  const context = buildGameContext(state, player);
  const persona = buildPersonaSection(player);

  const todayTranscript = buildTodayTranscript(state, 9000);
  const selfSpeech = buildPlayerTodaySpeech(state, player, 1400);

  // 计算当前是第几个发言
  const todaySpeakers = new Set<string>();
  const dayStartIndex = (() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].isSystem && state.messages[i].content === "天亮了") return i;
    }
    return 0;
  })();
  for (let i = dayStartIndex; i < state.messages.length; i++) {
    const m = state.messages[i];
    if (!m.isSystem && m.playerId && m.playerId !== player.playerId) {
      todaySpeakers.add(m.playerId);
    }
  }
  const speakOrder = todaySpeakers.size + 1; // 自己是第几个发言
  const isFirstSpeaker = speakOrder === 1;

  const isLastWords = state.phase === "DAY_LAST_WORDS";

  const roleHints = player.role === "Werewolf"
    ? "你是狼人，要伪装成好人，可以适当甩锅但不要太刻意"
    : player.role === "Seer"
    ? "你是预言家，可以选择跳身份或先潜水观察"
    : "";

  const system = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: ${getRoleText(player.role)}

${getWinCondition(player.role)}

${persona}

【任务】
${isLastWords ? "你已经出局，现在发表遗言。" : "白天讨论环节，发表你的看法。"}

【要求】
- 口语化，像群聊一样，模拟真人发消息的节奏
- 符合你的性格设定
- 分成2-4条短消息输出，每条15-50字
- 像发微信一样一条一条说
- 如果需要指向玩家，直接说"X号"，不要带玩家名字
${roleHints ? `- ${roleHints}` : ""}

【输出格式】
返回JSON数组，每个元素是一条消息：
["第一句话", "第二句话", "第三句话"]

示例：
["我觉得3号有点奇怪啊", "刚才发言的时候一直在踩5号", "我先投3号看看反应"]`;

  const user = `${context}

${todayTranscript ? `【本日讨论记录】\n${todayTranscript}` : `【本日讨论记录】\n（暂无，你是第${speakOrder}个发言）`}

${selfSpeech ? `【你本日已说过的话】\n"${selfSpeech}"` : "【你本日已说过的话】\n（无）"}

轮到你发言，返回JSON数组：`;

  return { system, user };
};

export const BADGE_ELECTION_PROMPT = (state: GameState, player: Player) => {
  const context = buildGameContext(state, player);
  const persona = buildPersonaSection(player);
  const candidates = Array.isArray(state.badge?.candidates) ? state.badge.candidates : [];
  const alivePlayers = state.players
    .filter((p) => p.alive && p.playerId !== player.playerId)
    .filter((p) => (candidates.length > 0 ? candidates.includes(p.seat) : true));

  const todayTranscript = buildTodayTranscript(state, 8000);
  const selfSpeech = buildPlayerTodaySpeech(state, player, 900);

  const system = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: ${getRoleText(player.role)}

${getWinCondition(player.role)}

${persona}

【任务】
现在进行警徽评选。选择一名玩家获得警徽。
请优先选择你认为更可信、更有领导力的玩家。

可选: ${alivePlayers.map((p) => `${p.seat + 1}号(${p.displayName})`).join(", ")}

【格式】
只回复座位数字，如: 3
不要解释，不要输出多余文字，不要代码块`;

  const user = `${context}

${todayTranscript ? `【本日讨论记录】\n${todayTranscript}` : "【本日讨论记录】\n（无）"}

${selfSpeech ? `【你本日发言汇总】\n\"${selfSpeech}\"` : "【你本日发言汇总】\n（你今天没有发言）"}

你把警徽投给几号？`;

  return { system, user };
};

// ============================================
// 投票阶段提示词
// ============================================

export const VOTE_PROMPT = (state: GameState, player: Player) => {
  const context = buildGameContext(state, player);
  const persona = buildPersonaSection(player);
  const alivePlayers = state.players.filter(
    (p) => p.alive && p.playerId !== player.playerId
  );

  const todayTranscript = buildTodayTranscript(state, 9000);
  const selfSpeech = buildPlayerTodaySpeech(state, player, 1200);

  const roleHints = player.role === "Werewolf"
    ? "提示：避免投狼队友，但也别太明显保人"
    : player.role === "Seer" && state.nightActions.seerResult
    ? "提示：根据查验结果决定"
    : "";

  const system = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: ${getRoleText(player.role)}

${getWinCondition(player.role)}

${persona}

【任务】
投票环节，选择一名玩家处决。
尽量与自己本日发言保持一致。

可选: ${alivePlayers.map((p) => `${p.seat + 1}号(${p.displayName})`).join(", ")}

${roleHints}

【格式】
只回复座位数字，如: 3
不要解释，不要输出多余文字，不要代码块`;

  const user = `${context}

${todayTranscript ? `【本日讨论记录】\n${todayTranscript}` : "【本日讨论记录】\n（无）"}

${selfSpeech ? `【你本日发言汇总】\n"${selfSpeech}"` : "【你本日发言汇总】\n（你今天没有发言）"}

你投几号？`;

  return { system, user };
};

// ============================================
// 预言家查验提示词
// ============================================

export const SEER_ACTION_PROMPT = (state: GameState, player: Player) => {
  const context = buildGameContext(state, player);
  const persona = buildPersonaSection(player);
  const seerHistory = state.nightActions.seerHistory || [];
  const checkedSeats = seerHistory.map(h => h.targetSeat);
  
  const alivePlayers = state.players.filter(
    (p) => p.alive && p.playerId !== player.playerId
  );
  
  // 优先推荐未查验的玩家
  const uncheckedPlayers = alivePlayers.filter(p => !checkedSeats.includes(p.seat));
  const alreadyChecked = alivePlayers.filter(p => checkedSeats.includes(p.seat));

  const system = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: 预言家（好人阵营）

${getWinCondition("Seer")}

${persona}

【任务】
夜晚查验阶段，选择一名玩家查验身份。
${alreadyChecked.length > 0 ? `\n已查验过: ${alreadyChecked.map(p => `${p.seat + 1}号`).join(", ")}（不建议重复查验）` : ""}

可选: ${uncheckedPlayers.length > 0 ? uncheckedPlayers.map((p) => `${p.seat + 1}号(${p.displayName})`).join(", ") : alivePlayers.map((p) => `${p.seat + 1}号(${p.displayName})`).join(", ")}

【格式】
只回复座位数字，如: 5
不要解释，不要输出多余文字，不要代码块`;

  const user = `${context}

你要查验几号？`;

  return { system, user };
};

// ============================================
// 狼人击杀提示词
// ============================================

export const WOLF_ACTION_PROMPT = (
  state: GameState, 
  player: Player,
  existingVotes: Record<string, number> = {}
) => {
  const context = buildGameContext(state, player);
  const persona = buildPersonaSection(player);
  const villagers = state.players.filter(
    (p) => p.alive && p.alignment === "village"
  );
  const teammates = state.players.filter(
    (p) => p.role === "Werewolf" && p.playerId !== player.playerId && p.alive
  );

  // 显示队友已投票的目标
  const teammateVotesStr = teammates
    .map(t => {
      const vote = existingVotes[t.playerId];
      if (vote === undefined) return null;
      const target = state.players.find(p => p.seat === vote);
      return `- ${t.seat + 1}号(${t.displayName}) 想杀: ${vote + 1}号${target ? `(${target.displayName})` : ""}`;
    })
    .filter(Boolean)
    .join("\n");

  const system = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: 狼人（坏人阵营）
${teammates.length > 0 ? `狼队友: ${teammates.map((t) => `${t.seat + 1}号 ${t.displayName}`).join(", ")}` : "你是唯一存活的狼人"}

${getWinCondition("Werewolf")}

${persona}

【任务】
夜晚击杀阶段，选择一名好人击杀。
${teammateVotesStr ? `\n【队友意向】\n${teammateVotesStr}\n提示：建议跟随队友集火同一目标！` : ""}

可选: ${villagers.map((p) => `${p.seat + 1}号(${p.displayName})`).join(", ")}

【格式】
只回复座位数字，如: 2
不要解释，不要输出多余文字，不要代码块`;

  const user = `${context}

你们要杀几号？`;

  return { system, user };
};

// ============================================
// 系统消息模板
// ============================================

export const SYSTEM_MESSAGES = {
  gameStart: "人到齐了，开始吧。",
  nightFall: (day: number) => `第 ${day} 夜，天黑请闭眼`,
  dayBreak: "天亮了，请睁眼",
  guardActionStart: "守卫请睁眼",
  wolfActionStart: "狼人请睁眼",
  witchActionStart: "女巫请睁眼",
  seerActionStart: "预言家请睁眼",
  peacefulNight: "昨晚平安无事",
  playerKilled: (seat: number, name: string) => `${seat}号 ${name} 昨晚出局`,
  playerPoisoned: (seat: number, name: string) => `${seat}号 ${name} 昨晚中毒出局`,
  badgeSpeechStart: "警徽竞选开始，请候选人依次发言",
  badgeElectionStart: "开始警徽评选",
  badgeRevote: "警徽平票，重新投票",
  badgeElected: (seat: number, name: string, votes: number) => `警徽授予 ${seat}号 ${name}（${votes}票）`,
  dayDiscussion: "开始自由发言",
  voteStart: "发言结束，开始投票。",
  playerExecuted: (seat: number, name: string, votes: number) => `${seat}号 ${name} 以 ${votes} 票出局`,
  voteTie: "票数相同，今天无人出局",
  villageWin: "好人获胜。",
  wolfWin: "狼人获胜。",
  seerResult: (seat: number, isWolf: boolean) => `查验结果：${seat}号是${isWolf ? "狼人" : "好人"}`,
  wolfAttack: (seat: number, name: string) => `你们决定击杀：${seat}号 ${name}`,
  witchSave: "你使用了解药",
  witchPoison: (seat: number, name: string) => `你对 ${seat}号 ${name} 使用了毒药`,
  guardProtect: (seat: number, name: string) => `你守护了 ${seat}号 ${name}`,
  hunterShoot: (hunterSeat: number, targetSeat: number, targetName: string) => `${hunterSeat}号猎人开枪带走了 ${targetSeat}号 ${targetName}`,
};

// ============================================
// UI 提示文案
// ============================================

export const UI_TEXT = {
  waitingSeer: "选择一名玩家进行查验",
  seerChecking: "预言家正在选择要查验的对象…",
  waitingWolf: "选择要击杀的目标",
  wolfActing: "狼人正在商量要击杀的目标…",
  wolfCoordinating: "等待狼队友选择击杀目标…",
  waitingWitch: "选择是否用药",
  witchActing: "女巫正在决定是否使用药水…",
  waitingGuard: "选择一名玩家进行守护",
  guardActing: "守卫正在选择要守护的对象…",
  badgeVotePrompt: "点击头像投票选警徽",
  hunterShoot: "点选目标，扣下最后一枪",
  hunterAiming: "猎人正在选择要带走的目标…",
  yourTurn: "轮到你了，开始发言吧",
  votePrompt: "点击头像投票",
  clickToVote: "点击头像投票",
  aiThinking: "有人正在思考…",
  aiVoting: "大家正在投票…",
  aiSpeaking: "有人正在发言…",
  waitingAction: "轮到你了",
  waitingOthers: "等待其他玩家…",
  generatingRoles: "正在邀请其他玩家…",
  startGame: "开始游戏",
  restart: "再来一局",
};
export const GUARD_ACTION_PROMPT = (state: GameState, player: Player) => {
  const context = buildGameContext(state, player);
  const persona = buildPersonaSection(player);
  const alivePlayers = state.players.filter((p) => p.alive);
  const lastTarget = state.nightActions.lastGuardTarget;

  const system = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: 守卫（好人阵营）

${getWinCondition("Guard")}

${persona}

【任务】
夜晚守护阶段，选择一名玩家保护，使其今晚不被狼人杀害。
注意：不能连续两晚保护同一人！

可选: ${alivePlayers
    .filter((p) => p.seat !== lastTarget)
    .map((p) => `${p.seat + 1}号(${p.displayName})`)
    .join(", ")}
${lastTarget !== undefined ? `\n上晚保护了${lastTarget + 1}号，今晚不能选` : ""}

【格式】
只回复座位数字，如: 3
不要解释，不要输出多余文字，不要代码块`;

  const user = `${context}

你要保护几号？`;

  return { system, user };
};

// ============================================
// 女巫行动提示词
// ============================================

export const WITCH_ACTION_PROMPT = (
  state: GameState, 
  player: Player, 
  wolfTarget: number | undefined
) => {
  const context = buildGameContext(state, player);
  const persona = buildPersonaSection(player);
  const alivePlayers = state.players.filter(
    (p) => p.alive && p.playerId !== player.playerId
  );
  
  // 女巫不可自救
  const isWitchTheVictim = wolfTarget === player.seat;
  const canSave = !state.roleAbilities.witchHealUsed && wolfTarget !== undefined && !isWitchTheVictim;
  const canPoison = !state.roleAbilities.witchPoisonUsed;
  
  const victimInfo = (wolfTarget !== undefined && !state.roleAbilities.witchHealUsed)
    ? state.players.find((p) => p.seat === wolfTarget)
    : null;

  const system = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: 女巫（好人阵营）

${getWinCondition("Witch")}

${persona}

【药水状态】
解药: ${state.roleAbilities.witchHealUsed ? "已使用" : "可用"}
毒药: ${state.roleAbilities.witchPoisonUsed ? "已使用" : "可用"}

【今晚情况】
${victimInfo ? `狼人袭击了 ${wolfTarget! + 1}号 ${victimInfo.displayName}` : (state.roleAbilities.witchHealUsed ? "解药已用，无法感知刀口" : "今晚无人被袭击")}

【任务】
决定是否使用药水（每晚最多用一瓶）：
${canSave ? `- 输入 "save" 使用解药救 ${wolfTarget! + 1}号` : isWitchTheVictim ? "- 女巫不可自救" : "- 解药已用完或无人被杀"}
${canPoison ? `- 输入 "poison X" 毒杀X号玩家（如 "poison 3"）` : "- 毒药已用完"}
- 输入 "pass" 不使用药水
注意：同一晚只能使用一瓶药水！

可毒目标: ${alivePlayers.map((p) => `${p.seat + 1}号`).join(", ")}

【格式】
回复: save / poison X / pass
只输出上述指令本身，不要解释，不要输出多余文字，不要代码块`;

  const user = `${context}

你要怎么做？`;

  return { system, user };
};

// ============================================
// 猎人开枪提示词
// ============================================

export const HUNTER_SHOOT_PROMPT = (state: GameState, player: Player) => {
  const context = buildGameContext(state, player);
  const persona = buildPersonaSection(player);
  const alivePlayers = state.players.filter(
    (p) => p.alive && p.playerId !== player.playerId
  );

  const system = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: 猎人（好人阵营）

${getWinCondition("Hunter")}

${persona}

【任务】
你已死亡，现在可以开枪带走一人。

可选: ${alivePlayers.map((p) => `${p.seat + 1}号(${p.displayName})`).join(", ")}

【格式】
只回复座位数字，如: 5
如果不想开枪，回复: pass
不要解释，不要输出多余文字，不要代码块`;

  const user = `${context}

你要带走几号？`;

  return { system, user };
};
