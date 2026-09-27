/**
 * 真实模型完整对局审计。
 *
 * 复用线上同一套 Prompt 构建（game-master / Phase 类）与状态流转规则，
 * 只把浏览器到 /api/chat 的网络层换成直连 Provider，并跳过语音、动画和鉴权。
 * 全员 AI（等价观战模式），跑完整局后输出：
 *   - ai-logs.json   每一次模型请求的完整 Prompt 与响应
 *   - transcript.md  带上帝视角标注的对局记录，供人工核对前后一致性
 *   - state.json     终局 GameState
 *
 * 用法：pnpm audit:full-game:live [--players 10] [--max-days 6] [--tag name]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AILogEntry } from "@/lib/ai-logger";
import type { LLMMessage } from "@/lib/llm";
import { applyDeepSeekPromptScope, type PromptScope } from "@/lib/deepseek-prompt-scope";
import { applyTokenDanceResponseFormat } from "@/lib/tokendance-response-format";
import {
  ALL_MODELS,
  PROJECT_MODELS,
  isWolfRole,
  type Alignment,
  type GameState,
  type Phase,
  type Player,
} from "@/types/game";

const ZENMUX_API_URL = "https://zenmux.ai/api/v1/chat/completions";
const MAX_PROVIDER_CALLS = 600;
const VOTE_CONCURRENCY = 4;

const argValue = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const PLAYER_COUNT = Number(argValue("players") ?? 10);
const MAX_DAYS = Number(argValue("max-days") ?? 6);
const RUN_TAG = argValue("tag") ?? new Date().toISOString().replace(/[:.]/g, "-");
const OUTPUT_DIR = path.resolve(argValue("out") ?? `dry-runs/full-game/${RUN_TAG}`);

type ReasoningPayload = { enabled?: boolean; effort?: string; max_tokens?: number };
type ChatPayload = {
  model: string;
  provider?: "zenmux" | "dashscope" | "tokendance";
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  reasoning?: ReasoningPayload;
  response_format?: unknown;
  prompt_scope?: PromptScope;
  stream?: boolean;
};

type GameEvent =
  | { kind: "night"; day: number; guard?: number; wolf?: number; witch: string; seer?: { target: number; isWolf: boolean }; deaths: Array<{ seat: number; reason: string }> }
  | { kind: "system"; day: number; phase: Phase; text: string }
  | { kind: "speech"; day: number; phase: Phase; seat: number; segments: string[] }
  | { kind: "badge_signup"; day: number; candidates: number[] }
  | { kind: "badge_vote"; day: number; round: number; votes: Array<{ seat: number; target: number }>; winner: number | null }
  | { kind: "vote"; day: number; round: number; votes: Array<{ seat: number; target: number; reason: string }>; executed: number | null; note: string }
  | { kind: "action"; day: number; phase: Phase; text: string };

const originalFetch = globalThis.fetch;
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const print = (...args: unknown[]) => originalConsoleLog(...args);

let providerCalls = 0;
const usageTotal = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 };

// ---------------------------------------------------------------------------
// Provider 直连：逐项对齐 src/app/api/chat/route.ts 的请求体组装
// ---------------------------------------------------------------------------
const getModelRef = (model: string) =>
  ALL_MODELS.find((ref) => ref.model === model) ?? PROJECT_MODELS.find((ref) => ref.model === model);

const isDeepSeek = (model: string) => /^deepseek[/-]/i.test(model);

const coalesceTextParts = (messages: LLMMessage[]): unknown[] =>
  messages.map((message) => {
    if (!Array.isArray(message.content)) return message;
    return {
      ...message,
      content: message.content
        .flatMap((part) => (part.type === "text" ? [part.text.trim()] : []))
        .filter(Boolean)
        .join("\n\n"),
    };
  });

function buildProviderRequest(payload: ChatPayload): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const ref = getModelRef(payload.model);
  const provider = payload.provider ?? ref?.provider ?? "zenmux";
  const rawTemperature = ref?.temperature ?? payload.temperature ?? 0.7;
  const reasoning = ref?.reasoning ?? payload.reasoning;
  let messages = coalesceTextParts(payload.messages);
  if (isDeepSeek(payload.model)) {
    messages = applyDeepSeekPromptScope(messages, payload.prompt_scope ?? "utility");
  }

  if (provider === "tokendance") {
    const base = process.env.TOKENDANCE_BASE_URL?.trim().replace(/\/+$/, "");
    if (!base || !process.env.TOKENDANCE_API_KEY) throw new Error("缺少 TOKENDANCE_API_KEY 或 TOKENDANCE_BASE_URL");
    const body: Record<string, unknown> = {
      model: payload.model,
      messages,
      temperature: Math.max(0, rawTemperature),
    };
    if (typeof payload.max_tokens === "number") body.max_tokens = Math.max(16, Math.floor(payload.max_tokens));
    if (reasoning !== undefined) {
      body.thinking = reasoning.enabled === true ? { type: "enabled" } : { type: "disabled" };
    }
    if (payload.response_format) applyTokenDanceResponseFormat(body, payload.response_format);
    if (payload.stream) body.stream = true;
    return {
      url: `${base}/chat/completions`,
      headers: { Authorization: `Bearer ${process.env.TOKENDANCE_API_KEY}`, "Content-Type": "application/json" },
      body,
    };
  }

  if (provider === "zenmux") {
    if (!process.env.ZENMUX_API_KEY) throw new Error("缺少 ZENMUX_API_KEY");
    const body: Record<string, unknown> = {
      model: payload.model,
      messages,
      temperature: Math.min(Math.max(0, rawTemperature), 1),
      reasoning: reasoning?.enabled === true
        ? { enabled: true, ...(reasoning.effort ? { effort: reasoning.effort } : {}) }
        : { enabled: false },
    };
    if (typeof payload.max_tokens === "number") body.max_tokens = Math.max(16, Math.floor(payload.max_tokens));
    if (payload.response_format) body.response_format = payload.response_format;
    if (payload.stream) body.stream = true;
    return {
      url: ZENMUX_API_URL,
      headers: { Authorization: `Bearer ${process.env.ZENMUX_API_KEY}`, "Content-Type": "application/json" },
      body,
    };
  }

  throw new Error(`审计脚本未覆盖的 Provider：${provider}`);
}

async function callProvider(payload: ChatPayload): Promise<Response> {
  providerCalls += 1;
  if (providerCalls > MAX_PROVIDER_CALLS) throw new Error(`超过审计调用上限 ${MAX_PROVIDER_CALLS}`);
  const { url, headers, body } = buildProviderRequest(payload);
  // 网关对单个 Key 有并发上限；并行对局时退避重试，避免把限流误记成模型行为。
  let response = await originalFetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  for (let attempt = 1; attempt <= 5 && [429, 502, 503].includes(response.status); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    response = await originalFetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  }
  return response;
}

function trackUsage(data: unknown) {
  const usage = (data as { usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } })?.usage;
  if (!usage) return;
  usageTotal.promptTokens += usage.prompt_tokens ?? 0;
  usageTotal.completionTokens += usage.completion_tokens ?? 0;
  usageTotal.cachedTokens += usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0;
}

function installTransport() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "/api/demo-config") return Response.json({ enabled: false, active: false });
    if (url !== "/api/chat") throw new Error(`审计发现未授权网络请求：${url}`);

    const body = JSON.parse(String(init?.body ?? "{}")) as ChatPayload & { requests?: ChatPayload[] };
    if (Array.isArray(body.requests)) {
      const results = await Promise.all(body.requests.map(async (request) => {
        const response = await callProvider(request);
        const text = await response.text();
        if (!response.ok) return { ok: false, status: response.status, error: `provider ${response.status}`, details: text };
        const data = JSON.parse(text);
        trackUsage(data);
        return { ok: true, data };
      }));
      return Response.json({ results });
    }

    const response = await callProvider(body);
    if (body.stream) {
      return new Response(response.body, { status: response.status, headers: { "Content-Type": "text/event-stream" } });
    }
    const text = await response.text();
    if (response.ok) {
      try { trackUsage(JSON.parse(text)); } catch { /* 由调用方报告解析失败 */ }
    }
    return new Response(text, { status: response.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  const muted = ["[LLM]", "[streaming]", "[character-gen]"];
  console.log = (...args: unknown[]) => {
    if (typeof args[0] === "string" && muted.some((prefix) => (args[0] as string).startsWith(prefix))) return;
    originalConsoleLog(...args);
  };
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

async function withRetry<T>(label: string, task: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      print(`  ! ${label} 第${attempt}次失败：${String(error).slice(0, 200)}`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// 对局编排：逐段对齐 useGameLogic / useBadgePhase / useSpecialEvents / Phase 类
// ---------------------------------------------------------------------------
async function runFullGame() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = "full-game-audit-anon-key";
  installTransport();

  const [{ setLocale }, { aiLogger }, gm, { generateCharacters, sampleModelRefs }, { getRandomScenario }, speechOrder, { recordVoteRound }, { getSystemMessages }, { getI18n }, { GAME_CONFIG }] =
    await Promise.all([
      import("@/i18n/locale-store"),
      import("@/lib/ai-logger"),
      import("@/lib/game-master"),
      import("@/lib/character-generator"),
      import("@/lib/scenarios"),
      import("@/lib/speech-order"),
      import("@/lib/vote-rounds"),
      import("@/lib/game-texts"),
      import("@/i18n/translator"),
      import("@/lib/game-constants"),
    ]);
  setLocale("zh");
  const { t } = getI18n();
  const sys = getSystemMessages();

  const aiLogs: AILogEntry[] = [];
  const unsubscribe = aiLogger.subscribe((entry) => { aiLogs.push(entry); });
  const events: GameEvent[] = [];
  const seatOf = (seat: number) => `${seat + 1}号`;

  const addSystem = (state: GameState, text: string): GameState => {
    if (!text.startsWith("[VOTE_RESULT]")) events.push({ kind: "system", day: state.day, phase: state.phase, text });
    return gm.addSystemMessage(state, text);
  };

  // ---- 开局：真实角色生成 + 真实发牌 ----
  print(`[开局] 生成 ${PLAYER_COUNT} 名 AI 角色…`);
  const scenario = getRandomScenario();
  const characters = await withRetry("角色生成", () => generateCharacters(PLAYER_COUNT, scenario, {}));
  const modelRefs = sampleModelRefs(PLAYER_COUNT);
  // 与 useGameLogic.startGame 一致：座位到角色的映射必须显式传入，观战模式下全部座位都是 AI。
  const aiSeatOrder = Array.from({ length: PLAYER_COUNT }, (_, seat) => seat);
  for (let i = aiSeatOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [aiSeatOrder[i], aiSeatOrder[j]] = [aiSeatOrder[j], aiSeatOrder[i]];
  }
  const players = gm.setupPlayers(characters, -1, "", PLAYER_COUNT, undefined, undefined, modelRefs, aiSeatOrder);
  if (new Set(players.map((p) => p.displayName)).size !== players.length) {
    throw new Error("座位与角色映射出现重名，审计结果不可用");
  }
  let state: GameState = {
    ...gm.createInitialGameState(),
    gameSessionId: null,
    scenario,
    players,
    phase: "NIGHT_START",
    day: 1,
    difficulty: "normal",
    isSpectatorMode: true,
  };
  state = gm.addSystemMessage(state, sys.gameStart);
  state = gm.addSystemMessage(state, sys.nightFall(1));
  print(players.map((p) => `${seatOf(p.seat)} ${p.displayName} = ${p.role} (${p.agentProfile?.modelRef.model})`).join("\n"));

  const persist = async (winner: Alignment | null, note: string) => {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(path.join(OUTPUT_DIR, "ai-logs.json"), JSON.stringify(aiLogs, null, 2), "utf8");
    await writeFile(path.join(OUTPUT_DIR, "state.json"), JSON.stringify(state, null, 2), "utf8");
    await writeFile(path.join(OUTPUT_DIR, "events.json"), JSON.stringify({ players: state.players.map((p) => ({ seat: p.seat + 1, name: p.displayName, role: p.role, persona: p.agentProfile?.persona, playerMind: p.agentProfile?.playerMind })), events }, null, 2), "utf8");
    await writeFile(path.join(OUTPUT_DIR, "transcript.md"), renderTranscript(state, events, winner, note), "utf8");
  };

  const speak = async (input: GameState, player: Player): Promise<GameState> => {
    let next: GameState = { ...input, currentSpeakerSeat: player.seat };
    const segments = await withRetry(`${seatOf(player.seat)}发言`, () => gm.generateAISpeechSegments(next, player));
    for (const segment of segments) next = gm.addPlayerMessage(next, player.playerId, segment);
    events.push({ kind: "speech", day: next.day, phase: next.phase, seat: player.seat, segments });
    print(`  [${next.phase}] ${seatOf(player.seat)}(${player.role}): ${segments.join(" ").slice(0, 120)}`);
    return next;
  };

  /** 白狼王自爆：对齐 useGameLogic.wwkBoomCheckRef */
  const applyBoom = (input: GameState, wwk: Player, targetSeat: number): GameState => {
    let next = gm.transitionPhase(input, "WHITE_WOLF_KING_BOOM");
    next = gm.killPlayer(next, wwk.seat);
    next = { ...next, roleAbilities: { ...next.roleAbilities, whiteWolfKingBoomUsed: true } };
    const target = next.players.find((p) => p.seat === targetSeat);
    if (target?.alive) {
      next = gm.killPlayer(next, targetSeat);
      next = addSystem(next, t("system.whiteWolfKingBoom", { seat: wwk.seat + 1, name: wwk.displayName, targetSeat: targetSeat + 1, targetName: target.displayName }));
      next = { ...next, dayHistory: { ...(next.dayHistory || {}), [next.day]: { ...(next.dayHistory?.[next.day] || {}), whiteWolfKingBoom: { boomSeat: wwk.seat, targetSeat } } } };
    }
    const sheriffSeat = next.badge.holderSeat;
    if (sheriffSeat !== null && !next.players.find((p) => p.seat === sheriffSeat)?.alive) {
      const sheriff = next.players.find((p) => p.seat === sheriffSeat);
      next = addSystem(next, t("system.badgeForceTorn", { seat: sheriffSeat + 1, name: sheriff?.displayName || "" }));
      next = { ...next, badge: { ...next.badge, holderSeat: null } };
    }
    return next;
  };

  type RoundOutcome = { state: GameState; boom?: { targetSeat: number } };
  const runSpeechRound = async (input: GameState, firstSeat: number | null): Promise<RoundOutcome> => {
    let current: GameState = { ...input, currentSpeakerSeat: firstSeat };
    while (current.currentSpeakerSeat !== null) {
      const speaker = current.players.find((p) => p.seat === current.currentSpeakerSeat)!;
      current = await speak(current, speaker);
      if ((current.phase === "DAY_SPEECH" || current.phase === "DAY_PK_SPEECH") && speaker.role === "WhiteWolfKing" &&
          speaker.alive && !current.roleAbilities.whiteWolfKingBoomUsed) {
        const targetSeat = await gm.generateWhiteWolfKingBoomDecision(current, speaker);
        if (targetSeat !== null) {
          events.push({ kind: "action", day: current.day, phase: current.phase, text: `${seatOf(speaker.seat)}白狼王自爆带走${seatOf(targetSeat)}` });
          return { state: applyBoom(current, speaker, targetSeat), boom: { targetSeat } };
        }
      }
      const nextSeat = speechOrder.getNextSpeechSeat(current);
      if (nextSeat === null) break;
      current = { ...current, currentSpeakerSeat: nextSeat };
    }
    return { state: current };
  };

  /** 警徽移交：对齐 useBadgePhase.handleBadgeTransfer */
  const transferBadge = async (input: GameState, sheriff: Player): Promise<GameState> => {
    let next = gm.transitionPhase(input, "BADGE_TRANSFER");
    next = addSystem(next, sys.badgeTransferStart(sheriff.seat + 1, sheriff.displayName));
    const targetSeat = await gm.generateBadgeTransfer(next, sheriff);
    if (targetSeat === gm.BADGE_TRANSFER_TORN) {
      next = { ...next, badge: { ...next.badge, holderSeat: null } };
      next = addSystem(next, sys.badgeTorn(sheriff.seat + 1, sheriff.displayName));
    } else {
      const target = next.players.find((p) => p.seat === targetSeat);
      if (target) {
        next = { ...next, badge: { ...next.badge, holderSeat: targetSeat } };
        next = addSystem(next, sys.badgeTransferred(sheriff.seat + 1, targetSeat + 1, target.displayName));
      }
    }
    return next;
  };

  const transferIfSheriffDead = async (input: GameState): Promise<GameState> => {
    const sheriffSeat = input.badge.holderSeat;
    const deadSheriff = sheriffSeat === null ? undefined : input.players.find((p) => p.seat === sheriffSeat && !p.alive);
    return deadSheriff ? transferBadge(input, deadSheriff) : input;
  };

  /** 猎人开枪：对齐 useSpecialEvents.handleHunterDeath + continueAfterHunterShot */
  const hunterShoot = async (input: GameState, hunter: Player, diedAtNight: boolean): Promise<{ state: GameState; winner: Alignment | null }> => {
    let next = gm.transitionPhase(input, "HUNTER_SHOOT");
    const targetSeat = await gm.generateHunterShoot(next, hunter);
    events.push({ kind: "action", day: next.day, phase: next.phase, text: `${seatOf(hunter.seat)}猎人${targetSeat === null ? "选择不开枪" : `开枪带走${seatOf(targetSeat)}`}` });
    if (targetSeat !== null) {
      next = gm.killPlayer(next, targetSeat);
      const target = next.players.find((p) => p.seat === targetSeat);
      if (target) next = addSystem(next, sys.hunterShoot(hunter.seat + 1, targetSeat + 1, target.displayName));
      const shot = { hunterSeat: hunter.seat, targetSeat };
      next = diedAtNight
        ? { ...next, nightHistory: { ...(next.nightHistory || {}), [next.day]: { ...(next.nightHistory?.[next.day] || {}), hunterShot: shot } } }
        : { ...next, dayHistory: { ...(next.dayHistory || {}), [next.day]: { ...(next.dayHistory?.[next.day] || {}), hunterShot: shot } } };
    }
    const winner = gm.checkWinCondition(next);
    if (winner) return { state: next, winner };
    return { state: await transferIfSheriffDead(next), winner: null };
  };

  // ---- 夜晚：对齐 NightPhase.runNightPhase + useSpecialEvents.resolveNight ----
  const runNight = async (input: GameState): Promise<GameState> => {
    let next = input;
    print(`\n===== 第${next.day}夜 =====`);
    if (next.players.some((p) => p.role === "Guard")) {
      next = gm.transitionPhase(next, "NIGHT_GUARD_ACTION");
      next = gm.addSystemMessage(next, sys.guardActionStart);
      const guard = next.players.find((p) => p.role === "Guard" && p.alive);
      if (guard) {
        const guardTarget = await gm.generateGuardAction(next, guard);
        if (guardTarget !== undefined) next = { ...next, nightActions: { ...next.nightActions, guardTarget } };
      }
    }

    next = gm.transitionPhase(next, "NIGHT_WOLF_ACTION");
    next = gm.addSystemMessage(next, sys.wolfActionStart);
    const wolves = next.players.filter((p) => isWolfRole(p.role) && p.alive);
    if (wolves.length > 0) {
      const wolfTarget = await gm.generateWolfAction(next, wolves[0], {});
      const wolfVotes = wolfTarget === undefined ? {} : Object.fromEntries(wolves.map((w) => [w.playerId, wolfTarget]));
      next = { ...next, nightActions: { ...next.nightActions, wolfVotes, ...(wolfTarget !== undefined ? { wolfTarget } : {}) } };
    }

    next = gm.transitionPhase(next, "NIGHT_WITCH_ACTION");
    next = gm.addSystemMessage(next, sys.witchActionStart);
    const witch = next.players.find((p) => p.role === "Witch" && p.alive);
    let witchNote = "无女巫或无药";
    if (witch && (!next.roleAbilities.witchHealUsed || !next.roleAbilities.witchPoisonUsed)) {
      const action = await gm.generateWitchAction(next, witch, next.nightActions.wolfTarget);
      if (action.type === "save") {
        next = { ...next, nightActions: { ...next.nightActions, witchSave: true }, roleAbilities: { ...next.roleAbilities, witchHealUsed: true } };
        witchNote = "使用解药";
      } else if (action.type === "poison") {
        next = { ...next, nightActions: { ...next.nightActions, witchPoison: action.target }, roleAbilities: { ...next.roleAbilities, witchPoisonUsed: true } };
        witchNote = `毒${seatOf(action.target)}`;
      } else {
        witchNote = "不用药";
      }
    }

    next = gm.transitionPhase(next, "NIGHT_SEER_ACTION");
    next = gm.addSystemMessage(next, sys.seerActionStart);
    const seer = next.players.find((p) => p.role === "Seer" && p.alive);
    if (seer) {
      const targetSeat = await gm.generateSeerAction(next, seer);
      if (targetSeat !== undefined) {
        const isWolf = next.players.find((p) => p.seat === targetSeat)?.alignment === "wolf";
        next = {
          ...next,
          nightActions: {
            ...next.nightActions,
            seerTarget: targetSeat,
            seerResult: { targetSeat, isWolf },
            seerHistory: [...(next.nightActions.seerHistory || []), { targetSeat, isWolf, day: next.day }],
          },
        };
      }
    }

    // resolveNight
    next = gm.transitionPhase(next, "NIGHT_RESOLVE");
    const { wolfTarget, guardTarget, witchSave, witchPoison } = next.nightActions;
    const deaths: Array<{ seat: number; reason: "wolf" | "poison" | "milk" }> = [];
    let wolfVictimSeat: number | undefined;
    if (wolfTarget !== undefined) {
      const isProtected = guardTarget === wolfTarget;
      const isSaved = witchSave === true;
      if ((isProtected && isSaved) || (!isProtected && !isSaved)) {
        wolfVictimSeat = wolfTarget;
        deaths.push({ seat: wolfTarget, reason: isProtected && isSaved ? "milk" : "wolf" });
      }
    }
    if (witchPoison !== undefined) {
      const existing = deaths.find((d) => d.seat === witchPoison);
      if (existing) existing.reason = "poison";
      else deaths.push({ seat: witchPoison, reason: "poison" });
    }
    next = {
      ...next,
      nightActions: { ...next.nightActions, lastGuardTarget: guardTarget, pendingWolfVictim: wolfVictimSeat, pendingPoisonVictim: witchPoison },
    };
    next = {
      ...next,
      nightHistory: {
        ...(next.nightHistory || {}),
        [next.day]: {
          guardTarget: next.nightActions.guardTarget,
          wolfTarget: next.nightActions.wolfTarget,
          witchSave: next.nightActions.witchSave,
          witchPoison: next.nightActions.witchPoison,
          seerTarget: next.nightActions.seerTarget,
          seerResult: next.nightActions.seerResult,
          deaths,
          resultsAnnounced: false,
        },
      },
    };
    events.push({
      kind: "night", day: next.day, guard: guardTarget, wolf: wolfTarget, witch: witchNote,
      seer: next.nightActions.seerResult ? { target: next.nightActions.seerResult.targetSeat, isWolf: next.nightActions.seerResult.isWolf } : undefined,
      deaths,
    });
    print(`  守:${guardTarget === undefined ? "-" : seatOf(guardTarget)} 刀:${wolfTarget === undefined ? "-" : seatOf(wolfTarget)} 女巫:${witchNote} 验:${next.nightActions.seerResult ? `${seatOf(next.nightActions.seerResult.targetSeat)}=${next.nightActions.seerResult.isWolf ? "狼" : "好人"}` : "-"} 死:${deaths.map((d) => seatOf(d.seat)).join(",") || "无"}`);

    next = gm.transitionPhase(next, "DAY_START");
    next = gm.addSystemMessage(next, sys.dayBreak);
    return next;
  };

  // ---- 警徽竞选：对齐 useBadgePhase ----
  const tallyBadge = (current: GameState, candidates: number[]) => {
    const aliveIds = new Set(current.players.filter((p) => p.alive).map((p) => p.playerId));
    const counts: Record<number, number> = {};
    for (const [voterId, seat] of Object.entries(current.badge.votes)) {
      if (!aliveIds.has(voterId) || !candidates.includes(seat)) continue;
      counts[seat] = (counts[seat] || 0) + 1;
    }
    const max = Math.max(-1, ...Object.values(counts));
    return { counts, topSeats: Object.entries(counts).filter(([, c]) => c === max).map(([s]) => Number(s)) };
  };

  const badgeVoteDetails = (current: GameState, candidates: number[]) => {
    const groups: Record<number, number[]> = {};
    for (const [voterId, seat] of Object.entries(current.badge.votes)) {
      const voter = current.players.find((p) => p.playerId === voterId);
      if (!voter?.alive || !candidates.includes(seat)) continue;
      (groups[seat] ||= []).push(voter.seat);
    }
    const results = Object.entries(groups)
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([targetSeat, voters]) => ({
        targetSeat: Number(targetSeat),
        targetName: current.players.find((p) => p.seat === Number(targetSeat))?.displayName ?? "",
        voterSeats: voters,
        voteCount: voters.length,
      }));
    return `[VOTE_RESULT]${JSON.stringify({ title: t("badgePhase.voteDetailTitle"), results })}`;
  };

  const runBadgeElection = async (input: GameState): Promise<GameState> => {
    print(`\n===== 第${input.day}天 警徽竞选 =====`);
    let next = gm.transitionPhase(input, "DAY_BADGE_SIGNUP");
    next = { ...next, currentSpeakerSeat: null, daySpeechStartSeat: null, badge: { ...next.badge, signup: {}, candidates: [] } };
    next = addSystem(next, t("badgePhase.signupStart"));
    const signup = await gm.generateAIBadgeSignupBatch(next, next.players.filter((p) => p.alive));
    next = { ...next, badge: { ...next.badge, signup } };
    const candidates = next.players.filter((p) => p.alive && signup[p.playerId] === true).map((p) => p.seat);
    events.push({ kind: "badge_signup", day: next.day, candidates });
    print(`  上警：${candidates.map(seatOf).join("、") || "无人"}`);
    if (candidates.length === 0) return addSystem(next, t("badgePhase.noSignup"));

    next = gm.transitionPhase({ ...next, badge: { ...next.badge, candidates } }, "DAY_BADGE_SPEECH");
    next = addSystem(next, sys.badgeSpeechStart);
    const startSeat = candidates[Math.floor(Math.random() * candidates.length)];
    next = { ...next, daySpeechStartSeat: startSeat };
    next = (await runSpeechRound(next, startSeat)).state;

    let isRevote = false;
    while (true) {
      next = next.phase === "DAY_BADGE_ELECTION" ? next : gm.transitionPhase(next, "DAY_BADGE_ELECTION");
      next = { ...next, currentSpeakerSeat: null, badge: { ...next.badge, votes: {}, revoteCount: isRevote ? next.badge.revoteCount : 0 } };
      if (!isRevote) next = addSystem(next, sys.badgeElectionStart);
      const roundCandidates = next.badge.candidates;

      if (roundCandidates.length === 1) {
        const winnerSeat = roundCandidates[0];
        const winner = next.players.find((p) => p.seat === winnerSeat);
        next = { ...next, badge: { ...next.badge, holderSeat: winnerSeat, allVotes: {}, history: { ...next.badge.history, [next.day]: {} }, electionWinners: { ...next.badge.electionWinners, [next.day]: winnerSeat } } };
        return addSystem(next, t("badgePhase.autoElected", { seat: winnerSeat + 1, name: winner?.displayName || "" }));
      }

      const voters = next.players.filter((p) => p.alive && !roundCandidates.includes(p.seat));
      const snapshot = next;
      const ballots = await mapLimit(voters, VOTE_CONCURRENCY, async (voter) => {
        let target = await gm.generateAIBadgeVote(snapshot, voter);
        if (target !== gm.BADGE_VOTE_ABSTAIN && !roundCandidates.includes(target)) target = gm.BADGE_VOTE_ABSTAIN;
        return { voter, target };
      });
      next = { ...next, badge: { ...next.badge, votes: Object.fromEntries(ballots.map((b) => [b.voter.playerId, b.target])) } };

      const { counts, topSeats } = tallyBadge(next, roundCandidates);
      const round = (next.badge.revoteCount || 0) + 1;
      next = recordVoteRound(next, {
        kind: "badge", round, candidates: roundCandidates, votes: next.badge.votes, sheriffSeat: null,
        winnerSeat: topSeats.length === 1 ? topSeats[0] : null,
        outcome: topSeats.length === 1 ? "elected" : topSeats.length ? "tie" : "no-votes",
      });
      events.push({ kind: "badge_vote", day: next.day, round, votes: ballots.map((b) => ({ seat: b.voter.seat, target: b.target })), winner: topSeats.length === 1 ? topSeats[0] : null });
      const detail = badgeVoteDetails(next, roundCandidates);
      const finalVotes = { ...next.badge.votes };

      if (topSeats.length === 1) {
        const winnerSeat = topSeats[0];
        const winner = next.players.find((p) => p.seat === winnerSeat);
        next = { ...next, badge: { ...next.badge, holderSeat: winnerSeat, allVotes: {}, history: { ...next.badge.history, [next.day]: finalVotes }, electionWinners: { ...next.badge.electionWinners, [next.day]: winnerSeat } } };
        next = gm.addSystemMessage(next, detail);
        print(`  警长：${seatOf(winnerSeat)}`);
        return addSystem(next, sys.badgeElected(winnerSeat + 1, winner?.displayName || "", counts[winnerSeat] || 0));
      }

      if (round >= GAME_CONFIG.MAX_BADGE_REVOTE_COUNT) {
        next = { ...next, badge: { ...next.badge, holderSeat: null, votes: {}, allVotes: {}, candidates: [], revoteCount: round, history: { ...next.badge.history, [next.day]: finalVotes }, electionWinners: { ...next.badge.electionWinners, [next.day]: null } } };
        next = gm.addSystemMessage(next, detail);
        return addSystem(next, t("badgePhase.tieTear" as never));
      }

      // 平票进入警徽 PK
      next = { ...next, badge: { ...next.badge, votes: {}, allVotes: finalVotes, revoteCount: round, candidates: topSeats } };
      next = gm.addSystemMessage(next, detail);
      next = gm.transitionPhase(next, "DAY_PK_SPEECH");
      next = { ...next, pkTargets: topSeats, pkSource: "badge", daySpeechStartSeat: topSeats[0], badge: { ...next.badge, candidates: topSeats, votes: {} } };
      next = addSystem(next, t("badgePhase.tiePk"));
      next = (await runSpeechRound(next, topSeats[0])).state;
      next = { ...next, pkTargets: undefined, pkSource: undefined };
      isRevote = true;
    }
  };

  // ---- 放逐投票：对齐 VotePhase ----
  const executionVoteDetails = (current: GameState, votes: Record<string, number>) => {
    const sheriffId = current.badge.holderSeat === null ? undefined
      : current.players.find((p) => p.seat === current.badge.holderSeat && p.alive)?.playerId;
    const aliveSeats = new Set(current.players.filter((p) => p.alive).map((p) => p.seat));
    const groups: Record<number, Player[]> = {};
    for (const [voterId, seat] of Object.entries(votes)) {
      const voter = current.players.find((p) => p.playerId === voterId);
      if (!voter?.alive || !aliveSeats.has(seat)) continue;
      (groups[seat] ||= []).push(voter);
    }
    const results = Object.entries(groups).map(([targetSeat, voters]) => ({
      targetSeat: Number(targetSeat),
      targetName: current.players.find((p) => p.seat === Number(targetSeat))?.displayName ?? "",
      voterSeats: voters.map((v) => v.seat),
      voteCount: voters.reduce((sum, v) => sum + (v.playerId === sheriffId ? 1.5 : 1), 0),
    })).sort((a, b) => b.voteCount - a.voteCount);
    return `[VOTE_RESULT]${JSON.stringify({ title: t("votePhase.voteDetailTitle"), results })}`;
  };

  type VoteOutcome = { state: GameState; executed: { seat: number; count: number } | null; winner: Alignment | null; boomed?: boolean };
  const runExecutionVote = async (input: GameState, isRevote: boolean): Promise<VoteOutcome> => {
    let next: GameState = { ...input, votes: {}, lastVoteReasons: input.voteReasons ? { ...input.voteReasons } : {}, voteReasons: {} };
    next = gm.transitionPhase(next, "DAY_VOTE");
    next = { ...next, currentSpeakerSeat: null, nextSpeakerSeatOverride: null, pkTargets: isRevote ? input.pkTargets : undefined, pkSource: isRevote ? "vote" : undefined };
    next = gm.addSystemMessage(next, sys.voteStart);

    const pkTargets = next.pkSource === "vote" && Array.isArray(next.pkTargets) ? next.pkTargets : [];
    const revealedIdiotId = next.roleAbilities.idiotRevealed ? next.players.find((p) => p.role === "Idiot" && p.alive)?.playerId : undefined;
    const voters = next.players.filter((p) => p.alive && !pkTargets.includes(p.seat) && p.playerId !== revealedIdiotId);
    const snapshot = next;
    const ballots = await mapLimit(voters, VOTE_CONCURRENCY, async (voter) => ({ voter, vote: await gm.generateAIVote(snapshot, voter) }));
    next = {
      ...next,
      votes: Object.fromEntries(ballots.map((b) => [b.voter.playerId, b.vote.seat])),
      voteReasons: Object.fromEntries(ballots.map((b) => [b.voter.playerId, b.vote.reason])),
    };

    // resolveVotes
    const votingState = next;
    next = gm.transitionPhase(next, "DAY_RESOLVE");
    const currentVotes = { ...votingState.votes };
    next = {
      ...next,
      voteHistory: { ...votingState.voteHistory, [votingState.day]: currentVotes },
      dayHistory: { ...(votingState.dayHistory || {}), [votingState.day]: { ...(votingState.dayHistory?.[votingState.day] || {}), sheriffSeatAtVote: votingState.badge.holderSeat } },
    };
    const result = gm.tallyVotes(next);
    const immunity = !!result && next.players.some((p) => p.seat === result.seat && p.role === "Idiot") && !next.roleAbilities.idiotRevealed;
    const hasAnyValidVote = Object.values(currentVotes).some((seat) => next.players.some((p) => p.alive && p.seat === seat));
    const round = votingState.pkSource === "vote" ? 2 : 1;
    next = recordVoteRound(next, {
      kind: "execution", round,
      candidates: votingState.pkSource === "vote" && votingState.pkTargets?.length ? votingState.pkTargets : votingState.players.filter((p) => p.alive).map((p) => p.seat),
      votes: currentVotes, sheriffSeat: votingState.badge.holderSeat, winnerSeat: result?.seat ?? null,
      outcome: result ? (immunity ? "idiot-revealed" : "executed") : hasAnyValidVote ? "tie" : "no-votes",
    });
    const dayRecord = next.dayHistory?.[next.day] || {};
    next = {
      ...next,
      dayHistory: {
        ...(next.dayHistory || {}),
        [next.day]: result
          ? { ...dayRecord, executed: immunity ? undefined : { seat: result.seat, votes: result.count }, voteTie: false }
          : { ...dayRecord, executed: undefined, voteTie: true },
      },
    };
    next = gm.addSystemMessage(next, executionVoteDetails(next, currentVotes));
    const voteEvent = {
      kind: "vote" as const, day: next.day, round,
      votes: ballots.map((b) => ({ seat: b.voter.seat, target: b.vote.seat, reason: b.vote.reason })),
      executed: result && !immunity ? result.seat : null, note: "",
    };
    events.push(voteEvent);
    print(`  票型：${ballots.map((b) => `${b.voter.seat + 1}→${b.vote.seat + 1}`).join(" ")}`);

    if (result) {
      const executed = next.players.find((p) => p.seat === result.seat);
      if (immunity && executed) {
        voteEvent.note = `${seatOf(result.seat)}白痴翻牌免死`;
        next = addSystem(next, t("system.idiotRevealed", { seat: result.seat + 1, name: executed.displayName }));
        next = {
          ...next,
          roleAbilities: { ...next.roleAbilities, idiotRevealed: true },
          dayHistory: { ...(next.dayHistory || {}), [next.day]: { ...(next.dayHistory?.[next.day] || {}), executed: undefined, voteTie: false, idiotRevealed: { seat: result.seat } } },
          pkTargets: undefined, pkSource: undefined,
        };
        return { state: next, executed: null, winner: gm.checkWinCondition(next) };
      }
      next = addSystem(next, sys.playerExecuted(result.seat + 1, executed?.displayName || "", result.count));
      next = { ...next, pkTargets: undefined, pkSource: undefined };
      return { state: next, executed: result, winner: null };
    }

    // 平票
    const counts: Record<number, number> = {};
    const sheriffId = next.badge.holderSeat === null ? undefined : next.players.find((p) => p.seat === next.badge.holderSeat && p.alive)?.playerId;
    for (const [voterId, seat] of Object.entries(currentVotes)) {
      const voter = next.players.find((p) => p.playerId === voterId);
      if (!voter?.alive || !next.players.some((p) => p.alive && p.seat === seat) || voterId === revealedIdiotId) continue;
      counts[seat] = (counts[seat] || 0) + (voterId === sheriffId ? 1.5 : 1);
    }
    const maxVotes = Math.max(0, ...Object.values(counts));
    const topSeats = Object.entries(counts).filter(([, c]) => c === maxVotes).map(([s]) => Number(s));
    if (topSeats.length > 1 && votingState.pkSource !== "vote") {
      voteEvent.note = `平票 PK：${topSeats.map(seatOf).join("、")}`;
      let pkState = gm.transitionPhase({ ...next, pkTargets: topSeats, pkSource: "vote" as const }, "DAY_PK_SPEECH");
      pkState = { ...pkState, daySpeechStartSeat: topSeats[0] };
      pkState = addSystem(pkState, t("votePhase.tiePk"));
      const pkRound = await runSpeechRound(pkState, topSeats[0]);
      if (pkRound.boom) return { state: pkRound.state, executed: null, winner: null, boomed: true };
      return runExecutionVote(pkRound.state, true);
    }
    voteEvent.note = "平票，无人出局";
    next = { ...next, pkTargets: undefined, pkSource: undefined };
    next = addSystem(next, sys.voteTie);
    return { state: next, executed: null, winner: gm.checkWinCondition(next) };
  };

  // ---- 白天：对齐 DaySpeechPhase.startDaySpeechAfterBadge + handleVoteComplete ----
  type DayOutcome = { state: GameState; winner: Alignment | null };
  const afterBoom = async (boomState: GameState, targetSeat: number): Promise<DayOutcome> => {
    const target = boomState.players.find((p) => p.seat === targetSeat);
    if (target?.role === "Hunter" && boomState.roleAbilities.hunterCanShoot) return hunterShoot(boomState, target, false);
    return { state: boomState, winner: gm.checkWinCondition(boomState) };
  };

  const runDay = async (input: GameState): Promise<DayOutcome> => {
    let next = input;
    if (next.day === 1 && next.badge.holderSeat === null) next = await runBadgeElection(next);
    print(`\n===== 第${next.day}天 白天 =====`);

    const { pendingWolfVictim, pendingPoisonVictim } = next.nightActions;
    let hasDeaths = false;
    let wolfVictim: Player | undefined;
    if (pendingWolfVictim !== undefined) {
      hasDeaths = true;
      next = gm.killPlayer(next, pendingWolfVictim);
      wolfVictim = next.players.find((p) => p.seat === pendingWolfVictim);
      if (wolfVictim) next = addSystem(next, sys.playerKilled(wolfVictim.seat + 1, wolfVictim.displayName));
    }
    if (pendingPoisonVictim !== undefined) {
      const victim = next.players.find((p) => p.seat === pendingPoisonVictim);
      if (victim?.role === "Hunter") next = { ...next, roleAbilities: { ...next.roleAbilities, hunterCanShoot: false } };
      if (pendingPoisonVictim !== pendingWolfVictim) {
        hasDeaths = true;
        next = gm.killPlayer(next, pendingPoisonVictim);
        if (victim) next = addSystem(next, sys.playerKilled(victim.seat + 1, victim.displayName));
      }
    }
    if (!hasDeaths) next = addSystem(next, sys.peacefulNight);
    next = {
      ...next,
      nightHistory: { ...next.nightHistory, [next.day]: { ...next.nightHistory?.[next.day], resultsAnnounced: true } },
      nightActions: { ...next.nightActions, pendingWolfVictim: undefined, pendingPoisonVictim: undefined },
    };

    const sheriffAtDawn = next.badge.holderSeat === null ? undefined : next.players.find((p) => p.seat === next.badge.holderSeat);
    const deadSheriff = sheriffAtDawn && !sheriffAtDawn.alive ? sheriffAtDawn : undefined;
    if (deadSheriff) next = await transferBadge(next, deadSheriff);
    let startAfterSeat = wolfVictim?.seat;
    if (wolfVictim?.role === "Hunter" && next.roleAbilities.hunterCanShoot) {
      const shot = await hunterShoot(next, wolfVictim, true);
      if (shot.winner) return shot;
      next = shot.state;
      startAfterSeat = undefined; // skipAnnouncements 路径不再带夜间死者
    }
    const dawnWinner = gm.checkWinCondition(next);
    if (dawnWinner) return { state: next, winner: dawnWinner };

    next = gm.transitionPhase(next, "DAY_SPEECH");
    next = addSystem(next, sys.dayDiscussion);
    const alive = next.players.filter((p) => p.alive);
    const sheriffSeat = next.badge.holderSeat;
    const sheriffAlive = typeof sheriffSeat === "number" && alive.some((p) => p.seat === sheriffSeat);
    const startSeat = sheriffAlive
      ? gm.getNextAliveSeat(next, sheriffSeat, true, "clockwise")
      : deadSheriff
        ? gm.getNextAliveSeat(next, deadSheriff.seat, false, "clockwise")
        : startAfterSeat !== undefined
          ? gm.getNextAliveSeat(next, startAfterSeat, false, "clockwise")
          : alive.map((p) => p.seat).sort((a, b) => a - b)[0] ?? null;
    next = { ...next, daySpeechStartSeat: startSeat, speechDirection: "clockwise" };

    const round = await runSpeechRound(next, startSeat);
    if (round.boom) return afterBoom(round.state, round.boom.targetSeat);

    const vote = await runExecutionVote(round.state, false);
    next = vote.state;
    if (vote.boomed) {
      const boom = next.dayHistory?.[next.day]?.whiteWolfKingBoom;
      return boom ? afterBoom(next, boom.targetSeat) : { state: next, winner: gm.checkWinCondition(next) };
    }
    if (vote.winner) return { state: next, winner: vote.winner };
    if (!vote.executed) return { state: next, winner: null };

    // 遗言 → 警徽移交 → 猎人开枪 → 胜负
    const executedSeat = vote.executed.seat;
    const executedPlayer = next.players.find((p) => p.seat === executedSeat)!;
    const wasSheriff = next.badge.holderSeat === executedSeat;
    next = gm.killPlayer(next, executedSeat);
    next = gm.transitionPhase(next, "DAY_LAST_WORDS");
    next = { ...next, currentSpeakerSeat: executedSeat };
    next = addSystem(next, t("dayPhase.lastWordsSystem", { seat: executedSeat + 1, name: executedPlayer.displayName }));
    next = await speak(next, next.players.find((p) => p.seat === executedSeat)!);
    if (wasSheriff) next = await transferBadge(next, executedPlayer);
    if (executedPlayer.role === "Hunter" && next.roleAbilities.hunterCanShoot) return hunterShoot(next, executedPlayer, false);
    return { state: next, winner: gm.checkWinCondition(next) };
  };

  /** 对齐 useGameLogic.proceedToNight（含每日总结调用） */
  const proceedToNight = async (input: GameState): Promise<GameState> => {
    const lastGuardTarget = input.nightActions.guardTarget ?? input.nightActions.lastGuardTarget;
    const seerHistory = input.nightActions.seerHistory;
    let next: GameState = {
      ...input,
      day: input.day + 1,
      nightActions: { ...(lastGuardTarget !== undefined ? { lastGuardTarget } : {}), ...(seerHistory ? { seerHistory } : {}) },
    };
    next = gm.transitionPhase(next, "NIGHT_START");
    next = gm.addSystemMessage(next, sys.nightFall(next.day));
    try {
      const summary = await gm.generateDailySummary(input);
      if (summary.bullets.length > 0) {
        next = {
          ...next,
          dailySummaries: { ...input.dailySummaries, [input.day]: summary.bullets },
          dailySummaryVoteData: { ...(input.dailySummaryVoteData ?? {}), ...(summary.voteData ? { [input.day]: summary.voteData } : {}) },
        };
      }
    } catch (error) {
      print(`  ! 每日总结失败：${String(error).slice(0, 160)}`);
    }
    return next;
  };

  let winner: Alignment | null = null;
  let note = "";
  try {
    while (true) {
      state = await runNight(state);
      const day = await runDay(state);
      state = day.state;
      await persist(day.winner, "进行中");
      if (day.winner) { winner = day.winner; break; }
      if (state.day >= MAX_DAYS) { note = `达到 ${MAX_DAYS} 天上限，提前结束`; break; }
      state = await proceedToNight(state);
    }
  } catch (error) {
    note = `对局异常中止：${String(error)}`;
    print(note);
    process.exitCode = 1;
  } finally {
    unsubscribe();
    globalThis.fetch = originalFetch;
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
  }

  if (winner) state = { ...gm.transitionPhase(state, "GAME_END"), winner };
  await persist(winner, note || "正常结束");
  print(`\n结果：${winner ? (winner === "village" ? "好人胜" : "狼人胜") : "未分胜负"}；${note}`);
  print(`Provider 调用 ${providerCalls} 次；prompt ${usageTotal.promptTokens} / completion ${usageTotal.completionTokens} / cached ${usageTotal.cachedTokens} tokens`);
  print(`输出目录：${OUTPUT_DIR}`);
}

function renderTranscript(state: GameState, events: GameEvent[], winner: Alignment | null, note: string): string {
  const role = (seat: number) => state.players.find((p) => p.seat === seat)?.role ?? "?";
  const tag = (seat: number) => (seat < 0 ? "弃票" : `${seat + 1}号[${role(seat)}]`);
  const phaseName: Partial<Record<Phase, string>> = {
    DAY_BADGE_SPEECH: "警徽竞选发言", DAY_PK_SPEECH: "PK发言", DAY_SPEECH: "白天发言", DAY_LAST_WORDS: "遗言",
  };
  const lines: string[] = [
    `# 完整对局审计 ${RUN_TAG}`,
    "",
    `结果：${winner ? (winner === "village" ? "好人胜" : "狼人胜") : "未分胜负"}（${note}）`,
    "",
    "## 上帝视角身份",
    ...state.players.map((p) => `- ${p.seat + 1}号 ${p.displayName}：${p.role}（${p.agentProfile?.modelRef.model}）`),
    "",
  ];
  let lastHeader = "";
  for (const event of events) {
    const header = `## 第${event.day}${event.kind === "night" ? "夜" : "天"}`;
    if (header !== lastHeader) { lines.push("", header, ""); lastHeader = header; }
    if (event.kind === "night") {
      lines.push(`- 守卫守：${event.guard === undefined ? "无" : tag(event.guard)}`);
      lines.push(`- 狼刀：${event.wolf === undefined ? "空刀" : tag(event.wolf)}`);
      lines.push(`- 女巫：${event.witch}`);
      lines.push(`- 预言家验：${event.seer ? `${tag(event.seer.target)} → ${event.seer.isWolf ? "狼人" : "好人"}` : "无"}`);
      lines.push(`- 实际死亡：${event.deaths.map((d) => `${tag(d.seat)}(${d.reason})`).join("、") || "无"}`);
    } else if (event.kind === "system") {
      lines.push(`> 系统：${event.text}`);
    } else if (event.kind === "speech") {
      lines.push(`**${tag(event.seat)} ${phaseName[event.phase] ?? event.phase}**：${event.segments.join(" / ")}`, "");
    } else if (event.kind === "badge_signup") {
      lines.push(`- 上警：${event.candidates.map(tag).join("、") || "无人"}`);
    } else if (event.kind === "badge_vote") {
      lines.push(`- 警徽投票第${event.round}轮：${event.votes.map((v) => `${v.seat + 1}→${v.target < 0 ? "弃" : v.target + 1}`).join("，")}；当选：${event.winner === null ? "无" : tag(event.winner)}`);
    } else if (event.kind === "vote") {
      lines.push(`### 放逐投票第${event.round}轮（出局：${event.executed === null ? "无" : tag(event.executed)}${event.note ? `；${event.note}` : ""}）`);
      for (const vote of event.votes) lines.push(`- ${tag(vote.seat)} → ${tag(vote.target)}：${vote.reason}`);
      lines.push("");
    } else {
      lines.push(`- ${event.text}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

runFullGame().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
