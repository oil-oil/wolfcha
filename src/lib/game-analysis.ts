/**
 * 游戏分析数据生成器
 * 从 GameState 解析并生成 GameAnalysisData
 */

import type { GameState, Player, Role, Alignment, Phase } from "@/types/game";
import { getSummaryModel } from "@/lib/api-keys";
import type {
  GameAnalysisData,
  TimelineEntry,
  NightEvent,
  DayEvent,
  PlayerSnapshot,
  RoundState,
  PersonalStats,
  PlayerReview,
  PlayerAward,
  VoteRecord,
  DayPhase,
  PlayerSpeech,
  DeathCause,
} from "@/types/analysis";
import { generateJSON } from "@/lib/llm";

const MAX_SPEECH_ITEMS_PER_PHASE = 30;
const MAX_SPEECH_CONTENT_LENGTH = 280;

const ROLE_ALIGNMENT: Record<Role, Alignment> = {
  Werewolf: "wolf",
  Seer: "village",
  Witch: "village",
  Hunter: "village",
  Guard: "village",
  Villager: "village",
};

interface EvaluationTagRule {
  tag: string;
  condition: (player: Player, state: GameState, stats: AnalysisContext) => boolean;
  priority: number;
}

function extractSpeechesFromMessages(
  state: GameState,
  options: { day: number; phases: Phase[] }
): PlayerSpeech[] {
  const { day, phases } = options;
  const phaseSet = new Set(phases);

  const items: PlayerSpeech[] = [];
  for (const m of state.messages) {
    if (m.isSystem) continue;
    if (m.day !== day) continue;
    if (!m.phase || !phaseSet.has(m.phase)) continue;
    const content = m.content?.trim();
    if (!content) continue;

    const player = state.players.find((p) => p.playerId === m.playerId);
    const seat = (player?.seat ?? -1) + 1;
    if (seat <= 0) continue;

    items.push({
      seat,
      content: content.length > MAX_SPEECH_CONTENT_LENGTH
        ? `${content.slice(0, MAX_SPEECH_CONTENT_LENGTH)}...`
        : content,
    });

    if (items.length >= MAX_SPEECH_ITEMS_PER_PHASE) break;
  }

  return items;
}

interface AnalysisContext {
  humanPlayer: Player;
  totalDays: number;
  humanDeathDay: number | null;
  humanKills: number;
  humanSaves: number;
  humanChecks: { wolves: number; villagers: number };
  humanGuards: { success: number; total: number };
  voteAccuracy: number;
  wasFirstNightKilled: boolean;
  gotBadgeByJump: boolean;
  // 新增：女巫相关
  witchSavedWolf: boolean;       // 救了狼人
  witchPoisonedWolf: boolean;    // 毒了狼人
  witchPoisonedVillager: boolean; // 毒了好人
  sameSaveAndGuard: boolean;     // 同守同救（奶穿）
  // 新增：狼人相关
  selfKnifeFirstNight: boolean;  // 首夜自刀骗药
  survivedAfterCheck: boolean;   // 被查杀后抗推存活
  // 新增：猎人相关
  hunterShot: boolean;           // 是否开枪
  hunterShotWolf: boolean;       // 开枪带走狼人
  hunterShotVillager: boolean;   // 开枪带走好人
}

const SEER_TAGS: EvaluationTagRule[] = [
  { tag: "天妒英才", condition: (_, __, ctx) => ctx.wasFirstNightKilled, priority: 100 },
  { tag: "洞悉之眼", condition: (_, __, ctx) => ctx.humanChecks.wolves >= 2, priority: 95 },
  { tag: "初露锋芒", condition: (_, __, ctx) => ctx.humanChecks.wolves === 1, priority: 90 },
];

const WITCH_TAGS: EvaluationTagRule[] = [
  { tag: "药物冲突", condition: (_, __, ctx) => ctx.sameSaveAndGuard, priority: 100 },
  { tag: "致命毒药", condition: (_, __, ctx) => ctx.witchPoisonedWolf, priority: 95 },
  { tag: "妙手回春", condition: (_, __, ctx) => ctx.humanSaves >= 1 && !ctx.witchSavedWolf, priority: 90 },
  { tag: "助纣为虐", condition: (_, __, ctx) => ctx.witchSavedWolf, priority: 85 },
  { tag: "误入歧途", condition: (_, __, ctx) => ctx.witchPoisonedVillager, priority: 80 },
];

const GUARD_TAGS: EvaluationTagRule[] = [
  { tag: "致命守护", condition: (_, __, ctx) => ctx.sameSaveAndGuard, priority: 100 },
  { tag: "铜墙铁壁", condition: (_, __, ctx) => ctx.humanGuards.success >= 2, priority: 95 },
  { tag: "坚实盾牌", condition: (_, __, ctx) => ctx.humanGuards.success === 1, priority: 90 },
  { tag: "生锈盾牌", condition: (_, __, ctx) => ctx.humanGuards.success === 0 && ctx.humanGuards.total > 0, priority: 80 },
];

function findHunterShot(p: Player, state: GameState) {
  const dayShot = Object.values(state.dayHistory || {}).find(d => d.hunterShot?.hunterSeat === p.seat);
  if (dayShot?.hunterShot) return dayShot.hunterShot;
  const nightShot = Object.values(state.nightHistory || {}).find(n => n.hunterShot?.hunterSeat === p.seat);
  if (nightShot?.hunterShot) return nightShot.hunterShot;
  return null;
}

const HUNTER_TAGS: EvaluationTagRule[] = [
  { tag: "一枪致命", condition: (p, state) => {
    const shot = findHunterShot(p, state);
    if (!shot) return false;
    const target = state.players.find(pl => pl.seat === shot.targetSeat);
    return target?.role === "Werewolf";
  }, priority: 100 },
  { tag: "擦枪走火", condition: (p, state) => {
    const shot = findHunterShot(p, state);
    if (!shot) return false;
    const target = state.players.find(pl => pl.seat === shot.targetSeat);
    return target?.role !== "Werewolf";
  }, priority: 90 },
  { tag: "仁慈之枪", condition: (_, __, ctx) => !ctx.hunterShot, priority: 80 },
];

