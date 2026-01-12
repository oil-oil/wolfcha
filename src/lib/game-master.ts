import { v4 as uuidv4 } from "uuid";
import { generateCompletion, generateCompletionStream, type OpenRouterMessage } from "./openrouter";
import {
  type GameState,
  type Player,
  type Role,
  type Phase,
  type ChatMessage,
  type Alignment,
  GENERATOR_MODEL,
  AVAILABLE_MODELS,
} from "@/types/game";
import { type GeneratedCharacter } from "./character-generator";
import { 
  SPEECH_PROMPT, 
  BADGE_ELECTION_PROMPT,
  VOTE_PROMPT, 
  SEER_ACTION_PROMPT, 
  WOLF_ACTION_PROMPT,
  GUARD_ACTION_PROMPT,
  WITCH_ACTION_PROMPT,
  HUNTER_SHOOT_PROMPT,
} from "./prompts";
import { aiLogger } from "./ai-logger";

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function createInitialGameState(): GameState {
  return {
    gameId: uuidv4(),
    phase: "LOBBY",
    day: 0,
    players: [],
    events: [],
    messages: [],
    currentSpeakerSeat: null,
    nextSpeakerSeatOverride: null,
    daySpeechStartSeat: null,
    badge: {
      holderSeat: null,
      candidates: [],
      signup: {},
      votes: {},
      history: {},
      revoteCount: 0,
    },
    votes: {},
    voteHistory: {},
    dailySummaries: {},
    nightActions: {},
    roleAbilities: {
      witchHealUsed: false,
      witchPoisonUsed: false,
      hunterCanShoot: true,
    },
    winner: null,
  };
}

