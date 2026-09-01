import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AILogEntry } from "@/lib/ai-logger";
import type { LLMMessage } from "@/lib/llm";
import { applyDeepSeekPromptScope } from "@/lib/deepseek-prompt-scope";
import {
  createSinglePlayerContextAuditState,
  redactAuditArtifact,
} from "./single-player-context-audit";
import type { ChatMessage, GameState, Player, Role } from "@/types/game";

const LIVE_MODEL = "deepseek-v4-flash-0731";
const MAX_PROVIDER_CALLS = 12;
const LIVE_OUTPUT_PATH = path.resolve("dry-runs/single-player-context-live-audit.json");

type ChatPayload = {
  model: string;
  provider?: "zenmux" | "dashscope" | "tokendance";
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  reasoning?: { enabled: boolean; effort?: "minimal" | "low" | "medium" | "high"; max_tokens?: number };
  reasoning_effort?: "minimal" | "low" | "medium" | "high";
  response_format?: unknown;
};

type AppRequestRecord = {
  requestId: number;
  batchIndex: number | null;
  model: string;
  messages: LLMMessage[];
};

type ProviderRequestRecord = {
  providerCallId: number;
  model: string;
  messages: unknown[];
  status: number;
  durationMs: number;
  usage?: unknown;
};

type AuditCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

const PRIVATE_TAGS = [
  "<your_seer_checks>",
  "<your_potions>",
  "<your_guard_info>",
  "<your_wolf_team>",
];

const expectedPrivateTags = (role: Role): string[] => {
  if (role === "Seer") return ["<your_seer_checks>"];
  if (role === "Witch") return ["<your_potions>"];
  if (role === "Guard") return ["<your_guard_info>"];
  if (role === "Werewolf" || role === "WhiteWolfKing") return ["<your_wolf_team>"];
  return [];
};

const flattenMessages = (messages: LLMMessage[]): string =>
  messages
    .flatMap((message) => {
      if (typeof message.content === "string") return [message.content];
      return message.content.flatMap((part) => (part.type === "text" ? [part.text] : []));
    })
    .join("\n");

const makeMessage = (
  players: Player[],
  seat: number,
  phase: ChatMessage["phase"],
  content: string,
  timestamp: number,
  isSystem = false
): ChatMessage => ({
  id: `live-audit-${timestamp}-${seat}`,
  playerId: isSystem ? "system" : players[seat]!.playerId,
  playerName: isSystem ? "系统" : players[seat]!.displayName,
  content,
  timestamp,
  day: 1,
  phase,
  isSystem,
});

