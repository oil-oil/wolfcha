import { v4 as uuidv4 } from "uuid";
import { generateCompletion, generateCompletionBatch, generateCompletionStream, stripMarkdownCodeFences, type LLMMessage } from "./llm";
import type { ChatCompletionResponse } from "./llm";
import {
  type GameState,
  type Player,
  type Role,
  type Phase,
  type ChatMessage,
  type Alignment,
  type DailySummaryFact,
  type DailySummaryVoteData,
  GENERATOR_MODEL,
  SUMMARY_MODEL,
  AVAILABLE_MODELS,
  type ModelRef,
} from "@/types/game";
import { GAME_TEMPERATURE } from "./ai-config";
import { sampleModelRefs, type GeneratedCharacter } from "./character-generator";
import { aiLogger } from "./ai-logger";
import { getGeneratorModel, getSummaryModel } from "@/lib/api-keys";
import { PhaseManager } from "@/game/core/PhaseManager";
import type { PromptResult } from "@/game/core/types";
import { buildCachedSystemMessageFromParts } from "./prompt-utils";
import { getI18n } from "@/i18n/translator";

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getRandomModelRef(): ModelRef {
  const fallback = sampleModelRefs(1)[0];
  if (fallback) return fallback;
  if (AVAILABLE_MODELS.length === 0) {
    // Fallback to GENERATOR_MODEL if no models available
    return { provider: "zenmux" as const, model: getGeneratorModel() };
  }
  const randomIndex = Math.floor(Math.random() * AVAILABLE_MODELS.length);
  return AVAILABLE_MODELS[randomIndex];
}

const phaseManager = new PhaseManager();

function sanitizeSeatMentions(text: string, totalSeats: number): string {
  if (!text) return text;
  if (!Number.isFinite(totalSeats) || totalSeats <= 0) return text;
  const { t } = getI18n();

  const replaceIfInvalid = (raw: string, numStr: string) => {
    const n = Number.parseInt(numStr, 10);
    if (!Number.isFinite(n)) return raw;
    if (n < 1 || n > totalSeats) return t("gameMaster.invalidSeat");
    return raw;
  };

  // Handle @12 / @12号
  let out = text.replace(/@(\d+)\s*号?/g, (m, numStr) => replaceIfInvalid(m, numStr));
  // Handle 12号
  out = out.replace(/(\d+)\s*号/g, (m, numStr) => replaceIfInvalid(m, numStr));
  return out;
}

function resolvePhasePrompt(
  phase: Phase,
  state: GameState,
  player: Player,
  extras?: Record<string, unknown>
) {
  // Override state.phase to ensure correct prompt is returned
  // This is needed when calling prompts for a phase different from state.phase
  const overriddenState = state.phase === phase ? state : { ...state, phase };
  const prompt = phaseManager.getPrompt(phase, { state: overriddenState, extras }, player);
  if (!prompt) {
    throw new Error(`[wolfcha] Missing phase prompt for ${phase}`);
  }
  return prompt;
}

function buildMessagesForPrompt(
  prompt: PromptResult,
  useCache: boolean = true
): { messages: LLMMessage[]; systemMessage: LLMMessage } {
  const systemMessage = buildCachedSystemMessageFromParts(
    prompt.systemParts,
    prompt.system,
    useCache
  );

  return {
    systemMessage,
    messages: [
      systemMessage,
      { role: "user", content: prompt.user },
    ],
  };
}

export function createInitialGameState(): GameState {
  return {
    gameId: uuidv4(),
    phase: "LOBBY",
    day: 0,
    difficulty: "normal",
    players: [],
    events: [],
    messages: [],
    currentSpeakerSeat: null,
    nextSpeakerSeatOverride: null,
    daySpeechStartSeat: null,
    speechDirection: "clockwise",
    pkTargets: undefined,
    pkSource: undefined,
    badge: {
      holderSeat: null,
      candidates: [],
      signup: {},
      votes: {},
      history: {},
      revoteCount: 0,
    },
    votes: {},
    voteReasons: {},
    lastVoteReasons: {},
    voteHistory: {},
    dailySummaries: {},
    dailySummaryFacts: {},
    dailySummaryVoteData: {},
    nightActions: {},
    roleAbilities: {
      witchHealUsed: false,
      witchPoisonUsed: false,
      hunterCanShoot: true,
    },
    winner: null,
  };
}

export function getRoleConfiguration(playerCount: number): Role[] {
  const configs: Record<number, Role[]> = {
    8: ["Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Villager", "Villager"],
    9: ["Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Villager", "Villager", "Villager"],
    10: [
      "Werewolf",
      "Werewolf",
      "Werewolf",
      "Seer",
      "Witch",
      "Hunter",
      "Guard",
      "Villager",
      "Villager",
      "Villager",
    ],
    11: [
      "Werewolf",
      "Werewolf",
      "Werewolf",
      "Werewolf",
      "Seer",
      "Witch",
      "Hunter",
      "Guard",
      "Villager",
      "Villager",
      "Villager",
    ],
    12: [
      "Werewolf",
      "Werewolf",
      "Werewolf",
      "Werewolf",
      "Seer",
      "Witch",
      "Hunter",
      "Guard",
      "Villager",
      "Villager",
      "Villager",
      "Villager",
    ],
  };

  const roles = configs[playerCount] ?? configs[10];
  return roles.slice();
}