const WOLF_TAGS: EvaluationTagRule[] = [
  { tag: "孤狼啸月", condition: (p, state) => {
    const wolves = state.players.filter(pl => pl.role === "Werewolf");
    const aliveWolves = wolves.filter(w => w.alive);
    return state.winner === "wolf" && aliveWolves.length === 1 && aliveWolves[0].seat === p.seat;
  }, priority: 100 },
  { tag: "完美猎杀", condition: (_, state) => {
    const wolves = state.players.filter(pl => pl.role === "Werewolf");
    return state.winner === "wolf" && wolves.every(w => w.alive);
  }, priority: 95 },
  { tag: "演技大师", condition: (_, __, ctx) => ctx.gotBadgeByJump, priority: 90 },
  { tag: "绝命赌徒", condition: (_, __, ctx) => ctx.selfKnifeFirstNight, priority: 88 },
  { tag: "绝地反击", condition: (_, __, ctx) => ctx.survivedAfterCheck, priority: 85 },
  { tag: "出师未捷", condition: (p, state) => {
    const firstCheck = state.nightHistory?.[1]?.seerResult;
    return firstCheck?.targetSeat === p.seat && firstCheck?.isWolf;
  }, priority: 80 },
  { tag: "嗜血猎手", condition: (_, state) => state.winner === "wolf", priority: 50 },
  { tag: "长夜难明", condition: (_, state) => state.winner === "village", priority: 40 },
];

const VILLAGER_TAGS: EvaluationTagRule[] = [
  { tag: "明察秋毫", condition: (_, __, ctx) => ctx.voteAccuracy >= 0.5, priority: 80 },
  { tag: "随波逐流", condition: (_, __, ctx) => ctx.voteAccuracy > 0.35 && ctx.voteAccuracy < 0.5, priority: 70 },
  { tag: "全场划水", condition: (_, __, ctx) => ctx.voteAccuracy <= 0.35, priority: 60 },
];

function getTagRulesForRole(role: Role): EvaluationTagRule[] {
  switch (role) {
    case "Seer": return [...SEER_TAGS, ...VILLAGER_TAGS];
    case "Witch": return [...WITCH_TAGS, ...VILLAGER_TAGS];
    case "Guard": return [...GUARD_TAGS, ...VILLAGER_TAGS];
    case "Hunter": return [...HUNTER_TAGS, ...VILLAGER_TAGS];
    case "Werewolf": return WOLF_TAGS;
    default: return VILLAGER_TAGS;
  }
}

function calculateVoteAccuracy(player: Player, state: GameState): number {
  const voteHistory = state.voteHistory || {};
  let totalVotes = 0;
  let correctVotes = 0;

  for (const dayVotes of Object.values(voteHistory)) {
    const playerVote = dayVotes[player.playerId];
    if (playerVote !== undefined) {
      totalVotes++;
      const target = state.players.find(p => p.seat === playerVote);
      if (target?.role === "Werewolf") {
        correctVotes++;
      }
    }
  }

  return totalVotes > 0 ? correctVotes / totalVotes : 0;
}

function buildAnalysisContext(humanPlayer: Player, state: GameState): AnalysisContext {
  const nightHistory = state.nightHistory || {};
  const dayHistory = state.dayHistory || {};
  const totalDays = state.day;
  
  let humanDeathDay: number | null = null;
  let humanKills = 0;
  let humanSaves = 0;
  let humanChecksWolves = 0;
  let humanChecksVillagers = 0;
  let humanGuardsSuccess = 0;
  let humanGuardsTotal = 0;
  let wasFirstNightKilled = false;
  let witchSavedWolf = false;
  let witchPoisonedWolf = false;
  let witchPoisonedVillager = false;
  let sameSaveAndGuard = false;
  let selfKnifeFirstNight = false;
  let survivedAfterCheck = false;
  let hunterShot = false;
  let hunterShotWolf = false;
  let hunterShotVillager = false;

  for (const [dayStr, nightData] of Object.entries(nightHistory)) {
    const day = parseInt(dayStr, 10);
    
    if (humanPlayer.role === "Witch") {
      if (nightData.witchSave) {
        humanSaves++;
        // 检查是否救了狼人
        if (nightData.wolfTarget !== undefined) {
          const savedTarget = state.players.find(p => p.seat === nightData.wolfTarget);
          if (savedTarget?.role === "Werewolf") {
            witchSavedWolf = true;
          }
        }
      }
      if (nightData.witchPoison !== undefined) {
        humanKills++;
        // 检查毒的目标是狼人还是好人
        const poisonedTarget = state.players.find(p => p.seat === nightData.witchPoison);
        if (poisonedTarget) {
          if (poisonedTarget.role === "Werewolf") {
            witchPoisonedWolf = true;
          } else {
            witchPoisonedVillager = true;
          }
        }
      }
    }
    
    if (humanPlayer.role === "Seer" && nightData.seerResult) {
      if (nightData.seerResult.isWolf) humanChecksWolves++;
      else humanChecksVillagers++;
    }
    
    if (humanPlayer.role === "Guard" && nightData.guardTarget !== undefined) {
      humanGuardsTotal++;
      if (nightData.wolfTarget === nightData.guardTarget && !nightData.deaths?.some(d => d.seat === nightData.guardTarget)) {
        humanGuardsSuccess++;
      }
    }
    
    // 检查同守同救（奶穿）：守卫和女巫同时保护同一目标
    if (nightData.guardTarget !== undefined && nightData.witchSave && 
        nightData.wolfTarget === nightData.guardTarget) {
      sameSaveAndGuard = true;
    }
    
    if (nightData.deaths?.some(d => d.seat === humanPlayer.seat)) {
      if (day === 1) wasFirstNightKilled = true;
      if (!humanDeathDay) humanDeathDay = day;
    }
    
    // 检查狼人首夜自刀骗药
    if (day === 1 && humanPlayer.role === "Werewolf") {
      if (nightData.wolfTarget === humanPlayer.seat && nightData.witchSave) {
        selfKnifeFirstNight = true;
      }
    }
  }

  // 检查狼人被查杀后是否抗推存活（好人被投出）
  if (humanPlayer.role === "Werewolf") {
    for (const [dayStr, nightData] of Object.entries(nightHistory)) {
      const day = parseInt(dayStr, 10);
      if (nightData.seerResult?.targetSeat === humanPlayer.seat && nightData.seerResult?.isWolf) {
        // 被查杀后，检查当天是否有好人被投出
        const dayData = dayHistory[day];
        if (dayData?.executed) {
          const executedPlayer = state.players.find(p => p.seat === dayData.executed!.seat);
          if (executedPlayer && executedPlayer.role !== "Werewolf") {
            survivedAfterCheck = true;
            break;
          }
        }
      }
    }
  }

  if (!humanPlayer.alive && !humanDeathDay) {
    for (const [dayStr, dayData] of Object.entries(dayHistory)) {
      if (dayData.executed?.seat === humanPlayer.seat) {
        humanDeathDay = parseInt(dayStr, 10);
        break;
      }
      if (dayData.hunterShot?.targetSeat === humanPlayer.seat) {
        humanDeathDay = parseInt(dayStr, 10);
        break;
      }
    }
  }
  // 再次兜底：检查 nightHistory 中的猎人开枪
  if (!humanPlayer.alive && !humanDeathDay) {
    for (const [dayStr, nightData] of Object.entries(nightHistory)) {
      if (nightData.hunterShot?.targetSeat === humanPlayer.seat) {
        humanDeathDay = parseInt(dayStr, 10);
        break;
      }
    }
  }

  // 检查猎人是否开枪及目标（dayHistory + nightHistory）
  if (humanPlayer.role === "Hunter") {
    let shotTargetSeat: number | undefined;
    for (const dayData of Object.values(dayHistory)) {
      if (dayData.hunterShot?.hunterSeat === humanPlayer.seat) {
        hunterShot = true;
        shotTargetSeat = dayData.hunterShot.targetSeat;
        break;
      }
    }
    if (!hunterShot) {
      for (const nightData of Object.values(nightHistory)) {
        if (nightData.hunterShot?.hunterSeat === humanPlayer.seat) {
          hunterShot = true;
          shotTargetSeat = nightData.hunterShot.targetSeat;
          break;
        }
      }
    }
    if (shotTargetSeat !== undefined) {
      const shotTarget = state.players.find(p => p.seat === shotTargetSeat);
      if (shotTarget?.role === "Werewolf") {
        hunterShotWolf = true;
      } else if (shotTarget) {
        hunterShotVillager = true;
      }
    }
  }

  const gotBadgeByJump = humanPlayer.role === "Werewolf" && state.badge.holderSeat === humanPlayer.seat;

  return {
    humanPlayer,
    totalDays,
    humanDeathDay,
    humanKills,
    humanSaves,
    humanChecks: { wolves: humanChecksWolves, villagers: humanChecksVillagers },
    humanGuards: { success: humanGuardsSuccess, total: humanGuardsTotal },
    voteAccuracy: calculateVoteAccuracy(humanPlayer, state),
    wasFirstNightKilled,
    gotBadgeByJump,
    witchSavedWolf,
    witchPoisonedWolf,
    witchPoisonedVillager,
    sameSaveAndGuard,
    selfKnifeFirstNight,
    survivedAfterCheck,
    hunterShot,
    hunterShotWolf,
    hunterShotVillager,
  };
}

