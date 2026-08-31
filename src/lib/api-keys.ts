import {
  ALL_MODELS,
  AVAILABLE_MODELS,
  GENERATOR_MODEL,
  SUMMARY_MODEL,
  REVIEW_MODEL,
} from "@/types/game";

const ZENMUX_API_KEY_STORAGE = "wolfcha_zenmux_api_key";
const DASHSCOPE_API_KEY_STORAGE = "wolfcha_dashscope_api_key";
const TOKENDANCE_API_KEY_STORAGE = "wolfcha_tokendance_api_key";
const TOKENPAY_CONNECTED_STORAGE = "wolfcha_tokenpay_connected";
const MODEL_SOURCE_STORAGE = "wolfcha_model_source";
const MINIMAX_API_KEY_STORAGE = "wolfcha_minimax_api_key";
const MINIMAX_GROUP_ID_STORAGE = "wolfcha_minimax_group_id";
const CUSTOM_KEY_ENABLED_STORAGE = "wolfcha_custom_key_enabled";
const SELECTED_MODELS_STORAGE = "wolfcha_selected_models";
const GENERATOR_MODEL_STORAGE = "wolfcha_generator_model";
const SUMMARY_MODEL_STORAGE = "wolfcha_summary_model";
const REVIEW_MODEL_STORAGE = "wolfcha_review_model";
const VALIDATED_ZENMUX_KEY_STORAGE = "wolfcha_validated_zenmux_key";
const VALIDATED_DASHSCOPE_KEY_STORAGE = "wolfcha_validated_dashscope_key";
const VALIDATED_TOKENDANCE_KEY_STORAGE = "wolfcha_validated_tokendance_key";
export const TOKENDANCE_BASE_URL = "https://tokendance.space/gateway/v1";
export const MODEL_SOURCE_CHANGE_EVENT = "wolfcha:model-source-change";

export type ModelSource = "project" | "tokenpay" | "custom";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStorage(key: string): string {
  if (!canUseStorage()) return "";
  const value = window.localStorage.getItem(key);
  return typeof value === "string" ? value.trim() : "";
}

function writeStorage(key: string, value: string) {
  if (!canUseStorage()) return;
  const trimmed = value.trim();
  if (!trimmed) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, trimmed);
}

export function getZenmuxApiKey(): string {
  return readStorage(ZENMUX_API_KEY_STORAGE);
}

export function setZenmuxApiKey(key: string) {
  writeStorage(ZENMUX_API_KEY_STORAGE, key);
}

export function getMinimaxApiKey(): string {
  return readStorage(MINIMAX_API_KEY_STORAGE);
}

export function getDashscopeApiKey(): string {
  return readStorage(DASHSCOPE_API_KEY_STORAGE);
}

export function getTokendanceApiKey(): string {
  return readStorage(TOKENDANCE_API_KEY_STORAGE);
}

export function getTokendanceBaseUrl(): string {
  return TOKENDANCE_BASE_URL;
}

export function setMinimaxApiKey(key: string) {
  writeStorage(MINIMAX_API_KEY_STORAGE, key);
}

export function setDashscopeApiKey(key: string) {
  writeStorage(DASHSCOPE_API_KEY_STORAGE, key);
}

export function setTokendanceApiKey(key: string) {
  writeStorage(TOKENDANCE_API_KEY_STORAGE, key);
}

export function isTokenPayConnected(): boolean {
  return readStorage(TOKENPAY_CONNECTED_STORAGE) === "true";
}

export function setTokenPayConnected(connected: boolean) {
  if (!canUseStorage()) return;
  if (connected) {
    window.localStorage.setItem(TOKENPAY_CONNECTED_STORAGE, "true");
    return;
  }
  window.localStorage.removeItem(TOKENPAY_CONNECTED_STORAGE);
}

export function setTokendanceBaseUrl() {
  // TokenDance gateway URL is fixed for custom-key gameplay.
}

export function getMinimaxGroupId(): string {
  return readStorage(MINIMAX_GROUP_ID_STORAGE);
}

export function setMinimaxGroupId(id: string) {
  writeStorage(MINIMAX_GROUP_ID_STORAGE, id);
}

export function hasZenmuxKey(): boolean {
  return Boolean(getZenmuxApiKey());
}

export function getValidatedZenmuxKey(): string {
  return readStorage(VALIDATED_ZENMUX_KEY_STORAGE);
}

export function setValidatedZenmuxKey(key: string) {
  writeStorage(VALIDATED_ZENMUX_KEY_STORAGE, key);
}

export function getValidatedDashscopeKey(): string {
  return readStorage(VALIDATED_DASHSCOPE_KEY_STORAGE);
}

export function setValidatedDashscopeKey(key: string) {
  writeStorage(VALIDATED_DASHSCOPE_KEY_STORAGE, key);
}

export function getValidatedTokendanceKey(): string {
  return readStorage(VALIDATED_TOKENDANCE_KEY_STORAGE);
}

export function setValidatedTokendanceKey(key: string) {
  writeStorage(VALIDATED_TOKENDANCE_KEY_STORAGE, key);
}

