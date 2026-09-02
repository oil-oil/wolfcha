import {
  generateJSON,
  generateCompletionStream,
  stripMarkdownCodeFences,
  type ResponseFormat,
} from "./llm";
import {
  ALL_MODELS,
  GENERATOR_MODEL,
  PLAYER_MODELS,
  PROJECT_MODELS,
  filterPlayerModels,
  type GameScenario,
  type ModelRef,
  type Persona,
  type PlayerMind,
} from "@/types/game";
import {
  getGeneratorModel,
  getSelectedModels,
  hasDashscopeKey,
  hasTokendanceKey,
  hasZenmuxKey,
  isCustomKeyEnabled,
} from "@/lib/api-keys";
import { aiLogger } from "./ai-logger";
import { GAME_TEMPERATURE } from "./ai-config";
import { getRandomScenario } from "./scenarios";
import { resolveVoiceId, VOICE_PRESETS, type AppLocale } from "./voice-constants";
import { getI18n } from "@/i18n/translator";
import { parseLLMJson } from "./llm-json";

export interface GeneratedCharacter {
  displayName: string;
  persona: Persona;
  playerMind?: PlayerMind;
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

const CHARACTER_GENERATOR_REASONING = { enabled: false } as const;
const CHARACTER_PERSONA_BATCH_SIZE = 3;
const CHARACTER_PERSONA_BATCH_MAX_TOKENS = 4200;

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getModelRefForModel(model: string): ModelRef {
  return (
    PROJECT_MODELS.find((ref) => ref.model === model) ??
    ALL_MODELS.find((ref) => ref.model === model) ??
    { provider: "zenmux" as const, model }
  );
}

export const sampleModelRefs = (count: number): ModelRef[] => {
  // Default pool when custom key is not enabled
  const defaultPool =
    PLAYER_MODELS.length > 0
      ? PLAYER_MODELS
      : [getModelRefForModel(GENERATOR_MODEL)];

  const pool = (() => {
    if (!isCustomKeyEnabled()) return defaultPool;

    // When custom key is enabled, use ALL_MODELS as the full available pool
    const fullPool = ALL_MODELS.length > 0 ? ALL_MODELS : defaultPool;

    const allowedProviders = new Set<ModelRef["provider"]>();
    if (hasZenmuxKey()) allowedProviders.add("zenmux");
    if (hasDashscopeKey()) allowedProviders.add("dashscope");
    if (hasTokendanceKey()) allowedProviders.add("tokendance");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

const isValidMbti = (v: unknown): v is string => typeof v === "string" && /^[A-Z]{4}$/.test(v.trim());

export interface BaseProfile {
  displayName: string;
  gender: Gender;
  age: number;
  mbti: string;
  basicInfo: string;
}

const normalizeBaseProfiles = (result: unknown): { profiles: BaseProfile[]; raw: unknown } => {
  if (isRecord(result) && Array.isArray(result.profiles)) {
    return { profiles: result.profiles as BaseProfile[], raw: result };
  }
  return { profiles: [], raw: result };
};

const isValidGender = (g: unknown): g is Gender => g === "male" || g === "female" || g === "nonbinary";

const isValidBaseProfiles = (profiles: unknown, count: number): profiles is BaseProfile[] => {
  if (!Array.isArray(profiles) || profiles.length !== count) return false;
  const ok = profiles.every((p) => {
    if (!isRecord(p)) return false;
    if (typeof p.displayName !== "string" || !p.displayName.trim()) return false;
    if (!isValidGender(p.gender)) return false;
    if (typeof p.age !== "number" || !Number.isFinite(p.age) || p.age < 16 || p.age > 70) return false;
    if (!isValidMbti(p.mbti)) return false;
    if (typeof p.basicInfo !== "string" || !p.basicInfo.trim()) return false;
    return true;
  });

  if (!ok) return false;
  const names = profiles.map((p) => String(p.displayName).trim()).filter(Boolean);
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

const buildCharacterSchemaLine = (p: BaseProfile): string => (
  `  { "displayName": "${p.displayName}", "persona": { "voiceRules": string[], "werewolfExperience": string, "vocabularyStyle": string, "reasoningStyle": string, "speechLengthHabit": string, "pressureStyle": string, "uncertaintyStyle": string, "mistakePattern": string, "wolfDeceptionStyle": string }, "playerMind": { "courage": string, "memoryBias": string, "suspicionThreshold": string, "selfProtection": string, "logicDepth": string, "tablePresence": string } }`
);

const normalizeGeneratedCharacters = (
  result: unknown
): { characters: GeneratedCharacter[]; raw: unknown } => {
  if (isRecord(result) && Array.isArray(result.characters)) {
    return { characters: result.characters as GeneratedCharacter[], raw: result };
  }
  return { characters: [], raw: result };
};

const PLAYER_MIND_REQUIRED_FIELDS: Array<keyof PlayerMind> = [
  "courage",
  "memoryBias",
  "suspicionThreshold",
  "selfProtection",
  "logicDepth",
  "tablePresence",
];

const PERSONA_TEXT_FIELDS = [
  "werewolfExperience",
  "vocabularyStyle",
  "reasoningStyle",
  "speechLengthHabit",
  "pressureStyle",
  "uncertaintyStyle",
  "mistakePattern",
  "wolfDeceptionStyle",
 ] as const satisfies ReadonlyArray<
  "werewolfExperience" |
  "vocabularyStyle" |
  "reasoningStyle" |
  "speechLengthHabit" |
  "pressureStyle" |
  "uncertaintyStyle" |
  "mistakePattern" |
  "wolfDeceptionStyle"
>;

const isValidPlayerMind = (mind: unknown): mind is PlayerMind => {
  if (!isRecord(mind)) return false;
  return PLAYER_MIND_REQUIRED_FIELDS.every((key) => (
    typeof mind[key] === "string" && mind[key].trim().length > 0
  ));
};

function parsePlayerMind(mind: unknown): PlayerMind | null {
  if (!isValidPlayerMind(mind)) return null;
  return {
    courage: mind.courage.trim(),
    memoryBias: mind.memoryBias.trim(),
    suspicionThreshold: mind.suspicionThreshold.trim(),
    selfProtection: mind.selfProtection.trim(),
    logicDepth: mind.logicDepth.trim(),
    tablePresence: mind.tablePresence.trim(),
  };
}

function parsePersonaForProfile(persona: unknown, profile: BaseProfile): Persona | null {
  if (!isRecord(persona)) return null;
  if (
    !Array.isArray(persona.voiceRules) ||
    persona.voiceRules.length === 0 ||
    persona.voiceRules.some((rule) => typeof rule !== "string" || !rule.trim()) ||
    PERSONA_TEXT_FIELDS.some((field) => (
      typeof persona[field] !== "string" || !persona[field].trim()
    ))
  ) {
    return null;
  }

  const normalized: Persona = {
    voiceRules: persona.voiceRules.map((rule) => rule.trim()),
    mbti: profile.mbti,
    gender: profile.gender,
    age: profile.age,
    basicInfo: profile.basicInfo,
  };

  for (const field of PERSONA_TEXT_FIELDS) {
    normalized[field] = (persona[field] as string).trim();
  }
  return normalized;
}

const isValidPersonaForProfile = (persona: unknown, profile: BaseProfile): persona is Persona => (
  isRecord(persona) &&
  Array.isArray(persona.voiceRules) &&
  persona.voiceRules.length > 0 &&
  PERSONA_TEXT_FIELDS.every((field) => (
    typeof persona[field] === "string" && persona[field].trim().length > 0
  )) &&
  persona.gender === profile.gender &&
  persona.age === profile.age &&
  persona.mbti === profile.mbti
);

function normalizeGeneratedCharacterForProfile(char: unknown, profile: BaseProfile): GeneratedCharacter | null {
  if (!isRecord(char)) return null;
  const rawName = typeof char.displayName === "string" ? char.displayName.trim() : "";
  if (!rawName) return null;
  const persona = parsePersonaForProfile(char.persona, profile);
  const playerMind = parsePlayerMind(char.playerMind);
  if (!persona || !playerMind) return null;

  return {
    displayName: rawName,
    persona,
    playerMind,
  };
}

const alignCharactersToProfiles = (
  chars: unknown,
  profiles: BaseProfile[]
): GeneratedCharacter[] | null => {
  if (!Array.isArray(chars)) {
    console.error("[alignCharacters] chars is not an array:", chars);
    return null;
  }
  if (chars.length !== profiles.length) {
    console.error(`[alignCharacters] length mismatch: ${chars.length} chars vs ${profiles.length} profiles`);
    return null;
  }
  const byName = new Map<string, GeneratedCharacter>();
  for (const c of chars as GeneratedCharacter[]) {
    if (!c || typeof c !== "object") {
      console.error("[alignCharacters] invalid character object:", c);
      return null;
    }
    const name = typeof c.displayName === "string" ? c.displayName.trim() : "";
    if (!name) {
      console.error("[alignCharacters] missing displayName:", c);
      return null;
    }
    if (byName.has(name)) {
      console.error("[alignCharacters] duplicate name:", name);
      return null;
    }
    byName.set(name, c);
  }
  const ordered: GeneratedCharacter[] = [];
  for (const profile of profiles) {
    const key = profile.displayName.trim();
    const rawCharacter = byName.get(key);
    if (!rawCharacter) {
      console.error(`[alignCharacters] character not found for profile: ${key}, available names:`, Array.from(byName.keys()));
      return null;
    }
    const c = normalizeGeneratedCharacterForProfile(rawCharacter, profile);
    if (!c || !isValidPersonaForProfile(c.persona, profile) || !isValidPlayerMind(c.playerMind)) {
      const p = isRecord(rawCharacter) ? rawCharacter.persona : undefined;
      console.error(`[alignCharacters] invalid persona for ${key}:`, {
        rawCharacter,
        normalizedCharacter: c,
        profile: { gender: profile.gender, age: profile.age, mbti: profile.mbti },
        isValid: c ? isValidPersonaForProfile(c.persona, profile) : false,
        isValidPlayerMind: c ? isValidPlayerMind(c.playerMind) : false,
        genderMatch: p?.gender === profile.gender,
        ageMatch: p?.age === profile.age,
        mbtiMatch: isRecord(p) ? String(p.mbti || "").trim() === profile.mbti : false,
      });
      return null;
    }
    ordered.push(c);
  }
  return ordered;
};

const buildFullPersonasPrompt = (
  scenario: GameScenario,
  allProfiles: BaseProfile[],
  outputProfiles: BaseProfile[] = allProfiles,
) => {
  const { t, locale } = getI18n();
  const outputNames = new Set(outputProfiles.map((profile) => profile.displayName));
  const roster = allProfiles
    .map((p, i) =>
      `${t("characterGenerator.rosterLine", {
          index: i + 1,
          name: p.displayName,
          gender: p.gender,
          age: p.age,
          basicInfo: p.basicInfo,
        })} ${outputNames.has(p.displayName)
          ? locale === "zh" ? "[本批输出]" : "[OUTPUT IN THIS BATCH]"
          : locale === "zh" ? "[仅作全局去重参考]" : "[CONTEXT ONLY FOR GLOBAL DIVERSITY]"}`
    )
    .join("\n");

  const schema = outputProfiles.map(buildCharacterSchemaLine).join(",\n");

  return t("characterGenerator.fullPersonasPrompt", {
    title: scenario.title,
    description: scenario.description,
    roster,
    count: outputProfiles.length,
    schema,
  });
};

const nonEmptyStringSchema = { type: "string", minLength: 1 } as const;

function buildBaseProfilesResponseFormat(count: number): ResponseFormat {
  return {
    type: "json_schema",
    json_schema: {
      name: "base_profiles",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["profiles"],
        properties: {
          profiles: {
            type: "array",
            minItems: count,
            maxItems: count,
            uniqueItems: true,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["displayName", "gender", "age", "mbti", "basicInfo"],
              properties: {
                displayName: nonEmptyStringSchema,
                gender: { type: "string", enum: ["male", "female"] },
                age: { type: "integer", minimum: 20, maximum: 55 },
                mbti: { type: "string", pattern: "^[A-Z]{4}$" },
                basicInfo: nonEmptyStringSchema,
              },
            },
          },
        },
      },
    },
  };
}

function buildPersonaBatchResponseFormat(profiles: BaseProfile[]): ResponseFormat {
  const personaTextProperties = Object.fromEntries(
    PERSONA_TEXT_FIELDS.map((field) => [field, nonEmptyStringSchema]),
  );
  const playerMindProperties = Object.fromEntries(
    PLAYER_MIND_REQUIRED_FIELDS.map((field) => [field, nonEmptyStringSchema]),
  );

  return {
    type: "json_schema",
    json_schema: {
      name: "character_batch",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["characters"],
        properties: {
          characters: {
            type: "array",
            minItems: profiles.length,
            maxItems: profiles.length,
            uniqueItems: true,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["displayName", "persona", "playerMind"],
              properties: {
                displayName: {
                  type: "string",
                  enum: profiles.map((profile) => profile.displayName),
                },
                persona: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "voiceRules",
                    ...PERSONA_TEXT_FIELDS,
                  ],
                  properties: {
                    voiceRules: {
                      type: "array",
                      minItems: 1,
                      items: nonEmptyStringSchema,
                    },
                    ...personaTextProperties,
                  },
                },
                playerMind: {
                  type: "object",
                  additionalProperties: false,
                  required: PLAYER_MIND_REQUIRED_FIELDS,
                  properties: playerMindProperties,
                },
              },
            },
          },
        },
      },
    },
  };
}