function evaluateTag(player: Player, state: GameState, ctx: AnalysisContext): string[] {
  const rules = getTagRulesForRole(player.role);
  const matchedTags = rules
    .filter(rule => rule.condition(player, state, ctx))
    .sort((a, b) => b.priority - a.priority);
  
  return matchedTags.length > 0 ? [matchedTags[0].tag] : ["待评估"];
}

function parseDeathCause(reason: string): DeathCause {
  switch (reason) {
    case "wolf": return "killed";
    case "poison": return "poisoned";
    case "milk": return "milk";
    default: return "killed";
  }
}

function buildPlayerSnapshots(state: GameState): PlayerSnapshot[] {
  return state.players.map(player => {
    let deathDay: number | undefined;
    let deathCause: DeathCause | undefined;

    // Check nightHistory for deaths
    for (const [dayStr, nightData] of Object.entries(state.nightHistory || {})) {
      const day = parseInt(dayStr, 10);
      
      // Check deaths array first
      const death = nightData.deaths?.find(d => d.seat === player.seat);
      if (death) {
        deathDay = day;
        deathCause = parseDeathCause(death.reason);
        break;
      }
      
      // Fallback: check wolfTarget if not saved by witch and not protected by guard
      if (!deathDay && nightData.wolfTarget === player.seat) {
        const wasSaved = nightData.witchSave === true;
        const wasProtected = nightData.guardTarget === player.seat;
        if (!wasSaved && !wasProtected) {
          deathDay = day;
          deathCause = "killed";
        }
      }
      
      // Check witch poison
      if (!deathDay && nightData.witchPoison === player.seat) {
        deathDay = day;
        deathCause = "poisoned";
      }
      
      // Check hunter shot in nightHistory
      if (!deathDay && nightData.hunterShot?.targetSeat === player.seat) {
        deathDay = day;
        deathCause = "shot";
      }
    }

    // Check dayHistory for executions and hunter shots
    if (!deathDay) {
      for (const [dayStr, dayData] of Object.entries(state.dayHistory || {})) {
        if (dayData.executed?.seat === player.seat) {
          deathDay = parseInt(dayStr, 10);
          deathCause = "exiled";
          break;
        }
        if (dayData.hunterShot?.targetSeat === player.seat) {
          deathDay = parseInt(dayStr, 10);
          deathCause = "shot";
          break;
        }
      }
    }

    // Normalize seat to 0-indexed for consistent handling
    // player.seat should always be 0-indexed from game-master initialization
    const normalizedSeat = player.seat;
    
    return {
      playerId: player.playerId,
      seat: normalizedSeat,
      name: player.displayName,
      avatar: player.avatarSeed || player.displayName,
      role: player.role,
      alignment: ROLE_ALIGNMENT[player.role],
      isAlive: player.alive,
      deathDay,
      deathCause,
      isSheriff: state.badge.holderSeat === player.seat,
      isHumanPlayer: player.isHuman,
    };
  });
}

function buildRoundStates(state: GameState, snapshots: PlayerSnapshot[]): RoundState[] {
  const rounds: RoundState[] = [];
  
  // 从投票记录中计算第1天的原始当选者
  const badgeVotes = state.badge.history?.[1] || {};
  const voteCounts: Record<number, number> = {};
  for (const targetSeat of Object.values(badgeVotes)) {
    const seat = Number(targetSeat);
    voteCounts[seat] = (voteCounts[seat] || 0) + 1;
  }
  const sortedByVotes = Object.entries(voteCounts)
    .map(([seat, count]) => ({ seat: Number(seat), count }))
    .sort((a, b) => b.count - a.count);
  // 原始当选者是得票最高的人
  const originalElectedSeat = sortedByVotes.length > 0 
    ? sortedByVotes[0].seat 
    : state.badge.holderSeat;
  
  // 第0天（开局）：没有警长
  rounds.push({
    day: 0,
    phase: "night",
    sheriffSeat: undefined,
    aliveCount: {
      village: snapshots.filter(p => p.alignment === "village").length,
      wolf: snapshots.filter(p => p.alignment === "wolf").length,
    },
    players: snapshots.map(p => ({ ...p, isAlive: true, isSheriff: false, deathDay: undefined, deathCause: undefined })),
  });

  // 跟踪当前警长座位
  let currentSheriffSeat: number | null = null;
  
  for (let day = 1; day <= state.day; day++) {
    // 第1天：使用原始当选者
    if (day === 1 && originalElectedSeat !== null) {
      currentSheriffSeat = originalElectedSeat;
    }
    
    // 检查当前警长是否在这一天死亡
    const sheriffSnapshot = currentSheriffSeat !== null 
      ? snapshots.find(p => p.seat === currentSheriffSeat) 
      : null;
    const sheriffDiedThisDay = sheriffSnapshot?.deathDay === day;
    
    // 如果警长在这天死亡，检查是否转让（最终警长不同于原警长）
    if (sheriffDiedThisDay && state.badge.holderSeat !== null && state.badge.holderSeat !== currentSheriffSeat) {
      // 检查新警长是否在这天或之后还活着
      const newSheriff = snapshots.find(p => p.seat === state.badge.holderSeat);
      if (newSheriff && (!newSheriff.deathDay || newSheriff.deathDay > day)) {
        currentSheriffSeat = state.badge.holderSeat;
      }
    }
    
    const playersAtDay = snapshots.map(p => ({
      ...p,
      isAlive: !p.deathDay || p.deathDay > day,
      isSheriff: p.seat === currentSheriffSeat,
    }));

    const aliveAtDay = playersAtDay.filter(p => p.isAlive);
    
    rounds.push({
      day,
      phase: "day",
      sheriffSeat: currentSheriffSeat ?? undefined,
      aliveCount: {
        village: aliveAtDay.filter(p => p.alignment === "village").length,
        wolf: aliveAtDay.filter(p => p.alignment === "wolf").length,
      },
      players: playersAtDay,
    });
  }

  return rounds;
}

