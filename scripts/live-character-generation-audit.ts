import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import messages from "@/i18n/messages/zh.json";
import { setLocale } from "@/i18n/locale-store";
import { parseLLMJson } from "@/lib/llm-json";
import { stripMarkdownCodeFences } from "@/lib/llm";
import type { GameScenario } from "@/types/game";
import {
  applyDeepSeekPromptScope,
  type PromptScope,
} from "@/lib/deepseek-prompt-scope";

const MODEL = "deepseek-v4-flash-0731";
const PLAYER_COUNT = 9;
const OUTPUT_PATH = path.resolve("dry-runs/live-character-generation-audit.json");
const APP_PATH_MODE = process.env.CHARACTER_AUDIT_APP_PATH === "true";
const DIRECT_PROVIDER_APP_URL = "direct-provider";
const SINGLE_APP_ATTEMPT = process.env.CHARACTER_AUDIT_SINGLE_ATTEMPT === "true";

type BaseProfile = {
  displayName: string;
  gender: "male" | "female";
  age: number;
  mbti: string;
  basicInfo: string;
};

type ProviderCall = {
  stage: "base" | "persona";
  status: number;
  durationMs: number;
  headersMs: number;
  firstContentMs: number | null;
  maxReadGapMs: number;
  outputChars: number;
  finishReason: string | null;
  usage: unknown;
  responseHash: string;
};

const interpolate = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  );

const scenario = {
  id: "live-character-generation-audit",
  title: "深夜便利店",
  description: "一群刚下班的人在便利店休息区玩一局狼人杀。",
  rolesHint: "普通上班族、夜班店员、学生和附近居民",
} satisfies GameScenario;

const basePrompt = interpolate(messages.characterGenerator.baseProfilesPrompt, {
  count: PLAYER_COUNT,
  ...scenario,
});

const providerUrl = () => {
  const base = process.env.TOKENDANCE_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base || !process.env.TOKENDANCE_API_KEY) {
    throw new Error("缺少 TOKENDANCE_API_KEY 或 TOKENDANCE_BASE_URL");
  }
  return `${base}/chat/completions`;
};

const digest = (content: string) => createHash("sha256").update(content).digest("hex");

