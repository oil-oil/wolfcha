import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AILogEntry } from "@/lib/ai-logger";
import type { LLMMessage } from "@/lib/llm";
import { getRoleConfiguration } from "@/lib/role-configuration";
import type { ChatMessage, GameState, Phase, Player, Role } from "@/types/game";

const AUDIT_MODEL = "deepseek-v4-flash-0731";
const AUDIT_ANON_KEY = "single-player-context-audit-anon-key";
const AUDIT_PLAYER_COUNT = 11;

type TransportRequest = {
  requestId: number;
  batchIndex: number | null;
  model: string;
  messages: LLMMessage[];
  responseContent: string;
};

type AuditCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

type CoverageSample = {
  scenario: string;
  phase: Phase;
  role: Role;
};

type NormalizedLog = Omit<AILogEntry, "id" | "timestamp"> & {
  response: Omit<AILogEntry["response"], "duration"> & { duration: number };
};

export type SinglePlayerContextAuditReport = {
  generatedAt: string;
  mode: "production-prompt-path-with-local-model-transport";
  summary: {
    playerCount: number;
    roles: Role[];
    aiLogCount: number;
    transportRequestCount: number;
    externalNetworkCallCount: number;
    phaseRoleCoverage: Array<CoverageSample & { sampleCount: number }>;
    checks: AuditCheck[];
  };
  transport: TransportRequest[];
  aiLogs: NormalizedLog[];
  fingerprint: string;
};

type RunOptions = {
  outputPath?: string | null;
};

const ROLE_ORDER: Role[] = getRoleConfiguration(AUDIT_PLAYER_COUNT);

const redactString = (value: string): string =>
  value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|key|token)[-_][A-Za-z0-9_-]{8,}\b/gi, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]");

export function redactAuditArtifact<T>(value: T): T {
  if (typeof value === "string") return redactString(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactAuditArtifact(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactAuditArtifact(item)])
    ) as T;
  }
  return value;
}

const flattenMessages = (messages: LLMMessage[]): string =>
  messages
    .flatMap((message) => {
      if (typeof message.content === "string") return [message.content];
      return message.content
        .filter((part) => part.type === "text")
        .map((part) => (part.type === "text" ? part.text : ""));
    })
    .join("\n");

const makePlayers = (): Player[] =>
  ROLE_ORDER.map((role, seat) => ({
    playerId: `audit-player-${seat + 1}`,
    seat,
    displayName: `审计玩家${seat + 1}`,
    alive: true,
    role,
    alignment: role === "Werewolf" || role === "WhiteWolfKing" ? "wolf" : "village",
    isHuman: false,
    agentProfile: {
      modelRef: { provider: "tokendance", model: AUDIT_MODEL },
      persona: {
        mbti: seat % 2 === 0 ? "INTJ" : "ESFP",
        gender: seat % 2 === 0 ? "female" : "male",
        age: 22 + seat,
        styleLabel: `审计性格${seat + 1}`,
        voiceRules: [`只按${seat + 1}号自己的视角表达`],
        socialHabit: `审计习惯${seat + 1}`,
      },
    },
  }));

const makeMessage = (
  seat: number,
  day: number,
  phase: Phase,
  content: string,
  isSystem = false
): ChatMessage => ({
  id: `audit-message-${day}-${phase}-${seat}-${content}`,
  playerId: isSystem ? "system" : `audit-player-${seat + 1}`,
  playerName: isSystem ? "系统" : `审计玩家${seat + 1}`,
  content,
  timestamp: Date.UTC(2026, 0, day, 8, seat),
  day,
  phase,
  isSystem,
});