function parseSummaryBullets(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(item => String(item));
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (obj.bullets && Array.isArray(obj.bullets)) {
      return obj.bullets.map((item: unknown) => String(item));
    }
    if (obj.summary && typeof obj.summary === "string") {
      return [obj.summary];
    }
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(item => String(item));
      if (parsed?.bullets && Array.isArray(parsed.bullets)) {
        return parsed.bullets.map((item: unknown) => String(item));
      }
      if (parsed?.summary && typeof parsed.summary === "string") {
        return [parsed.summary];
      }
    } catch {
      return [raw];
    }
  }
  return [];
}

interface AISpeechSummaryResult {
  discussion: Record<number, PlayerSpeech[]>;
  election: Record<number, PlayerSpeech[]>;
  daySummaries: Record<number, string>;
}

async function generateAISpeechSummaries(
  state: GameState,
  model: string
): Promise<AISpeechSummaryResult> {
  const result: AISpeechSummaryResult = {
    discussion: {},
    election: {},
    daySummaries: {},
  };
  
  // Collect speeches by day, phase, and seat
  const speechesByDayPhase: Record<number, { election: Record<number, string[]>; discussion: Record<number, string[]> }> = {};
  
  for (const m of state.messages) {
    if (m.isSystem || !m.day || !m.content?.trim()) continue;
    const player = state.players.find(p => p.playerId === m.playerId);
    if (!player) continue;
    const seat = player.seat + 1;
    const day = m.day;
    
    if (!speechesByDayPhase[day]) {
      speechesByDayPhase[day] = { election: {}, discussion: {} };
    }
    
    const isElection = m.phase === "DAY_BADGE_SPEECH";
    const phaseKey = isElection ? "election" : "discussion";
    
    if (!speechesByDayPhase[day][phaseKey][seat]) {
      speechesByDayPhase[day][phaseKey][seat] = [];
    }
    speechesByDayPhase[day][phaseKey][seat].push(m.content.trim());
  }
  
  // Generate AI summaries for each day
  for (const day of Object.keys(speechesByDayPhase).map(Number).sort((a, b) => a - b)) {
    const dayData = speechesByDayPhase[day];
    
    // Build combined prompt for all phases
    const electionText = Object.keys(dayData.election).length > 0
      ? Object.entries(dayData.election)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([seat, speeches]) => {
            const player = state.players.find(p => p.seat === parseInt(seat) - 1);
            return `${seat}号 ${player?.displayName || ""}:\n${speeches.join("\n")}`;
          })
          .join("\n\n")
      : "";
    
    const discussionText = Object.keys(dayData.discussion).length > 0
      ? Object.entries(dayData.discussion)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([seat, speeches]) => {
            const player = state.players.find(p => p.seat === parseInt(seat) - 1);
            return `${seat}号 ${player?.displayName || ""}:\n${speeches.join("\n")}`;
          })
          .join("\n\n")
      : "";
    
    if (!electionText && !discussionText) continue;
    
    const prompt = `请分析以下狼人杀游戏第${day}天的发言记录，生成：
1. 每个玩家的发言摘要（第一人称，1-2句话）
2. 当天发言阶段的整体概括（一段话，50-80字）

${electionText ? `【竞选阶段发言】\n${electionText}\n\n` : ""}${discussionText ? `【讨论阶段发言】\n${discussionText}` : ""}

要求：
- 玩家摘要必须是第一人称（用"我"开头），简洁有力
- 如果玩家只说"过"或无实质内容，摘要直接返回"过"
- 当天概括必须用座位号代替玩家名（如"7号"而非"7号明哥"），一段话概括核心争议和投票走向

请返回JSON格式：
{
  "electionSummaries": [{"seat": 1, "content": "第一人称摘要"}],
  "discussionSummaries": [{"seat": 1, "content": "第一人称摘要"}],
  "daySummary": "一段话概括（50-80字，只用座位号）"
}`;

    try {
      const response = await generateJSON<{
        electionSummaries?: Array<{ seat: number; content: string }>;
        discussionSummaries?: Array<{ seat: number; content: string }>;
        daySummary?: string;
      }>({
        model,
        messages: [
          { role: "system", content: "你是狼人杀游戏记录员，擅长分析场上局势和压缩玩家发言。" },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2500,
      });
      
      if (response?.electionSummaries && Array.isArray(response.electionSummaries)) {
        result.election[day] = response.electionSummaries
          .filter(s => s.seat && s.content)
          .map(s => ({ seat: s.seat, content: s.content }));
      }
      
      if (response?.discussionSummaries && Array.isArray(response.discussionSummaries)) {
        result.discussion[day] = response.discussionSummaries
          .filter(s => s.seat && s.content)
          .map(s => ({ seat: s.seat, content: s.content }));
      }
      
      if (response?.daySummary) {
        result.daySummaries[day] = response.daySummary;
      }
    } catch (error) {
      console.error(`AI speech summary generation failed for day ${day}:`, error);
      // Fallback
      if (Object.keys(dayData.discussion).length > 0) {
        result.discussion[day] = extractSpeeches(state, day);
      }
    }
  }
  
  return result;
}