export function getValidatedTokendanceBaseUrl(): string {
  return TOKENDANCE_BASE_URL;
}

export function setValidatedTokendanceBaseUrl() {
  // TokenDance gateway URL is fixed for custom-key gameplay.
}

export function hasDashscopeKey(): boolean {
  return Boolean(getDashscopeApiKey());
}

export function hasTokendanceKey(): boolean {
  return Boolean(getTokendanceApiKey());
}

export function hasMinimaxKey(): boolean {
  return Boolean(getMinimaxApiKey()) && Boolean(getMinimaxGroupId());
}

function hasLocalLlmKey(): boolean {
  return hasZenmuxKey() || hasDashscopeKey() || hasTokendanceKey();
}

export function resolveModelSource(options: {
  storedSource?: string | null;
  legacyCustomEnabled?: boolean;
  hasLocalKey?: boolean;
  tokenPayConnected?: boolean;
}): ModelSource {
  if (
    options.storedSource === "project" ||
    options.storedSource === "tokenpay" ||
    options.storedSource === "custom"
  ) {
    return options.storedSource;
  }
  if (options.legacyCustomEnabled && options.hasLocalKey) return "custom";
  if (options.tokenPayConnected) return "tokenpay";
  return "project";
}

export function getModelSource(): ModelSource {
  if (!canUseStorage()) return "project";
  const source = resolveModelSource({
    storedSource: window.localStorage.getItem(MODEL_SOURCE_STORAGE),
    legacyCustomEnabled:
      window.localStorage.getItem(CUSTOM_KEY_ENABLED_STORAGE) === "true",
    hasLocalKey: hasLocalLlmKey(),
    tokenPayConnected: isTokenPayConnected(),
  });
  if (!window.localStorage.getItem(MODEL_SOURCE_STORAGE)) {
    window.localStorage.setItem(MODEL_SOURCE_STORAGE, source);
  }
  return source;
}

export function setModelSource(source: ModelSource) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(MODEL_SOURCE_STORAGE, source);
  window.localStorage.setItem(
    CUSTOM_KEY_ENABLED_STORAGE,
    source === "custom" ? "true" : "false",
  );
  window.dispatchEvent(new CustomEvent(MODEL_SOURCE_CHANGE_EVENT, { detail: source }));
}

export function isTokenPayActive(): boolean {
  return getModelSource() === "tokenpay" && isTokenPayConnected();
}

// When custom key is enabled, keep model within providers that have keys.
function resolveModelWhenCustomEnabled(preferred: string, fallbackPreferred: string): string {
  const allowedProviders = new Set<(typeof ALL_MODELS)[number]["provider"]>();
  if (hasZenmuxKey()) allowedProviders.add("zenmux");
  if (hasDashscopeKey()) allowedProviders.add("dashscope");
  if (hasTokendanceKey()) allowedProviders.add("tokendance");

  if (allowedProviders.size === 0) return preferred;

  const allowedPool = ALL_MODELS.filter((ref) => allowedProviders.has(ref.provider));
  if (allowedPool.length === 0) return preferred;

  const allowedSet = new Set(allowedPool.map((ref) => ref.model));
  if (preferred && allowedSet.has(preferred)) return preferred;
  if (fallbackPreferred && allowedSet.has(fallbackPreferred)) return fallbackPreferred;
  return allowedPool[0].model;
}

function resolveModelForCurrentKeyState(
  storedValue: string,
  fallbackValue: string,
  storageKey: string
): string {
  const base = storedValue || fallbackValue;
  const resolved = resolveModelWhenCustomEnabled(base, fallbackValue);
  if (resolved !== base) {
    writeStorage(storageKey, resolved);
  }
  return resolved;
}

export function isCustomKeyEnabled(): boolean {
  return getModelSource() === "custom" && hasLocalLlmKey();
}

export function setCustomKeyEnabled(value: boolean) {
  setModelSource(value ? "custom" : isTokenPayConnected() ? "tokenpay" : "project");
}

