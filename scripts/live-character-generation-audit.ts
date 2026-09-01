import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import messages from "@/i18n/messages/zh.json";
import { parseLLMJson } from "@/lib/llm-json";
import { stripMarkdownCodeFences } from "@/lib/llm";

const MODEL = "deepseek-v4-flash-0731";
const PLAYER_COUNT = 9;
const OUTPUT_PATH = path.resolve("dry-runs/live-character-generation-audit.json");

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
  title: "深夜便利店",
  description: "一群刚下班的人在便利店休息区玩一局狼人杀。",
  rolesHint: "普通上班族、夜班店员、学生和附近居民",
};

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