export function setupPlayers(
  characters: GeneratedCharacter[],
  humanSeat: number = 0,
  humanName: string = "",
  playerCount: number = 10,
  fixedRoles?: Role[],
  seedPlayerIds?: string[],
  modelRefs?: ModelRef[],
  aiSeatOrder?: number[]
): Player[] {
  const { t } = getI18n();
  const totalPlayers = playerCount;
  const fallbackHumanName = t("common.you");
  const roles = getRoleConfiguration(totalPlayers);
  const assignedRoles = fixedRoles && fixedRoles.length === totalPlayers ? fixedRoles : shuffleArray(roles);

  const players: Player[] = [];

  const computeCharIndexForSeat = (() => {
    const aiSeats = Array.from({ length: totalPlayers }, (_, seat) => seat).filter(
      (seat) => seat !== humanSeat
    );

    if (
      Array.isArray(aiSeatOrder) &&
      aiSeatOrder.length === aiSeats.length &&
      new Set(aiSeatOrder).size === aiSeats.length &&
      aiSeatOrder.every((s) => aiSeats.includes(s))
    ) {
      const seatToCharIndex = new Map<number, number>();
      aiSeatOrder.forEach((seat, idx) => seatToCharIndex.set(seat, idx));
      return (seat: number) => seatToCharIndex.get(seat) ?? -1;
    }

    return (seat: number) => (seat > humanSeat ? seat - 1 : seat);
  })();

  const getPlayerIdForSeat = (seat: number) => {
    const id = Array.isArray(seedPlayerIds) ? seedPlayerIds[seat] : undefined;
    return typeof id === "string" && id.trim() ? id : uuidv4();
  };

  for (let seat = 0; seat < totalPlayers; seat++) {
    const role = assignedRoles[seat];
    const alignment: Alignment = role === "Werewolf" ? "wolf" : "village";

    if (seat === humanSeat) {
      players.push({
        playerId: getPlayerIdForSeat(seat),
        seat,
        displayName: humanName.trim() || fallbackHumanName,
        alive: true,
        role,
        alignment,
        isHuman: true,
      });
    } else {
      const charIndex = computeCharIndexForSeat(seat);
      const fallbackIndex = seat > humanSeat ? seat - 1 : seat;
      const safeCharIndex =
        Number.isFinite(charIndex) && charIndex >= 0 && charIndex < characters.length
          ? charIndex
          : Math.min(Math.max(0, fallbackIndex), Math.max(0, characters.length - 1));
      const character = characters[safeCharIndex];
      const modelRef = modelRefs?.[safeCharIndex] ?? getRandomModelRef();

      players.push({
        playerId: getPlayerIdForSeat(seat),
        seat,
        displayName: character.displayName,
        alive: true,
        role,
        alignment,
        isHuman: false,
        agentProfile: {
          modelRef,
          persona: character.persona,
        },
      });
    }
  }

  return players;
}

export function addSystemMessage(
  state: GameState,
  content: string
): GameState {
  const { t } = getI18n();
  const message: ChatMessage = {
    id: uuidv4(),
    playerId: "system",
    playerName: t("speakers.host"),
    content,
    timestamp: Date.now(),
    day: state.day,
    phase: state.phase,
    isSystem: true,
  };

  return {
    ...state,
    messages: [...state.messages, message],
  };
}

export function addPlayerMessage(
  state: GameState,
  playerId: string,
  content: string,
  options?: { isLastWords?: boolean }
): GameState {
  const player = state.players.find((p) => p.playerId === playerId);
  if (!player) return state;

  if (content.trim().length === 0) return state;

  // Auto-detect last words phase or use explicit flag
  const isLastWords = options?.isLastWords ?? state.phase === "DAY_LAST_WORDS";

  const message: ChatMessage = {
    id: uuidv4(),
    playerId,
    playerName: player.displayName,
    content,
    timestamp: Date.now(),
    day: state.day,
    phase: state.phase,
    ...(isLastWords && { isLastWords: true }),
  };

  return {
    ...state,
    messages: [...state.messages, message],
  };
}

export function transitionPhase(state: GameState, newPhase: Phase): GameState {
  // Clear currentSpeakerSeat when transitioning to night phases
  const isNightPhase = newPhase.startsWith("NIGHT_");
  const shouldClearSpeaker = isNightPhase || newPhase === "DAY_VOTE" || newPhase === "DAY_RESOLVE";
  
  return {
    ...state,
    phase: newPhase,
    ...(shouldClearSpeaker && { currentSpeakerSeat: null }),
  };
}

export function checkWinCondition(state: GameState): Alignment | null {
  const alivePlayers = state.players.filter((p) => p.alive);
  const aliveWolves = alivePlayers.filter((p) => p.alignment === "wolf");
  const aliveVillagers = alivePlayers.filter((p) => p.alignment === "village");

  if (aliveWolves.length === 0) {
    return "village";
  }

  if (aliveWolves.length >= aliveVillagers.length) {
    return "wolf";
  }

  return null;
}

export function killPlayer(state: GameState, seat: number): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.seat === seat ? { ...p, alive: false } : p
    ),
  };
}