export function setupPlayers(
  characters: GeneratedCharacter[],
  humanSeat: number = 0,
  humanName: string = "你",
  fixedRoles?: Role[]
): Player[] {
  const totalPlayers = 10;
  // 10人局配置: 3狼人 + 1预言家 + 1女巫 + 1猎人 + 1守卫 + 3村民
  const roles: Role[] = [
    "Werewolf", "Werewolf", "Werewolf",  // 3狼人
    "Seer",                               // 1预言家
    "Witch",                              // 1女巫
    "Hunter",                             // 1猎人
    "Guard",                              // 1守卫
    "Villager", "Villager", "Villager",  // 3村民
  ];

  const assignedRoles = fixedRoles && fixedRoles.length === totalPlayers ? fixedRoles : shuffleArray(roles);
  const shuffledModels = shuffleArray([...AVAILABLE_MODELS]);

  const players: Player[] = [];

  for (let seat = 0; seat < totalPlayers; seat++) {
    const role = assignedRoles[seat];
    const alignment: Alignment = role === "Werewolf" ? "wolf" : "village";

    if (seat === humanSeat) {
      players.push({
        playerId: uuidv4(),
        seat,
        displayName: humanName.trim() || "你",
        alive: true,
        role,
        alignment,
        isHuman: true,
      });
    } else {
      const charIndex = seat > humanSeat ? seat - 1 : seat;
      const character = characters[charIndex];
      const modelRef = shuffledModels[charIndex % shuffledModels.length];

      players.push({
        playerId: uuidv4(),
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
  const message: ChatMessage = {
    id: uuidv4(),
    playerId: "system",
    playerName: "主持人",
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
  content: string
): GameState {
  const player = state.players.find((p) => p.playerId === playerId);
  if (!player) return state;

  const message: ChatMessage = {
    id: uuidv4(),
    playerId,
    playerName: player.displayName,
    content,
    timestamp: Date.now(),
    day: state.day,
    phase: state.phase,
  };

  return {
    ...state,
    messages: [...state.messages, message],
  };
}

export function transitionPhase(state: GameState, newPhase: Phase): GameState {
  return {
    ...state,
    phase: newPhase,
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

export function getNextAliveSeat(state: GameState, currentSeat: number): number | null {
  const alivePlayers = state.players.filter((p) => p.alive);
  if (alivePlayers.length === 0) return null;

  const sortedSeats = alivePlayers.map((p) => p.seat).sort((a, b) => a - b);
  const nextSeat = sortedSeats.find((s) => s > currentSeat);
  
  return nextSeat ?? sortedSeats[0];
}

export function tallyVotes(state: GameState): { seat: number; count: number } | null {
  const voteCounts: Record<number, number> = {};
  
  for (const targetSeat of Object.values(state.votes)) {
    voteCounts[targetSeat] = (voteCounts[targetSeat] || 0) + 1;
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

export async function generateDailySummary(
  apiKey: string,
  state: GameState
): Promise<string[]> {
  const startTime = Date.now();

  const dayStartIndex = (() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.isSystem && m.content === "天亮了") return i;
    }
    return 0;
  })();

  const dayMessages = state.messages.slice(dayStartIndex);

  const transcript = dayMessages
    .map((m) => `${m.playerName}: ${m.content}`)
    .join("\n")
    .slice(0, 12000);

  const system = `你是狼人杀的记录员。\n\n把给定的记录压缩为 3-6 条【关键事实】，作为后续玩家长期记忆。\n\n要求：\n- 只总结给定记录中出现过的信息，不要猜测/补全\n- 每条 10-35 字\n- 优先保留：公投出局/遗言、关键站边/指控、明显的归票/改票、夜晚死亡信息（如果在记录里）\n\n输出格式：返回 JSON 数组，例如：["第1天: 2号被放逐，遗言踩10号", "9号曾投给1号"]`;

  const user = `【第${state.day}天 白天记录】\n${transcript}\n\n请返回 JSON 数组：`;

  const messages: OpenRouterMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const result = await generateCompletion(apiKey, {
    model: GENERATOR_MODEL,
    messages,
    temperature: 0.3,
    max_tokens: 220,
  });

  aiLogger.log({
    type: "daily_summary",
    request: {
      model: GENERATOR_MODEL,
      messages,
    },
    response: { content: result.content, duration: Date.now() - startTime },
  });

  try {
    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const arr = JSON.parse(jsonMatch[0]) as unknown;
      if (Array.isArray(arr)) {
        const cleaned = arr
          .filter((x): x is string => typeof x === "string")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 8);
        if (cleaned.length > 0) return cleaned;
      }
    }
  } catch {
    // ignore
  }

  const fallback = result.content
    .split(/\n+/)
    .map((s) => s.replace(/^[-*\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 6);

  return fallback.length > 0 ? fallback : [result.content.trim()].filter(Boolean);
}

export async function* generateAISpeechStream(
  apiKey: string,
  state: GameState,
  player: Player
): AsyncGenerator<string, void, unknown> {
  const { system, user } = SPEECH_PROMPT(state, player);
  const startTime = Date.now();

  const messages: OpenRouterMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  let fullResponse = "";
  try {
    for await (const chunk of generateCompletionStream(apiKey, {
      model: player.agentProfile!.modelRef.model,
      messages,
      temperature: 0.75,
      max_tokens: 300,
    })) {
      fullResponse += chunk;
      yield chunk;
    }

    aiLogger.log({
      type: "speech",
      request: { 
        model: player.agentProfile!.modelRef.model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
      },
      response: { content: fullResponse, duration: Date.now() - startTime },
    });
  } catch (error) {
    aiLogger.log({
      type: "speech",
      request: { 
        model: player.agentProfile!.modelRef.model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
      },
      response: { content: fullResponse, duration: Date.now() - startTime },
      error: String(error),
    });
    throw error;
  }
}

export async function generateAISpeech(
  apiKey: string,
  state: GameState,
  player: Player
): Promise<string> {
  let result = "";
  for await (const chunk of generateAISpeechStream(apiKey, state, player)) {
    result += chunk;
  }
  return result;
}

export async function generateAISpeechSegments(
  apiKey: string,
  state: GameState,
  player: Player
): Promise<string[]> {
  const { system, user } = SPEECH_PROMPT(state, player);
  const startTime = Date.now();

  const messages: OpenRouterMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  try {
    const result = await generateCompletion(apiKey, {
      model: player.agentProfile!.modelRef.model,
      messages,
      temperature: 0.75,
      max_tokens: 400,
    });

    aiLogger.log({
      type: "speech",
      request: { 
        model: player.agentProfile!.modelRef.model,
        messages,
        player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
      },
      response: { content: result.content, duration: Date.now() - startTime },
    });

    // 尝试解析JSON数组
    try {
      const jsonMatch = result.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const segments = JSON.parse(jsonMatch[0]) as string[];
        if (Array.isArray(segments) && segments.length > 0) {
          return segments.filter(s => typeof s === "string" && s.trim());
        }
      }
    } catch {
      // JSON解析失败，按换行分割
    }

    // 降级处理：按换行或句号分割
    const fallbackSegments = result.content
      .replace(/[\[\]"]/g, "")
      .split(/[。！？\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    return fallbackSegments.length > 0 ? fallbackSegments : [result.content];
  } catch (error) {
    aiLogger.log({
      type: "speech",
      request: { 
        model: player.agentProfile!.modelRef.model,
        messages,
        player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
      },
      response: { content: "", duration: Date.now() - startTime },
      error: String(error),
    });
    throw error;
  }
}

export async function generateAIVote(
  apiKey: string,
  state: GameState,
  player: Player
): Promise<number> {
  const { system, user } = VOTE_PROMPT(state, player);
  const alivePlayers = state.players.filter((p) => p.alive && p.playerId !== player.playerId);
  const startTime = Date.now();

  const messages: OpenRouterMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  let result: { content: string };
  try {
    result = await generateCompletion(apiKey, {
      model: player.agentProfile!.modelRef.model,
      messages,
      temperature: 0.5,
      max_tokens: 10,
    });

    aiLogger.log({
      type: "vote",
      request: { 
        model: player.agentProfile!.modelRef.model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
      },
      response: { content: result.content, duration: Date.now() - startTime },
    });
  } catch (error) {
    aiLogger.log({
      type: "vote",
      request: {
        model: player.agentProfile!.modelRef.model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
      },
      response: { content: "", duration: Date.now() - startTime },
      error: String(error),
    });

    if (alivePlayers.length === 0) return player.seat;
    return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
  }

  const match = result.content.match(/\d+/);
  if (match) {
    const seat = parseInt(match[0]) - 1;
    const validSeats = alivePlayers.map((p) => p.seat);
    if (validSeats.includes(seat)) {
      return seat;
    }
  }

  if (alivePlayers.length === 0) return player.seat;
  return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
}

export async function generateAIBadgeVote(
  apiKey: string,
  state: GameState,
  player: Player
): Promise<number> {
  const { system, user } = BADGE_ELECTION_PROMPT(state, player);
  const alivePlayers = state.players.filter((p) => p.alive && p.playerId !== player.playerId);
  const startTime = Date.now();

  const messages: OpenRouterMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const result = await generateCompletion(apiKey, {
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: 0.5,
    max_tokens: 10,
  });

  aiLogger.log({
    type: "badge_vote",
    request: {
      model: player.agentProfile!.modelRef.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
    },
    response: { content: result.content, duration: Date.now() - startTime },
  });

  const match = result.content.match(/\d+/);
  if (match) {
    const seat = parseInt(match[0]) - 1;
    const validSeats = alivePlayers.map((p) => p.seat);
    if (validSeats.includes(seat)) {
      return seat;
    }
  }

  return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
}

export async function generateSeerAction(
  apiKey: string,
  state: GameState,
  player: Player
): Promise<number> {
  const { system, user } = SEER_ACTION_PROMPT(state, player);
  const alivePlayers = state.players.filter(
    (p) => p.alive && p.playerId !== player.playerId
  );
  const startTime = Date.now();

  const messages: OpenRouterMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const result = await generateCompletion(apiKey, {
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: 0.5,
    max_tokens: 10,
  });

  aiLogger.log({
    type: "seer_action",
    request: { 
      model: player.agentProfile!.modelRef.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
    },
    response: { content: result.content, duration: Date.now() - startTime },
  });

  const match = result.content.match(/\d+/);
  if (match) {
    const seat = parseInt(match[0]) - 1;
    const validSeats = alivePlayers.map((p) => p.seat);
    if (validSeats.includes(seat)) {
      return seat;
    }
  }

  return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
}

export async function generateWolfAction(
  apiKey: string,
  state: GameState,
  player: Player,
  existingVotes: Record<string, number> = {}
): Promise<number> {
  const { system, user } = WOLF_ACTION_PROMPT(state, player, existingVotes);
  const alivePlayers = state.players.filter(
    (p) => p.alive && p.alignment === "village"
  );
  const startTime = Date.now();

  const messages: OpenRouterMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const result = await generateCompletion(apiKey, {
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: 0.5,
    max_tokens: 10,
  });

  aiLogger.log({
    type: "wolf_action",
    request: { 
      model: player.agentProfile!.modelRef.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
    },
    response: { content: result.content, duration: Date.now() - startTime },
  });

  const match = result.content.match(/\d+/);
  if (match) {
    const seat = parseInt(match[0]) - 1;
    const validSeats = alivePlayers.map((p) => p.seat);
    if (validSeats.includes(seat)) {
      return seat;
    }
  }

  return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
}

// ============================================
// 守卫行动
// ============================================

export async function generateGuardAction(
  apiKey: string,
  state: GameState,
  player: Player
): Promise<number> {
  const { system, user } = GUARD_ACTION_PROMPT(state, player);
  const lastTarget = state.nightActions.lastGuardTarget;
  const alivePlayers = state.players.filter(
    (p) => p.alive && p.seat !== lastTarget
  );
  const startTime = Date.now();

  const messages: OpenRouterMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const result = await generateCompletion(apiKey, {
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: 0.5,
    max_tokens: 10,
  });

  aiLogger.log({
    type: "guard_action",
    request: { 
      model: player.agentProfile!.modelRef.model,
      messages,
      player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
    },
    response: { content: result.content, duration: Date.now() - startTime },
  });

  const match = result.content.match(/\d+/);
  if (match) {
    const seat = parseInt(match[0]) - 1;
    const validSeats = alivePlayers.map((p) => p.seat);
    if (validSeats.includes(seat)) {
      return seat;
    }
  }

  return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
}

// ============================================
// 女巫行动
// ============================================

export interface WitchAction {
  type: "save" | "poison" | "pass";
  target?: number;
}

export async function generateWitchAction(
  apiKey: string,
  state: GameState,
  player: Player,
  wolfTarget: number | undefined
): Promise<WitchAction> {
  const { system, user } = WITCH_ACTION_PROMPT(state, player, wolfTarget);
  const startTime = Date.now();

  const messages: OpenRouterMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const result = await generateCompletion(apiKey, {
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: 0.5,
    max_tokens: 20,
  });

  aiLogger.log({
    type: "witch_action",
    request: { 
      model: player.agentProfile!.modelRef.model,
      messages,
      player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
    },
    response: { content: result.content, duration: Date.now() - startTime },
  });

  const content = result.content.toLowerCase().trim();
  
  // 解析女巫的决定（女巫不可自救）
  const isWitchTheVictim = wolfTarget === player.seat;
  if (content.includes("save") && !state.roleAbilities.witchHealUsed && wolfTarget !== undefined && !isWitchTheVictim) {
    return { type: "save" };
  }
  
  const poisonMatch = content.match(/poison\s*(\d+)/i);
  if (poisonMatch && !state.roleAbilities.witchPoisonUsed) {
    const targetSeat = parseInt(poisonMatch[1]) - 1;
    const alivePlayers = state.players.filter((p) => p.alive && p.playerId !== player.playerId);
    if (alivePlayers.some((p) => p.seat === targetSeat)) {
      return { type: "poison", target: targetSeat };
    }
  }

  return { type: "pass" };
}

// ============================================
// 猎人开枪
// ============================================

export async function generateHunterShoot(
  apiKey: string,
  state: GameState,
  player: Player
): Promise<number | null> {
  const { system, user } = HUNTER_SHOOT_PROMPT(state, player);
  const alivePlayers = state.players.filter(
    (p) => p.alive && p.playerId !== player.playerId
  );
  const startTime = Date.now();

  const messages: OpenRouterMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const result = await generateCompletion(apiKey, {
    model: player.agentProfile!.modelRef.model,
    messages,
    temperature: 0.5,
    max_tokens: 10,
  });

  aiLogger.log({
    type: "hunter_shoot",
    request: { 
      model: player.agentProfile!.modelRef.model,
      messages,
      player: { playerId: player.playerId, displayName: player.displayName, seat: player.seat, role: player.role },
    },
    response: { content: result.content, duration: Date.now() - startTime },
  });

  const content = result.content.toLowerCase().trim();
  if (content.includes("pass")) {
    return null;
  }

  const match = result.content.match(/\d+/);
  if (match) {
    const seat = parseInt(match[0]) - 1;
    const validSeats = alivePlayers.map((p) => p.seat);
    if (validSeats.includes(seat)) {
      return seat;
    }
  }

  // 猎人随机选择一个目标
  return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
}
