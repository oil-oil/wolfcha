import type { ModelRef } from "@/types/game";

/**
 * 决策类调用（投票、夜间行动）的思考配置名。
 * 客户端只能声明用途，思考量由服务端按模型配置决定，避免请求方任意抬高计费。
 */
export type ReasoningProfile = "decision";

export type ReasoningConfig = NonNullable<ModelRef["reasoning"]>;

/** 低档思考的投票实测中位约 20 秒、最长 142 秒，普通调用的 60 秒上限会把它截断成弃票；需小于路由的 maxDuration。 */
export const DECISION_TIMEOUT_MS = 240_000;

export function normalizeReasoningProfile(value: unknown): ReasoningProfile | undefined {
  return value === "decision" ? "decision" : undefined;
}

/** 模型自带的配置优先于请求里的 reasoning；决策调用取 decisionReasoning。 */
export function resolveReasoning(
  modelRef: Pick<ModelRef, "reasoning" | "decisionReasoning"> | undefined,
  requested: ReasoningConfig | undefined,
  profile: ReasoningProfile | undefined,
): ReasoningConfig | undefined {
  if (profile === "decision" && modelRef?.decisionReasoning !== undefined) {
    return modelRef.decisionReasoning;
  }
  return modelRef?.reasoning !== undefined ? modelRef.reasoning : requested;
}

/**
 * TokenDance 的 DeepSeek 不理会 thinking.budget_tokens（设 128 仍思考 1500 以上 token），
 * 档位只有通过 reasoning_effort 才生效；budget_tokens 仅在显式给出上限时保留。
 */
export function buildTokendanceThinking(
  reasoning: ReasoningConfig | undefined,
): { thinking?: Record<string, unknown>; reasoning_effort?: string } {
  if (reasoning === undefined) return {};
  if (reasoning.enabled !== true) return { thinking: { type: "disabled" } };

  const budget =
    typeof reasoning.max_tokens === "number" && Number.isFinite(reasoning.max_tokens)
      ? Math.max(32, Math.floor(reasoning.max_tokens))
      : undefined;
  return {
    thinking: { type: "enabled", ...(budget ? { budget_tokens: budget } : {}) },
    ...(reasoning.effort ? { reasoning_effort: reasoning.effort } : {}),
  };
}