export function getNextAliveSeat(
  state: GameState,
  currentSeat: number,
  excludeSheriff = false,
  direction: "clockwise" | "counterclockwise" = "clockwise"
): number | null {
  const sheriffSeat = state.badge.holderSeat;
  let alivePlayers = state.players.filter((p) => p.alive);
  
  // 如果需要排除警长（警长最后发言），则从候选列表中移除警长
  if (excludeSheriff && sheriffSeat !== null) {
    alivePlayers = alivePlayers.filter((p) => p.seat !== sheriffSeat);
  }
  
  if (alivePlayers.length === 0) return null;

  const sortedSeats = alivePlayers.map((p) => p.seat).sort((a, b) => a - b);
  if (sortedSeats.length === 0) return null;

  if (direction === "counterclockwise") {
    const prevSeat = [...sortedSeats].reverse().find((s) => s < currentSeat);
    return prevSeat ?? sortedSeats[sortedSeats.length - 1];
  }

  const nextSeat = sortedSeats.find((s) => s > currentSeat);
  return nextSeat ?? sortedSeats[0];
}

export function tallyVotes(state: GameState): { seat: number; count: number } | null {
  const voteCounts: Record<number, number> = {};
  const sheriffSeat = state.badge.holderSeat;
  const aliveById = new Set(state.players.filter((p) => p.alive).map((p) => p.playerId));
  const aliveBySeat = new Set(state.players.filter((p) => p.alive).map((p) => p.seat));
  
  // 找到警长的 playerId
  const sheriffPlayer = sheriffSeat !== null 
    ? state.players.find((p) => p.seat === sheriffSeat && p.alive)
    : null;
  const sheriffPlayerId = sheriffPlayer?.playerId;
  
  for (const [voterId, targetSeat] of Object.entries(state.votes)) {
    if (!aliveById.has(voterId)) continue;
    if (!aliveBySeat.has(targetSeat)) continue;
    // 警长的票计算为1.5票
    const voteWeight = voterId === sheriffPlayerId ? 1.5 : 1;
    voteCounts[targetSeat] = (voteCounts[targetSeat] || 0) + voteWeight;
  }

  let maxVotes = 0;
  let maxSeat: number | null = null;

  for (const [seat, count] of Object.entries(voteCounts)) {
    if (count > maxVotes) {
      maxVotes = count;
      maxSeat = parseInt(seat);
    }
  }

  // 平票判定：如果最高票并列，则无人被放逐
  if (maxVotes > 0) {
    const topSeats = Object.entries(voteCounts)
      .filter(([, c]) => c === maxVotes)
      .map(([s]) => parseInt(s));
    if (topSeats.length !== 1) return null;
  }

  if (maxSeat === null) return null;
  return { seat: maxSeat, count: maxVotes };
}