export const createSinglePlayerContextAuditState = (): GameState => ({
  gameId: "single-player-context-audit",
  phase: "DAY_BADGE_SIGNUP",
  day: 2,
  startTime: Date.UTC(2026, 0, 1),
  difficulty: "normal",
  players: makePlayers(),
  events: [],
  messages: [
    makeMessage(0, 1, "DAY_START", "第一天天亮", true),
    makeMessage(0, 1, "DAY_SPEECH", "1号第一天发言"),
    makeMessage(4, 1, "DAY_SPEECH", "5号第一天跳预言家"),
    makeMessage(0, 2, "DAY_START", "第二天天亮，先进行警徽流程", true),
  ],
  currentSpeakerSeat: null,
  nextSpeakerSeatOverride: null,
  daySpeechStartSeat: 0,
  speechDirection: "clockwise",
  badge: {
    holderSeat: 4,
    candidates: [0, 4, 5],
    signup: {},
    votes: {},
    allVotes: {},
    history: { 1: { "audit-player-10": 4 } },
    revoteCount: 0,
  },
  votes: {},
  voteReasons: {},
  lastVoteReasons: {},
  voteHistory: { 1: { "audit-player-1": 9 } },
  nightHistory: {
    1: {
      guardTarget: 9,
      wolfTarget: 9,
      witchSave: true,
      seerTarget: 0,
      seerResult: { targetSeat: 0, isWolf: true },
      deaths: [],
    },
    2: {
      guardTarget: 8,
      wolfTarget: 10,
      witchPoison: 9,
      seerTarget: 9,
      seerResult: { targetSeat: 9, isWolf: false },
      deaths: [
        { seat: 10, reason: "wolf" },
        { seat: 9, reason: "poison" },
      ],
    },
  },
  dayHistory: {
    1: { executed: { seat: 9, votes: 6 } },
  },
  dailySummaries: { 1: ["1号质疑5号的预言家身份"] },
  dailySummaryFacts: { 1: [{ fact: "5号声称预言家", day: 1, speakerSeat: 4, type: "claim" }] },
  dailySummaryVoteData: {},
  nightActions: {
    lastGuardTarget: 8,
    wolfTarget: 10,
    witchPoison: 9,
    seerTarget: 9,
    seerResult: { targetSeat: 9, isWolf: false },
    seerHistory: [
      { targetSeat: 0, isWolf: true, day: 1 },
      { targetSeat: 9, isWolf: false, day: 2 },
    ],
    pendingWolfVictim: 10,
    pendingPoisonVictim: 9,
  },
  roleAbilities: {
    witchHealUsed: true,
    witchPoisonUsed: true,
    hunterCanShoot: true,
    idiotRevealed: false,
    whiteWolfKingBoomUsed: false,
  },
  winner: null,
});

const normalizeLog = (entry: AILogEntry): NormalizedLog => {
  return {
    type: entry.type,
    request: entry.request,
    response: {
      ...entry.response,
      duration: 0,
    },
    ...(entry.error ? { error: entry.error } : {}),
  };
};

