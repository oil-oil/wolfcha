import { generateJSON } from "./llm";
import { AVAILABLE_MODELS, ALL_MODELS, GENERATOR_MODEL, type GameScenario, type ModelRef, type Persona } from "@/types/game";
import { getGeneratorModel, getSelectedModels, hasDashscopeKey, hasZenmuxKey, isCustomKeyEnabled } from "@/lib/api-keys";
import { aiLogger } from "./ai-logger";
import { AI_TEMPERATURE, GAME_TEMPERATURE } from "./ai-config";
import { getRandomScenario } from "./scenarios";
import { resolveVoiceId, VOICE_PRESETS } from "./voice-constants";

export interface GeneratedCharacter {
  displayName: string;
  persona: Persona;
}

export interface GeneratedCharacters {
  characters: GeneratedCharacter[];
}

export type Gender = "male" | "female" | "nonbinary";

const MODEL_DISPLAY_NAME_MAP: Array<{ match: RegExp; label: string }> = [
  { match: /gemini/i, label: "Gemini" },
  { match: /deepseek/i, label: "DeepSeek" },
  { match: /claude/i, label: "Claude" },
  { match: /qwen/i, label: "Qwen" },
  { match: /doubao/i, label: "Doubao" },
  { match: /bytedance|seed/i, label: "ByteDance" },
  { match: /openai|gpt/i, label: "OpenAI" },
  { match: /kimi|moonshot/i, label: "Kimi" },
];

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const sampleModelRefs = (count: number): ModelRef[] => {
  // Default pool when custom key is not enabled
  const defaultPool =
    AVAILABLE_MODELS.length > 0
      ? AVAILABLE_MODELS
      : [{ provider: "zenmux" as const, model: GENERATOR_MODEL }];

  const pool = (() => {
    if (!isCustomKeyEnabled()) return defaultPool;

    // When custom key is enabled, use ALL_MODELS as the full available pool
    const fullPool = ALL_MODELS.length > 0 ? ALL_MODELS : defaultPool;

    const allowedProviders = new Set<ModelRef["provider"]>();
    if (hasZenmuxKey()) allowedProviders.add("zenmux");
    if (hasDashscopeKey()) allowedProviders.add("dashscope");
    if (allowedProviders.size === 0) return defaultPool;

    // Filter by allowed providers
    const allowedPool = fullPool.filter((ref) => allowedProviders.has(ref.provider));
    if (allowedPool.length === 0) return defaultPool;

    // Filter by user's selected models
    const selectedModels = getSelectedModels();
    if (selectedModels.length === 0) return allowedPool;
    const selectedPool = allowedPool.filter((ref) => selectedModels.includes(ref.model));
    return selectedPool.length > 0 ? selectedPool : allowedPool;
  })();

  if (!Number.isFinite(count) || count <= 0) return [];

  if (count <= pool.length) {
    return shuffleArray(pool).slice(0, count);
  }

  const out = shuffleArray(pool);
  while (out.length < count) {
    out.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return out;
};

const getModelDisplayName = (modelRef: ModelRef): string => {
  const raw = modelRef.model ?? "";
  const mapped = MODEL_DISPLAY_NAME_MAP.find((entry) => entry.match.test(raw))?.label;
  if (mapped) return mapped;
  const fallback = raw.split("/").pop() ?? raw;
  return fallback.split("-")[0] || fallback || "AI";
};

type NicknameItem = { model: string; nicknames: string[] };

const nicknameCache = new Map<string, string[]>();

const buildNicknamePrompt = (requirements: Array<{ model: string; count: number }>) => {
  const list = requirements.map((r) => `- ${r.model} x${r.count}`).join("\n");

  return `你是取名助手，为模型英文名生成中文昵称。

【模型列表】
${list}

【要求】
1. 每个模型给对应数量的昵称（同一模型昵称彼此不同）
2. 1-4 字为主，可中英混合
3. 有趣、好记，能呼应英文名
4. items[].model 必须与上方列表中的模型名称完全一致
5. 不要重复，不要加引号或编号

【输出 JSON】
{
  "items": [
    { "model": "ModelX", "nicknames": ["小X", "X仔"] }
  ]
}

现在输出：`;
};

const normalizeNicknameResponse = (raw: unknown): Map<string, string[]> => {
  const result = new Map<string, string[]>();
  if (!raw || typeof raw !== "object" || !("items" in raw) || !Array.isArray((raw as any).items)) {
    return result;
  }

  const items = (raw as { items: NicknameItem[] }).items;
  items.forEach((item) => {
    if (!item || typeof item.model !== "string" || !Array.isArray(item.nicknames)) return;
    const model = item.model.trim().toLowerCase();
    if (!model) return;
    const nicknames = item.nicknames
      .map((n) => String(n ?? "").trim())
      .filter(Boolean);
    if (nicknames.length === 0) return;
    result.set(model, nicknames);
  });

  return result;
};

const resolveNicknameMap = async (requirements: Array<{ model: string; count: number }>): Promise<Map<string, string[]>> => {
  const missing = requirements.filter((req) => (nicknameCache.get(req.model)?.length ?? 0) < req.count);
  if (missing.length === 0) {
    return new Map(requirements.map((req) => [req.model, nicknameCache.get(req.model) as string[]]));
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const prompt = buildNicknamePrompt(missing);
      const raw = await generateJSON<unknown>({
        model: getGeneratorModel(),
        messages: [{ role: "user", content: prompt }],
        temperature: AI_TEMPERATURE.BALANCED,
      });
      const normalized = normalizeNicknameResponse(raw);
      missing.forEach((req) => {
        const nicknames = normalized.get(req.model.toLowerCase());
        if (!nicknames || nicknames.length < req.count) {
          throw new Error(`Missing nicknames for ${req.model}`);
        }
        const unique = Array.from(new Set(nicknames));
        if (unique.length < req.count) {
          throw new Error(`Duplicate nicknames for ${req.model}`);
        }
        nicknameCache.set(req.model, unique.slice(0, req.count));
      });

      const allNicknames = Array.from(nicknameCache.values()).flat();
      const uniqueAll = new Set(allNicknames);
      if (uniqueAll.size !== allNicknames.length) {
        throw new Error("Duplicate nicknames across models");
      }
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn("[wolfcha] Nickname generation failed after retry.", lastError);
    throw lastError;
  }

  return new Map(requirements.map((req) => [req.model, nicknameCache.get(req.model) as string[]]));
};

const createGenshinPersona = (voiceId?: string): Persona => {
  return {
    styleLabel: "neutral",
    voiceRules: ["concise"],
    mbti: "NA",
    gender: "nonbinary",
    age: 0,
    voiceId,
  };
};

export const buildGenshinModelRefs = (count: number): ModelRef[] => {
  return sampleModelRefs(count);
};

export const generateGenshinModeCharacters = async (
  count: number,
  modelRefs: ModelRef[]
): Promise<GeneratedCharacter[]> => {
  const modelUsageCounts = new Map<string, number>();
  const modelVoiceMap = new Map<string, string>();
  const resolvedRefs = modelRefs.length >= count ? modelRefs : buildGenshinModelRefs(count);

  return resolvedRefs.slice(0, count).map((modelRef) => {
    const modelLabel = getModelDisplayName(modelRef);
    const usageCount = modelUsageCounts.get(modelLabel) ?? 0;
    modelUsageCounts.set(modelLabel, usageCount + 1);
    const preferredName = usageCount === 0 ? modelLabel : `${modelLabel} ${usageCount + 1}`;

    let voiceId = modelVoiceMap.get(modelLabel);
    if (!voiceId) {
      const preset = VOICE_PRESETS[Math.floor(Math.random() * VOICE_PRESETS.length)];
      voiceId = preset?.id;
      if (voiceId) {
        modelVoiceMap.set(modelLabel, voiceId);
      }
    }

    return {
      displayName: preferredName,
      persona: createGenshinPersona(voiceId),
    };
  });
};

const isValidMbti = (v: any): v is string => typeof v === "string" && /^[A-Z]{4}$/.test(v.trim());

export interface BaseProfile {
  displayName: string;
  gender: Gender;
  age: number;
  mbti: string;
  basicInfo: string;
}

interface BaseProfilesResponse {
  profiles: BaseProfile[];
}

const normalizeBaseProfiles = (result: unknown): { profiles: BaseProfile[]; raw: unknown } => {
  if (result && typeof result === "object" && "profiles" in result && Array.isArray((result as any).profiles)) {
    return { profiles: (result as BaseProfilesResponse).profiles, raw: result };
  }

  if (Array.isArray(result)) {
    if (result.length > 0 && typeof result[0] === "object" && result[0] && "displayName" in (result[0] as any)) {
      return { profiles: result as BaseProfile[], raw: result };
    }
    return { profiles: [], raw: result };
  }

  return { profiles: [], raw: result };
};

const isValidGender = (g: any): g is Gender => g === "male" || g === "female" || g === "nonbinary";

const isValidBaseProfiles = (profiles: any, count: number): profiles is BaseProfile[] => {
  if (!Array.isArray(profiles) || profiles.length !== count) return false;
  const ok = profiles.every((p) => {
    if (!p || typeof p !== "object") return false;
    if (typeof (p as any).displayName !== "string" || !(p as any).displayName.trim()) return false;
    if (!isValidGender((p as any).gender)) return false;
    if (typeof (p as any).age !== "number" || !Number.isFinite((p as any).age) || (p as any).age < 16 || (p as any).age > 70) return false;
    if (!isValidMbti((p as any).mbti)) return false;
    if (typeof (p as any).basicInfo !== "string" || !(p as any).basicInfo.trim()) return false;
    return true;
  });

  if (!ok) return false;
  const names = profiles.map((p: any) => String(p.displayName).trim()).filter(Boolean);
  if (names.length !== count) return false;
  if (new Set(names).size !== count) return false;
  return true;
};

const buildBaseProfilesPrompt = (count: number, scenario: GameScenario) => {
  return `你是一个狼人杀游戏的角色设计师。

【当前剧本背景】
标题：${scenario.title}
背景：${scenario.description}
角色建议：${scenario.rolesHint}

【任务】
生成 ${count} 个玩家角色档案。这些是"玩狼人杀的普通人"，不是悬疑剧本的角色。

【重要】
- 这是狼人杀游戏，角色需要能正常讨论、投票、发言
- 口头禅要像口语习惯/语气词/连接词，避免夸张或“动漫式”口癖
- 口头禅只是偶尔使用，不要每句话都重复或固定句尾
- 背景是普通人的职业/身份，不要悬疑剧情
- 角色要有性格差异，但说话方式要正常

【输出要求】
1. 必须严格输出 JSON 对象
2. 必须恰好 ${count} 个档案
3. 每个档案字段：
   - displayName: string（符合场景的名字，2-3个字）
   - gender: "male" | "female"
   - age: number（20-55）
   - mbti: string（4字母，如 INTJ/ENFP）
   - basicInfo: string（一句话职业/身份，如"开出租的老司机"、"刚毕业的大学生"）
4. 名字必须各不相同

【示例】
{
  "profiles": [
    { "displayName": "张伟", "gender": "male", "age": 35, "mbti": "ESTJ", "basicInfo": "开了十年出租车的老司机" },
    { "displayName": "林小雨", "gender": "female", "age": 24, "mbti": "ENFP", "basicInfo": "互联网公司的产品经理" }
  ]
}

现在输出：`;
};

const normalizeGeneratedCharacters = (
  result: unknown
): { characters: GeneratedCharacter[]; raw: unknown } => {
  if (result && typeof result === "object" && "displayName" in result && "persona" in result) {
    return { characters: [result as GeneratedCharacter], raw: result };
  }

  if (result && typeof result === "object" && "characters" in result && Array.isArray((result as any).characters)) {
    return { characters: (result as GeneratedCharacters).characters, raw: result };
  }

  if (Array.isArray(result)) {
    if (result.length > 0 && typeof result[0] === "object" && result[0] && "displayName" in (result[0] as any)) {
      return { characters: result as GeneratedCharacter[], raw: result };
    }
    return { characters: [], raw: result };
  }

  return { characters: [], raw: result };
};

const isValidPersona = (p: any): p is Persona => {
  if (!p || typeof p !== "object") return false;
  if (typeof p.styleLabel !== "string") return false;
  if (!Array.isArray(p.voiceRules) || p.voiceRules.filter((x: any) => typeof x === "string" && x.trim()).length === 0) return false;
  if (!isValidMbti(p.mbti)) return false;
  if (!isValidGender(p.gender)) return false;
  if (typeof p.age !== "number" || !Number.isFinite(p.age) || p.age < 16 || p.age > 70) return false;
  if (p.relationships !== undefined) {
    if (!Array.isArray(p.relationships)) return false;
    if (p.relationships.some((x: any) => typeof x !== "string")) return false;
  }
  return true;
};

const isValidPersonaForProfile = (p: any, profile: BaseProfile): p is Persona => {
  if (!isValidPersona(p)) return false;
  if (p.gender !== profile.gender) return false;
  if (p.age !== profile.age) return false;
  if (String(p.mbti).trim() !== profile.mbti) return false;
  return true;
};

const isValidCharacters = (chars: any, count: number): chars is GeneratedCharacter[] => {
  if (!Array.isArray(chars) || chars.length !== count) return false;
  return chars.every((c) => {
    if (!c || typeof c !== "object") return false;
    if (typeof (c as any).displayName !== "string" || !(c as any).displayName.trim()) return false;
    return isValidPersona((c as any).persona);
  });
};

const alignCharactersToProfiles = (
  chars: unknown,
  profiles: BaseProfile[]
): GeneratedCharacter[] | null => {
  if (!Array.isArray(chars) || chars.length !== profiles.length) return null;
  const byName = new Map<string, GeneratedCharacter>();
  for (const c of chars as GeneratedCharacter[]) {
    if (!c || typeof c !== "object") return null;
    const name = typeof c.displayName === "string" ? c.displayName.trim() : "";
    if (!name) return null;
    if (byName.has(name)) return null;
    byName.set(name, c);
  }
  const ordered: GeneratedCharacter[] = [];
  for (const profile of profiles) {
    const key = profile.displayName.trim();
    const c = byName.get(key);
    if (!c || !isValidPersonaForProfile(c.persona, profile)) return null;
    ordered.push(c);
  }
  return ordered;
};

const buildFullPersonasPrompt = (scenario: GameScenario, allProfiles: BaseProfile[]) => {
  const roster = allProfiles
    .map((p, i) => `${i + 1}. ${p.displayName} (${p.gender}, ${p.age}岁) - ${p.basicInfo}`)
    .join("\n");

  const schema = allProfiles
    .map((p) => `  { "displayName": "${p.displayName}", "persona": { "styleLabel": string, "voiceRules": string[], "mbti": "${p.mbti}", "gender": "${p.gender}", "age": ${p.age} } }`)
    .join(",\n");

  return `你是狼人杀游戏的角色设计师。

【场景】
${scenario.title} - ${scenario.description}

【全员档案】
${roster}

【任务】
为每个角色补全 persona，让他们在狼人杀游戏中有自然且有辨识度的说话风格。
请自由发挥，确保每个人的性格、说话习惯和表达节奏都有明显差异，但整体像真实玩家而不是戏剧角色。

【重要约束】
- 这是狼人杀游戏，角色需要能正常讨论、分析、投票
- 角色发言需聚焦局内，不要引导编剧情节或场外聊天
- voiceRules 需体现具体说话特征
- styleLabel 用简短标签概括性格或表达方式

【输出要求】
1. 必须输出 JSON：{ "characters": [...] }
2. 必须恰好 ${allProfiles.length} 个角色，顺序与档案一致
3. persona.gender/age/mbti 必须与档案完全一致

【输出结构】
{
  "characters": [
${schema}
  ]
}

现在输出：`;
};

const buildRepairBaseProfilesPrompt = (count: number, scenario: GameScenario, raw: unknown) => {
  const rawStr = (() => {
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  })();

  return `你是一个严格的 JSON 修复器。

【目标】
把输入修复成严格 JSON 对象，结构为 { "profiles": [...] }，并确保 profiles 恰好 ${count} 个。

【字段要求】
- displayName: string
- gender: "male" | "female" | "nonbinary"
- age: number（16-70）
- mbti: string（4 字母，例如 INTJ/ENFP）
- basicInfo: string

【场景】
${scenario.title}
${scenario.description}

【输入】
${rawStr}

【输出】
只输出 JSON：`;
};

const buildRepairFullPersonasPrompt = (scenario: GameScenario, allProfiles: BaseProfile[], raw: unknown) => {
  const rawStr = (() => {
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  })();

  const roster = allProfiles
    .map((p, i) => `${i + 1}. ${p.displayName} (${p.gender}) - ${p.basicInfo}`)
    .join("\n");

  const schema = allProfiles
    .map((p) => `  { "displayName": "${p.displayName}", "persona": { "styleLabel": string, "voiceRules": string[], "mbti": "${p.mbti}", "gender": "${p.gender}", "age": ${p.age} } }`)
    .join(",\n");

  return `你是一个严格的 JSON 修复器。

【目标】
把输入修复成严格 JSON 对象，结构为 { "characters": [...] }，并确保 characters 恰好 ${allProfiles.length} 个。

【必须严格满足】
1. characters 顺序必须与基础档案一致
2. persona.gender/age/mbti 必须与对应档案一致
3. styleLabel 和 voiceRules 保持原样或合理修复，不要替换成固定模板

【场景】
${scenario.title}
${scenario.description}

【全员基础档案】
${roster}

【输入】
${rawStr}

【输出】
{
  "characters": [
${schema}
  ]
}

注意：只输出 JSON，不要解释。`;
};

export async function generateCharacters(
  count: number,
  scenario?: GameScenario,
  options?: {
    onBaseProfiles?: (profiles: BaseProfile[]) => void;
    onCharacter?: (index: number, character: GeneratedCharacter) => void;
  }
): Promise<GeneratedCharacter[]> {
  const usedScenario = scenario ?? getRandomScenario();
  const runOnce = async () => {
    const startTime = Date.now();
    const basePrompt = buildBaseProfilesPrompt(count, usedScenario);

    const baseResult = await generateJSON<unknown>({
      model: getGeneratorModel(),
      messages: [{ role: "user", content: basePrompt }],
      temperature: GAME_TEMPERATURE.CHARACTER_GENERATION,
      max_tokens: 1200,
    });

    const normalizedBase = normalizeBaseProfiles(baseResult);
    let baseProfiles = normalizedBase.profiles;

    if (!isValidBaseProfiles(baseProfiles, count)) {
      const baseRepairPrompt = buildRepairBaseProfilesPrompt(count, usedScenario, normalizedBase.raw);
      const baseRepaired = await generateJSON<unknown>({
        model: getGeneratorModel(),
        messages: [{ role: "user", content: baseRepairPrompt }],
        temperature: GAME_TEMPERATURE.CHARACTER_REPAIR,
        max_tokens: 1200,
      });

      const normalizedBaseRepaired = normalizeBaseProfiles(baseRepaired);
      baseProfiles = normalizedBaseRepaired.profiles;

      if (!isValidBaseProfiles(baseProfiles, count)) {
        throw new Error("Base profile generation returned invalid schema after repair");
      }
    }

    options?.onBaseProfiles?.(baseProfiles);

    const fullPrompt = buildFullPersonasPrompt(usedScenario, baseProfiles);
    const fullResult = await generateJSON<unknown>({
      model: getGeneratorModel(),
      messages: [{ role: "user", content: fullPrompt }],
      temperature: GAME_TEMPERATURE.CHARACTER_GENERATION,
      max_tokens: 6000,
    });

    const normalized = normalizeGeneratedCharacters(fullResult);
    let alignedCharacters = alignCharactersToProfiles(normalized.characters, baseProfiles);

    if (!alignedCharacters) {
      const repairPrompt = buildRepairFullPersonasPrompt(usedScenario, baseProfiles, normalized.raw);
      const repaired = await generateJSON<unknown>({
        model: getGeneratorModel(),
        messages: [{ role: "user", content: repairPrompt }],
        temperature: GAME_TEMPERATURE.CHARACTER_REPAIR,
        max_tokens: 6000,
      });

      const normalizedRepaired = normalizeGeneratedCharacters(repaired);
      alignedCharacters = alignCharactersToProfiles(normalizedRepaired.characters, baseProfiles);

      if (!alignedCharacters) {
        throw new Error("Character generation returned invalid schema after repair");
      }
    }

    const finalizedCharacters = alignedCharacters.map((c, index) => {
      const profile = baseProfiles[index];
      // 分配 Voice ID：按性别 + 年龄选择（缺失/非法时兜底到默认音色）
      const voiceId = resolveVoiceId(
        c.persona.voiceId,
        c.persona.gender,
        c.persona.age
      );

      const character: GeneratedCharacter = {
        displayName: profile.displayName,
        persona: {
          ...c.persona,
          voiceId,
          relationships: undefined,
        },
      };

      options?.onCharacter?.(index, character);
      return character;
    });

    await aiLogger.log({
      type: "character_generation",
      request: { 
        model: getGeneratorModel(),
        messages: [{ role: "user", content: fullPrompt }],
      },
      response: { 
        content: JSON.stringify(finalizedCharacters.map(c => c.displayName)), 
        duration: Date.now() - startTime 
      },
    });

    return finalizedCharacters;
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await runOnce();
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        continue;
      }
      console.error("Character generation failed:", error);
      await aiLogger.log({
        type: "character_generation",
        request: { 
          model: GENERATOR_MODEL,
          messages: [{ role: "user", content: "(two-stage generation)" }],
        },
        response: { content: "[]", duration: 0 },
        error: String(error),
      });
    }
  }

  throw lastError;
}
