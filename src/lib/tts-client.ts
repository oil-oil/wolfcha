import { getMinimaxApiKey, getMinimaxGroupId, getModelSource, hasMinimaxKey } from "@/lib/api-keys";
import { STEPFUN_ENGLISH_VOICE_PRESETS, STEPFUN_VOICE_PRESETS } from "@/lib/tts/stepfun-voices";
import type { TtsCredentials, TtsProviderId } from "@/lib/tts/types";
import {
  DEFAULT_VOICE_ID,
  DEFAULT_VOICE_ID_EN,
  ENGLISH_VOICE_PRESETS,
  VOICE_PRESETS,
  type AppLocale,
  type VoicePreset,
} from "@/lib/voice-constants";

/**
 * TTS Provider 的前端配置层（localStorage）。
 *
 * - `minimax`：保持旧行为——服务端 env（项目模式）或用户在旧入口填的
 *   MiniMax key（自定义模式）。
 * - 其他 Provider：用户自带的凭据，通过 `x-tts-*` 请求头透传给 `/api/tts`。
 */

export type { TtsProviderId };

export interface TtsSettings {
  provider: TtsProviderId;
  openai: { baseUrl: string; apiKey: string; model: string };
  stepfun: { baseUrl: string; apiKey: string; model: string };
  volcengine: { appId: string; accessToken: string };
  elevenlabs: { baseUrl: string; apiKey: string; model: string };
}

const STORAGE_KEY = "wolfcha_tts_settings_v1";
export const TTS_SETTINGS_CHANGE_EVENT = "wolfcha:tts-settings-change";

export const TTS_PROVIDER_LABELS: Record<TtsProviderId, { zh: string; en: string }> = {
  minimax: { zh: "MiniMax（内置）", en: "MiniMax (built-in)" },
  stepfun: { zh: "阶跃星辰 StepFun", en: "StepFun" },
  "openai-compatible": { zh: "OpenAI 兼容（OpenAI / 硅基流动 / Fish Audio…）", en: "OpenAI-compatible (OpenAI / SiliconFlow / Fish Audio…)" },
  volcengine: { zh: "火山引擎（豆包）", en: "Volcengine (Doubao)" },
  elevenlabs: { zh: "ElevenLabs", en: "ElevenLabs" },
};

