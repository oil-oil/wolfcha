import { ALL_MODELS, AVAILABLE_MODELS, GENERATOR_MODEL, SUMMARY_MODEL } from "@/types/game";

const ZENMUX_API_KEY_STORAGE = "wolfcha_zenmux_api_key";
const DASHSCOPE_API_KEY_STORAGE = "wolfcha_dashscope_api_key";
const MINIMAX_API_KEY_STORAGE = "wolfcha_minimax_api_key";
const MINIMAX_GROUP_ID_STORAGE = "wolfcha_minimax_group_id";
const CUSTOM_KEY_ENABLED_STORAGE = "wolfcha_custom_key_enabled";
const SELECTED_MODELS_STORAGE = "wolfcha_selected_models";
const GENERATOR_MODEL_STORAGE = "wolfcha_generator_model";
const SUMMARY_MODEL_STORAGE = "wolfcha_summary_model";
const VALIDATED_ZENMUX_KEY_STORAGE = "wolfcha_validated_zenmux_key";
const VALIDATED_DASHSCOPE_KEY_STORAGE = "wolfcha_validated_dashscope_key";

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

export function setMinimaxApiKey(key: string) {
  writeStorage(MINIMAX_API_KEY_STORAGE, key);
}

export function setDashscopeApiKey(key: string) {
  writeStorage(DASHSCOPE_API_KEY_STORAGE, key);
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

export function hasDashscopeKey(): boolean {
  return Boolean(getDashscopeApiKey());
}

export function hasMinimaxKey(): boolean {
  return Boolean(getMinimaxApiKey()) && Boolean(getMinimaxGroupId());
}

// When custom key is disabled, use a model from AVAILABLE_MODELS so the server
// can use its built-in API keys (no user x-zenmux-api-key header).
function resolveDefaultModelWhenCustomDisabled(fallbackDefault: string): string {
  const builtin =
    AVAILABLE_MODELS.find((r) => r.provider === "zenmux") ?? AVAILABLE_MODELS[0];
  return builtin?.model ?? fallbackDefault;
}

// When custom key is enabled, keep model within providers that have keys.
function resolveModelWhenCustomEnabled(preferred: string, fallbackPreferred: string): string {
  const allowedProviders = new Set<"zenmux" | "dashscope">();
  if (hasZenmuxKey()) allowedProviders.add("zenmux");
  if (hasDashscopeKey()) allowedProviders.add("dashscope");

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
  // When custom key is disabled, always use system default - ignore user's stored selection
  if (!isCustomKeyEnabled()) {
    return resolveDefaultModelWhenCustomDisabled(fallbackValue);
  }

  // When custom key is enabled, use user's stored selection (or fallback if not set)
  const base = storedValue || fallbackValue;
  const resolved = resolveModelWhenCustomEnabled(base, fallbackValue);
  if (resolved !== base) {
    writeStorage(storageKey, resolved);
  }
  return resolved;
}

export function isCustomKeyEnabled(): boolean {
  if (!canUseStorage()) return false;
  const flagEnabled = window.localStorage.getItem(CUSTOM_KEY_ENABLED_STORAGE) === "true";
  if (!flagEnabled) return false;
  // 额外安全检查：即使标志位为 true，如果没有任何有效的 LLM API key，也返回 false
  // 这可以防止用户开启了开关但没有正确配置 key 的情况
  const hasAnyLLMKey = hasZenmuxKey() || hasDashscopeKey();
  return hasAnyLLMKey;
}

export function setCustomKeyEnabled(value: boolean) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(CUSTOM_KEY_ENABLED_STORAGE, value ? "true" : "false");
}

export function getSelectedModels(): string[] {
  if (!canUseStorage()) return [];
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
  const normalized = models.map((m) => String(m ?? "").trim()).filter(Boolean);
  if (normalized.length === 0) {
    window.localStorage.removeItem(SELECTED_MODELS_STORAGE);
    return;
  }
  window.localStorage.setItem(SELECTED_MODELS_STORAGE, JSON.stringify(normalized));
}

// Deprecated Zenmux model ID that no longer exists; migrate to valid one
const DEPRECATED_GENERATOR_MODEL = "google/gemini-2.5-flash-lite-preview-09-2025";

export function getGeneratorModel(): string {
  // When custom key is disabled, always use GENERATOR_MODEL directly
  // (independent of AI player models in AVAILABLE_MODELS)
  if (!isCustomKeyEnabled()) {
    return GENERATOR_MODEL;
  }
  const stored = readStorage(GENERATOR_MODEL_STORAGE);
  if (stored === DEPRECATED_GENERATOR_MODEL) {
    writeStorage(GENERATOR_MODEL_STORAGE, GENERATOR_MODEL);
    return GENERATOR_MODEL;
  }
  return resolveModelForCurrentKeyState(stored, GENERATOR_MODEL, GENERATOR_MODEL_STORAGE);
}

export function setGeneratorModel(model: string) {
  writeStorage(GENERATOR_MODEL_STORAGE, model);
}

export function getSummaryModel(): string {
  // When custom key is disabled, always use SUMMARY_MODEL directly
  // (independent of AI player models in AVAILABLE_MODELS)
  if (!isCustomKeyEnabled()) {
    return SUMMARY_MODEL;
  }
  const stored = readStorage(SUMMARY_MODEL_STORAGE);
  if (stored === DEPRECATED_GENERATOR_MODEL) {
    writeStorage(SUMMARY_MODEL_STORAGE, SUMMARY_MODEL);
    return SUMMARY_MODEL;
  }
  return resolveModelForCurrentKeyState(stored, SUMMARY_MODEL, SUMMARY_MODEL_STORAGE);
}

export function setSummaryModel(model: string) {
  writeStorage(SUMMARY_MODEL_STORAGE, model);
}

export function clearApiKeys() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(ZENMUX_API_KEY_STORAGE);
  window.localStorage.removeItem(DASHSCOPE_API_KEY_STORAGE);
  window.localStorage.removeItem(MINIMAX_API_KEY_STORAGE);
  window.localStorage.removeItem(MINIMAX_GROUP_ID_STORAGE);
  window.localStorage.removeItem(CUSTOM_KEY_ENABLED_STORAGE);
  window.localStorage.removeItem(SELECTED_MODELS_STORAGE);
  window.localStorage.removeItem(GENERATOR_MODEL_STORAGE);
  window.localStorage.removeItem(SUMMARY_MODEL_STORAGE);
  window.localStorage.removeItem(VALIDATED_ZENMUX_KEY_STORAGE);
  window.localStorage.removeItem(VALIDATED_DASHSCOPE_KEY_STORAGE);
}
