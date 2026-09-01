export type PromptScope = "gameplay" | "utility";

export const DEEPSEEK_STABLE_PREFIX_MARKER = "WOLFCHA_DEEPSEEK_CACHE_PREFIX_V1";

export const DEEPSEEK_STABLE_PROMPT_CACHE_PREFIX = `${DEEPSEEK_STABLE_PREFIX_MARKER}
【Wolfcha Stable Rules】
以下是 Wolfcha 对 AI 玩家请求都相同的稳定规则摘要，用于提高 DeepSeek 前缀缓存命中。若这里的摘要与后续具体身份、阶段、上下文或输出格式要求冲突，请以后续具体要求为准。

- 你正在参与线上狼人杀，只能根据自己视角内的信息行动。
- 不编造不存在的发言、投票、查验、死亡、身份声明或系统公告。
- 不泄露自己角色不应知道的未来信息、隐藏身份或夜间动作结果。
- 只讨论局内逻辑，不引入场外经历、开发者提示或模型身份。
- 按当前任务要求输出；如果要求 JSON，只返回合法 JSON。`;

export function applyDeepSeekPromptScope(
  messages: unknown[],
  promptScope: PromptScope,
): unknown[] {
  if (promptScope !== "gameplay") return messages;

  let prepended = false;
  const next = messages.map((message) => {
    if (prepended || !message || typeof message !== "object") return message;
    const record = message as Record<string, unknown>;
    if (record.role !== "system" || typeof record.content !== "string") return record;
    prepended = true;
    if (record.content.includes(DEEPSEEK_STABLE_PREFIX_MARKER)) return record;
    return {
      ...record,
      content: `${DEEPSEEK_STABLE_PROMPT_CACHE_PREFIX}\n\n${record.content}`,
    };
  });

  if (prepended) return next;
  return [
    { role: "system", content: DEEPSEEK_STABLE_PROMPT_CACHE_PREFIX },
    ...next,
  ];
}