const createUniqueSeerClaimState = (): GameState => {
  const base = structuredClone(createSinglePlayerContextAuditState());
  const players = base.players.map((player) => ({
    ...player,
    alive: true,
    agentProfile: player.agentProfile
      ? {
          ...player.agentProfile,
          modelRef: { provider: "tokendance" as const, model: LIVE_MODEL, reasoning: { enabled: false } },
        }
      : player.agentProfile,
  }));

  // 与用户反馈一致，让 1 号是唯一且真实的预言家；只交换角色，不改变公开板子数量。
  const seatOneRole = players[0]!.role;
  const seatOneAlignment = players[0]!.alignment;
  players[0] = { ...players[0]!, role: players[4]!.role, alignment: players[4]!.alignment };
  players[4] = { ...players[4]!, role: seatOneRole, alignment: seatOneAlignment };

  let ts = Date.UTC(2026, 8, 1, 1, 0, 0);
  const nextTs = () => (ts += 1_000);
  const messages: ChatMessage[] = [
    makeMessage(players, 0, "DAY_START", "第一天天亮，昨夜平安夜。现在进行警长竞选。", nextTs(), true),
    makeMessage(players, 7, "DAY_BADGE_SPEECH", "8号不认预言家，先听后置位。", nextTs()),
    makeMessage(players, 8, "DAY_BADGE_SPEECH", "9号不认预言家，目前没有查验信息。", nextTs()),
    makeMessage(
      players,
      0,
      "DAY_BADGE_SPEECH",
      "我1号是预言家，昨夜查验8号是好人。今晚准备查验按照8、9、1、3顺序中尚未发言的3号。",
      nextTs()
    ),
    makeMessage(
      players,
      2,
      "DAY_BADGE_SPEECH",
      "我是3号，现在轮到我发言。我不认预言家，也没有查验能力，先听1号后续。",
      nextTs()
    ),
    makeMessage(players, 0, "DAY_BADGE_ELECTION", "1号当选警长。", nextTs(), true),
  ];

  const ordinarySpeech: Array<[number, string]> = [
    [0, "1号重申自己是场上唯一预言家，昨夜查验8号是好人。"],
    [1, "2号不认预言家，暂时认为1号是场上唯一预言家。"],
    [2, "3号不认预言家，没有其他查验信息。"],
    [3, "4号不认预言家，先跟着唯一预言家的查验信息盘。"],
    [4, "5号不认预言家，目前没有第二个预言家出现。"],
    [5, "6号不认预言家，关注后续查验。"],
    [6, "7号不认预言家，暂时站边1号。"],
    [7, "8号补充：我不认预言家，1号给我的好人查验属实。"],
    [8, "9号补充：我不认预言家。"],
    [9, "10号不认预言家，场上目前只有1号跳预言家。"],
    [10, "11号不认预言家，没有其他查验信息。"],
  ];
  ordinarySpeech.forEach(([seat, content]) => {
    messages.push(makeMessage(players, seat, "DAY_SPEECH", content, nextTs()));
  });

  return {
    ...base,
    phase: "DAY_SPEECH",
    day: 1,
    players,
    messages,
    currentSpeakerSeat: null,
    badge: {
      ...base.badge,
      holderSeat: 0,
      candidates: [0, 2, 7, 8],
      signup: Object.fromEntries(players.map((player) => [player.playerId, [0, 2, 7, 8].includes(player.seat)])),
      votes: Object.fromEntries(players.slice(1).map((player) => [player.playerId, 0])),
      allVotes: Object.fromEntries(players.slice(1).map((player) => [player.playerId, 0])),
      history: { 1: Object.fromEntries(players.slice(1).map((player) => [player.playerId, 0])) },
      revoteCount: 0,
    },
    votes: {},
    voteReasons: {},
    lastVoteReasons: {},
    voteHistory: {},
    nightHistory: {
      1: {
        guardTarget: 7,
        wolfTarget: 7,
        witchSave: true,
        seerTarget: 7,
        seerResult: { targetSeat: 7, isWolf: false },
        deaths: [],
      },
    },
    dayHistory: {},
    dailySummaries: {},
    dailySummaryFacts: {},
    dailySummaryVoteData: {},
    nightActions: {
      lastGuardTarget: 7,
      seerTarget: 7,
      seerResult: { targetSeat: 7, isWolf: false },
      seerHistory: [{ targetSeat: 7, isWolf: false, day: 1 }],
    },
    roleAbilities: {
      witchHealUsed: true,
      witchPoisonUsed: false,
      hunterCanShoot: true,
      idiotRevealed: false,
      whiteWolfKingBoomUsed: false,
    },
    winner: null,
  };
};

const actorSamples = (state: GameState): Player[] => {
  const roles: Role[] = [
    "Seer",
    "Witch",
    "Hunter",
    "Guard",
    "Idiot",
    "Villager",
    "Werewolf",
    "WhiteWolfKing",
  ];
  return roles.map((role) => state.players.find((player) => player.role === role)!);
};

const createLastSpeakerState = (state: GameState, actor: Player): GameState => {
  const candidateSeats = [...new Set([...state.badge.candidates, actor.seat])];
  const votesForActor = Object.fromEntries(
    state.players
      .filter((player) => player.playerId !== actor.playerId)
      .map((player) => [player.playerId, actor.seat])
  );
  const messages = state.messages
    .filter((message) => !(message.phase === "DAY_SPEECH" && message.playerId === actor.playerId))
    .map((message) =>
      message.isSystem && message.phase === "DAY_BADGE_ELECTION"
        ? { ...message, content: `${actor.seat + 1}号当选警长。` }
        : message
    );
  const actorHasCampaignSpeech = messages.some(
    (message) => message.phase === "DAY_BADGE_SPEECH" && message.playerId === actor.playerId
  );
  if (!actorHasCampaignSpeech) {
    const electionIndex = messages.findIndex((message) => message.phase === "DAY_BADGE_ELECTION");
    const campaignSpeech: ChatMessage = {
      id: `live-audit-campaign-${actor.seat}`,
      playerId: actor.playerId,
      playerName: actor.displayName,
      content: `${actor.seat + 1}号不认预言家，竞选警长是为了归票。`,
      timestamp: (messages[electionIndex]?.timestamp ?? Date.now()) - 500,
      day: 1,
      phase: "DAY_BADGE_SPEECH",
    };
    messages.splice(electionIndex >= 0 ? electionIndex : messages.length, 0, campaignSpeech);
  }
  return {
    ...state,
    messages,
    currentSpeakerSeat: actor.seat,
    daySpeechStartSeat: (actor.seat + 1) % state.players.length,
    speechDirection: "clockwise",
    badge: {
      ...state.badge,
      holderSeat: actor.seat,
      candidates: candidateSeats,
      signup: Object.fromEntries(
        state.players.map((player) => [player.playerId, candidateSeats.includes(player.seat)])
      ),
      votes: votesForActor,
      allVotes: votesForActor,
      history: { 1: votesForActor },
    },
  };
};