/** Extract structured vote_data from [VOTE_RESULT] in day messages. Preserves "who voted for whom" so it is not lost when context is trimmed. */
function extractVoteDataFromDayMessages(
  dayMessages: ChatMessage[],
  state: GameState
): DailySummaryVoteData | undefined {
  const { t } = getI18n();
  const badgeVoteTitle = t("badgePhase.voteDetailTitle");
  const dayVoteTitle = t("votePhase.voteDetailTitle");
  let sheriff: { winner: number; votes: Record<string, number[]> } | undefined;
  let execution: { eliminated: number; votes: Record<string, number[]> } | undefined;

  for (const m of dayMessages) {
    if (!m.isSystem || !m.content.startsWith("[VOTE_RESULT]")) continue;
    try {
      const json = m.content.slice("[VOTE_RESULT]".length);
      const data = JSON.parse(json) as { title?: string; results?: Array<{ targetSeat: number; voterSeats?: number[] }> };
      const results = data.results ?? [];
      const votes: Record<string, number[]> = {};
      for (const r of results) {
        const k = String(r.targetSeat);
        votes[k] = Array.isArray(r.voterSeats) ? r.voterSeats : [];
      }
      if (data.title === badgeVoteTitle && Object.keys(votes).length > 0) {
        const winner = state.badge.holderSeat ?? -1;
        sheriff = { winner, votes };
      } else if (data.title === dayVoteTitle && Object.keys(votes).length > 0) {
        const eliminated = state.dayHistory?.[state.day]?.executed?.seat ?? -1;
        execution = { eliminated, votes };
      }
    } catch {
      // skip malformed [VOTE_RESULT]
    }
  }

  if (!sheriff && !execution) return undefined;
  const out: DailySummaryVoteData = {};
  if (sheriff != null && sheriff.winner >= 0) out.sheriff_election = sheriff;
  if (execution != null && execution.eliminated >= 0) out.execution_vote = execution;
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function generateDailySummary(
  state: GameState
): Promise<{ bullets: string[]; facts: DailySummaryFact[]; voteData?: DailySummaryVoteData }> {
  const { t } = getI18n();
  const startTime = Date.now();
  const summaryModel = getSummaryModel();
  const dayBreakShort = t("system.dayBreakShort");
  const systemSpeaker = t("speakers.system");

  const dayStartIndex = (() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.isSystem && m.content === dayBreakShort) return i;
    }
    return 0;
  })();

  const dayMessages = state.messages.slice(dayStartIndex);
  const voteData = extractVoteDataFromDayMessages(dayMessages, state);

  const transcript = dayMessages
    .map((m) => {
      if (m.isSystem) return `${systemSpeaker}: ${m.content}`;
      const player = state.players.find((p) => p.playerId === m.playerId);
      const seatLabel = player ? t("mentions.seatLabel", { seat: player.seat + 1 }) : "";
      const nameLabel = player?.displayName || m.playerName;
      const speaker = seatLabel ? `${seatLabel} ${nameLabel}`.trim() : nameLabel;
      return `${speaker}: ${m.content}`;
    })
    .join("\n")
    .slice(0, 15000);

  const system = t("gameMaster.dailySummary.systemPrompt");
  const user = t("gameMaster.dailySummary.userPrompt", { day: state.day, transcript });

  const messages: LLMMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const result = await generateCompletion({
    model: summaryModel,
    messages,
    temperature: GAME_TEMPERATURE.SUMMARY,
    response_format: { type: "json_object" },
  });

  const cleanedDaily = stripMarkdownCodeFences(result.content);

  await aiLogger.log({
    type: "daily_summary",
    request: {
      model: summaryModel,
      messages,
    },
    response: {
      content: cleanedDaily,
      raw: result.content,
      rawResponse: JSON.stringify(result.raw, null, 2),
      finishReason: result.raw.choices?.[0]?.finish_reason,
      duration: Date.now() - startTime,
    },
  });

  // Parse the new { "summary": "..." } format
  let summaryText = "";
  
  try {
    const objectMatch = cleanedDaily.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      const obj = JSON.parse(objectMatch[0]) as { summary?: string };
      if (typeof obj.summary === "string" && obj.summary.trim()) {
        summaryText = obj.summary.trim();
      }
    }
  } catch {
    // ignore parse errors
  }

  // If we got a summary, return it as a single bullet (preserving full text) and structured vote_data
  if (summaryText) {
    return { bullets: [summaryText], facts: [], voteData };
  }

  // Fallback: use raw content
  const fallback = result.content
    .replace(/```json\s*|\s*```/g, "")
    .replace(/^\s*\{[\s\S]*?"summary"\s*:\s*"/, "")
    .replace(/"\s*\}\s*$/, "")
    .trim();

  const fallbackBullets = fallback ? [fallback] : [result.content.trim()].filter(Boolean);
  return { bullets: fallbackBullets, facts: [], voteData };
}

export async function* generateAISpeechStream(
  state: GameState,
  player: Player
): AsyncGenerator<string, void, unknown> {
  const { t } = getI18n();
  const prompt = resolvePhasePrompt(state.phase, state, player);
  const startTime = Date.now();
  const { messages } = buildMessagesForPrompt(prompt);

  let fullResponse = "";
  try {
    for await (const chunk of generateCompletionStream({
      model: player.agentProfile!.modelRef.model,
      messages,
      temperature: GAME_TEMPERATURE.SPEECH,
    })) {
      fullResponse += chunk;
      yield chunk;
    }

    const sanitizedSpeech = sanitizeSeatMentions(fullResponse, state.players.length);
    await aiLogger.log({
      type: "speech",
      request: { 
        model: player.agentProfile!.modelRef.model,
        messages,
        temperature: GAME_TEMPERATURE.SPEECH,
        player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
      },
      response: {
        content: sanitizedSpeech,
        raw: fullResponse,
        duration: Date.now() - startTime,
      },
    });
  } catch (error) {
    const sanitizedSpeech = sanitizeSeatMentions(fullResponse, state.players.length);
    await aiLogger.log({
      type: "speech",
      request: { 
        model: player.agentProfile!.modelRef.model,
        messages,
        player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
      },
      response: { content: sanitizedSpeech, duration: Date.now() - startTime },
      error: String(error),
    });

    const raw = String(error);
    if (raw.includes("429") || raw.includes("limit_requests")) {
      if (!fullResponse.trim()) {
        yield t("gameMaster.tooManyRequests");
      }
      return;
    }

    throw error;
  }
}

export async function generateAISpeech(
  state: GameState,
  player: Player
): Promise<string> {
  let result = "";
  for await (const chunk of generateAISpeechStream(state, player)) {
    result += chunk;
  }
  return result;
}

export async function generateAISpeechSegments(
  state: GameState,
  player: Player
): Promise<string[]> {
  const { t } = getI18n();
  const prompt = resolvePhasePrompt(state.phase, state, player);
  const startTime = Date.now();
  const { messages } = buildMessagesForPrompt(prompt);

  const extractQuotedSegments = (text: string): string[] => {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    const slice = start >= 0 && end > start ? text.slice(start, end + 1) : text;
    const matches = slice.match(/"(?:\\.|[^"\\])*"/g) ?? [];
    const out: string[] = [];
    for (const m of matches) {
      try {
        const s = JSON.parse(m);
        if (typeof s === "string") {
          const cleaned = s.trim();
          if (cleaned) out.push(cleaned);
        }
      } catch {
        // ignore
      }
    }
    return out;
  };

  const extractObjectSegments = (text: string): string[] => {
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (!objectMatch) return [];
    try {
      const parsed = JSON.parse(objectMatch[0]) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

      const out: string[] = [];
      for (const v of Object.values(parsed as Record<string, unknown>)) {
        if (typeof v === "string") {
          const cleaned = v.trim();
          if (cleaned) out.push(cleaned);
          continue;
        }
        if (Array.isArray(v)) {
          for (const item of v) {
            if (typeof item === "string") {
              const cleaned = item.trim();
              if (cleaned) out.push(cleaned);
            }
          }
        }
      }
      return out;
    } catch {
      return [];
    }
  };

  try {
    const result = await generateCompletion({
      model: player.agentProfile!.modelRef.model,
      messages,
      temperature: GAME_TEMPERATURE.SPEECH,
    });

    const cleanedSpeech = stripMarkdownCodeFences(result.content);
    const sanitizedSpeech = sanitizeSeatMentions(cleanedSpeech, state.players.length);

    await aiLogger.log({
      type: "speech",
      request: { 
        model: player.agentProfile!.modelRef.model,
        messages,
        player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
      },
      response: {
        content: sanitizedSpeech,
        raw: result.content,
        rawResponse: JSON.stringify(result.raw, null, 2),
        finishReason: result.raw.choices?.[0]?.finish_reason,
        duration: Date.now() - startTime,
      },
    });

    // 尝试解析JSON数组
    try {
      const jsonMatch = sanitizedSpeech.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const segments = JSON.parse(jsonMatch[0]) as string[];
        if (Array.isArray(segments) && segments.length > 0) {
          const normalized = segments
            .filter((s) => typeof s === "string")
            .map((s) => s.trim().replace(/^["']+|["']+$/g, ""))
            .filter((s) => s.trim().length > 0);

          if (normalized.length > 0) {
            return normalized;
          }
        }
      }
    } catch {
      // JSON解析失败，按换行分割
    }

    const objectExtracted = extractObjectSegments(sanitizedSpeech);
    if (objectExtracted.length > 0) return objectExtracted;

    const extracted = extractQuotedSegments(sanitizedSpeech)
      .map((s) => s.trim().replace(/^['"]+|['"]+$/g, ""))
      .filter((s) => s.length > 0);
    if (extracted.length > 0) return extracted;

    // 降级处理：按换行或句号分割
    const fallbackSegments = sanitizedSpeech
      .replace(/[\[\]]/g, "")  // 只移除方括号，保留引号
      .split(/[。！？]+(?=\s|$)|\n+/)  // 按句号、感叹号、问号（后面跟空格或结尾）或换行分割
      .map(s => s.trim().replace(/^["']+|["']+$/g, ""))  // 移除首尾引号
      .filter(s => s.length > 2);  // 过滤掉长度小于等于2的片段
    
    if (fallbackSegments.length > 0) return fallbackSegments;

    const cleanedSingle = sanitizedSpeech
      .replace(/[\[\]]/g, "")
      .trim()
      .replace(/^["']+|["']+$/g, "")
      .trim();

    return cleanedSingle.length > 0 ? [cleanedSingle] : ["（……）"];
  } catch (error) {
    await aiLogger.log({
      type: "speech",
      request: { 
        model: player.agentProfile!.modelRef.model,
        messages,
        player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
      },
      response: { content: "", duration: Date.now() - startTime },
      error: String(error),
    });

    const raw = String(error);
    if (raw.includes("429") || raw.includes("limit_requests")) {
      return [t("gameMaster.tooManyRequests")];
    }

    throw error;
  }
}

export async function generateAIVote(
  state: GameState,
  player: Player
): Promise<{ seat: number; reason: string }> {
  const { t } = getI18n();
  const prompt = resolvePhasePrompt("DAY_VOTE", state, player);
  const eligibleSeats = state.pkSource === "vote" && state.pkTargets && state.pkTargets.length > 0
    ? new Set(state.pkTargets)
    : null;
  const alivePlayers = state.players.filter(
    (p) => p.alive && p.playerId !== player.playerId && (!eligibleSeats || eligibleSeats.has(p.seat))
  );
  const startTime = Date.now();
  const { messages } = buildMessagesForPrompt(prompt);

  let result: { content: string; raw: ChatCompletionResponse };
  try {
    result = await generateCompletion({
      model: player.agentProfile!.modelRef.model,
      messages,
      temperature: GAME_TEMPERATURE.ACTION,
      response_format: { type: "json_object" },
    });

    const rawContent = result.content;
    const cleanedVote = stripMarkdownCodeFences(rawContent);
    const cleaned = cleanedVote.trim();
    
    let parsedResult: { seat: number; reason: string } | null = null;
    
    try {
      const parsed = JSON.parse(cleaned) as { seat?: number; reason?: string };
      const seat = typeof parsed.seat === "number" ? parsed.seat - 1 : NaN;
      const validSeats = alivePlayers.map((p) => p.seat);
      if (Number.isFinite(seat) && validSeats.includes(seat)) {
        const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
        parsedResult = { seat, reason: reason || t("gameMaster.voteFallback.missingReason") };
      }
    } catch {
      // Fallback to regex parsing below
    }

    if (!parsedResult) {
      const match = cleaned.match(/\d+/);
      if (match) {
        const seat = parseInt(match[0], 10) - 1;
        const validSeats = alivePlayers.map((p) => p.seat);
        if (validSeats.includes(seat)) {
          parsedResult = { seat, reason: t("gameMaster.voteFallback.parseSeatOnly") };
        }
      }
    }

    if (!parsedResult) {
      if (alivePlayers.length === 0) {
        parsedResult = { seat: player.seat, reason: t("gameMaster.voteFallback.noTargets") };
      } else {
        const fallback = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
        parsedResult = { seat: fallback, reason: t("gameMaster.voteFallback.randomPick") };
      }
    }

    // Log with both raw and parsed data
    await aiLogger.log({
      type: "vote",
      request: { 
        model: player.agentProfile!.modelRef.model,
        messages,
        player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
      },
      response: { 
        content: cleanedVote, 
        raw: rawContent,
        rawResponse: JSON.stringify(result.raw, null, 2),
        finishReason: result.raw.choices?.[0]?.finish_reason,
        parsed: parsedResult,
        duration: Date.now() - startTime 
      },
    });

    return parsedResult;
  } catch (error) {
    const fallbackResult = alivePlayers.length === 0
      ? { seat: player.seat, reason: t("gameMaster.voteFallback.noTargets") }
      : { seat: alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat, reason: t("gameMaster.voteFallback.randomPick") };
    
    await aiLogger.log({
      type: "vote",
      request: {
        model: player.agentProfile!.modelRef.model,
        messages,
        player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
      },
      response: { 
        content: "", 
        parsed: fallbackResult,
        duration: Date.now() - startTime 
      },
      error: String(error),
    });

    return fallbackResult;
  }
}

/** Sentinel for abstain when AI fails to vote or parse. Counting logic skips -1 via aliveBySeat.has(seat). */
export const BADGE_VOTE_ABSTAIN = -1;

export async function generateAIBadgeSignupBatch(
  state: GameState,
  players: Player[]
): Promise<Record<string, boolean>> {
  if (!players || players.length === 0) return {};

  const startTime = Date.now();
  const prompts = players.map((player) => resolvePhasePrompt("DAY_BADGE_SIGNUP", state, player));
  const messageBundles = prompts.map((prompt) => buildMessagesForPrompt(prompt));
  const requests = players.map((player, idx) => ({
    model: player.agentProfile!.modelRef.model,
    messages: messageBundles[idx].messages,
    temperature: GAME_TEMPERATURE.ACTION,
  }));

  const results = await generateCompletionBatch(requests);
  const parsedByPlayer: Record<string, boolean> = {};
  const duration = Date.now() - startTime;

  // Process results and collect log entries
  const logEntries: Parameters<typeof aiLogger.log>[0][] = [];

  for (let idx = 0; idx < players.length; idx++) {
    const player = players[idx];
    const result = results[idx];
    let cleaned = "";
    let parsed: boolean | null = null;
    let error: string | undefined;

    if (result?.ok) {
      cleaned = stripMarkdownCodeFences(result.content).trim();
      if (/^[01]$/.test(cleaned)) {
        parsed = cleaned === "1";
      } else {
        const lower = cleaned.toLowerCase();
        if (/(yes|true|报名|上警|参加|竞选)/i.test(lower)) parsed = true;
        if (/(no|false|不报名|不上警|放弃)/i.test(lower)) parsed = false;
      }
    } else {
      error = result?.error || "Unknown error";
    }

    if (parsed === null) parsed = false;
    parsedByPlayer[player.playerId] = parsed;

    logEntries.push({
      type: "badge_signup",
      request: {
        model: player.agentProfile!.modelRef.model,
        messages: messageBundles[idx].messages,
        player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
      },
      response: {
        content: cleaned,
        raw: result?.ok ? result.content : "",
        rawResponse: result?.ok ? JSON.stringify(result.raw, null, 2) : undefined,
        finishReason: result?.ok ? result.raw?.choices?.[0]?.finish_reason : undefined,
        parsed,
        duration,
      },
      ...(error ? { error } : {}),
    });
  }

  // Log all entries sequentially to avoid concurrent file writes
  for (const entry of logEntries) {
    await aiLogger.log(entry);
  }

  return parsedByPlayer;
}

export async function generateAIBadgeVote(
  state: GameState,
  player: Player
): Promise<number> {
  const prompt = resolvePhasePrompt("DAY_BADGE_ELECTION", state, player);
  const alivePlayers = state.players.filter((p) => p.alive && p.playerId !== player.playerId);
  const startTime = Date.now();
  const { messages } = buildMessagesForPrompt(prompt);

  try {
    const result = await generateCompletion({
      model: player.agentProfile!.modelRef.model,
      messages,
      temperature: GAME_TEMPERATURE.ACTION,
    });

    const cleanedBadgeVote = stripMarkdownCodeFences(result.content);

    await aiLogger.log({
      type: "badge_vote",
      request: {
        model: player.agentProfile!.modelRef.model,
        messages,
        player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
      },
      response: {
        content: cleanedBadgeVote,
        raw: result.content,
        rawResponse: JSON.stringify(result.raw, null, 2),
        finishReason: result.raw.choices?.[0]?.finish_reason,
        duration: Date.now() - startTime,
      },
    });

    const match = cleanedBadgeVote.match(/\d+/);
    if (match) {
      const seat = parseInt(match[0]) - 1;
      const validSeats = alivePlayers.map((p) => p.seat);
      if (validSeats.includes(seat)) {
        return seat;
      }
    }

    // Parse failed or invalid seat: treat as abstain instead of random to avoid stuck flow
    return BADGE_VOTE_ABSTAIN;
  } catch (error) {
    // Network/API error: treat as abstain so the phase does not get stuck
    console.warn("[wolfcha] generateAIBadgeVote failed, treating as abstain:", error);
    await aiLogger.log({
      type: "badge_vote",
      request: {
        model: player.agentProfile!.modelRef.model,
        messages: [],
        player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
      },
      response: { content: "", duration: Date.now() - startTime },
      error: String(error),
    });
    return BADGE_VOTE_ABSTAIN;
  }
}

export async function generateBadgeTransfer(
  state: GameState,
  player: Player
): Promise<number> {
  const prompt = resolvePhasePrompt("BADGE_TRANSFER", state, player);
  const alivePlayers = state.players.filter(
    (p) => p.alive && p.playerId !== player.playerId
  );
  const startTime = Date.now();
  const { messages } = buildMessagesForPrompt(prompt);

  const result = await generateCompletion({
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: GAME_TEMPERATURE.ACTION,
  });

  const cleanedTransfer = stripMarkdownCodeFences(result.content);

  await aiLogger.log({
    type: "badge_transfer",
    request: {
      model: player.agentProfile!.modelRef.model,
      messages,
      player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
    },
    response: {
      content: cleanedTransfer,
      raw: result.content,
      rawResponse: JSON.stringify(result.raw, null, 2),
      finishReason: result.raw.choices?.[0]?.finish_reason,
      duration: Date.now() - startTime,
    },
  });

  const match = cleanedTransfer.match(/\d+/);
  if (match) {
    const seat = parseInt(match[0]) - 1;
    const validSeats = alivePlayers.map((p) => p.seat);
    if (validSeats.includes(seat)) {
      return seat;
    }
  }

  // 随机选择一个存活玩家
  return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
}

export async function generateSeerAction(
  state: GameState,
  player: Player
): Promise<number> {
  const prompt = resolvePhasePrompt("NIGHT_SEER_ACTION", state, player);
  const alivePlayers = state.players.filter(
    (p) => p.alive && p.playerId !== player.playerId
  );
  const startTime = Date.now();
  const { messages } = buildMessagesForPrompt(prompt);

  const result = await generateCompletion({
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: GAME_TEMPERATURE.ACTION,
  });

  const rawContent = result.content;
  const cleanedSeer = stripMarkdownCodeFences(rawContent);

  const match = cleanedSeer.match(/\d+/);
  let parsedSeat: number;
  if (match) {
    const seat = parseInt(match[0]) - 1;
    const validSeats = alivePlayers.map((p) => p.seat);
    if (validSeats.includes(seat)) {
      parsedSeat = seat;
    } else {
      parsedSeat = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
    }
  } else {
    parsedSeat = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
  }

  await aiLogger.log({
    type: "seer_action",
    request: { 
      model: player.agentProfile!.modelRef.model,
      messages,
      player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
    },
    response: { 
      content: cleanedSeer, 
      raw: rawContent,
      rawResponse: JSON.stringify(result.raw, null, 2),
      finishReason: result.raw.choices?.[0]?.finish_reason,
      parsed: { targetSeat: parsedSeat },
      duration: Date.now() - startTime 
    },
  });

  return parsedSeat;
}

export async function generateWolfAction(
  state: GameState,
  player: Player,
  existingVotes: Record<string, number> = {}
): Promise<number> {
  const prompt = resolvePhasePrompt("NIGHT_WOLF_ACTION", state, player, { existingVotes });
  const alivePlayers = state.players.filter(
    (p) => p.alive && p.alignment === "village"
  );
  const startTime = Date.now();
  const { messages } = buildMessagesForPrompt(prompt);

  const result = await generateCompletion({
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: GAME_TEMPERATURE.ACTION,
  });

  const rawContent = result.content;
  const cleanedWolf = stripMarkdownCodeFences(rawContent);

  const match = cleanedWolf.match(/\d+/);
  let parsedSeat: number;
  if (match) {
    const seat = parseInt(match[0]) - 1;
    const validSeats = alivePlayers.map((p) => p.seat);
    if (validSeats.includes(seat)) {
      parsedSeat = seat;
    } else {
      parsedSeat = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
    }
  } else {
    parsedSeat = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
  }

  await aiLogger.log({
    type: "wolf_action",
    request: { 
      model: player.agentProfile!.modelRef.model,
      messages,
      player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
    },
    response: { 
      content: cleanedWolf, 
      raw: rawContent,
      rawResponse: JSON.stringify(result.raw, null, 2),
      finishReason: result.raw.choices?.[0]?.finish_reason,
      parsed: { targetSeat: parsedSeat },
      duration: Date.now() - startTime 
    },
  });

  return parsedSeat;
}

export type WitchAction =
  | { type: "save" }
  | { type: "poison"; target: number }
  | { type: "pass" };

export async function generateWitchAction(
  state: GameState,
  player: Player,
  wolfTarget: number | undefined
): Promise<WitchAction> {
  const prompt = resolvePhasePrompt("NIGHT_WITCH_ACTION", state, player, { wolfTarget });
  const startTime = Date.now();
  const { messages } = buildMessagesForPrompt(prompt);

  const result = await generateCompletion({
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: GAME_TEMPERATURE.ACTION,
  });

  const cleanedWitch = stripMarkdownCodeFences(result.content);

  const rawText = cleanedWitch.trim();
  const contentLower = rawText.toLowerCase();

  const canSave =
    !state.roleAbilities.witchHealUsed &&
    wolfTarget !== undefined &&
    wolfTarget !== player.seat;
  const canPoison = !state.roleAbilities.witchPoisonUsed;

  let parsedAction: WitchAction;
  if (contentLower.startsWith("save")) {
    parsedAction = canSave ? { type: "save" } : { type: "pass" };
  } else if (contentLower.startsWith("pass")) {
    parsedAction = { type: "pass" };
  } else if (contentLower.startsWith("poison")) {
    if (!canPoison) {
      parsedAction = { type: "pass" };
    } else {
      const match = contentLower.match(/poison\s*(\d+)/);
      if (!match) {
        parsedAction = { type: "pass" };
      } else {
        const seat = parseInt(match[1], 10) - 1;
        if (!Number.isFinite(seat) || seat === player.seat) {
          parsedAction = { type: "pass" };
        } else {
          const target = state.players.find((p) => p.seat === seat);
          if (!target || !target.alive) {
            parsedAction = { type: "pass" };
          } else {
            parsedAction = { type: "poison", target: seat };
          }
        }
      }
    }
  } else {
    parsedAction = { type: "pass" };
  }

  await aiLogger.log({
    type: "witch_action",
    request: {
      model: player.agentProfile!.modelRef.model,
      messages,
      player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
    },
    response: {
      content: cleanedWitch,
      raw: result.content,
      rawResponse: JSON.stringify(result.raw, null, 2),
      finishReason: result.raw.choices?.[0]?.finish_reason,
      parsed: parsedAction,
      duration: Date.now() - startTime,
    },
  });

  return parsedAction;
}

// ...

export async function generateGuardAction(
  state: GameState,
  player: Player
): Promise<number> {
  const prompt = resolvePhasePrompt("NIGHT_GUARD_ACTION", state, player);
  const lastTarget = state.nightActions.lastGuardTarget;
  const alivePlayers = state.players.filter(
    (p) => p.alive && p.seat !== lastTarget
  );
  const startTime = Date.now();
  const { messages } = buildMessagesForPrompt(prompt);

  const result = await generateCompletion({
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: GAME_TEMPERATURE.ACTION,
  });

  const cleanedGuard = stripMarkdownCodeFences(result.content);

  const match = cleanedGuard.match(/\d+/);
  let parsedSeat: number;
  if (match) {
    const seat = parseInt(match[0]) - 1;
    const validSeats = alivePlayers.map((p) => p.seat);
    if (validSeats.includes(seat)) {
      parsedSeat = seat;
    } else {
      parsedSeat = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
    }
  } else {
    parsedSeat = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
  }

  await aiLogger.log({
    type: "guard_action",
    request: { 
      model: player.agentProfile!.modelRef.model,
      messages,
      player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
    },
    response: {
      content: cleanedGuard,
      raw: result.content,
      rawResponse: JSON.stringify(result.raw, null, 2),
      finishReason: result.raw.choices?.[0]?.finish_reason,
      parsed: { targetSeat: parsedSeat },
      duration: Date.now() - startTime,
    },
  });

  return parsedSeat;
}

// ...

export async function generateHunterShoot(
  state: GameState,
  player: Player
): Promise<number | null> {
  const prompt = resolvePhasePrompt("HUNTER_SHOOT", state, player);
  const alivePlayers = state.players.filter(
    (p) => p.alive && p.playerId !== player.playerId
  );
  const startTime = Date.now();
  const { messages } = buildMessagesForPrompt(prompt);

  const result = await generateCompletion({
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: GAME_TEMPERATURE.ACTION,
  });

  const cleanedHunter = stripMarkdownCodeFences(result.content);

  const contentLower = cleanedHunter.toLowerCase().trim();
  let parsedTarget: number | null;
  
  if (contentLower.includes("pass")) {
    parsedTarget = null;
  } else {
    const match = cleanedHunter.match(/\d+/);
    if (match) {
      const seat = parseInt(match[0]) - 1;
      const validSeats = alivePlayers.map((p) => p.seat);
      if (validSeats.includes(seat)) {
        parsedTarget = seat;
      } else {
        // 猎人随机选择一个目标
        parsedTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
      }
    } else {
      // 猎人随机选择一个目标
      parsedTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
    }
  }

  await aiLogger.log({
    type: "hunter_shoot",
    request: { 
      model: player.agentProfile!.modelRef.model,
      messages,
      player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
    },
    response: {
      content: cleanedHunter,
      raw: result.content,
      rawResponse: JSON.stringify(result.raw, null, 2),
      finishReason: result.raw.choices?.[0]?.finish_reason,
      parsed: { targetSeat: parsedTarget },
      duration: Date.now() - startTime,
    },
  });

  return parsedTarget;
}