const makeChatResponse = (content: string, requestId: number) => ({
  id: `audit-response-${requestId}`,
  choices: [
    {
      message: { role: "assistant", content },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
});

const createTransport = () => {
  const records: TransportRequest[] = [];
  let externalNetworkCallCount = 0;
  let nextContents: string[] = [];
  let requestId = 0;

  const setNext = (...contents: string[]) => {
    nextContents = [...contents];
  };

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "/api/demo-config") {
      return Response.json({ enabled: false, active: false });
    }
    if (url !== "/api/chat") {
      externalNetworkCallCount += 1;
      throw new Error(`上下文审计禁止外部网络请求: ${url}`);
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as {
      model?: string;
      messages?: LLMMessage[];
      requests?: Array<{ model: string; messages: LLMMessage[] }>;
    };
    requestId += 1;

    if (Array.isArray(body.requests)) {
      const results = body.requests.map((request, batchIndex) => {
        const responseContent = nextContents[batchIndex] ?? "0";
        records.push({
          requestId,
          batchIndex,
          model: request.model,
          messages: request.messages,
          responseContent,
        });
        return { ok: true, data: makeChatResponse(responseContent, requestId * 100 + batchIndex) };
      });
      nextContents = [];
      return Response.json({ results });
    }

    const responseContent = nextContents.shift() ?? "[\"审计发言\"]";
    records.push({
      requestId,
      batchIndex: null,
      model: body.model ?? "",
      messages: body.messages ?? [],
      responseContent,
    });
    nextContents = [];

    const wantsStream = Boolean((body as { stream?: boolean }).stream);
    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: responseContent } }] })}\n\n`)
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
    }

    return Response.json(makeChatResponse(responseContent, requestId));
  };

  return {
    records,
    setNext,
    fetchImpl,
    getExternalNetworkCallCount: () => externalNetworkCallCount,
  };
};

const addCheck = (checks: AuditCheck[], name: string, condition: boolean, detail: string) => {
  checks.push({ name, passed: condition, detail });
};

const getExpectedPrivateTags = (role: Role): string[] => {
  if (role === "Seer") return ["<your_seer_checks>"];
  if (role === "Witch") return ["<your_potions>"];
  if (role === "Guard") return ["<your_guard_info>"];
  if (role === "Werewolf" || role === "WhiteWolfKing") return ["<your_wolf_team>"];
  return [];
};

const PRIVATE_TAGS = [
  "<your_seer_checks>",
  "<your_potions>",
  "<your_guard_info>",
  "<your_wolf_team>",
];

/**
 * 该审计会临时接管进程级 fetch/console，只能在独立进程或串行测试中运行。
 */
export async function runSinglePlayerContextAudit(
  options: RunOptions = {}
): Promise<SinglePlayerContextAuditReport> {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= AUDIT_ANON_KEY;

  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const transport = createTransport();
  globalThis.fetch = transport.fetchImpl;
  console.log = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && (first.startsWith("[LLM]") || first.startsWith("[streaming]"))) {
      return;
    }
    originalConsoleLog(...args);
  };

  const capturedLogs: AILogEntry[] = [];
  const coverageSamples: CoverageSample[] = [];
  const recordCoverage = (scenario: string, phase: Phase, actor: Player) => {
    coverageSamples.push({ scenario, phase, role: actor.role });
  };
  let unsubscribe = () => {};

  try {
    const [{ setLocale }, { aiLogger }, gameMaster] = await Promise.all([
      import("@/i18n/locale-store"),
      import("@/lib/ai-logger"),
      import("@/lib/game-master"),
    ]);
    setLocale("zh");
    unsubscribe = aiLogger.subscribe((entry) => {
      capturedLogs.push(entry);
    });

    const preAnnouncement = createSinglePlayerContextAuditState();
    const players = preAnnouncement.players;

    transport.setNext(...players.map((player) => (player.seat % 2 === 0 ? "1" : "0")));
    await gameMaster.generateAIBadgeSignupBatch(preAnnouncement, players);
    players.forEach((player) => recordCoverage("badge_signup", "DAY_BADGE_SIGNUP", player));

    for (const player of players) {
      // 故意使用非 JSON 文本，覆盖正式流式解析器的回退分支。
      transport.setNext("警徽阶段审计发言");
      await gameMaster.generateAISpeechSegmentsStream(
        { ...preAnnouncement, phase: "DAY_BADGE_SPEECH" },
        player
      );
      recordCoverage("badge_speech", "DAY_BADGE_SPEECH", player);
    }

    for (const player of players) {
      const candidates = players.filter((candidate) => candidate.seat !== player.seat).slice(0, 2);
      const electionState: GameState = {
        ...preAnnouncement,
        phase: "DAY_BADGE_ELECTION",
        badge: {
          ...preAnnouncement.badge,
          candidates: candidates.map((candidate) => candidate.seat),
        },
      };
      transport.setNext(JSON.stringify({ seat: candidates[0].seat + 1 }));
      await gameMaster.generateAIBadgeVote(electionState, player);
      recordCoverage("badge_election", "DAY_BADGE_ELECTION", player);
    }

    for (const player of players) {
      transport.setNext('["警徽阶段PK审计发言"]');
      await gameMaster.generateAISpeechSegments(
        {
          ...preAnnouncement,
          phase: "DAY_PK_SPEECH",
          pkSource: "badge",
          pkTargets: players.map((candidate) => candidate.seat),
        },
        player
      );
      recordCoverage("badge_pk_speech", "DAY_PK_SPEECH", player);
    }

    const makePublicStateForActor = (actorSeat: number, phase: Phase): GameState => {
      const victimSeats = players
        .filter((candidate) => candidate.seat !== actorSeat)
        .slice(-2)
        .map((candidate) => candidate.seat);
      let nextState: GameState = {
        ...preAnnouncement,
        phase,
        players: players.map((candidate) => ({ ...candidate, alive: true })),
        nightHistory: {
          ...preAnnouncement.nightHistory,
          2: {
            ...preAnnouncement.nightHistory?.[2],
            deaths: victimSeats.map((seat, index) => ({
              seat,
              reason: index === 0 ? "wolf" as const : "poison" as const,
            })),
          },
        },
      };
      victimSeats.forEach((seat) => {
        nextState = gameMaster.killPlayer(nextState, seat);
      });
      return gameMaster.addSystemMessage(
        gameMaster.transitionPhase(nextState, phase),
        `昨夜${victimSeats.map((seat) => `${seat + 1}号`).join("和")}出局`
      );
    };

    for (const player of players) {
      const publicState = makePublicStateForActor(player.seat, "DAY_SPEECH");
      transport.setNext('["白天阶段审计发言"]');
      await gameMaster.generateAISpeechSegments(publicState, player);
      recordCoverage("day_speech", "DAY_SPEECH", player);
    }

    for (const player of players) {
      const publicState = makePublicStateForActor(player.seat, "DAY_VOTE");
      const target = publicState.players.find(
        (candidate) => candidate.alive && candidate.playerId !== player.playerId
      );
      transport.setNext(JSON.stringify({ seat: (target?.seat ?? 0) + 1, reason: "审计投票" }));
      await gameMaster.generateAIVote(publicState, player);
      recordCoverage("day_vote", "DAY_VOTE", player);
    }

    for (const player of players) {
      const publicState = makePublicStateForActor(player.seat, "DAY_PK_SPEECH");
      transport.setNext('["放逐PK阶段审计发言"]');
      await gameMaster.generateAISpeechSegments(
        {
          ...publicState,
          pkSource: "vote",
          pkTargets: [
            player.seat,
            players.find((candidate) => candidate.seat !== player.seat && candidate.alive)?.seat ?? 0,
          ],
        },
        player
      );
      recordCoverage("vote_pk_speech", "DAY_PK_SPEECH", player);
    }

    for (const player of players) {
      let lastWordsState = makePublicStateForActor(player.seat, "DAY_LAST_WORDS");
      lastWordsState = gameMaster.killPlayer(lastWordsState, player.seat);
      lastWordsState = {
        ...lastWordsState,
        dayHistory: {
          ...lastWordsState.dayHistory,
          [lastWordsState.day]: { executed: { seat: player.seat, votes: 5 } },
        },
      };
      transport.setNext('["遗言阶段审计发言"]');
      await gameMaster.generateAISpeechSegments(lastWordsState, player);
      recordCoverage("last_words", "DAY_LAST_WORDS", player);
    }

    const byRole = (role: Role) => players.find((player) => player.role === role)!;
    transport.setNext(JSON.stringify({ seat: 1 }));
    await gameMaster.generateSeerAction(
      { ...preAnnouncement, phase: "NIGHT_SEER_ACTION" },
      byRole("Seer")
    );
    recordCoverage("seer_action", "NIGHT_SEER_ACTION", byRole("Seer"));

    for (const wolf of players.filter((player) => player.alignment === "wolf")) {
      transport.setNext(JSON.stringify({ seat: 5 }));
      await gameMaster.generateWolfAction(
        { ...preAnnouncement, phase: "NIGHT_WOLF_ACTION" },
        wolf
      );
      recordCoverage("wolf_action", "NIGHT_WOLF_ACTION", wolf);
    }

    transport.setNext(JSON.stringify({ action: "pass" }));
    await gameMaster.generateWitchAction(
      { ...preAnnouncement, phase: "NIGHT_WITCH_ACTION" },
      byRole("Witch"),
      10
    );
    recordCoverage("witch_action", "NIGHT_WITCH_ACTION", byRole("Witch"));

    transport.setNext(JSON.stringify({ seat: 1 }));
    await gameMaster.generateGuardAction(
      { ...preAnnouncement, phase: "NIGHT_GUARD_ACTION" },
      byRole("Guard")
    );
    recordCoverage("guard_action", "NIGHT_GUARD_ACTION", byRole("Guard"));

    transport.setNext(JSON.stringify({ action: "pass" }));
    const hunterState = gameMaster.killPlayer(
      makePublicStateForActor(byRole("Hunter").seat, "HUNTER_SHOOT"),
      byRole("Hunter").seat
    );
    await gameMaster.generateHunterShoot(
      hunterState,
      byRole("Hunter")
    );
    recordCoverage("hunter_shoot", "HUNTER_SHOOT", byRole("Hunter"));

    transport.setNext(JSON.stringify({ action: "pass" }));
    await gameMaster.generateWhiteWolfKingBoomDecision(
      makePublicStateForActor(byRole("WhiteWolfKing").seat, "WHITE_WOLF_KING_BOOM"),
      byRole("WhiteWolfKing")
    );
    recordCoverage("white_wolf_king_boom", "WHITE_WOLF_KING_BOOM", byRole("WhiteWolfKing"));

    for (const player of players) {
      const transferState = gameMaster.killPlayer(
        {
          ...makePublicStateForActor(player.seat, "BADGE_TRANSFER"),
          badge: { ...preAnnouncement.badge, holderSeat: player.seat },
        },
        player.seat
      );
      const target = transferState.players.find((candidate) => candidate.alive);
      transport.setNext(JSON.stringify({ seat: (target?.seat ?? 0) + 1 }));
      await gameMaster.generateBadgeTransfer(transferState, player);
      recordCoverage("badge_transfer", "BADGE_TRANSFER", player);
    }
  } finally {
    unsubscribe();
    globalThis.fetch = originalFetch;
    console.log = originalConsoleLog;
  }

  const checks: AuditCheck[] = [];
  const normalizedLogs = capturedLogs.map(normalizeLog);
  const coverageCounts = new Map<string, CoverageSample & { sampleCount: number }>();
  coverageSamples.forEach((sample) => {
    const key = `${sample.scenario}:${sample.phase}:${sample.role}`;
    const existing = coverageCounts.get(key);
    coverageCounts.set(key, { ...sample, sampleCount: (existing?.sampleCount ?? 0) + 1 });
  });
  const phaseRoleCoverage = [...coverageCounts.values()].sort((a, b) =>
    `${a.scenario}:${a.role}`.localeCompare(`${b.scenario}:${b.role}`)
  );
  const badgeLogs = normalizedLogs.filter((entry) => entry.type === "badge_signup");

  addCheck(
    checks,
    "警徽报名逐玩家隔离",
    badgeLogs.length === ROLE_ORDER.length && badgeLogs.every((entry) => entry.request.player?.playerId !== "batch"),
    `报名日志 ${badgeLogs.length} 条，预期 ${ROLE_ORDER.length} 条`
  );

  const roleIsolationFailures = normalizedLogs.filter((entry) => {
    const role = entry.request.player?.role as Role | undefined;
    if (!role) return false;
    const text = flattenMessages(entry.request.messages);
    const expected = new Set(getExpectedPrivateTags(role));
    return PRIVATE_TAGS.some((tag) => text.includes(tag) && !expected.has(tag));
  });
  addCheck(
    checks,
    "角色私有区块没有串视角",
    roleIsolationFailures.length === 0,
    roleIsolationFailures.length === 0
      ? "所有 AI 日志只包含行动者有权看到的私有区块"
      : `发现 ${roleIsolationFailures.length} 条异常日志`
  );

  const personaIsolationFailures = normalizedLogs.filter((entry) => {
    const actorSeat = entry.request.player?.seat;
    if (typeof actorSeat !== "number" || actorSeat < 0) return false;
    const text = flattenMessages(entry.request.messages);
    return ROLE_ORDER.some(
      (_role, seat) => seat !== actorSeat && text.includes(`审计性格${seat + 1}`)
    );
  });
  addCheck(
    checks,
    "人物设定没有串位",
    personaIsolationFailures.length === 0,
    personaIsolationFailures.length === 0
      ? "每次请求只包含行动者自己的人设"
      : `发现 ${personaIsolationFailures.length} 条异常日志`
  );

  const contextShapeFailures = normalizedLogs.filter((entry) => {
    const text = flattenMessages(entry.request.messages);
    return !text.includes("<public_role_configuration>") || text.includes("audit-player-");
  });
  addCheck(
    checks,
    "公共板子只传聚合配置",
    contextShapeFailures.length === 0,
    contextShapeFailures.length === 0
      ? "请求包含公开角色数量，但不包含稳定 playerId"
      : `发现 ${contextShapeFailures.length} 条异常日志`
  );

  const campaignLogs = normalizedLogs.filter(
    (entry) => entry.type === "badge_signup" || entry.type === "badge_vote" ||
      (entry.type === "speech" && entry.response.content.includes("警徽阶段"))
  );
  const campaignLeakedDeaths = campaignLogs.filter((entry) =>
    flattenMessages(entry.request.messages).includes("dead: [{seat: 11")
  );
  addCheck(
    checks,
    "警徽流程不提前公开夜间死亡",
    campaignLogs.length > 0 && campaignLeakedDeaths.length === 0,
    `检查 ${campaignLogs.length} 条警徽阶段上下文`
  );

  const dayLogs = normalizedLogs.filter(
    (entry) => entry.type === "speech" && entry.response.content.includes("白天阶段")
  );
  const announcedDeathVisible = dayLogs.some((entry) =>
    flattenMessages(entry.request.messages).includes("dead: [{seat: 10") ||
    flattenMessages(entry.request.messages).includes("{seat: 11, name: 审计玩家11")
  );
  addCheck(
    checks,
    "公布后上下文包含公开死亡",
    dayLogs.length > 0 && announcedDeathVisible,
    `检查 ${dayLogs.length} 条普通白天上下文`
  );

  const everyLogHasTransport = normalizedLogs.every((entry) => {
    const serialized = JSON.stringify(entry.request.messages);
    return transport.records.some((record) => JSON.stringify(record.messages) === serialized);
  });
  addCheck(
    checks,
    "每条 AI 日志都可回溯到真实传输消息",
    normalizedLogs.length > 0 && everyLogHasTransport,
    `日志 ${normalizedLogs.length} 条，模型子请求 ${transport.records.length} 条`
  );

  const everyTransportHasLog = transport.records.every((record) => {
    const serialized = JSON.stringify(record.messages);
    return normalizedLogs.some((entry) => JSON.stringify(entry.request.messages) === serialized);
  });
  addCheck(
    checks,
    "每个模型子请求都有 AI 日志",
    transport.records.length > 0 && everyTransportHasLog,
    `模型子请求 ${transport.records.length} 条，日志 ${normalizedLogs.length} 条`
  );

  const coveredRoles = new Set(
    normalizedLogs.map((entry) => entry.request.player?.role).filter((role): role is string => Boolean(role))
  );
  addCheck(
    checks,
    "所有配置角色都有上下文样本",
    [...new Set(ROLE_ORDER)].every((role) => coveredRoles.has(role)),
    `覆盖角色：${[...coveredRoles].join("、")}`
  );

  const expectedScenarios = [
    "badge_signup",
    "badge_speech",
    "badge_election",
    "badge_pk_speech",
    "day_speech",
    "day_vote",
    "vote_pk_speech",
    "last_words",
    "guard_action",
    "wolf_action",
    "witch_action",
    "seer_action",
    "hunter_shoot",
    "white_wolf_king_boom",
    "badge_transfer",
  ];
  const coveredScenarios = new Set(phaseRoleCoverage.map((sample) => sample.scenario));
  addCheck(
    checks,
    "所有可达 Prompt 路径都有样本",
    expectedScenarios.every((scenario) => coveredScenarios.has(scenario)),
    `覆盖 ${coveredScenarios.size}/${expectedScenarios.length} 个场景`
  );

  addCheck(
    checks,
    "没有外部网络请求",
    transport.getExternalNetworkCallCount() === 0,
    `外部网络请求 ${transport.getExternalNetworkCallCount()} 次`
  );

  const rawReportCore = {
    mode: "production-prompt-path-with-local-model-transport" as const,
    summary: {
      playerCount: ROLE_ORDER.length,
      roles: [...ROLE_ORDER],
      aiLogCount: normalizedLogs.length,
      transportRequestCount: transport.records.length,
      externalNetworkCallCount: transport.getExternalNetworkCallCount(),
      phaseRoleCoverage,
      checks,
    },
    transport: transport.records,
    aiLogs: normalizedLogs,
  };
  const sanitizedPreview = JSON.stringify(redactAuditArtifact(rawReportCore));
  addCheck(
    checks,
    "审计产物不含密钥或请求头",
    !sanitizedPreview.includes(AUDIT_ANON_KEY) &&
      !/Bearer\s+(?!\[REDACTED\])\S+/i.test(sanitizedPreview),
    "产物不记录 headers 和环境变量，消息体中的常见凭证会递归脱敏"
  );

  const reportCore = redactAuditArtifact(rawReportCore);
  const fingerprint = createHash("sha256").update(JSON.stringify(reportCore)).digest("hex");
  const report: SinglePlayerContextAuditReport = {
    generatedAt: new Date().toISOString(),
    ...reportCore,
    fingerprint,
  };

  if (options.outputPath) {
    const outputPath = path.resolve(options.outputPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  return report;
}

export const isSinglePlayerContextAuditEntrypoint = (entryPath: string | undefined): boolean =>
  path.basename(entryPath ?? "") === "single-player-context-audit.ts";

const isDirectRun = isSinglePlayerContextAuditEntrypoint(process.argv[1]);
if (isDirectRun) {
  const outputPath = path.resolve("dry-runs/single-player-context-audit.json");
  runSinglePlayerContextAudit({ outputPath })
    .then((report) => {
      const failed = report.summary.checks.filter((check) => !check.passed);
      console.log(`单人上下文审计：${report.summary.checks.length - failed.length}/${report.summary.checks.length} 项通过`);
      console.log(`AI 日志：${report.summary.aiLogCount} 条；模型子请求：${report.summary.transportRequestCount} 条`);
      console.log(`报告：${outputPath}`);
      if (failed.length > 0) {
        failed.forEach((check) => console.error(`失败：${check.name}（${check.detail}）`));
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