const addCheck = (checks: AuditCheck[], name: string, passed: boolean, detail: string) => {
  checks.push({ name, passed, detail });
};

async function runLiveAudit() {
  if (!process.env.TOKENDANCE_API_KEY || !process.env.TOKENDANCE_BASE_URL) {
    throw new Error("缺少 TOKENDANCE_API_KEY 或 TOKENDANCE_BASE_URL，无法运行付费 live 审计");
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "live-audit-anon-key";

  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const appRequests: AppRequestRecord[] = [];
  const providerRequests: ProviderRequestRecord[] = [];
  const capturedLogs: AILogEntry[] = [];
  let appRequestId = 0;
  let providerCallId = 0;
  let unsubscribe = () => {};

  const [{ setLocale }, { aiLogger }, gameMaster] = await Promise.all([
    import("@/i18n/locale-store"),
    import("@/lib/ai-logger"),
    import("@/lib/game-master"),
  ]);
  setLocale("zh");

  const callPaidProvider = async (payload: ChatPayload) => {
    providerCallId += 1;
    if (providerCallId > MAX_PROVIDER_CALLS) {
      throw new Error(`live 审计最多允许 ${MAX_PROVIDER_CALLS} 次付费 Provider 调用`);
    }
    const messages = applyDeepSeekPromptScope(payload.messages, "gameplay");
    const requestBody: Record<string, unknown> = {
      model: payload.model,
      messages,
      temperature: Math.max(0, payload.temperature ?? 0.7),
      thinking: { type: "disabled" },
    };
    if (typeof payload.max_tokens === "number" && Number.isFinite(payload.max_tokens)) {
      requestBody.max_tokens = Math.max(16, Math.floor(payload.max_tokens));
    }
    if (payload.response_format) requestBody.response_format = payload.response_format;

    const providerUrl = `${process.env.TOKENDANCE_BASE_URL!.trim().replace(/\/+$/, "")}/chat/completions`;
    const start = Date.now();
    const response = await originalFetch(providerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TOKENDANCE_API_KEY}`,
        "Content-Type": "application/json",
        "X-App-Name": "Wolfcha",
        "X-Site-URL": "https://wolf-cha.com",
      },
      body: JSON.stringify(requestBody),
    });
    const responseText = await response.text();
    const responseBody = JSON.parse(responseText) as { usage?: unknown };
    providerRequests.push({
      providerCallId,
      model: payload.model,
      messages,
      status: response.status,
      durationMs: Date.now() - start,
      ...(responseBody.usage ? { usage: responseBody.usage } : {}),
    });
    if (!response.ok) {
      return {
        ok: false as const,
        status: response.status,
        error: `TokenDance error: ${response.status}`,
        details: responseBody,
      };
    }
    return { ok: true as const, data: responseBody };
  };

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "/api/demo-config") {
      return Response.json({ enabled: false, active: false });
    }

    if (url !== "/api/chat") throw new Error(`live 审计发现未授权网络请求：${url}`);

    appRequestId += 1;
    const body = JSON.parse(String(init?.body ?? "{}")) as ChatPayload & { requests?: ChatPayload[] };
    if (Array.isArray(body.requests)) {
      body.requests.forEach((request, batchIndex) => {
        appRequests.push({
          requestId: appRequestId,
          batchIndex,
          model: request.model,
          messages: request.messages,
        });
      });
      const results = await Promise.all(
        body.requests.map((request) => callPaidProvider(request))
      );
      return Response.json({ results });
    }

    appRequests.push({
      requestId: appRequestId,
      batchIndex: null,
      model: body.model,
      messages: body.messages,
    });
    const result = await callPaidProvider(body);
    if (!result.ok) {
      return Response.json(result, { status: result.status });
    }
    return Response.json(result.data);
  };

  console.log = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("[LLM]")) return;
    originalConsoleLog(...args);
  };

  const state = createUniqueSeerClaimState();
  const samples = actorSamples(state);
  const speechResults: Array<{ seat: number; role: Role; speech: string[] }> = [];
  let badgeSignup: Record<string, boolean> = {};

  try {
    unsubscribe = aiLogger.subscribe((entry) => {
      capturedLogs.push(entry);
    });

    for (const actor of samples) {
      const speech = await gameMaster.generateAISpeechSegments(
        createLastSpeakerState(state, actor),
        actor
      );
      speechResults.push({ seat: actor.seat + 1, role: actor.role, speech });
    }

    const badgeState = {
      ...createSinglePlayerContextAuditState(),
      players: state.players,
    };
    const signupActors = ["Seer", "Witch", "Werewolf", "Villager"].map(
      (role) => state.players.find((player) => player.role === role)!
    );
    badgeSignup = await gameMaster.generateAIBadgeSignupBatch(badgeState, signupActors);
  } finally {
    unsubscribe();
    globalThis.fetch = originalFetch;
    console.log = originalConsoleLog;
  }

  const checks: AuditCheck[] = [];
  const aiLogs = capturedLogs.map((entry) => ({
    ...entry,
    response: { ...entry.response, duration: 0 },
  }));
  const allAppText = appRequests.map((request) => flattenMessages(request.messages));
  const speechAppText = aiLogs
    .filter((entry) => entry.type === "speech")
    .map((entry) => flattenMessages(entry.request.messages));
  const roleIsolationFailures = aiLogs.filter((entry) => {
    const role = entry.request.player?.role as Role | undefined;
    if (!role) return false;
    const text = flattenMessages(entry.request.messages);
    const allowed = new Set(expectedPrivateTags(role));
    return PRIVATE_TAGS.some((tag) => text.includes(tag) && !allowed.has(tag));
  });
  addCheck(
    checks,
    "真实请求角色私有区块没有串视角",
    roleIsolationFailures.length === 0,
    roleIsolationFailures.length === 0 ? `检查 ${aiLogs.length} 条正式 AI 日志` : `发现 ${roleIsolationFailures.length} 条异常`
  );

  const personaFailures = aiLogs.filter((entry) => {
    const actorSeat = entry.request.player?.seat;
    if (typeof actorSeat !== "number") return false;
    const text = flattenMessages(entry.request.messages);
    return state.players.some(
      (player) => player.seat !== actorSeat && text.includes(`审计性格${player.seat + 1}`)
    );
  });
  addCheck(
    checks,
    "真实请求人物设定没有串位",
    personaFailures.length === 0,
    personaFailures.length === 0 ? "每次只包含行动者自己的人设" : `发现 ${personaFailures.length} 条异常`
  );

  addCheck(
    checks,
    "唯一预言家声明与发言时序完整传入",
    speechAppText.length === 8 && speechAppText.every((text) => {
      const claim = text.indexOf("尚未发言的3号");
      const seatThreeSpeech = text.indexOf("我是3号，现在轮到我发言");
      return claim >= 0 && seatThreeSpeech > claim;
    }),
    speechAppText.length === 8
      ? "所有 8 条行为样本均保留：1号先说要验尚未发言的3号，之后才轮到3号"
      : `行为样本 ${speechAppText.length}/8 条`
  );

  addCheck(
    checks,
    "每个行为样本都收到客观且准确的末置发言状态",
    speechAppText.length === samples.length && samples.every((actor, index) => {
      const statusSection = speechAppText[index]?.match(/【发言顺序】\n([\s\S]*?)\n\n轮到你发言/)?.[1] ?? "";
      return statusSection.includes(
        `当前轮到：${actor.seat + 1}号（第${state.players.length}/${state.players.length}位）`
      ) &&
        statusSection.includes("尚未轮到且没有公开发言记录：无") &&
        !/可以|建议|应该|先抛|回应|想想|角度/.test(statusSection);
    }),
    "每个角色均为警长末置位；Prompt 只记录当前座位、位置和真实发言记录，不提供发言策略"
  );

  addCheck(
    checks,
    "公开角色配置只含聚合数量",
    allAppText.every(
      (text) => text.includes("<public_role_configuration>") && !text.includes("audit-player-")
    ),
    "Prompt 含公开板子数量，不含稳定 playerId 或座位身份映射"
  );

  addCheck(
    checks,
    "警徽报名隐藏待公布死亡",
    aiLogs
      .filter((entry) => entry.type === "badge_signup")
      .every((entry) => !flattenMessages(entry.request.messages).includes("dead: [{seat: 11")),
    "4 条真实警徽报名请求均未提前公开待公布死亡"
  );

  addCheck(
    checks,
    "正式 App 请求与 Provider 调用数量一致",
    appRequests.length === providerRequests.length && providerRequests.every((request) => request.status === 200),
    `App 子请求 ${appRequests.length} 条，付费 Provider 调用 ${providerRequests.length} 次`
  );

  addCheck(
    checks,
    "正式 AI 日志完整",
    aiLogs.length === appRequests.length,
    `AI 日志 ${aiLogs.length} 条，App 子请求 ${appRequests.length} 条`
  );

  const rawReportCore = {
    mode: "production-context-and-provider-path-with-auth-seam-bypassed" as const,
    provider: "tokendance" as const,
    model: LIVE_MODEL,
    summary: {
      appSubrequestCount: appRequests.length,
      providerCallCount: providerRequests.length,
      aiLogCount: aiLogs.length,
      checks,
      totalUsage: providerRequests.reduce(
        (total, request) => {
          const usage = request.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
          total.promptTokens += usage?.prompt_tokens ?? 0;
          total.completionTokens += usage?.completion_tokens ?? 0;
          total.tokens += usage?.total_tokens ?? 0;
          return total;
        },
        { promptTokens: 0, completionTokens: 0, tokens: 0 }
      ),
    },
    scenario: {
      description: "1号是唯一且真实的预言家；警上按8、9、1、3发言，1号在3号发言前说要验尚未发言的3号。每个角色样本都使用一份内部一致的末置发言状态。",
      speechResults,
      badgeSignup: Object.fromEntries(
        Object.entries(badgeSignup).map(([playerId, decision]) => {
          const player = state.players.find((candidate) => candidate.playerId === playerId);
          return [player ? player.seat + 1 : playerId, decision];
        })
      ),
    },
    appRequests,
    providerRequests,
    aiLogs,
  };

  const serialized = JSON.stringify(redactAuditArtifact(rawReportCore));
  const secretValues = [
    process.env.TOKENDANCE_API_KEY,
    process.env.ZENMUX_API_KEY,
    process.env.DASHSCOPE_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter((value): value is string => Boolean(value && value.length >= 8));
  addCheck(
    checks,
    "live 报告不含服务端密钥或请求头",
    secretValues.every((value) => !serialized.includes(value)) && !/Bearer\s+(?!\[REDACTED\])\S+/i.test(serialized),
    "报告仅记录消息体、状态码、用量和脱敏日志"
  );

  const reportCore = redactAuditArtifact(rawReportCore);
  const fingerprint = createHash("sha256").update(JSON.stringify(reportCore)).digest("hex");
  const report = {
    generatedAt: new Date().toISOString(),
    ...reportCore,
    fingerprint,
  };
  await mkdir(path.dirname(LIVE_OUTPUT_PATH), { recursive: true });
  await writeFile(LIVE_OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const passed = checks.filter((check) => check.passed).length;
  originalConsoleLog(`Live 单人上下文审计：${passed}/${checks.length} 项通过`);
  originalConsoleLog(`付费模型：TokenDance / ${LIVE_MODEL}`);
  originalConsoleLog(`Provider 调用：${providerRequests.length} 次`);
  originalConsoleLog(`报告：${LIVE_OUTPUT_PATH}`);
  speechResults.forEach((sample) => {
    originalConsoleLog(`${sample.seat}号 ${sample.role}: ${sample.speech.join(" ")}`);
  });

  if (checks.some((check) => !check.passed)) {
    process.exitCode = 1;
  }
}

runLiveAudit().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