async function callProvider(
  stage: ProviderCall["stage"],
  prompt: string,
  maxTokens: number,
  stream: boolean,
): Promise<{ content: string; record: ProviderCall }> {
  const startedAt = Date.now();
  const response = await fetch(providerUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TOKENDANCE_API_KEY}`,
      "Content-Type": "application/json",
      "X-App-Name": "Wolfcha",
      "X-Site-URL": "https://www.wolf-cha.com",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9,
      max_tokens: maxTokens,
      thinking: { type: "disabled" },
      ...(stream ? { stream: true } : {}),
    }),
  });
  const headersMs = Date.now() - startedAt;

  let content = "";
  let finishReason: string | null = null;
  let usage: unknown = null;
  let firstContentMs: number | null = null;
  let maxReadGapMs = 0;

  if (stream) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("流式响应没有 body");
    const decoder = new TextDecoder();
    let buffer = "";
    let lastReadAt = Date.now();
    while (true) {
      const { done, value } = await reader.read();
      const now = Date.now();
      maxReadGapMs = Math.max(maxReadGapMs, now - lastReadAt);
      lastReadAt = now;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") continue;
        const payload = JSON.parse(trimmed.slice(6)) as {
          choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
          usage?: unknown;
        };
        const delta = payload.choices?.[0]?.delta?.content ?? "";
        if (delta && firstContentMs === null) firstContentMs = Date.now() - startedAt;
        content += delta;
        finishReason = payload.choices?.[0]?.finish_reason ?? finishReason;
        usage = payload.usage ?? usage;
      }
    }
  } else {
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string | null }>;
      usage?: unknown;
    };
    content = payload.choices?.[0]?.message?.content ?? "";
    firstContentMs = content ? Date.now() - startedAt : null;
    finishReason = payload.choices?.[0]?.finish_reason ?? null;
    usage = payload.usage ?? null;
  }

  const record: ProviderCall = {
    stage,
    status: response.status,
    durationMs: Date.now() - startedAt,
    headersMs,
    firstContentMs,
    maxReadGapMs,
    outputChars: content.length,
    finishReason,
    usage,
    responseHash: digest(content),
  };
  if (!response.ok) {
    throw new Error(`${stage} 请求失败：HTTP ${response.status}`);
  }
  return { content, record };
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

async function runClientGenerationAudit() {
  const appUrl = process.env.CHARACTER_AUDIT_APP_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.TOKENDANCE_API_KEY?.trim();
  if (!appUrl || !apiKey) {
    throw new Error("应用路径审计缺少 CHARACTER_AUDIT_APP_URL 或 TOKENDANCE_API_KEY");
  }

  // 只在本进程内模拟用户选择自定义 TokenDance Key。URL 模式走部署后的
  // /api/chat；direct-provider 模式只验证客户端生成管线，不代表生产 Route。
  setLocale("zh");
  const storage = new MemoryStorage();
  storage.setItem("wolfcha_model_source", "custom");
  storage.setItem("wolfcha_model_source_explicit_v1", "true");
  storage.setItem("wolfcha_custom_key_enabled", "true");
  storage.setItem("wolfcha_tokendance_api_key", apiKey);
  storage.setItem("wolfcha_generator_model", MODEL);

  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const mockWindow = {
    localStorage: storage,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: mockWindow,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  const startedAt = Date.now();
  const routeCalls: Array<{
    stream: boolean;
    promptScope: PromptScope;
    status: number;
    durationMs: number;
    outputChars?: number;
    finishReason?: string | null;
    doneMarkerSeen?: boolean;
    responseHash?: string;
    usage?: unknown;
  }> = [];
  const baseProfileHashes: string[] = [];
  const emittedCharacterHashes: string[] = [];
  let resultHashes: string[] = [];
  let personaHashes: string[] = [];
  let error: string | null = null;

  const forwardDirectProviderRequest = async (init?: RequestInit): Promise<Response> => {
    const callStartedAt = Date.now();
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      model?: string;
      messages?: unknown[];
      prompt_scope?: PromptScope;
      temperature?: number;
      max_tokens?: number;
      stream?: boolean;
      response_format?: unknown;
    };
    if (
      SINGLE_APP_ATTEMPT &&
      body.stream === true &&
      routeCalls.some((call) => call.stream)
    ) {
      return Response.json({ error: "审计只允许一次完整角色流" }, { status: 400 });
    }
    const response = await originalFetch(providerUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-App-Name": "Wolfcha",
        "X-Site-URL": "https://www.wolf-cha.com",
      },
      body: JSON.stringify({
        model: body.model,
        messages: applyDeepSeekPromptScope(
          Array.isArray(body.messages) ? body.messages : [],
          body.prompt_scope ?? "utility",
        ),
        temperature: body.temperature,
        max_tokens: body.max_tokens,
        stream: body.stream === true,
        thinking: { type: "disabled" },
        ...(body.response_format ? { response_format: body.response_format } : {}),
      }),
    });
    const callRecord: (typeof routeCalls)[number] = {
      stream: body.stream === true,
      promptScope: body.prompt_scope ?? "utility",
      status: response.status,
      durationMs: Date.now() - callStartedAt,
    };
    routeCalls.push(callRecord);

    if (!body.stream || !response.body) return response;

    const decoder = new TextDecoder();
    const responseDigest = createHash("sha256");
    let buffer = "";
    let outputChars = 0;
    let finishReason: string | null = null;
    let doneMarkerSeen = false;
    let usage: unknown = null;
    const updateCallRecord = () => {
      callRecord.durationMs = Date.now() - callStartedAt;
      callRecord.outputChars = outputChars;
      callRecord.finishReason = finishReason;
      callRecord.doneMarkerSeen = doneMarkerSeen;
      callRecord.responseHash = responseDigest.copy().digest("hex");
      callRecord.usage = usage;
    };
    const inspectLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const data = trimmed.slice(5).trimStart();
      if (data === "[DONE]") {
        doneMarkerSeen = true;
        updateCallRecord();
        return;
      }
      try {
        const payload = JSON.parse(data) as {
          choices?: Array<{
            delta?: { content?: string };
            finish_reason?: string | null;
          }>;
          usage?: unknown;
        };
        const content = payload.choices?.[0]?.delta?.content ?? "";
        outputChars += content.length;
        responseDigest.update(content);
        finishReason = payload.choices?.[0]?.finish_reason ?? finishReason;
        usage = payload.usage ?? usage;
        updateCallRecord();
      } catch {
        // 生产解析器会报告完整坏帧；审计器只记录，不改变转发内容。
      }
    };
    const inspectedBody = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(inspectLine);
        controller.enqueue(chunk);
      },
      flush() {
        buffer += decoder.decode();
        if (buffer.trim()) inspectLine(buffer);
        updateCallRecord();
      },
    }));
    return new Response(inspectedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };

  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (appUrl === DIRECT_PROVIDER_APP_URL) {
      if (raw === "/api/demo-config") {
        return Promise.resolve(Response.json({
          source: "database",
          enabled: false,
          active: false,
          startsAt: null,
          expiresAt: null,
          serverNow: new Date().toISOString(),
        }));
      }
      if (raw === "/api/chat") return forwardDirectProviderRequest(init);
    }
    const resolved = raw.startsWith("/") ? new URL(raw, `${appUrl}/`).toString() : raw;
    return originalFetch(resolved, init);
  };

  try {
    const { generateCharacters } = await import("@/lib/character-generator");
    const characters = await generateCharacters(PLAYER_COUNT, scenario, {
      onBaseProfiles: (profiles) => {
        baseProfileHashes.push(...profiles.map((profile) => digest(profile.displayName)));
      },
      onCharacter: (_index, character) => {
        emittedCharacterHashes.push(digest(character.displayName));
      },
    });
    resultHashes = characters.map((character) => digest(character.displayName));
    personaHashes = characters.map((character) => digest(JSON.stringify({
      persona: character.persona,
      playerMind: character.playerMind,
    })));
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    }
    if (originalLocalStorage === undefined) {
      Reflect.deleteProperty(globalThis, "localStorage");
    } else {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: originalLocalStorage,
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: appUrl === DIRECT_PROVIDER_APP_URL
      ? "client-generation-direct-provider"
      : "app-path",
    appUrl,
    model: MODEL,
    playerCount: PLAYER_COUNT,
    durationMs: Date.now() - startedAt,
    routeCalls,
    baseProfileCount: baseProfileHashes.length,
    uniqueBaseProfileCount: new Set(baseProfileHashes).size,
    emittedCharacterCount: emittedCharacterHashes.length,
    resultCount: resultHashes.length,
    uniqueResultNameCount: new Set(resultHashes).size,
    uniquePersonaCount: new Set(personaHashes).size,
    baseAndResultOrderMatches:
      baseProfileHashes.length === PLAYER_COUNT &&
      JSON.stringify(baseProfileHashes) === JSON.stringify(resultHashes),
    error,
  };
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (error || report.resultCount !== PLAYER_COUNT || !report.baseAndResultOrderMatches) {
    process.exitCode = 1;
  }
}

const buildPersonaPrompt = (profiles: BaseProfile[]) => {
  const roster = profiles
    .map((profile, index) => interpolate(messages.characterGenerator.rosterLine, {
      index: index + 1,
      name: profile.displayName,
      gender: profile.gender,
      age: profile.age,
      basicInfo: profile.basicInfo,
    }))
    .join("\n");
  const schema = profiles
    .map((profile) =>
      `  { "displayName": "${profile.displayName}", "persona": { "voiceRules": string[], "werewolfExperience": string, "vocabularyStyle": string, "reasoningStyle": string, "speechLengthHabit": string, "pressureStyle": string, "uncertaintyStyle": string, "mistakePattern": string, "wolfDeceptionStyle": string, "mbti": "${profile.mbti}", "gender": "${profile.gender}", "age": ${profile.age} }, "playerMind": { "courage": string, "memoryBias": string, "suspicionThreshold": string, "selfProtection": string, "logicDepth": string, "tablePresence": string } }`
    )
    .join(",\n");
  return interpolate(messages.characterGenerator.fullPersonasPrompt, {
    title: scenario.title,
    description: scenario.description,
    roster,
    count: profiles.length,
    schema,
  });
};

async function main() {
  if (APP_PATH_MODE) {
    await runClientGenerationAudit();
    return;
  }
  const calls: ProviderCall[] = [];
  const fixedProfiles: BaseProfile[] = [
    { displayName: "张伟", gender: "male", age: 35, mbti: "ESTJ", basicInfo: "刚下夜班的出租车司机" },
    { displayName: "林雨", gender: "female", age: 27, mbti: "ENFP", basicInfo: "互联网产品经理" },
    { displayName: "周诚", gender: "male", age: 31, mbti: "ISTJ", basicInfo: "便利店夜班店员" },
    { displayName: "陈曦", gender: "female", age: 24, mbti: "INFP", basicInfo: "准备考研的学生" },
    { displayName: "王凯", gender: "male", age: 42, mbti: "ENTJ", basicInfo: "附近小公司的老板" },
    { displayName: "赵宁", gender: "female", age: 38, mbti: "ISFJ", basicInfo: "社区医院护士" },
    { displayName: "许峰", gender: "male", age: 29, mbti: "INTP", basicInfo: "自由职业程序员" },
    { displayName: "唐悦", gender: "female", age: 33, mbti: "ESFP", basicInfo: "健身房教练" },
    { displayName: "刘洋", gender: "male", age: 26, mbti: "ISFP", basicInfo: "刚结束排练的乐手" },
  ];
  let profiles = fixedProfiles;
  if (process.env.CHARACTER_AUDIT_PERSONA_ONLY !== "true") {
    const base = await callProvider(
      "base",
      `${basePrompt}\n\nRespond with valid JSON only. No markdown, no code blocks, just raw JSON.`,
      Math.max(2400, PLAYER_COUNT * 350 + 600),
      false,
    );
    calls.push(base.record);
    const baseJson = parseLLMJson<{ profiles?: BaseProfile[] }>(stripMarkdownCodeFences(base.content));
    profiles = baseJson?.profiles ?? [];
  }
  if (profiles.length !== PLAYER_COUNT) {
    throw new Error(`基础档案数量错误：${profiles.length}/${PLAYER_COUNT}`);
  }

  const persona = await callProvider(
    "persona",
    buildPersonaPrompt(profiles),
    Math.max(9000, PLAYER_COUNT * 1250 + 1800),
    true,
  );
  calls.push(persona.record);
  const personaJson = parseLLMJson<{ characters?: Array<{ displayName?: string }> }>(
    stripMarkdownCodeFences(persona.content),
  );
  const characters = personaJson?.characters ?? [];
  const expectedNames = profiles.map((profile) => profile.displayName);
  const actualNames = characters.map((character) => character.displayName ?? "");
  const checks = {
    baseCount: profiles.length === PLAYER_COUNT,
    personaJsonValid: personaJson !== null,
    personaCount: characters.length === PLAYER_COUNT,
    personaOrderMatches: JSON.stringify(actualNames) === JSON.stringify(expectedNames),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    playerCount: PLAYER_COUNT,
    calls,
    checks,
  };
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (Object.values(checks).some((passed) => !passed)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
