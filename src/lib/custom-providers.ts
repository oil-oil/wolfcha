import type { ModelRef } from "@/types/game";

/**
 * 自定义 OpenAI 兼容 LLM Provider（用户自带 key + base URL）。
 *
 * 与内置的 zenmux/dashscope/tokendance 三家不同，自定义 Provider 不依赖
 * 服务器环境变量：配置存放在浏览器 localStorage，请求时通过
 * `X-Custom-Base-Url` / `X-Custom-Api-Key` 头透传给 `/api/chat` 代理转发。
 * 所有主流厂商（DeepSeek、Kimi、智谱、MiniMax、xAI、Gemini、Claude、
 * OpenRouter、硅基流动等）都提供 OpenAI 兼容端点，共用一条转发通道。
 */

export interface CustomLlmProvider {
  id: string;
  name: string;
  /** OpenAI 兼容 API 根地址，例如 https://api.deepseek.com/v1 */
  baseUrl: string;
  apiKey: string;
  /** 通过 /models 拉取并缓存的可用模型 ID 列表 */
  modelIds: string[];
}

export interface LlmProviderPreset {
  key: string;
  name: string;
  baseUrl: string;
  /** 预设可能依赖厂商侧的兼容层，UI 上提示用户先测连通 */
  note?: "compat";
}

