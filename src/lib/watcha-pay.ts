import "server-only";

export const WATCHA_PAY_DEFAULT_BASE_URL = "https://pay.watcha.cn";
export const WATCHA_PAY_DEFAULT_RETURN_URL = "https://wolf-cha.com/?payment=watcha-pay";

export type WatchaPayErrorCode =
  | "misconfigured"
  | "invalid_response"
  | "insufficient_quota"
  | "unavailable";

export class WatchaPayError extends Error {
  readonly code: WatchaPayErrorCode;
  readonly status?: number;

  constructor(code: WatchaPayErrorCode, message: string, status?: number) {
    super(message);
    this.name = "WatchaPayError";
    this.code = code;
    this.status = status;
  }
}

export type WatchaPayAccess = {
  access: "granted" | "purchase_required" | "unavailable";
  remaining: number;
  purchaseUrl?: string;
  qrCodeUrl?: string;
};

export type WatchaPayQuotaConsumption = {
  consumed: number;
  remaining: number;
};

const REQUEST_TIMEOUT_MS = 10_000;

type WatchaPayConfig = {
  apiKey: string;
  entitlementId: string;
  baseUrl: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function normalizeUrl(raw: string, label: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WatchaPayError("misconfigured", `${label} must be a valid URL`);
  }

  const isLocalhost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(process.env.NODE_ENV === "test" && isLocalhost)) {
    throw new WatchaPayError("misconfigured", `${label} must use HTTPS`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new WatchaPayError(
      "misconfigured",
      `${label} must not contain credentials, query parameters, or fragments`,
    );
  }
  return url.toString().replace(/\/$/, "");
}

function readConfig(): WatchaPayConfig {
  const apiKey = process.env.WATCHA_PAY_API_KEY?.trim();
  if (!apiKey) {
    throw new WatchaPayError(
      "misconfigured",
      "WATCHA_PAY_API_KEY is not configured",
    );
  }
  if (process.env.VERCEL_ENV === "production" && !apiKey.startsWith("wpay_live_")) {
    throw new WatchaPayError("misconfigured", "Production requires a live Watcha Pay key");
  }

  const entitlementId = process.env.WATCHA_PAY_ENTITLEMENT_ID?.trim();
  if (!entitlementId) {
    throw new WatchaPayError(
      "misconfigured",
      "WATCHA_PAY_ENTITLEMENT_ID is not configured",
    );
  }

  const baseUrl = normalizeUrl(
    process.env.WATCHA_PAY_BASE_URL?.trim() || WATCHA_PAY_DEFAULT_BASE_URL,
    "WATCHA_PAY_BASE_URL",
  );
  return { apiKey, entitlementId, baseUrl };
}

export function isWatchaPayConfigured(): boolean {
  try {
    readConfig();
    return true;
  } catch {
    return false;
  }
}

function validateUserId(userId: string): void {
  if (typeof userId !== "string" || !userId.trim()) {
    throw new WatchaPayError("misconfigured", "userId must be a non-empty string");
  }
}

function validateReturnUrl(returnUrl: string | undefined): void {
  if (returnUrl === undefined) return;
  try {
    const url = new URL(returnUrl);
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) || !url.hostname) {
      throw new Error();
    }
  } catch {
    throw new WatchaPayError(
      "misconfigured",
      "returnUrl must be an absolute HTTPS URL or local HTTP URL",
    );
  }
}

export function getWatchaPayReturnUrl(): string {
  const returnUrl = process.env.WATCHA_PAY_RETURN_URL?.trim()
    || WATCHA_PAY_DEFAULT_RETURN_URL;
  validateReturnUrl(returnUrl);
  if (process.env.VERCEL_ENV === "production" && new URL(returnUrl).origin !== "https://wolf-cha.com") {
    throw new WatchaPayError("misconfigured", "Production return URL must use https://wolf-cha.com");
  }
  return new URL(returnUrl).toString();
}

function validateAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new WatchaPayError(
      "misconfigured",
      "amount must be a positive safe integer",
    );
  }
}

function invalidResponse(message: string, status?: number): WatchaPayError {
  return new WatchaPayError("invalid_response", message, status);
}

function readHttpsUrl(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw invalidResponse(`${label} must be an absolute HTTPS URL`);
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error();
    return url.toString();
  } catch {
    throw invalidResponse(`${label} must be an absolute HTTPS URL`);
  }
}

function readPurchaseUrl(value: unknown): string | undefined {
  if (typeof value === "string" && value.startsWith("alipays:")) {
    const url = new URL(value);
    if (url.hostname !== "platformapi" || url.pathname !== "/startapp"
      || url.username || url.password || url.hash
      || !/^\d{16}$/.test(url.searchParams.get("appId") ?? "")
      || !url.searchParams.get("page")) {
      throw invalidResponse("Watcha Pay returned an invalid Alipay purchase URL");
    }
    return url.toString();
  }
  return readHttpsUrl(value, "purchase.url");
}