const DEFAULT_SETTINGS: TtsSettings = {
  provider: "minimax",
  openai: { baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini-tts" },
  stepfun: { baseUrl: "https://api.stepfun.com/v1", apiKey: "", model: "step-tts-mini" },
  volcengine: { appId: "", accessToken: "" },
  elevenlabs: { baseUrl: "https://api.elevenlabs.io", apiKey: "", model: "eleven_multilingual_v2" },
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getTtsSettings(): TtsSettings {
  if (!canUseStorage()) return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<TtsSettings>;
    return {
      provider: isProviderId(parsed.provider) ? parsed.provider : "minimax",
      openai: { ...DEFAULT_SETTINGS.openai, ...parsed.openai },
      stepfun: { ...DEFAULT_SETTINGS.stepfun, ...parsed.stepfun },
      volcengine: { ...DEFAULT_SETTINGS.volcengine, ...parsed.volcengine },
      elevenlabs: { ...DEFAULT_SETTINGS.elevenlabs, ...parsed.elevenlabs },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveTtsSettings(settings: TtsSettings): TtsSettings {
  if (!canUseStorage()) return settings;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(TTS_SETTINGS_CHANGE_EVENT, { detail: settings.provider }));
  return settings;
}

function isProviderId(value: unknown): value is TtsProviderId {
  return (
    value === "minimax" ||
    value === "openai-compatible" ||
    value === "stepfun" ||
    value === "volcengine" ||
    value === "elevenlabs"
  );
}

/** 当前 Provider 是否已填好自备凭据（minimax 始终视为可用，走 env/旧配置）。 */
export function isCustomTtsActive(settings?: TtsSettings): boolean {
  const s = settings ?? getTtsSettings();
  if (s.provider === "minimax") return false;
  if (s.provider === "openai-compatible") return Boolean(s.openai.apiKey.trim());
  if (s.provider === "stepfun") return Boolean(s.stepfun.apiKey.trim());
  if (s.provider === "volcengine") return Boolean(s.volcengine.appId.trim() && s.volcengine.accessToken.trim());
  if (s.provider === "elevenlabs") return Boolean(s.elevenlabs.apiKey.trim());
  return false;
}

/**
 * 组装 /api/tts 请求头。minimax 保持旧协议头（兼容服务端 env 与旧 MiniMax
 * key 入口），其他 Provider 走 x-tts-* 头。
 */
export function buildTtsRequestHeaders(settings?: TtsSettings): Record<string, string> {
  const s = settings ?? getTtsSettings();
  if (s.provider === "minimax") {
    // 旧入口的 MiniMax 自带 key（api-keys 存储）。项目模式下必须走服务端
    // env（不带自定义头，服务端才会做对局授权校验），与旧行为保持一致。
    if (getModelSource() === "project" || !hasMinimaxKey()) {
      return {};
    }
    return {
      "X-Minimax-Api-Key": getMinimaxApiKey(),
      "X-Minimax-Group-Id": getMinimaxGroupId(),
    };
  }

  const headers: Record<string, string> = { "X-TTS-Provider": s.provider };
  if (s.provider === "openai-compatible") {
    headers["X-TTS-Api-Key"] = s.openai.apiKey.trim();
    if (s.openai.baseUrl.trim()) headers["X-TTS-Base-Url"] = s.openai.baseUrl.trim();
    if (s.openai.model.trim()) headers["X-TTS-Model"] = s.openai.model.trim();
  } else if (s.provider === "stepfun") {
    headers["X-TTS-Api-Key"] = s.stepfun.apiKey.trim();
    if (s.stepfun.baseUrl.trim()) headers["X-TTS-Base-Url"] = s.stepfun.baseUrl.trim();
    if (s.stepfun.model.trim()) headers["X-TTS-Model"] = s.stepfun.model.trim();
  } else if (s.provider === "volcengine") {
    headers["X-TTS-App-Id"] = s.volcengine.appId.trim();
    headers["X-TTS-Access-Token"] = s.volcengine.accessToken.trim();
  } else if (s.provider === "elevenlabs") {
    headers["X-TTS-Api-Key"] = s.elevenlabs.apiKey.trim();
    if (s.elevenlabs.baseUrl.trim()) headers["X-TTS-Base-Url"] = s.elevenlabs.baseUrl.trim();
    if (s.elevenlabs.model.trim()) headers["X-TTS-Model"] = s.elevenlabs.model.trim();
  }
  return headers;
}

export function getTtsCredentialsPreview(settings?: TtsSettings): TtsCredentials {
  const s = settings ?? getTtsSettings();
  if (s.provider === "openai-compatible") {
    return { apiKey: s.openai.apiKey, baseUrl: s.openai.baseUrl, model: s.openai.model };
  }
  if (s.provider === "stepfun") {
    return { apiKey: s.stepfun.apiKey, baseUrl: s.stepfun.baseUrl, model: s.stepfun.model };
  }
  if (s.provider === "volcengine") {
    return { appId: s.volcengine.appId, accessToken: s.volcengine.accessToken };
  }
  if (s.provider === "elevenlabs") {
    return { apiKey: s.elevenlabs.apiKey, baseUrl: s.elevenlabs.baseUrl, model: s.elevenlabs.model };
  }
  return {};
}

export interface TtsProbeResult {
  ok: boolean;
  error?: string;
}

/** 连通性测试：让 /api/tts 用当前配置合成一句短语。 */
export async function probeTtsProvider(settings?: TtsSettings): Promise<TtsProbeResult> {
  const s = settings ?? getTtsSettings();
  try {
    const { getAuthHeaders } = await import("@/lib/auth-headers");
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildTtsRequestHeaders(s),
        ...(await getAuthHeaders()),
      },
      body: JSON.stringify({ probe: true, locale: "zh" }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: data?.error || `HTTP ${response.status}` };
    }
    const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (data?.ok) return { ok: true };
    return { ok: false, error: data?.error || "验证失败" };
  } catch (error) {
    return { ok: false, error: `连接失败: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ---------------------------------------------------------------------------
// 音色预设
// ---------------------------------------------------------------------------

const OPENAI_VOICE_PRESETS: VoicePreset[] = [
  { id: "alloy", name: "Alloy", styles: ["balanced"], gender: "female" },
  { id: "ash", name: "Ash", styles: ["calm"], gender: "male" },
  { id: "ballad", name: "Ballad", styles: ["cheerful"], gender: "male" },
  { id: "coral", name: "Coral", styles: ["warm"], gender: "female" },
  { id: "echo", name: "Echo", styles: ["logic"], gender: "male" },
  { id: "fable", name: "Fable", styles: ["storytelling"], gender: "male" },
  { id: "onyx", name: "Onyx", styles: ["deep"], gender: "male" },
  { id: "nova", name: "Nova", styles: ["bright"], gender: "female" },
  { id: "sage", name: "Sage", styles: ["calm"], gender: "female" },
  { id: "shimmer", name: "Shimmer", styles: ["soft"], gender: "female" },
];

const VOLCENGINE_VOICE_PRESETS: VoicePreset[] = [
  // 音色 ID 以火山引擎控制台开通列表为准（voice_type）
  { id: "zh_female_shuangkuaisisi_mars_bigtts", name: "爽快思思", styles: ["cheerful"], gender: "female" },
  { id: "zh_female_rouqingmeimei_mars_bigtts", name: "柔软妹妹", styles: ["safe", "soft"], gender: "female" },
  { id: "zh_female_wanqudashu_mars_bigtts", name: "湾曲大叔", styles: ["calm"], gender: "male" },
  { id: "zh_male_beijingxiaoye_mars_bigtts", name: "北京小爷", styles: ["aggressive"], gender: "male" },
  { id: "zh_female_cancan_mars_bigtts", name: "灿灿", styles: ["balanced"], gender: "female" },
  { id: "zh_male_dayi_mars_bigtts", name: "大力", styles: ["logic"], gender: "male" },
];

const ELEVENLABS_VOICE_PRESETS: VoicePreset[] = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", styles: ["calm"], gender: "female" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", styles: ["soft"], gender: "female" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", styles: ["cheerful"], gender: "female" },
  { id: "LcfcDJNUP1GQjkzn1xUU", name: "Emily", styles: ["balanced"], gender: "female" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", styles: ["balanced"], gender: "male" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", styles: ["aggressive"], gender: "male" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", styles: ["intense"], gender: "male" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", styles: ["young"], gender: "male" },
];

const PROVIDER_PRESETS: Record<Exclude<TtsProviderId, "minimax">, { zh: VoicePreset[]; en: VoicePreset[] }> = {
  "openai-compatible": { zh: OPENAI_VOICE_PRESETS, en: OPENAI_VOICE_PRESETS },
  stepfun: { zh: STEPFUN_VOICE_PRESETS, en: STEPFUN_ENGLISH_VOICE_PRESETS },
  volcengine: { zh: VOLCENGINE_VOICE_PRESETS, en: VOLCENGINE_VOICE_PRESETS },
  elevenlabs: { zh: ELEVENLABS_VOICE_PRESETS, en: ELEVENLABS_VOICE_PRESETS },
};

export function getVoicePresetsForProvider(provider: TtsProviderId, locale: AppLocale): VoicePreset[] {
  if (provider === "minimax") {
    return locale === "en" ? ENGLISH_VOICE_PRESETS : VOICE_PRESETS;
  }
  return PROVIDER_PRESETS[provider][locale] ?? PROVIDER_PRESETS[provider].zh;
}

export function getDefaultVoiceForProvider(provider: TtsProviderId, locale: AppLocale): string {
  if (provider === "minimax") {
    return locale === "en" ? DEFAULT_VOICE_ID_EN.male : DEFAULT_VOICE_ID.male;
  }
  return getVoicePresetsForProvider(provider, locale)[0]?.id ?? "";
}

/**
 * 与 voice-constants 的 resolveVoiceId 语义一致，但按当前 TTS Provider
 * 的音色表解析。旧存档里残留的其他 Provider 音色 ID 会被归一化为当前
 * Provider 的合法音色，避免播放失败。
 */
export function resolveVoiceIdForActiveProvider(
  input: string | undefined,
  gender: "male" | "female" | "nonbinary" | undefined,
  age?: number,
  locale: AppLocale = "zh",
  /** 确定性种子：同一角色跨台词、跨会话保持同一音色（默认用输入 ID） */
  seed?: string,
): string {
  const settings = getTtsSettings();
  const normGender: "male" | "female" = gender === "female" ? "female" : "male";
  const presets = getVoicePresetsForProvider(settings.provider, locale);
  const fallback = getDefaultVoiceForProvider(settings.provider, locale);
  const trimmed = (input || "").trim();

  if (settings.provider === "minimax") {
    // 与旧逻辑完全一致：合法 ID 直接用，否则按性别/年龄挑预设
    if (locale === "zh" && trimmed && presets.some((p) => p.id === trimmed)) {
      return trimmed;
    }
    return pickByGenderAge(presets, normGender, age, fallback);
  }

  // 非 MiniMax：输入命中当前 Provider 音色表则使用；否则按种子稳定映射，
  // 避免旧存档的异 Provider 音色 ID 导致每句台词换声。
  if (trimmed && presets.some((p) => p.id === trimmed)) {
    return trimmed;
  }
  return pickByGenderAge(presets, normGender, age, fallback, seed ?? trimmed);
}

function pickByGenderAge(
  presets: VoicePreset[],
  gender: "male" | "female",
  age: number | undefined,
  fallback: string,
  seed?: string,
): string {
  const byGender = presets.filter((p) => p.gender === gender);
  const pool = byGender.length > 0 ? byGender : presets;
  const hasAge = typeof age === "number" && Number.isFinite(age);
  const aged = hasAge
    ? pool.filter((p) => {
        const minOk = typeof p.minAge === "number" ? age >= p.minAge : true;
        const maxOk = typeof p.maxAge === "number" ? age <= p.maxAge : true;
        return minOk && maxOk;
      })
    : [];
  const finalPool = aged.length > 0 ? aged : pool;

  if (seed) {
    // FNV-1a 哈希做确定性选择
    let hash = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    const index = Math.abs(hash) % finalPool.length;
    return finalPool[index]?.id ?? fallback;
  }
  return finalPool[Math.floor(Math.random() * finalPool.length)]?.id ?? fallback;
}