function buildTimeline(state: GameState, aiSummaries?: AISpeechSummaryResult): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (let day = 1; day <= state.day; day++) {
    const nightData = state.nightHistory?.[day];
    const dayData = state.dayHistory?.[day];
    const summaryBullets = parseSummaryBullets(state.dailySummaries?.[day]);

    const nightEvents: NightEvent[] = [];
    
    if (nightData) {
      if (nightData.wolfTarget !== undefined) {
        nightEvents.push({
          type: "kill",
          source: "狼人",
          target: `${nightData.wolfTarget + 1}号`,
          blocked: nightData.guardTarget === nightData.wolfTarget,
        });
      }
      
      if (nightData.witchSave && nightData.wolfTarget !== undefined) {
        nightEvents.push({
          type: "save",
          source: "女巫",
          target: `${nightData.wolfTarget + 1}号`,
        });
      }
      
      if (nightData.witchPoison !== undefined) {
        nightEvents.push({
          type: "poison",
          source: "女巫",
          target: `${nightData.witchPoison + 1}号`,
        });
      }
      
      if (nightData.seerResult) {
        nightEvents.push({
          type: "check",
          source: "预言家",
          target: `${nightData.seerResult.targetSeat + 1}号`,
          result: nightData.seerResult.isWolf ? "狼人" : "好人",
        });
      }
      
      if (nightData.guardTarget !== undefined) {
        nightEvents.push({
          type: "guard",
          source: "守卫",
          target: `${nightData.guardTarget + 1}号`,
        });
      }
    }

    const dayEvents: DayEvent[] = [];
    
    if (dayData?.executed) {
      const voteHistory = state.voteHistory?.[day] || {};
      const sheriffPlayerId = state.badge.holderSeat !== null
        ? state.players.find(p => p.seat === state.badge.holderSeat)?.playerId
        : null;
      const votes: VoteRecord[] = Object.entries(voteHistory).map(([oderId, targetSeat]) => {
        const voter = state.players.find(p => p.playerId === oderId);
        return {
          voterSeat: (voter?.seat ?? -1) + 1,
          targetSeat: (targetSeat as number) + 1,
        };
      });

      // 计算加权票数（警长1.5票）
      let weightedVoteCount = 0;
      for (const [oderId, targetSeat] of Object.entries(voteHistory)) {
        if (targetSeat === dayData.executed.seat) {
          weightedVoteCount += oderId === sheriffPlayerId ? 1.5 : 1;
        }
      }

      dayEvents.push({
        type: "exile",
        target: `${dayData.executed.seat + 1}号`,
        voteCount: weightedVoteCount,
        votes,
      });
    }

    // 猎人开枪信息（可能在夜晚或白天触发）
    const hunterShot = dayData?.hunterShot || nightData?.hunterShot;
    if (hunterShot) {
      const { hunterSeat, targetSeat } = hunterShot;
      if (targetSeat !== null && targetSeat !== undefined) {
        dayEvents.push({
          type: "hunter_shot",
          target: `${hunterSeat + 1}号 → ${targetSeat + 1}号`,
        });
      } else {
        dayEvents.push({
          type: "hunter_shot",
          target: `${hunterSeat + 1}号选择不开枪`,
        });
      }
    }

    // Build day phases for better organization
    const dayPhases: DayPhase[] = [];
    
    if (day === 1 && state.badge.holderSeat !== null) {
      const badgeVotes = state.badge.history?.[1] || {};
      const votes: VoteRecord[] = Object.entries(badgeVotes).map(([voterId, targetSeat]) => {
        const voter = state.players.find(p => p.playerId === voterId);
        return {
          voterSeat: (voter?.seat ?? -1) + 1,
          targetSeat: (targetSeat as number) + 1,
        };
      });

      // 从投票记录中计算原始当选者（得票最高的人，可能与当前警长不同，因为警长可以转让）
      const voteCounts: Record<number, number> = {};
      for (const targetSeat of Object.values(badgeVotes)) {
        const seat = Number(targetSeat);
        voteCounts[seat] = (voteCounts[seat] || 0) + 1;
      }
      const sortedCandidates = Object.entries(voteCounts)
        .map(([seat, count]) => ({ seat: Number(seat), count }))
        .sort((a, b) => b.count - a.count);
      // 原始当选者是得票最高的人，如果没有投票记录则使用当前警长
      const originalElectedSeat = sortedCandidates.length > 0 
        ? sortedCandidates[0].seat 
        : state.badge.holderSeat;
      const originalElectedVoteCount = sortedCandidates.length > 0 
        ? sortedCandidates[0].count 
        : 0;

      // 从 badge.signup 中获取候选人（signup[playerId] === true 的玩家）
      const signupCandidates = state.players
        .filter(p => state.badge.signup?.[p.playerId] === true)
        .map(p => p.seat);
      
      // 如果 signup 为空，尝试从投票记录中提取被投票的玩家座位作为后备
      const votedSeats = Object.values(badgeVotes) as number[];
      
      // 合并候选人：signup 中的候选人 + 被投票的玩家 + 原始当选者
      const allCandidateSeats = new Set([
        ...signupCandidates,
        ...votedSeats,
        originalElectedSeat,
      ]);
      const candidateSeats = [...allCandidateSeats].sort((a, b) => a - b);

      // Use AI summaries for election speeches if available
      const electionSpeeches = aiSummaries?.election?.[day] ?? extractSpeechesFromMessages(state, {
        day,
        phases: ["DAY_BADGE_SPEECH"],
      });

      // Election phase - 使用原始当选者信息
      const electionSummary = candidateSeats.length > 0
        ? `${candidateSeats.map(s => `${s + 1}号`).join("、")}上警竞选，${originalElectedSeat + 1}号当选警长`
        : `${originalElectedSeat + 1}号当选警长`;
      
      // 如果没有投票记录但有当选者，说明是自动当选（单人竞选）
      const isAutoElected = Object.keys(badgeVotes).length === 0;
      
      dayPhases.push({
        type: "election",
        summary: electionSummary,
        speeches: electionSpeeches.length > 0 ? electionSpeeches : undefined,
        event: {
          type: "badge",
          target: `${originalElectedSeat + 1}号`,
          voteCount: isAutoElected ? undefined : originalElectedVoteCount,
          votes: isAutoElected ? undefined : votes,
        },
      });

      dayEvents.push({
        type: "badge",
        target: `${originalElectedSeat + 1}号`,
        voteCount: isAutoElected ? undefined : originalElectedVoteCount,
        votes: isAutoElected ? undefined : votes,
      });
    }

    // Discussion phase with per-player speech summaries (prefer AI summaries)
    const speeches = aiSummaries?.discussion?.[day] ?? extractSpeeches(state, day);
    // Use AI-generated day summary if available, otherwise use simple description
    // 如果是最后一天且游戏已结束但没有放逐，显示游戏结果
    const isLastDayGameEnded = day === state.day && state.winner !== null && !dayData?.executed;
    const gameResultSummary = state.winner === "wolf" ? "狼人阵营获胜" : "好人阵营获胜";
    const discussionSummary = aiSummaries?.daySummaries?.[day] 
      ?? (dayData?.executed
        ? `各玩家发言讨论后，${dayData.executed.seat + 1}号被放逐`
        : isLastDayGameEnded
          ? gameResultSummary
          : "各玩家发言讨论");
    
    // 始终创建讨论阶段（即使没有 speeches），包含放逐事件和猎人开枪事件
    const exileEvent = dayEvents.find(e => e.type === "exile");
    const hunterEvent = dayEvents.find(e => e.type === "hunter_shot");
    dayPhases.push({
      type: "discussion",
      summary: discussionSummary,
      speeches: speeches.length > 0 ? speeches : undefined,
      event: exileEvent,
      hunterEvent,
    });

    entries.push({
      day,
      summary: summaryBullets.join("；") || `第${day}天`,
      nightEvents,
      dayEvents,
      dayPhases: dayPhases.length > 0 ? dayPhases : undefined,
      speeches,
    });
  }

  return entries;
}