function parseAccessResponse(payload: unknown): WatchaPayAccess {
  if (!isPlainObject(payload)) {
    throw invalidResponse("Watcha Pay access response must be an object");
  }
  const access = payload.access;
  if (
    access !== "granted" &&
    access !== "purchase_required" &&
    access !== "unavailable"
  ) {
    throw invalidResponse("Watcha Pay access response has an invalid access value");
  }

  const entitlement = payload.entitlement;
  if (
    !isPlainObject(entitlement) ||
    entitlement.type !== "quota" ||
    !isSafeNonNegativeInteger(entitlement.remaining)
  ) {
    throw invalidResponse("Watcha Pay access response has an invalid entitlement");
  }

  const purchase = payload.purchase;
  if (purchase !== undefined && !isPlainObject(purchase)) {
    throw invalidResponse("Watcha Pay access response has an invalid purchase");
  }
  const purchaseUrl = purchase
    ? readPurchaseUrl(purchase.url)
    : undefined;
  const qrCodeUrl = purchase
    ? readHttpsUrl(purchase.qr_code_url, "purchase.qr_code_url")
    : undefined;

  return {
    access,
    remaining: entitlement.remaining,
    ...(purchaseUrl ? { purchaseUrl } : {}),
    ...(qrCodeUrl ? { qrCodeUrl } : {}),
  };
}

function parseConsumeResponse(payload: unknown): WatchaPayQuotaConsumption {
  if (!isPlainObject(payload) || !isSafeNonNegativeInteger(payload.consumed)) {
    throw invalidResponse("Watcha Pay consume response has an invalid consumed value");
  }
  const entitlement = payload.entitlement;
  if (
    !isPlainObject(entitlement) ||
    entitlement.type !== "quota" ||
    !isSafeNonNegativeInteger(entitlement.remaining)
  ) {
    throw invalidResponse("Watcha Pay consume response has an invalid entitlement");
  }
  return { consumed: payload.consumed, remaining: entitlement.remaining };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw invalidResponse("Watcha Pay returned invalid JSON", response.status);
  }
}

async function postWatchaPay(
  path: string,
  body: Record<string, unknown>,
  config: WatchaPayConfig,
  operation: "access" | "consume",
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) handleHttpFailure(response, operation);
    // 超时必须覆盖响应体读取，避免上游只返回响应头后永久挂起。
    return await readJson(response);
  } catch (error) {
    if (error instanceof WatchaPayError) throw error;
    throw new WatchaPayError("unavailable", "Watcha Pay request failed");
  } finally {
    clearTimeout(timeout);
  }
}

function handleHttpFailure(response: Response, operation: string): never {
  if (response.status === 409 && operation === "consume") {
    throw new WatchaPayError(
      "insufficient_quota",
      "Watcha Pay quota is insufficient",
      response.status,
    );
  }
  throw new WatchaPayError(
    "unavailable",
    `Watcha Pay ${operation} request failed (${response.status})`,
    response.status,
  );
}

export async function getWatchaPayAccess(
  userId: string,
  returnUrl?: string,
): Promise<WatchaPayAccess> {
  const config = readConfig();
  validateUserId(userId);
  validateReturnUrl(returnUrl);

  try {
    const payload = await postWatchaPay(
      "/v1/entitlements/access",
      {
        entitlement_id: config.entitlementId,
        user_id: userId,
        ...(returnUrl === undefined ? {} : { return_url: returnUrl }),
      },
      config,
      "access",
    );
    return parseAccessResponse(payload);
  } catch (error) {
    if (error instanceof WatchaPayError) throw error;
    throw new WatchaPayError("unavailable", "Watcha Pay access request failed");
  }
}

export async function consumeWatchaPayQuota(
  userId: string,
  amount: number,
  idempotencyKey: string,
): Promise<WatchaPayQuotaConsumption> {
  const config = readConfig();
  validateUserId(userId);
  validateAmount(amount);
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    throw new WatchaPayError(
      "misconfigured",
      "idempotencyKey must be a non-empty string",
    );
  }

  const payload = await postWatchaPay(
    "/v1/entitlements/consume",
    {
      entitlement_id: config.entitlementId,
      user_id: userId,
      amount,
      idempotency_key: idempotencyKey,
    },
    config,
    "consume",
  );
  const result = parseConsumeResponse(payload);
  if (result.consumed !== amount) {
    throw invalidResponse("Watcha Pay consumed amount does not match the request");
  }
  return result;
}
