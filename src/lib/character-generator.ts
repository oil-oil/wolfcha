import { generateJSON } from "./openrouter";
import { GENERATOR_MODEL, type GameScenario, type Persona } from "@/types/game";
import { aiLogger } from "./ai-logger";
import { GAME_TEMPERATURE } from "./ai-config";
import { getRandomScenario } from "./scenarios";
import { resolveVoiceId } from "./voice-constants";

export interface GeneratedCharacter {
  displayName: string;
  persona: Persona;
}

export interface GeneratedCharacters {
  characters: GeneratedCharacter[];
}

export type Gender = "male" | "female" | "nonbinary";

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
  if (p.riskBias !== "safe" && p.riskBias !== "balanced" && p.riskBias !== "aggressive") return false;
  if (!isValidMbti(p.mbti)) return false;
  if (!isValidGender(p.gender)) return false;
  if (typeof p.age !== "number" || !Number.isFinite(p.age) || p.age < 16 || p.age > 70) return false;
  if (typeof p.backgroundStory !== "string" || !p.backgroundStory.trim()) return false;
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
    .map((p) => `  { "displayName": "${p.displayName}", "persona": { "styleLabel": string, "voiceRules": string[], "riskBias": "safe"|"balanced"|"aggressive", "mbti": "${p.mbti}", "gender": "${p.gender}", "age": ${p.age}, "backgroundStory": string } }`)
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
- voiceRules 需体现具体说话特征
- backgroundStory 是简单职业描述，10-20字，如"暴躁的卡车司机"、"刚睡醒的宅男"
- styleLabel 用简短标签概括性格或表达方式
- riskBias 根据性格选择（safe/balanced/aggressive）

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
    .map((p) => `  { "displayName": "${p.displayName}", "persona": { "styleLabel": string, "voiceRules": string[], "riskBias": "safe" | "balanced" | "aggressive", "mbti": "${p.mbti}", "gender": "${p.gender}", "age": ${p.age}, "backgroundStory": string } }`)
    .join(",\n");

  return `你是一个严格的 JSON 修复器。

【目标】
把输入修复成严格 JSON 对象，结构为 { "characters": [...] }，并确保 characters 恰好 ${allProfiles.length} 个。

【必须严格满足】
1. characters 顺序必须与基础档案一致
2. persona.gender/age/mbti 必须与对应档案一致
3. backgroundStory 必须是 1 句话
4. styleLabel 和 voiceRules 保持原样或合理修复，不要替换成固定模板

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
  const startTime = Date.now();

  try {
    const basePrompt = buildBaseProfilesPrompt(count, usedScenario);

    const baseResult = await generateJSON<unknown>({
      model: GENERATOR_MODEL,
      messages: [{ role: "user", content: basePrompt }],
      temperature: GAME_TEMPERATURE.CHARACTER_GENERATION,
      max_tokens: 1200,
    });

    const normalizedBase = normalizeBaseProfiles(baseResult);
    let baseProfiles = normalizedBase.profiles;

    if (!isValidBaseProfiles(baseProfiles, count)) {
      const baseRepairPrompt = buildRepairBaseProfilesPrompt(count, usedScenario, normalizedBase.raw);
      const baseRepaired = await generateJSON<unknown>({
        model: GENERATOR_MODEL,
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
      model: GENERATOR_MODEL,
      messages: [{ role: "user", content: fullPrompt }],
      temperature: GAME_TEMPERATURE.CHARACTER_GENERATION,
      max_tokens: 6000,
    });

    const normalized = normalizeGeneratedCharacters(fullResult);
    let alignedCharacters = alignCharactersToProfiles(normalized.characters, baseProfiles);

    if (!alignedCharacters) {
      const repairPrompt = buildRepairFullPersonasPrompt(usedScenario, baseProfiles, normalized.raw);
      const repaired = await generateJSON<unknown>({
        model: GENERATOR_MODEL,
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
          backgroundStory: profile.basicInfo,
          relationships: undefined,
        },
      };

      options?.onCharacter?.(index, character);
      return character;
    });

    await aiLogger.log({
      type: "character_generation",
      request: { 
        model: GENERATOR_MODEL,
        messages: [{ role: "user", content: fullPrompt }],
      },
      response: { 
        content: JSON.stringify(finalizedCharacters.map(c => c.displayName)), 
        duration: Date.now() - startTime 
      },
    });

    return finalizedCharacters;
  } catch (error) {
    console.error("Character generation failed:", error);

    await aiLogger.log({
      type: "character_generation",
      request: { 
        model: GENERATOR_MODEL,
        messages: [{ role: "user", content: "(two-stage generation)" }],
      },
      response: { 
        content: "[]", 
        duration: Date.now() - startTime 
      },
      error: String(error),
    });

    throw error;
  }
}
