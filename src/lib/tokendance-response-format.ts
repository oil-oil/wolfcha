/**
 * TokenDance 的 DeepSeek 支持 JSON 输出，但不支持严格 json_schema。
 * 必须在最终 Provider / 模型确定后转换，兼容 TokenPay 模型替换和旧客户端。
 */
export function applyTokenDanceResponseFormat(
  requestBody: Record<string, unknown>,
  responseFormat: unknown,
): void {
  const format = responseFormat as {
    type?: unknown;
    json_schema?: { schema?: unknown };
  } | undefined;
  const model = String(requestBody.model ?? "").toLowerCase();
  const isDeepSeek = model.startsWith("deepseek-") || model.startsWith("deepseek/");

  if (!isDeepSeek || format?.type !== "json_schema") {
    requestBody.response_format = responseFormat;
    return;
  }

  requestBody.response_format = { type: "json_object" };
  // 降级的是网关参数，业务字段约束仍传给模型并由现有解析器校验。
  if (format.json_schema?.schema && Array.isArray(requestBody.messages)) {
    requestBody.messages = [
      {
        role: "system",
        content: `只输出 JSON 对象，不要使用 Markdown 代码块。输出必须符合以下 JSON Schema：\n${JSON.stringify(format.json_schema.schema)}`,
      },
      ...requestBody.messages,
    ];
  }
}