function calculateRadarStats(player: Player, state: GameState, ctx: AnalysisContext): PersonalStats["radarStats"] {
  const survivalScore = ctx.humanDeathDay 
    ? Math.round((ctx.humanDeathDay / ctx.totalDays) * 100)
    : 100;

  const isWolf = player.role === "Werewolf";

  if (isWolf) {
    // 狼人隐藏价值：基于伪装和欺骗能力
    let hideScore = 50; // 基础分
    
    // 骗到警徽，说明伪装成功
    if (ctx.gotBadgeByJump) {
      hideScore += 30;
    }
    
    // 首夜自刀骗药，高风险高收益操作
    if (ctx.selfKnifeFirstNight) {
      hideScore += 15;
    }
    
    // 被查杀后抗推存活，说明演技高超
    if (ctx.survivedAfterCheck) {
      hideScore += 20;
    }
    
    // 游戏胜利加分
    if (state.winner === "wolf") {
      hideScore += 15;
    }
    
    // 存活到最后额外加分
    if (player.alive) {
      hideScore += 10;
    }
    
    hideScore = Math.max(10, Math.min(100, hideScore));
    
    return {
      logic: 50,
      speech: 50,
      survival: survivalScore,
      skillOrHide: hideScore,
      voteOrTicket: Math.round((1 - ctx.voteAccuracy) * 100),
    };
  }

  let skillValue = 50;
  
  if (player.role === "Seer") {
    // 预言家技能价值：查验结果的有效性
    let seerScore = 40; // 基础分（未查验或未查到狼）
    const totalChecks = ctx.humanChecks.wolves + ctx.humanChecks.villagers;
    
    if (ctx.wasFirstNightKilled) {
      seerScore = 30; // 首夜被刀，技能价值受限
    } else if (totalChecks > 0) {
      // 每查到一个狼 +25，最高不超过100
      seerScore = 40 + ctx.humanChecks.wolves * 25;
      // 如果只查到村民，略微加分（至少在努力验人）
      if (ctx.humanChecks.wolves === 0 && ctx.humanChecks.villagers > 0) {
        seerScore = 50;
      }
    }
    skillValue = Math.max(10, Math.min(100, seerScore));
    
  } else if (player.role === "Witch") {
    // 女巫技能价值：基于技能使用的正确性
    let witchScore = 50; // 基础分（未使用技能）
    
    // 解药评估
    if (ctx.humanSaves > 0) {
      if (ctx.witchSavedWolf) {
        witchScore -= 20; // 救了狼人，严重失误
      } else {
        witchScore += 25; // 正确救人
      }
    }
    
    // 毒药评估
    if (ctx.humanKills > 0) {
      if (ctx.witchPoisonedWolf) {
        witchScore += 30; // 毒中狼人，高价值
      } else if (ctx.witchPoisonedVillager) {
        witchScore -= 35; // 毒了好人，严重失误
      }
    }
    
    // 同守同救（奶穿）额外惩罚
    if (ctx.sameSaveAndGuard) {
      witchScore -= 15;
    }
    
    skillValue = Math.max(10, Math.min(100, witchScore));
    
  } else if (player.role === "Guard") {
    // 守卫技能价值：守护成功次数与总守护次数的比例
    let guardScore = 40; // 基础分
    
    if (ctx.sameSaveAndGuard) {
      guardScore = 15; // 同守同救（奶穿），严重失误
    } else if (ctx.humanGuards.total > 0) {
      if (ctx.humanGuards.success >= 2) {
        guardScore = 100; // 多次守护成功
      } else if (ctx.humanGuards.success === 1) {
        guardScore = 80; // 单次守护成功
      } else {
        // 守护了但没成功，根据守护次数给基础分
        guardScore = Math.min(60, 40 + ctx.humanGuards.total * 5);
      }
    }
    skillValue = Math.max(10, Math.min(100, guardScore));
    
  } else if (player.role === "Hunter") {
    // 猎人技能价值：是否开枪及目标
    let hunterScore = 50; // 基础分（未开枪）
    
    if (ctx.hunterShot) {
      if (ctx.hunterShotWolf) {
        hunterScore = 100; // 带走狼人，完美发挥
      } else if (ctx.hunterShotVillager) {
        hunterScore = 20; // 带走好人，严重失误
      } else {
        hunterScore = 60; // 开枪但目标不明
      }
    } else if (!player.alive) {
      // 死了但没开枪（可能被毒死）
      hunterScore = 30;
    }
    skillValue = Math.max(10, Math.min(100, hunterScore));
    
  } else if (player.role === "Villager") {
    // 村民技能价值：基于投票准确率（村民没有技能，用投票体现价值）
    skillValue = Math.max(20, Math.min(100, Math.round(ctx.voteAccuracy * 100) + 20));
  }

  return {
    logic: 50,
    speech: 50,
    survival: survivalScore,
    skillOrHide: skillValue,
    voteOrTicket: Math.round(ctx.voteAccuracy * 100),
  };
}

function calculateTotalScore(radarStats: PersonalStats["radarStats"]): number {
  const weights = [0.25, 0.2, 0.15, 0.25, 0.15];
  const values = [radarStats.logic, radarStats.speech, radarStats.survival, radarStats.skillOrHide, radarStats.voteOrTicket];
  return Math.round(values.reduce((sum, v, i) => sum + v * weights[i], 0));
}

