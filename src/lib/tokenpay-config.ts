export const TOKENPAY_GATEWAY_URL = "https://tokendance.space/gateway/v1";
export const TOKENPAY_APP_URL = "https://wolf-cha.com";

function normalizeConfiguredUrl(raw: string, label: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (
    url.protocol !== "https:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  ) {
    throw new Error(`${label} must use HTTPS`);
  }
  return url.toString().replace(/\/$/, "");
}

export function getTokenPayAppUrl(requestOrigin?: string): string {
  const configured = process.env.TOKENPAY_APP_URL?.trim();
  if (configured) return normalizeConfiguredUrl(configured, "TOKENPAY_APP_URL");
  if (process.env.NODE_ENV !== "production" && requestOrigin) {
    return normalizeConfiguredUrl(requestOrigin, "request origin");
  }
  return TOKENPAY_APP_URL;
}

export function getTokenPayGatewayUrl(): string {
  const configured = process.env.TOKENDANCE_BASE_URL?.trim();
  return configured
    ? normalizeConfiguredUrl(configured, "TOKENDANCE_BASE_URL")
    : TOKENPAY_GATEWAY_URL;
}
