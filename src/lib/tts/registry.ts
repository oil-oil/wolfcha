import type { TtsAdapter, TtsProviderId } from "./types";
import { minimaxAdapter } from "./minimax";
import { openaiCompatibleAdapter } from "./openai-compatible";
import { stepfunAdapter } from "./stepfun";
import { volcengineAdapter } from "./volcengine";
import { elevenlabsAdapter } from "./elevenlabs";

const ADAPTERS: Record<TtsProviderId, TtsAdapter> = {
  minimax: minimaxAdapter,
  "openai-compatible": openaiCompatibleAdapter,
  stepfun: stepfunAdapter,
  volcengine: volcengineAdapter,
  elevenlabs: elevenlabsAdapter,
};

export function getTtsAdapter(id: TtsProviderId): TtsAdapter {
  return ADAPTERS[id] ?? minimaxAdapter;
}

export function isTtsProviderId(value: string): value is TtsProviderId {
  return value in ADAPTERS;
}