export async function generateGameAnalysis(
  state: GameState,
  model?: string,
  durationSeconds?: number
): Promise<GameAnalysisData> {
  const resolvedModel = model || getSummaryModel();
  // In spectator mode (纯斗蛐蛐), use player 1 (seat 0) as the focal player for analysis
  const humanPlayer = state.players.find(p => p.isHuman) || state.players.find(p => p.seat === 0);
  if (!humanPlayer) {
    throw new Error("No player found in game state");
  }

  const snapshots = buildPlayerSnapshots(state);
  const roundStates = buildRoundStates(state, snapshots);
  const ctx = buildAnalysisContext(humanPlayer, state);
  
  // Generate AI speech summaries for each day
  const aiSpeechSummaries = await generateAISpeechSummaries(state, resolvedModel);
  const timeline = buildTimeline(state, aiSpeechSummaries);

  const tags = evaluateTag(humanPlayer, state, ctx);
  const aiData = await generateAIAnalysisData(state, humanPlayer, resolvedModel);
  
  const humanSpeeches = state.messages
    .filter(m => m.playerName === humanPlayer.displayName && !m.isSystem)
    .map(m => m.content);
  const hasSpeeches = humanSpeeches.length > 0;
  
  const baseRadarStats = calculateRadarStats(humanPlayer, state, ctx);
  const radarStats = {
    ...baseRadarStats,
    logic: aiData.speechScores?.logic ?? baseRadarStats.logic,
    speech: aiData.speechScores?.clarity ?? baseRadarStats.speech,
  };
  const totalScore = calculateTotalScore(radarStats);

  const personalStats: PersonalStats = {
    role: humanPlayer.role,
    userName: humanPlayer.displayName,
    avatar: humanPlayer.avatarSeed || humanPlayer.displayName,
    alignment: ROLE_ALIGNMENT[humanPlayer.role],
    tags,
    radarStats,
    highlightQuote: hasSpeeches ? aiData.highlightQuote : "",
    totalScore,
  };

  return {
    gameId: state.gameId,
    timestamp: Date.now(),
    duration: durationSeconds ?? 0,
    playerCount: state.players.length,
    result: state.winner === "wolf" ? "wolf_win" : "village_win",
    awards: aiData.awards,
    timeline,
    players: snapshots,
    roundStates,
    personalStats,
    reviews: aiData.reviews,
  };
}

interface AIAnalysisResult {
  awards: {
    mvp: PlayerAward;
    svp: PlayerAward;
  };
  highlightQuote: string;
  reviews: PlayerReview[];
  speechScores: {
    logic: number;
    clarity: number;
  };
}

