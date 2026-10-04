type ProviderNetworkError = {
  status: 502 | 504;
  code: "upstream_network_error" | "upstream_timeout";
  error: string;
};

const TIMEOUT_CODES = new Set([
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);
const NETWORK_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_PRX_TLS",
]);

export function getProviderNetworkError(error: unknown): ProviderNetworkError | null {
  const pending = [error];
  const seen = new Set<unknown>();
  let networkFailure = false;

  while (pending.length > 0 && seen.size < 16) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const detail = current as { name?: unknown; code?: unknown; cause?: unknown; errors?: unknown };

    if (
      detail.name === "AbortError" || detail.name === "TimeoutError" ||
      (typeof detail.code === "string" && TIMEOUT_CODES.has(detail.code))
    ) {
      return {
        status: 504,
        code: "upstream_timeout",
        error: "模型服务连接或响应超时，请检查服务端网络及代理配置后重试。",
      };
    }

    if (typeof detail.code === "string" && NETWORK_CODES.has(detail.code)) networkFailure = true;
    pending.push(detail.cause);
    if (Array.isArray(detail.errors)) pending.push(...detail.errors);
  }

  return networkFailure ? {
    status: 502,
    code: "upstream_network_error",
    error: "无法连接模型服务，请检查服务端网络及代理配置后重试。",
  } : null;
}