export function getSelectedModels(): string[] {
  if (!canUseStorage()) return [];
  if (!isCustomKeyEnabled()) return [];
  const raw = window.localStorage.getItem(SELECTED_MODELS_STORAGE);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function setSelectedModels(models: string[]) {
  if (!canUseStorage()) return;
  if (!isCustomKeyEnabled()) {
    window.localStorage.removeItem(SELECTED_MODELS_STORAGE);
    return;
  }
  const normalized = models.map((m) => String(m ?? "").trim()).filter(Boolean);
  if (normalized.length === 0) {
    window.localStorage.removeItem(SELECTED_MODELS_STORAGE);
    return;
  }
  window.localStorage.setItem(SELECTED_MODELS_STORAGE, JSON.stringify(normalized));
}

export function getGeneratorModel(): string {
  const source = getModelSource();
  if (source === "tokenpay") return AVAILABLE_MODELS[0]?.model ?? GENERATOR_MODEL;
  if (source !== "custom") return GENERATOR_MODEL;
  const stored = readStorage(GENERATOR_MODEL_STORAGE);
  return resolveModelForCurrentKeyState(stored, GENERATOR_MODEL, GENERATOR_MODEL_STORAGE);
}

export function setGeneratorModel(model: string) {
  if (!isCustomKeyEnabled()) {
    writeStorage(GENERATOR_MODEL_STORAGE, "");
    return;
  }
  writeStorage(GENERATOR_MODEL_STORAGE, model);
}

export function getSummaryModel(): string {
  const source = getModelSource();
  if (source === "tokenpay") return AVAILABLE_MODELS[0]?.model ?? SUMMARY_MODEL;
  if (source !== "custom") return SUMMARY_MODEL;
  const stored = readStorage(SUMMARY_MODEL_STORAGE);
  return resolveModelForCurrentKeyState(stored, SUMMARY_MODEL, SUMMARY_MODEL_STORAGE);
}

export function setSummaryModel(model: string) {
  if (!isCustomKeyEnabled()) {
    writeStorage(SUMMARY_MODEL_STORAGE, "");
    return;
  }
  writeStorage(SUMMARY_MODEL_STORAGE, model);
}

export function getReviewModel(): string {
  const source = getModelSource();
  if (source === "tokenpay") return AVAILABLE_MODELS[0]?.model ?? REVIEW_MODEL;
  if (source !== "custom") return REVIEW_MODEL;
  const stored = readStorage(REVIEW_MODEL_STORAGE);
  return resolveModelForCurrentKeyState(stored, REVIEW_MODEL, REVIEW_MODEL_STORAGE);
}

export function setReviewModel(model: string) {
  if (!isCustomKeyEnabled()) {
    writeStorage(REVIEW_MODEL_STORAGE, "");
    return;
  }
  writeStorage(REVIEW_MODEL_STORAGE, model);
}

export function clearApiKeys() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(ZENMUX_API_KEY_STORAGE);
  window.localStorage.removeItem(DASHSCOPE_API_KEY_STORAGE);
  window.localStorage.removeItem(TOKENDANCE_API_KEY_STORAGE);
  window.localStorage.removeItem(MINIMAX_API_KEY_STORAGE);
  window.localStorage.removeItem(MINIMAX_GROUP_ID_STORAGE);
  window.localStorage.removeItem(SELECTED_MODELS_STORAGE);
  window.localStorage.removeItem(GENERATOR_MODEL_STORAGE);
  window.localStorage.removeItem(SUMMARY_MODEL_STORAGE);
  window.localStorage.removeItem(REVIEW_MODEL_STORAGE);
  window.localStorage.removeItem(VALIDATED_ZENMUX_KEY_STORAGE);
  window.localStorage.removeItem(VALIDATED_DASHSCOPE_KEY_STORAGE);
  window.localStorage.removeItem(VALIDATED_TOKENDANCE_KEY_STORAGE);
  window.localStorage.removeItem("wolfcha_tokendance_base_url");
  window.localStorage.removeItem("wolfcha_validated_tokendance_base_url");
  setModelSource(isTokenPayConnected() ? "tokenpay" : "project");
}

export interface KeyValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
}

export async function validateApiKeyBalance(): Promise<KeyValidationResult> {
  const source = getModelSource();
  if (source === "project") {
    return { valid: true };
  }

  if (source === "tokenpay") {
    try {
      const { getAuthHeaders } = await import("@/lib/auth-headers");
      const response = await fetch("/api/tokenpay/balance", {
        headers: await getAuthHeaders(),
        cache: "no-store",
      });
      if (response.ok) return { valid: true };
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        recoveryAction?: string;
      } | null;
      return {
        valid: false,
        error: data?.error || "TokenPay 账户不可用",
        errorCode: data?.recoveryAction || "tokenpay_unavailable",
      };
    } catch (error) {
      return {
        valid: false,
        error: `验证请求失败: ${String(error)}`,
        errorCode: "network_error",
      };
    }
  }

  const zenmuxKey = getZenmuxApiKey();
  const dashscopeKey = getDashscopeApiKey();
  const tokendanceKey = getTokendanceApiKey();
  const tokendanceBaseUrl = getTokendanceBaseUrl();
  if (!zenmuxKey && !dashscopeKey && !tokendanceKey) {
    return { valid: false, error: "未配置任何 API Key", errorCode: "no_key" };
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (zenmuxKey) {
      headers["X-Zenmux-Api-Key"] = zenmuxKey;
    }
    if (dashscopeKey) {
      headers["X-Dashscope-Api-Key"] = dashscopeKey;
    }
    if (tokendanceKey) {
      headers["X-Tokendance-Api-Key"] = tokendanceKey;
    }
    if (tokendanceBaseUrl) {
      headers["X-Tokendance-Base-Url"] = tokendanceBaseUrl;
    }

    const response = await fetch("/api/validate-key", {
      method: "POST",
      headers,
    });

    const data = await response.json();

    if (data.valid) {
      return { valid: true };
    }

    return {
      valid: false,
      error: data.error || "API Key 验证失败",
      errorCode: data.errorCode || "unknown",
    };
  } catch (error) {
    return {
      valid: false,
      error: `验证请求失败: ${String(error)}`,
      errorCode: "network_error",
    };
  }
}
