import { generateJSON, generateCompletionStream, stripMarkdownCodeFences } from "./llm";
import { LLMJSONParser } from "ai-json-fixer";
import {
  ALL_MODELS,
  GENERATOR_MODEL,
  PLAYER_MODELS,
  filterPlayerModels,
  type GameScenario,
  type ModelRef,
  type Persona,
} from "@/types/game";
import { getGeneratorModel, getSelectedModels, hasDashscopeKey, hasZenmuxKey, isCustomKeyEnabled } from "@/lib/api-keys";
import { aiLogger } from "./ai-logger";
import { AI_TEMPERATURE, GAME_TEMPERATURE } from "./ai-config";
import { getRandomScenario } from "./scenarios";
import { resolveVoiceId, VOICE_PRESETS, type AppLocale } from "./voice-constants";
import { getI18n } from "@/i18n/translator";

export interface GeneratedCharacter {
  displayName: string;
  persona: Persona;
  avatarSeed?: string;
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
    PLAYER_MODELS.length > 0
      ? PLAYER_MODELS
      : [{ provider: "zenmux" as const, model: GENERATOR_MODEL }];

  const pool = (() => {
    if (!isCustomKeyEnabled()) return defaultPool;

    // When custom key is enabled, use ALL_MODELS as the full available pool
    const fullPool = ALL_MODELS.length > 0 ? ALL_MODELS : defaultPool;

    const allowedProviders = new Set<ModelRef["provider"]>();
    if (hasZenmuxKey()) allowedProviders.add("zenmux");
    if (hasDashscopeKey()) allowedProviders.add("dashscope");
    if (allowedProviders.size === 0) return defaultPool;

    // Filter by allowed providers, then exclude non-player models
    const allowedPool = filterPlayerModels(
      fullPool.filter((ref) => allowedProviders.has(ref.provider))
    );
    if (allowedPool.length === 0) return defaultPool;

    // Filter by user's selected models - STRICTLY respect user selection
    const selectedModels = getSelectedModels();
    if (selectedModels.length === 0) return allowedPool;
    
    // Only use models the user explicitly selected
    const selectedPool = allowedPool.filter((ref) => selectedModels.includes(ref.model));
    
    // If user selected models but none are in allowedPool, try to find them in fullPool
    // This handles cases where user selected models from a different provider
    if (selectedPool.length === 0) {
      const fullSelectedPool = filterPlayerModels(
        fullPool.filter((ref) => selectedModels.includes(ref.model) && allowedProviders.has(ref.provider))
      );
      if (fullSelectedPool.length > 0) return fullSelectedPool;
      
      // Last resort: only return models that user actually selected, even if empty
      // This prevents using models the user didn't choose
      console.warn("[sampleModelRefs] User selected models not found in allowed pool:", selectedModels);
    }
    
    // Return only user-selected models, never fall back to all models
    return selectedPool.length > 0 ? selectedPool : allowedPool.slice(0, 1);
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
  const { t } = getI18n();
  const list = requirements.map((r) => `- ${r.model} x${r.count}`).join("\n");
  return t("characterGenerator.nicknamePrompt", { list });
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
  const { t } = getI18n();
  return t("characterGenerator.baseProfilesPrompt", {
    count,
    title: scenario.title,
    description: scenario.description,
    rolesHint: scenario.rolesHint,
  });
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
  const { t } = getI18n();
  const roster = allProfiles
    .map((p, i) =>
      t("characterGenerator.rosterLine", {
        index: i + 1,
        name: p.displayName,
        gender: p.gender,
        age: p.age,
        basicInfo: p.basicInfo,
      })
    )
    .join("\n");

  const schema = allProfiles
    .map((p) => `  { "displayName": "${p.displayName}", "persona": { "styleLabel": string, "voiceRules": string[], "mbti": "${p.mbti}", "gender": "${p.gender}", "age": ${p.age} } }`)
    .join(",\n");

  return t("characterGenerator.fullPersonasPrompt", {
    title: scenario.title,
    description: scenario.description,
    roster,
    count: allProfiles.length,
    schema,
  });
};

const buildRepairBaseProfilesPrompt = (count: number, scenario: GameScenario, raw: unknown) => {
  const { t } = getI18n();
  const rawStr = (() => {
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  })();

  return t("characterGenerator.repairBaseProfilesPrompt", {
    count,
    title: scenario.title,
    description: scenario.description,
    raw: rawStr,
  });
};

const buildRepairFullPersonasPrompt = (scenario: GameScenario, allProfiles: BaseProfile[], raw: unknown) => {
  const { t } = getI18n();
  const rawStr = (() => {
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  })();

  const roster = allProfiles
    .map((p, i) =>
      t("characterGenerator.rosterLineSimple", {
        index: i + 1,
        name: p.displayName,
        gender: p.gender,
        basicInfo: p.basicInfo,
      })
    )
    .join("\n");

  const schema = allProfiles
    .map((p) => `  { "displayName": "${p.displayName}", "persona": { "styleLabel": string, "voiceRules": string[], "mbti": "${p.mbti}", "gender": "${p.gender}", "age": ${p.age} } }`)
    .join(",\n");

  return t("characterGenerator.repairFullPersonasPrompt", {
    title: scenario.title,
    description: scenario.description,
    roster,
    raw: rawStr,
    count: allProfiles.length,
    schema,
  });
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
    
    // 使用流式生成，每解析出一个角色就立即调用回调
    const finalizedCharacters: GeneratedCharacter[] = [];
    const emittedIndices = new Set<number>();
    let accumulatedContent = "";
    const parser = new LLMJSONParser();
    
    const stream = generateCompletionStream({
      model: getGeneratorModel(),
      messages: [{ role: "user", content: fullPrompt }],
      temperature: GAME_TEMPERATURE.CHARACTER_GENERATION,
      max_tokens: 6000,
    });

    for await (const chunk of stream) {
      accumulatedContent += chunk;
      
      // 使用正则提取完整的角色对象
      // 匹配 {"displayName": "...", "persona": {...}} 结构
      const cleaned = stripMarkdownCodeFences(accumulatedContent);
      
      // 找到所有可能完整的角色对象
      // 通过匹配 displayName 后跟 persona 对象的闭合 } 来识别完整角色
      const characterPattern = /\{\s*"displayName"\s*:\s*"[^"]+"\s*,\s*"persona"\s*:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\s*\}/g;
      const matches = cleaned.match(characterPattern);
      
      if (matches) {
        for (const match of matches) {
          try {
            const c = JSON.parse(match) as GeneratedCharacter;
            if (!c.displayName || !c.persona) continue;
            
            // 找到对应的 profile index
            const profileIndex = baseProfiles.findIndex(p => 
              p.displayName === c.displayName && !emittedIndices.has(baseProfiles.indexOf(p))
            );
            
            if (profileIndex === -1) continue;
            
            const profile = baseProfiles[profileIndex];
            
            // 验证 persona 是否有效
            if (isValidPersonaForProfile(c.persona, profile)) {
              emittedIndices.add(profileIndex);
              
              const voiceId = resolveVoiceId(
                c.persona.voiceId,
                c.persona.gender,
                c.persona.age,
                "zh" as AppLocale
              );

              const character: GeneratedCharacter = {
                displayName: profile.displayName,
                persona: {
                  ...c.persona,
                  voiceId,
                  relationships: undefined,
                },
              };

              finalizedCharacters[profileIndex] = character;
              options?.onCharacter?.(profileIndex, character);
              console.log(`[character-gen] emitted character ${profileIndex}: ${character.displayName}`);
            }
          } catch {
            // 解析失败是正常的
          }
        }
      }
    }

    // 流式结束后，检查是否所有角色都已生成
    if (finalizedCharacters.filter(Boolean).length < baseProfiles.length) {
      // 回退到完整解析
      const cleaned = stripMarkdownCodeFences(accumulatedContent);
      let fullResult: unknown;
      try {
        fullResult = JSON.parse(cleaned);
      } catch {
        fullResult = parser.parse(cleaned);
      }
      
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

      // 补充未生成的角色
      for (let i = 0; i < alignedCharacters.length; i++) {
        if (finalizedCharacters[i]) continue;
        
        const c = alignedCharacters[i];
        const profile = baseProfiles[i];
        const voiceId = resolveVoiceId(
          c.persona.voiceId,
          c.persona.gender,
          c.persona.age,
          "zh" as AppLocale
        );

        const character: GeneratedCharacter = {
          displayName: profile.displayName,
          persona: {
            ...c.persona,
            voiceId,
            relationships: undefined,
          },
        };

        finalizedCharacters[i] = character;
        options?.onCharacter?.(i, character);
      }
    }

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