async function generateAIAnalysisData(
  state: GameState,
  humanPlayer: Player,
  model: string
): Promise<AIAnalysisResult> {
  const winnerSide = state.winner === "wolf" ? "狼人" : "好人";
  const loserSide = state.winner === "wolf" ? "好人" : "狼人";
  
  const humanAlignment = ROLE_ALIGNMENT[humanPlayer.role];
  const humanAlignmentText = humanAlignment === "wolf" ? "狼人阵营" : "好人阵营";
  
  // 明确区分队友和对手
  const allies = state.players.filter(p => 
    p.playerId !== humanPlayer.playerId && 
    ROLE_ALIGNMENT[p.role] === humanAlignment
  );
  const enemies = state.players.filter(p => 
    ROLE_ALIGNMENT[p.role] !== humanAlignment
  );
  
  const alliesText = allies.length > 0 
    ? allies.map(p => `${p.seat + 1}号 ${p.displayName}`).join("、")
    : "无";
  const enemiesText = enemies.length > 0
    ? enemies.map(p => `${p.seat + 1}号 ${p.displayName}`).join("、")
    : "无";

  const playersSummary = state.players.map(p => 
    `${p.seat + 1}号 ${p.displayName}（${p.role}${p.alive ? "" : "，已出局"}）`
  ).join("\n");

  const historyText = Object.entries(state.dailySummaries || {})
    .map(([day, bullets]) => `第${day}天：${bullets.join("；")}`)
    .join("\n");

  const humanMessages = state.messages
    .filter(m => m.playerName === humanPlayer.displayName && !m.isSystem)
    .map(m => m.content);
  
  const allHumanSpeeches = humanMessages.join("\n");

  const prompt = `你是狼人杀游戏分析师。请根据以下游戏信息生成分析数据。

## 游戏结果
${winnerSide}阵营获胜

## 玩家列表
${playersSummary}

## 被评价玩家信息
- 玩家：${humanPlayer.displayName}（${humanPlayer.seat + 1}号）
- 角色：${humanPlayer.role}
- 阵营：${humanAlignmentText}
- 队友（同阵营）：${alliesText}
- 对手（敌对阵营）：${enemiesText}

## 游戏历史
${historyText}

## 玩家（${humanPlayer.displayName}）的全部发言
${allHumanSpeeches || "（无发言记录）"}

请输出JSON格式的分析数据：
{
  "awards": {
    "mvp": {
      "playerId": "获胜方MVP的玩家ID",
      "playerName": "玩家名称",
      "reason": "简短评价（15字内）",
      "avatar": "玩家的avatarSeed（用于生成头像）",
      "role": "角色英文名"
    },
    "svp": {
      "playerId": "失败方SVP的玩家ID",
      "playerName": "玩家名称",
      "reason": "简短评价（15字内）",
      "avatar": "玩家的avatarSeed（用于生成头像）",
      "role": "角色英文名"
    }
  },
  "highlightQuote": "从玩家发言中选取最有逻辑或最精彩的一句话（原文）",
  "reviews": [
    {
      "fromPlayerId": "评价者ID",
      "fromCharacterName": "评价者名称",
      "avatar": "评价者的avatarSeed（用于生成头像）",
      "content": "以该角色口吻对${humanPlayer.displayName}的一句话评价（20字内）",
      "relation": "ally或enemy",
      "role": "评价者角色英文名"
    }
  ],
  "speechScores": {
    "logic": "0-100的整数，评估玩家发言的逻辑严密度",
    "clarity": "0-100的整数，评估玩家发言的表达清晰度"
  }
}

要求：
1. MVP从${winnerSide}阵营选，SVP从${loserSide}阵营选
2. 【重要】优先考虑将玩家「${humanPlayer.displayName}」评为MVP或SVP（如果他在对应阵营且表现不差）
3. reviews必须包含2条队友评价（ally，从「${alliesText}」中选择）和1条对手评价（enemy，从「${enemiesText}」中选择）
4. 【重要】队友是指同一阵营的玩家，对手是指敌对阵营的玩家。${humanAlignmentText}的队友只能是${humanAlignmentText}的其他成员！
5. highlightQuote必须是玩家的原话，从上面的发言记录中选取，如果无发言记录则返回空字符串""
6. 角色名使用英文：Werewolf, Seer, Witch, Hunter, Guard, Villager
7. speechScores评分标准：
   - logic（逻辑严密度）：分析发言是否有逻辑漏洞、推理是否合理
   - clarity（发言清晰度）：分析表达是否清晰、是否容易理解
   - 如果无发言记录，两项均给50分`;

  try {
    const result = await generateJSON<AIAnalysisResult>({
      model,
      messages: [
        { role: "system", content: "你是专业的狼人杀游戏分析师，擅长评价玩家表现并生成有趣的复盘内容。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    // 校正 AI 返回的 playerId 和 avatar，确保与实际玩家数据匹配
    const correctedResult = correctAIResult(result, state);
    return correctedResult;
  } catch (error) {
    console.error("AI analysis generation failed:", error);
    return generateFallbackAIData(state, humanPlayer);
  }
}

function correctAIResult(result: AIAnalysisResult, state: GameState): AIAnalysisResult {
  const findPlayerByName = (name: string) => 
    state.players.find(p => p.displayName === name || p.playerId === name);

  // 校正 MVP
  const mvpPlayer = findPlayerByName(result.awards.mvp.playerName) || 
                    findPlayerByName(result.awards.mvp.playerId);
  if (mvpPlayer) {
    result.awards.mvp.playerId = mvpPlayer.playerId;
    result.awards.mvp.avatar = mvpPlayer.avatarSeed || mvpPlayer.displayName;
  }

  // 校正 SVP
  const svpPlayer = findPlayerByName(result.awards.svp.playerName) || 
                    findPlayerByName(result.awards.svp.playerId);
  if (svpPlayer) {
    result.awards.svp.playerId = svpPlayer.playerId;
    result.awards.svp.avatar = svpPlayer.avatarSeed || svpPlayer.displayName;
  }

  // 校正 reviews
  result.reviews = result.reviews.map(review => {
    const reviewer = findPlayerByName(review.fromCharacterName) || 
                     findPlayerByName(review.fromPlayerId);
    if (reviewer) {
      return {
        ...review,
        fromPlayerId: reviewer.playerId,
        avatar: reviewer.avatarSeed || reviewer.displayName,
      };
    }
    return review;
  });

  return result;
}

function generateFallbackAIData(state: GameState, humanPlayer: Player): AIAnalysisResult {
  const winnerPlayers = state.players.filter(p => 
    (state.winner === "wolf" && p.role === "Werewolf") ||
    (state.winner === "village" && p.role !== "Werewolf")
  );
  const loserPlayers = state.players.filter(p => 
    (state.winner === "wolf" && p.role !== "Werewolf") ||
    (state.winner === "village" && p.role === "Werewolf")
  );

  const mvpPlayer = winnerPlayers.find(p => p.alive) || winnerPlayers[0];
  const svpPlayer = loserPlayers.find(p => p.alive) || loserPlayers[0];

  const humanAlignment = ROLE_ALIGNMENT[humanPlayer.role];
  
  // 基于阵营判断队友和对手，而非角色
  const allies = state.players.filter(p => 
    p.playerId !== humanPlayer.playerId && 
    ROLE_ALIGNMENT[p.role] === humanAlignment
  ).slice(0, 2);

  const enemies = state.players.filter(p => 
    ROLE_ALIGNMENT[p.role] !== humanAlignment
  ).slice(0, 1);

  return {
    awards: {
      mvp: {
        playerId: mvpPlayer?.playerId || "unknown",
        playerName: mvpPlayer?.displayName || "MVP",
        reason: state.winner === "wolf" ? "带领狼队获胜" : "守护村庄胜利",
        avatar: mvpPlayer?.avatarSeed || mvpPlayer?.displayName || "MVP",
        role: mvpPlayer?.role || "Villager",
      },
      svp: {
        playerId: svpPlayer?.playerId || "unknown",
        playerName: svpPlayer?.displayName || "SVP",
        reason: "虽败犹荣",
        avatar: svpPlayer?.avatarSeed || svpPlayer?.displayName || "SVP",
        role: svpPlayer?.role || "Villager",
      },
    },
    highlightQuote: "这局游戏很精彩！",
    reviews: [
      ...allies.map(p => ({
        fromPlayerId: p.playerId,
        fromCharacterName: p.displayName,
        avatar: p.avatarSeed || p.displayName,
        content: "和你配合很默契！",
        relation: "ally" as const,
        role: p.role,
      })),
      ...enemies.map(p => ({
        fromPlayerId: p.playerId,
        fromCharacterName: p.displayName,
        avatar: p.avatarSeed || p.displayName,
        content: "你是个难缠的对手。",
        relation: "enemy" as const,
        role: p.role,
      })),
    ],
    speechScores: {
      logic: 50,
      clarity: 50,
    },
  };
}

export function extractSpeeches(state: GameState, day: number): PlayerSpeech[] {
  // First try dailySummaryFacts for structured per-player speech info
  const facts = state.dailySummaryFacts?.[day];
  if (facts && facts.length > 0) {
    const speechMap = new Map<number, { key: string[]; other: string[] }>();
    const keyTypes = new Set(["claim", "vote", "suspicion", "alignment"]);
    
    for (const fact of facts) {
      if (fact.speakerSeat !== undefined && fact.speakerSeat !== null) {
        const seat = fact.speakerSeat + 1;
        if (!speechMap.has(seat)) {
          speechMap.set(seat, { key: [], other: [] });
        }
        const bucket = speechMap.get(seat)!;
        if (fact.type && keyTypes.has(fact.type)) {
          bucket.key.push(fact.fact);
        } else {
          bucket.other.push(fact.fact);
        }
      }
    }
    
    if (speechMap.size > 0) {
      return Array.from(speechMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([seat, { key, other }]) => {
          const selected = key.length > 0 ? key.slice(0, 2) : other.slice(0, 1);
          const content = convertToFirstPerson(selected.join("，") || "过");
          return { seat, content };
        });
    }
  }
  
  // Fallback: parse dailySummaries bullets to extract per-player info
  const bullets = state.dailySummaries?.[day];
  if (bullets && bullets.length > 0) {
    const speechMap = new Map<number, string[]>();
    const seatPattern = /^(\d+)号/;
    
    for (const bullet of bullets) {
      const match = bullet.match(seatPattern);
      if (match) {
        const seat = parseInt(match[1], 10);
        if (!speechMap.has(seat)) {
          speechMap.set(seat, []);
        }
        // Remove the seat prefix and player name for cleaner display
        const content = bullet.replace(/^\d+号\s*\S+\s*/, "");
        speechMap.get(seat)!.push(content);
      }
    }
    
    if (speechMap.size > 0) {
      return Array.from(speechMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([seat, contents]) => {
          const content = convertToFirstPerson(contents.slice(0, 2).join("，") || "过");
          return { seat, content };
        });
    }
  }
  
  return extractSpeechesFromMessages(state, {
    day,
    phases: ["DAY_SPEECH", "DAY_PK_SPEECH", "DAY_LAST_WORDS"],
  });
}

function convertToFirstPerson(text: string): string {
  // Convert third-person statements to first-person voice
  // NOTE: order matters — more specific patterns first to avoid cascading replacements
  return text
    .replace(/声称是/g, "我是")
    .replace(/声称/g, "我觉得")
    .replace(/表示/g, "")
    .replace(/(?<!我)认为/g, "我觉得")
    .replace(/(?<!我)怀疑/g, "我怀疑")
    .replace(/投票给/g, "我投")
    .replace(/(?<!我)支持/g, "我支持")
    .replace(/(?<!我)反对/g, "我反对")
    .replace(/验了/g, "我查了")
    .replace(/查验/g, "我查")
    .replace(/指出/g, "")
    .replace(/发言过/g, "过");
}
