import { v4 as uuidv4 } from "uuid";
import { generateCompletion, generateCompletionBatch, generateCompletionStream, mergeOptionsFromModelRef, stripMarkdownCodeFences, type LLMMessage } from "./llm";
import type { ChatCompletionResponse } from "./llm";
import { StreamingSpeechParser } from "./streaming-speech-parser";
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
  PLAYER_MODELS,
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
  if (PLAYER_MODELS.length === 0) {
    // Fallback to GENERATOR_MODEL if no models available
    return { provider: "zenmux" as const, model: getGeneratorModel() };
  }
  const randomIndex = Math.floor(Math.random() * PLAYER_MODELS.length);
  return PLAYER_MODELS[randomIndex];
}

const phaseManager = new PhaseManager();

function sanitizeModelArtifacts(text: string): string {
  const raw = String(text ?? "");
  if (!raw) return raw;

  return raw
    .replace(/<\|begin▁of▁sentence\|>/g, "")
    .replace(/<\|end▁of▁sentence\|>/g, "")
    .replace(/<｜begin▁of▁sentence｜>/g, "")
    .replace(/<｜end▁of▁sentence｜>/g, "")
    .trim();
}

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
    const playerId = getPlayerIdForSeat(seat);

    if (seat === humanSeat) {
      players.push({
        playerId,
        seat,
        displayName: humanName.trim() || fallbackHumanName,
        avatarSeed: playerId,
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
        playerId,
        seat,
        displayName: character.displayName,
        avatarSeed: character.avatarSeed ?? playerId,
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

  const trimmedContent = content.trim();
  if (trimmedContent.length === 0) return state;

  // Auto-detect last words phase or use explicit flag
  const isLastWords = options?.isLastWords ?? state.phase === "DAY_LAST_WORDS";

  // Deduplication: prevent adding identical message from same player in same day/phase
  // Check recent messages (last 20) to avoid O(n) scan on large message arrays
  const recentMessages = state.messages.slice(-20);
  const isDuplicate = recentMessages.some(
    (m) =>
      m.playerId === playerId &&
      m.day === state.day &&
      m.phase === state.phase &&
      m.content === trimmedContent &&
      (isLastWords ? m.isLastWords === true : !m.isLastWords)
  );
  if (isDuplicate) {
    console.warn("[wolfcha] addPlayerMessage: duplicate message blocked", {
      playerId,
      day: state.day,
      phase: state.phase,
      contentPreview: trimmedContent.slice(0, 50),
    });
    return state;
  }

  const message: ChatMessage = {
    id: uuidv4(),
    playerId,
    playerName: player.displayName,
    content: trimmedContent,
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
    for await (const chunk of generateCompletionStream(mergeOptionsFromModelRef(player.agentProfile!.modelRef, {
      model: player.agentProfile!.modelRef.model,
      messages,
      temperature: GAME_TEMPERATURE.SPEECH,
    }))) {
      fullResponse += chunk;
      yield chunk;
    }

    const sanitizedSpeech = sanitizeSeatMentions(sanitizeModelArtifacts(fullResponse), state.players.length);
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
    const sanitizedSpeech = sanitizeSeatMentions(sanitizeModelArtifacts(fullResponse), state.players.length);
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
    const result = await generateCompletion(mergeOptionsFromModelRef(player.agentProfile!.modelRef, {
      model: player.agentProfile!.modelRef.model,
      messages,
      temperature: GAME_TEMPERATURE.SPEECH,
    }));

    const cleanedSpeech = sanitizeModelArtifacts(stripMarkdownCodeFences(result.content));
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
        const segments = JSON.parse(jsonMatch[0]) as unknown[];
        if (Array.isArray(segments) && segments.length > 0) {
          const normalized: string[] = [];
          for (const item of segments) {
            if (typeof item === "string") {
              // 情况1: ["话1", "话2"] - 字符串数组
              const cleaned = item.trim().replace(/^["']+|["']+$/g, "");
              if (cleaned) normalized.push(cleaned);
            } else if (item && typeof item === "object") {
              // 情况2: [{"speaker": "...", "message": "..."}] - 对象数组
              // 优先提取 content, message, text, value 等常见字段
              const obj = item as Record<string, unknown>;
              const text = obj.content || obj.message || obj.text || obj.value || obj.speech;
              if (typeof text === "string") {
                const cleaned = text.trim();
                if (cleaned) normalized.push(cleaned);
              }
            }
          }

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

export interface StreamingSpeechOptions {
  onSegmentReceived?: (segment: string, index: number) => void;
  onProgress?: (current: number) => void;
  onComplete?: (segments: string[]) => void;
  onError?: (error: string) => void;
}

/**
 * 流式生成 AI 发言段落
 * 实时输出发言内容，每完成一个段落就立即通知
 */
export async function generateAISpeechSegmentsStream(
  state: GameState,
  player: Player,
  options: StreamingSpeechOptions = {}
): Promise<string[]> {
  const { t } = getI18n();
  const prompt = resolvePhasePrompt(state.phase, state, player);
  const startTime = Date.now();
  const { messages } = buildMessagesForPrompt(prompt);

  // Track segments already emitted via streaming to prevent double-emit in fallback
  const emittedSegments = new Set<string>();
  let emittedCount = 0;

  const parser = new StreamingSpeechParser({
    onSegmentReceived: (segment, index) => {
      const sanitized = sanitizeSeatMentions(sanitizeModelArtifacts(segment), state.players.length);
      if (!emittedSegments.has(sanitized)) {
        emittedSegments.add(sanitized);
        options.onSegmentReceived?.(sanitized, emittedCount++);
      }
    },
    onProgress: options.onProgress,
    onError: options.onError,
  });

  try {
    const stream = generateCompletionStream(mergeOptionsFromModelRef(player.agentProfile!.modelRef, {
      model: player.agentProfile!.modelRef.model,
      messages,
      temperature: GAME_TEMPERATURE.SPEECH,
    }));

    let accumulatedContent = "";
    let chunkCount = 0;

    for await (const chunk of stream) {
      chunkCount++;
      accumulatedContent += chunk;
      parser.processChunk(chunk);
      
      // 调试：每10个chunk输出一次
      if (chunkCount % 10 === 0) {
        console.log(`[streaming] chunks: ${chunkCount}, accumulated: ${accumulatedContent.length} chars, segments: ${parser.getSegmentCount()}`);
      }
    }
    
    console.log(`[streaming] done. total chunks: ${chunkCount}, segments emitted: ${parser.getSegmentCount()}, unique emitted: ${emittedSegments.size}`);

    // 结束解析
    const segments = parser.end();

    // 如果流式解析没有产生结果，回退到传统解析
    // 注意：只有当 emittedSegments 也为空时才进行回退，避免重复发射
    if (segments.length === 0 && emittedSegments.size === 0) {
      const cleanedSpeech = sanitizeModelArtifacts(stripMarkdownCodeFences(accumulatedContent));
      const sanitizedSpeech = sanitizeSeatMentions(cleanedSpeech, state.players.length);

      // 尝试解析 JSON 数组
      const jsonMatch = sanitizedSpeech.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as unknown[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            const normalized: string[] = [];
            for (const item of parsed) {
              if (typeof item === "string") {
                // 情况1: ["话1", "话2"] - 字符串数组
                const cleaned = item.trim().replace(/^["']+|["']+$/g, "");
                if (cleaned) normalized.push(cleaned);
              } else if (item && typeof item === "object") {
                // 情况2: [{"speaker": "...", "message": "..."}] - 对象数组
                const obj = item as Record<string, unknown>;
                const text = obj.content || obj.message || obj.text || obj.value || obj.speech;
                if (typeof text === "string") {
                  const cleaned = text.trim();
                  if (cleaned) normalized.push(cleaned);
                }
              }
            }

            if (normalized.length > 0) {
              // 通知回退解析的结果（只发射未发射过的）
              normalized.forEach((seg) => {
                if (!emittedSegments.has(seg)) {
                  emittedSegments.add(seg);
                  options.onSegmentReceived?.(seg, emittedCount++);
                }
              });
              options.onComplete?.(normalized);
              return normalized;
            }
          }
        } catch {
          // 继续尝试其他方法
        }
      }

      // 降级处理：按换行或句号分割
      const fallbackSegments = sanitizedSpeech
        .replace(/[\[\]]/g, "")
        .split(/[。！？]+(?=\s|$)|\n+/)
        .map((s) => s.trim().replace(/^["']+|["']+$/g, ""))
        .filter((s) => s.length > 2);

      if (fallbackSegments.length > 0) {
        fallbackSegments.forEach((seg) => {
          if (!emittedSegments.has(seg)) {
            emittedSegments.add(seg);
            options.onSegmentReceived?.(seg, emittedCount++);
          }
        });
        options.onComplete?.(fallbackSegments);
        return fallbackSegments;
      }

      const cleanedSingle = sanitizedSpeech
        .replace(/[\[\]]/g, "")
        .trim()
        .replace(/^["']+|["']+$/g, "")
        .trim();

      const result = cleanedSingle.length > 0 ? [cleanedSingle] : ["（……）"];
      result.forEach((seg) => {
        if (!emittedSegments.has(seg)) {
          emittedSegments.add(seg);
          options.onSegmentReceived?.(seg, emittedCount++);
        }
      });
      options.onComplete?.(result);
      return result;
    }
    
    // 如果流式已经发射了 segments 但 parser.end() 返回空，使用已发射的
    if (segments.length === 0 && emittedSegments.size > 0) {
      const emittedList = Array.from(emittedSegments);
      options.onComplete?.(emittedList);
      return emittedList;
    }

    // Sanitize all segments
    const sanitizedSegments = segments.map((s) =>
      sanitizeSeatMentions(sanitizeModelArtifacts(s), state.players.length)
    );

    await aiLogger.log({
      type: "speech",
      request: {
        model: player.agentProfile!.modelRef.model,
        messages,
        player: {
          playerId: player.playerId,
          displayName: player.displayName,
          seat: player.seat,
          role: player.role,
        },
      },
      response: {
        content: sanitizedSegments.join("\n"),
        raw: accumulatedContent,
        duration: Date.now() - startTime,
      },
    });

    options.onComplete?.(sanitizedSegments);
    return sanitizedSegments;
  } catch (error) {
    await aiLogger.log({
      type: "speech",
      request: {
        model: player.agentProfile!.modelRef.model,
        messages,
        player: {
          playerId: player.playerId,
          displayName: player.displayName,
          seat: player.seat,
          role: player.role,
        },
      },
      response: { content: "", duration: Date.now() - startTime },
      error: String(error),
    });

    const raw = String(error);
    if (raw.includes("429") || raw.includes("limit_requests")) {
      const result = [t("gameMaster.tooManyRequests")];
      options.onComplete?.(result);
      return result;
    }

    options.onError?.(String(error));
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
    result = await generateCompletion(mergeOptionsFromModelRef(player.agentProfile!.modelRef, {
      model: player.agentProfile!.modelRef.model,
      messages,
      temperature: GAME_TEMPERATURE.ACTION,
      response_format: { type: "json_object" },
    }));

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

export const BADGE_TRANSFER_TORN = -1;

/**
 * 使用 SUMMARY_MODEL 一次性判断所有玩家是否上警
 * 基于玩家的背景信息和第一晚的操作信息来决策
 */
export async function generateAIBadgeSignupBatch(
  state: GameState,
  players: Player[]
): Promise<Record<string, boolean>> {
  if (!players || players.length === 0) return {};

  const { t } = getI18n();
  const startTime = Date.now();

  // 构建所有玩家的信息摘要
  const playersInfo = players.map((player) => {
    const persona = player.agentProfile?.persona;
    const roleText = (() => {
      switch (player.role) {
        case "Werewolf": return t("promptUtils.roleText.werewolf");
        case "Seer": return t("promptUtils.roleText.seer");
        case "Witch": return t("promptUtils.roleText.witch");
        case "Hunter": return t("promptUtils.roleText.hunter");
        case "Guard": return t("promptUtils.roleText.guard");
        default: return t("promptUtils.roleText.villager");
      }
    })();

    // 获取玩家第一晚的行动信息
    let nightActionInfo = "";
    if (player.role === "Seer" && state.nightActions.seerHistory && state.nightActions.seerHistory.length > 0) {
      const lastCheck = state.nightActions.seerHistory[state.nightActions.seerHistory.length - 1];
      const targetPlayer = state.players.find((p) => p.seat === lastCheck.targetSeat);
      if (targetPlayer) {
        nightActionInfo = t("gameMaster.badgeSignup.seerChecked", {
          targetName: targetPlayer.displayName,
          result: lastCheck.isWolf ? t("gameMaster.badgeSignup.werewolf") : t("gameMaster.badgeSignup.notWerewolf"),
        });
      }
    } else if (player.role === "Witch") {
      const actions: string[] = [];
      if (state.roleAbilities?.witchHealUsed) {
        actions.push(t("gameMaster.badgeSignup.witchHealed"));
      }
      if (state.roleAbilities?.witchPoisonUsed) {
        actions.push(t("gameMaster.badgeSignup.witchPoisoned"));
      }
      if (actions.length > 0) {
        nightActionInfo = actions.join(t("promptUtils.gameContext.listSeparator"));
      }
    } else if (player.role === "Guard" && state.nightActions.lastGuardTarget !== undefined) {
      const targetPlayer = state.players.find((p) => p.seat === state.nightActions.lastGuardTarget);
      if (targetPlayer) {
        nightActionInfo = t("gameMaster.badgeSignup.guardProtected", { targetName: targetPlayer.displayName });
      }
    } else if (player.role === "Werewolf") {
      nightActionInfo = t("gameMaster.badgeSignup.werewolfParticipated");
    }

    // 从 Persona 构建性格描述
    const personalityParts: string[] = [];
    if (persona?.mbti) personalityParts.push(persona.mbti);
    if (persona?.styleLabel) personalityParts.push(persona.styleLabel);
    if (persona?.socialHabit) personalityParts.push(persona.socialHabit);

    return {
      playerId: player.playerId,
      seat: player.seat + 1,
      name: player.displayName,
      role: roleText,
      personality: personalityParts.join("，") || "",
      nightAction: nightActionInfo,
    };
  });

  // 构建批量判断的 prompt
  // 使用 t.raw() 因为 prompt 包含字面的 {} 字符（JSON 示例），不应被解析为 ICU 占位符
  const systemPrompt = t.raw("gameMaster.badgeSignup.systemPrompt");
  const playerDescriptions = playersInfo.map((info) => {
    let desc = t("gameMaster.badgeSignup.playerDesc", {
      seat: info.seat,
      name: info.name,
      role: info.role,
      personality: info.personality || t("gameMaster.badgeSignup.noPersonality"),
    });
    if (info.nightAction) {
      desc += t("gameMaster.badgeSignup.nightActionSuffix", { action: info.nightAction });
    }
    return desc;
  }).join("\n");

  // userPrompt 也包含字面 {} 字符，需要手动替换占位符
  const userPromptTemplate = t.raw("gameMaster.badgeSignup.userPrompt");
  const userPrompt = userPromptTemplate
    .replace("{playerDescriptions}", playerDescriptions)
    .replace("{seatList}", playersInfo.map((p) => p.seat).join(", "));

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const parsedByPlayer: Record<string, boolean> = {};

  try {
    const result = await generateCompletion({
      model: getSummaryModel(),
      messages,
      temperature: GAME_TEMPERATURE.ACTION,
      response_format: { type: "json_object" },
    });

    const cleaned = stripMarkdownCodeFences(result.content).trim();
    const duration = Date.now() - startTime;

    await aiLogger.log({
      type: "badge_signup",
      request: {
        model: getSummaryModel(),
        messages,
        player: { playerId: "batch", displayName: "All Players", seat: -1, role: "Villager" as Role },
      },
      response: {
        content: cleaned,
        raw: result.content,
        rawResponse: JSON.stringify(result.raw, null, 2),
        finishReason: result.raw.choices?.[0]?.finish_reason,
        duration,
      },
    });

    // 解析 JSON 响应
    try {
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      
      // 支持多种响应格式
      // 格式1: { "decisions": { "1": true, "2": false, ... } }
      // 格式2: { "1": true, "2": false, ... }
      // 格式3: { "signup": [1, 3, 5] } (seats that signup)
      let decisions: Record<string, boolean> = {};

      if (parsed.decisions && typeof parsed.decisions === "object") {
        decisions = parsed.decisions as Record<string, boolean>;
      } else if (parsed.signup && Array.isArray(parsed.signup)) {
        // 如果返回的是上警座位列表
        const signupSeats = new Set(parsed.signup.map(Number));
        for (const info of playersInfo) {
          decisions[String(info.seat)] = signupSeats.has(info.seat);
        }
      } else {
        // 直接作为 seat -> decision 的映射
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === "boolean" || value === 0 || value === 1) {
            decisions[key] = Boolean(value);
          }
        }
      }

      // 将座位号映射回 playerId
      for (const info of playersInfo) {
        const decision = decisions[String(info.seat)];
        parsedByPlayer[info.playerId] = decision === true;
      }
    } catch {
      // 解析失败，默认所有人不上警
      for (const player of players) {
        parsedByPlayer[player.playerId] = false;
      }
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    await aiLogger.log({
      type: "badge_signup",
      request: {
        model: getSummaryModel(),
        messages,
        player: { playerId: "batch", displayName: "All Players", seat: -1, role: "Villager" as Role },
      },
      response: { content: "", duration },
      error: String(error),
    });

    // 出错时默认所有人不上警
    for (const player of players) {
      parsedByPlayer[player.playerId] = false;
    }
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
    const result = await generateCompletion(mergeOptionsFromModelRef(player.agentProfile!.modelRef, {
      model: player.agentProfile!.modelRef.model,
      messages,
      temperature: GAME_TEMPERATURE.ACTION,
    }));

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
  const confirmedWolfSeats = new Set(
    (state.nightActions.seerHistory || [])
      .filter((x) => x && x.isWolf)
      .map((x) => x.targetSeat)
  );
  const startTime = Date.now();
  const { messages } = buildMessagesForPrompt(prompt);

  const result = await generateCompletion(mergeOptionsFromModelRef(player.agentProfile!.modelRef, {
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: GAME_TEMPERATURE.ACTION,
  }));

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

  const validSeats = alivePlayers.map((p) => p.seat);
  const pickFallbackSeat = (): number => {
    if (player.alignment === "village" && player.role === "Seer" && confirmedWolfSeats.size > 0) {
      const safeSeats = validSeats.filter((s) => !confirmedWolfSeats.has(s));
      if (safeSeats.length > 0) {
        return safeSeats[Math.floor(Math.random() * safeSeats.length)];
      }
      return BADGE_TRANSFER_TORN;
    }
    return validSeats[Math.floor(Math.random() * validSeats.length)];
  };

  const match = cleanedTransfer.match(/-?\d+/);
  if (match) {
    const parsed = Number.parseInt(match[0], 10);
    if (parsed === 0) {
      return BADGE_TRANSFER_TORN;
    }
    const seat = parsed - 1;
    if (validSeats.includes(seat)) {
      if (player.alignment === "village" && player.role === "Seer" && confirmedWolfSeats.has(seat)) {
        return pickFallbackSeat();
      }
      return seat;
    }
  }

  return pickFallbackSeat();
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

  const result = await generateCompletion(mergeOptionsFromModelRef(player.agentProfile!.modelRef, {
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: GAME_TEMPERATURE.ACTION,
  }));

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
  const alivePlayers = state.players.filter((p) => p.alive);
  const startTime = Date.now();
  const { messages } = buildMessagesForPrompt(prompt);

  const result = await generateCompletion(mergeOptionsFromModelRef(player.agentProfile!.modelRef, {
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: GAME_TEMPERATURE.ACTION,
  }));

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

  const result = await generateCompletion(mergeOptionsFromModelRef(player.agentProfile!.modelRef, {
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: GAME_TEMPERATURE.ACTION,
  }));

  const cleanedWitch = stripMarkdownCodeFences(result.content);

  const rawText = cleanedWitch.trim();
  const contentLower = rawText.toLowerCase();

  const canSave =
    !state.roleAbilities.witchHealUsed &&
    wolfTarget !== undefined;
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

  const result = await generateCompletion(mergeOptionsFromModelRef(player.agentProfile!.modelRef, {
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: GAME_TEMPERATURE.ACTION,
  }));

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

  const result = await generateCompletion(mergeOptionsFromModelRef(player.agentProfile!.modelRef, {
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: GAME_TEMPERATURE.ACTION,
  }));

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