export const LLM_PROVIDER_PRESETS: LlmProviderPreset[] = [
  { key: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  { key: "moonshot", name: "Kimi (Moonshot)", baseUrl: "https://api.moonshot.cn/v1" },
  { key: "zhipu", name: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  { key: "minimax", name: "MiniMax", baseUrl: "https://api.minimaxi.com/v1" },
  { key: "stepfun", name: "阶跃星辰 StepFun", baseUrl: "https://api.stepfun.com/v1" },
  { key: "xai", name: "Grok (xAI)", baseUrl: "https://api.x.ai/v1" },
  { key: "gemini", name: "Gemini (OpenAI 兼容层)", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", note: "compat" },
  { key: "anthropic", name: "Claude (OpenAI 兼容层)", baseUrl: "https://api.anthropic.com/v1", note: "compat" },
  { key: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { key: "siliconflow", name: "硅基流动 SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1" },
  { key: "custom", name: "自定义", baseUrl: "" },
];

const PROVIDERS_STORAGE = "wolfcha_custom_llm_providers";
const ACTIVE_PROVIDER_STORAGE = "wolfcha_custom_llm_active";

export const CUSTOM_PROVIDER_BASE_URL_HEADER = "X-Custom-Base-Url";
export const CUSTOM_PROVIDER_API_KEY_HEADER = "X-Custom-Api-Key";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readProviders(): CustomLlmProvider[] {
  if (!canUseStorage()) return [];
  const raw = window.localStorage.getItem(PROVIDERS_STORAGE);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null)
      .map((item) => ({
        id: String(item.id ?? ""),
        name: String(item.name ?? "").trim() || "Custom Provider",
        baseUrl: String(item.baseUrl ?? "").trim(),
        apiKey: String(item.apiKey ?? "").trim(),
        modelIds: Array.isArray(item.modelIds)
          ? item.modelIds.map((m) => String(m ?? "").trim()).filter(Boolean).slice(0, 500)
          : [],
      }))
      .filter((p) => p.id && p.baseUrl);
  } catch {
    return [];
  }
}

function writeProviders(providers: CustomLlmProvider[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(PROVIDERS_STORAGE, JSON.stringify(providers));
}

export function listCustomLlmProviders(): CustomLlmProvider[] {
  return readProviders();
}

export function getCustomLlmProvider(id: string): CustomLlmProvider | null {
  return readProviders().find((p) => p.id === id) ?? null;
}

export function saveCustomLlmProvider(provider: CustomLlmProvider): CustomLlmProvider[] {
  const providers = readProviders();
  const normalized: CustomLlmProvider = {
    ...provider,
    id: provider.id || generateProviderId(),
    name: provider.name.trim() || "Custom Provider",
    baseUrl: normalizeBaseUrl(provider.baseUrl),
    apiKey: provider.apiKey.trim(),
    modelIds: provider.modelIds.filter(Boolean).slice(0, 500),
  };
  const index = providers.findIndex((p) => p.id === normalized.id);
  if (index >= 0) providers[index] = normalized;
  else providers.push(normalized);
  writeProviders(providers);
  return providers;
}

export function deleteCustomLlmProvider(id: string): CustomLlmProvider[] {
  const providers = readProviders().filter((p) => p.id !== id);
  writeProviders(providers);
  if (getActiveCustomLlmProviderId() === id) {
    setActiveCustomLlmProviderId(null);
  }
  return providers;
}

export function generateProviderId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getActiveCustomLlmProviderId(): string | null {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(ACTIVE_PROVIDER_STORAGE) || null;
}

export function setActiveCustomLlmProviderId(id: string | null) {
  if (!canUseStorage()) return;
  if (id) window.localStorage.setItem(ACTIVE_PROVIDER_STORAGE, id);
  else window.localStorage.removeItem(ACTIVE_PROVIDER_STORAGE);
}

/** 当前启用中的自定义 Provider；要求已填 apiKey 才视为可用。 */
export function getActiveCustomLlmProvider(): CustomLlmProvider | null {
  const activeId = getActiveCustomLlmProviderId();
  if (!activeId) return null;
  const provider = getCustomLlmProvider(activeId);
  return provider && provider.apiKey && provider.baseUrl ? provider : null;
}

/**
 * 拼接 OpenAI 兼容端点 URL。约定 baseUrl 是 API 根（通常以 /v1 或厂商
 * 等价路径结尾）；只有裸域名时才自动补 /v1。
 */
export function joinProviderUrl(baseUrl: string, path: string): string | null {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  let origin: string;
  let suffix: string;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const pathPart = url.pathname.replace(/\/+$/, "");
    origin = `${url.protocol}//${url.host}`;
    suffix = pathPart || "/v1";
  } catch {
    return null;
  }
  return `${origin}${suffix}/${path.replace(/^\/+/, "")}`;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/** 自定义 Provider 下的可用模型列表（供模型池采样）。 */
export function getCustomModelRefs(): ModelRef[] {
  const provider = getActiveCustomLlmProvider();
  if (!provider) return [];
  return provider.modelIds.map((model) => ({ provider: "custom" as const, model }));
}

export function isCustomModel(model: string): boolean {
  return getCustomModelRefs().some((ref) => ref.model === model);
}

/** 三处 getModelRefForModel 兜底共用：自定义模型 → custom ModelRef。 */
export function getModelRefForCustomModel(model: string): ModelRef | null {
  return getCustomModelRefs().find((ref) => ref.model === model) ?? null;
}

/** 组装透传给 /api/chat 的请求头；无可用自定义 Provider 时返回空对象。 */
export function buildCustomProviderHeaders(): Record<string, string> {
  const provider = getActiveCustomLlmProvider();
  if (!provider) return {};
  return {
    [CUSTOM_PROVIDER_BASE_URL_HEADER]: provider.baseUrl,
    [CUSTOM_PROVIDER_API_KEY_HEADER]: provider.apiKey,
  };
}

export interface CustomProviderProbeResult {
  ok: boolean;
  models?: string[];
  error?: string;
  /** /models 不可用（部分网关不实现）时用最小对话请求兜底验证 */
  fellBackToChatProbe?: boolean;
}

/**
 * 连通性测试：走服务端 `/api/llm-models` 代理（浏览器直连各厂商会被
 * CORS 拦截）。服务端优先 GET /models（零 token 消耗），失败时退回一条
 * max_tokens=1 的最小对话请求。
 */
export async function probeCustomLlmProvider(
  input: { baseUrl: string; apiKey: string; model?: string },
): Promise<CustomProviderProbeResult> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const apiKey = input.apiKey.trim();
  if (!baseUrl || !apiKey) {
    return { ok: false, error: "请先填写 Base URL 和 API Key" };
  }

  try {
    const { getAuthHeaders } = await import("@/lib/auth-headers");
    const response = await fetch("/api/llm-models", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildProbeHeaders(baseUrl, apiKey, input.model),
        ...(await getAuthHeaders()),
      },
      cache: "no-store",
    });
    const data: unknown = await response.json().catch(() => null);
    if (response.ok && typeof data === "object" && data !== null && (data as { ok?: unknown }).ok === true) {
      const record = data as { models?: unknown; fellBackToChatProbe?: unknown };
      return {
        ok: true,
        models: Array.isArray(record.models) ? record.models.map((m) => String(m)) : [],
        fellBackToChatProbe: record.fellBackToChatProbe === true,
      };
    }
    const message =
      typeof data === "object" && data !== null && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `验证失败（HTTP ${response.status}）`;
    return { ok: false, error: message };
  } catch (error) {
    return { ok: false, error: `连接失败: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function buildProbeHeaders(baseUrl: string, apiKey: string, model?: string): Record<string, string> {
  return {
    [CUSTOM_PROVIDER_BASE_URL_HEADER]: normalizeBaseUrl(baseUrl),
    [CUSTOM_PROVIDER_API_KEY_HEADER]: apiKey.trim(),
    ...(model?.trim() ? { "X-Custom-Model": model.trim() } : {}),
  };
}

export function clearCustomLlmProviders() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(PROVIDERS_STORAGE);
  window.localStorage.removeItem(ACTIVE_PROVIDER_STORAGE);
}