export async function generateCharacters(
  count: number,
  scenario?: GameScenario,
  options?: {
    onBaseProfiles?: (profiles: BaseProfile[]) => void;
    onCharacter?: (index: number, character: GeneratedCharacter) => void;
  }
): Promise<GeneratedCharacter[]> {
  const usedScenario = scenario ?? getRandomScenario();
  const basePrompt = buildBaseProfilesPrompt(count, usedScenario);
  const baseResult = await generateJSON<unknown>({
    model: getGeneratorModel(),
    messages: [{ role: "user", content: basePrompt }],
    temperature: GAME_TEMPERATURE.CHARACTER_GENERATION,
    max_tokens: Math.max(2400, count * 350 + 600),
    reasoning: CHARACTER_GENERATOR_REASONING,
    response_format: buildBaseProfilesResponseFormat(count),
  });
  const baseProfiles = normalizeBaseProfiles(baseResult).profiles;
  if (!isValidBaseProfiles(baseProfiles, count)) {
    throw new Error("Base profile generation returned invalid schema");
  }
  options?.onBaseProfiles?.(baseProfiles);

  const finalizedCharacters: GeneratedCharacter[] = [];
  const emitCharacter = (index: number, character: GeneratedCharacter) => {
    finalizedCharacters[index] = character;
    options?.onCharacter?.(index, character);
    console.log(`[character-gen] emitted character ${index}: ${character.displayName}`);
  };

  const generatePersonaBatch = async (
    batchProfiles: BaseProfile[],
    batchStartIndex: number,
  ): Promise<GeneratedCharacter[]> => {
    const batchStartedAt = Date.now();
    const batchModel = getGeneratorModel();
    const fullPrompt = buildFullPersonasPrompt(
      usedScenario,
      baseProfiles,
      batchProfiles,
    );
    const batchCharacters: GeneratedCharacter[] = [];
    const emittedLocalIndices = new Set<number>();
    let accumulatedContent = "";

    try {
      // 三人一批并行生成，避免九人长输出达到 token 上限；每批只调用一次。
      const stream = generateCompletionStream({
        model: batchModel,
        messages: [{ role: "user", content: fullPrompt }],
        temperature: GAME_TEMPERATURE.CHARACTER_PERSONA,
        max_tokens: CHARACTER_PERSONA_BATCH_MAX_TOKENS,
        reasoning: CHARACTER_GENERATOR_REASONING,
        response_format: buildPersonaBatchResponseFormat(batchProfiles),
      });

      for await (const chunk of stream) {
        accumulatedContent += chunk;
        const cleaned = stripMarkdownCodeFences(accumulatedContent);
        const characterPattern = /\{\s*"displayName"\s*:\s*"[^"]+"\s*,\s*"persona"\s*:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\s*,\s*"playerMind"\s*:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\s*\}/g;
        const matches = cleaned.match(characterPattern);

        for (const match of matches ?? []) {
          const rawCharacter = parseLLMJson<GeneratedCharacter>(match);
          if (!rawCharacter?.displayName) continue;
          const localIndex = batchProfiles.findIndex(
            (profile, index) =>
              profile.displayName === rawCharacter.displayName &&
              !emittedLocalIndices.has(index),
          );
          if (localIndex === -1) continue;

          const profile = batchProfiles[localIndex];
          const normalized = normalizeGeneratedCharacterForProfile(rawCharacter, profile);
          if (
            !normalized ||
            !isValidPersonaForProfile(normalized.persona, profile) ||
            !isValidPlayerMind(normalized.playerMind)
          ) {
            continue;
          }

          const voiceId = resolveVoiceId(
            normalized.persona.voiceId,
            normalized.persona.gender,
            normalized.persona.age,
            "zh" as AppLocale,
          );
          const character: GeneratedCharacter = {
            displayName: profile.displayName,
            persona: {
              ...normalized.persona,
              basicInfo: profile.basicInfo,
              voiceId,
              relationships: undefined,
            },
            playerMind: normalized.playerMind,
          };
          emittedLocalIndices.add(localIndex);
          batchCharacters[localIndex] = character;
          emitCharacter(batchStartIndex + localIndex, character);
        }
      }

      if (batchCharacters.filter(Boolean).length < batchProfiles.length) {
        const fullResult = parseLLMJson<unknown>(stripMarkdownCodeFences(accumulatedContent));
        if (!fullResult) {
          throw new Error(`Character batch ${batchStartIndex} returned invalid JSON`);
        }
        const normalized = normalizeGeneratedCharacters(fullResult);
        const aligned = alignCharactersToProfiles(normalized.characters, batchProfiles);
        if (!aligned) {
          throw new Error(`Character batch ${batchStartIndex} returned invalid schema`);
        }

        aligned.forEach((character, localIndex) => {
          if (batchCharacters[localIndex]) return;
          const profile = batchProfiles[localIndex];
          const voiceId = resolveVoiceId(
            character.persona.voiceId,
            character.persona.gender,
            character.persona.age,
            "zh" as AppLocale,
          );
          const completed: GeneratedCharacter = {
            displayName: profile.displayName,
            persona: {
              ...character.persona,
              basicInfo: profile.basicInfo,
              voiceId,
              relationships: undefined,
            },
            playerMind: character.playerMind,
          };
          batchCharacters[localIndex] = completed;
          emitCharacter(batchStartIndex + localIndex, completed);
        });
      }

      await aiLogger.log({
        type: "character_generation",
        request: {
          model: batchModel,
          messages: [{ role: "user", content: fullPrompt }],
        },
        response: {
          content: JSON.stringify(batchCharacters.map((c) => ({
            displayName: c.displayName,
            hiddenCommunicationProfile: {
              werewolfExperience: c.persona.werewolfExperience,
              vocabularyStyle: c.persona.vocabularyStyle,
              reasoningStyle: c.persona.reasoningStyle,
              speechLengthHabit: c.persona.speechLengthHabit,
              pressureStyle: c.persona.pressureStyle,
              uncertaintyStyle: c.persona.uncertaintyStyle,
              mistakePattern: c.persona.mistakePattern,
              wolfDeceptionStyle: c.persona.wolfDeceptionStyle,
            },
            playerMind: c.playerMind,
          }))),
          duration: Date.now() - batchStartedAt,
          rawResponse: JSON.stringify({ batchStartIndex }),
        },
      });
      return batchCharacters;
    } catch (error) {
      await aiLogger.log({
        type: "character_generation",
        request: {
          model: batchModel,
          messages: [{ role: "user", content: fullPrompt }],
        },
        response: {
          content: accumulatedContent,
          duration: Date.now() - batchStartedAt,
          raw: accumulatedContent,
          rawResponse: JSON.stringify({ batchStartIndex }),
        },
        error: String(error),
      });
      throw error;
    }
  };

  const batchTasks: Promise<GeneratedCharacter[]>[] = [];
  for (let start = 0; start < baseProfiles.length; start += CHARACTER_PERSONA_BATCH_SIZE) {
    batchTasks.push(
      generatePersonaBatch(
        baseProfiles.slice(start, start + CHARACTER_PERSONA_BATCH_SIZE),
        start,
      ),
    );
  }
  const batchResults = await Promise.allSettled(batchTasks);
  const failedBatch = batchResults.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failedBatch) throw failedBatch.reason;
  if (finalizedCharacters.filter(Boolean).length !== baseProfiles.length) {
    throw new Error("Character generation returned incomplete batches");
  }
  return finalizedCharacters;
}
