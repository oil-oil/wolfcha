import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";
import { getTokenPayAppUrl } from "@/lib/tokenpay-config";

export {
  getTokenPayAppUrl,
  getTokenPayGatewayUrl,
  TOKENPAY_APP_URL,
  TOKENPAY_GATEWAY_URL,
} from "@/lib/tokenpay-config";

export const TOKENPAY_AUTH_URL = "https://tokendance.space/auth";
export const TOKENPAY_PORTAL_API_URL = "https://tokendance.space/portal/api/v1";
export const TOKENPAY_MODE_HEADER = "x-tokenpay-mode";
export const TOKENPAY_RECOVERY_HEADER = "TokenDance-Recovery-Action";

const TOKENPAY_KEY_NAME = "Wolfcha TokenPay";
const OAUTH_FLOW_TTL_MS = 10 * 60 * 1000;
const ENCRYPTED_VALUE_VERSION = "v1";

export type TokenPayConnectionStatus = "connected" | "reauthorize_required";
export type TokenPayRecoveryAction =
  | "top_up_balance"
  | "reauthorize_api_key"
  | "api_key_quota";

export type TokenPayConnectionSummary = {
  connected: boolean;
  status: TokenPayConnectionStatus | null;
};

export type TokenPayBalance = {
  creditsMicro: number;
  creditsUsedMicro: number;
  availableMicro: number;
};

export type TokenPayPaymentSession = {
  id: string;
  amount: number;
  status: string;
  paymentUrl: string;
  statusUrl: string;
  expiredAt: number;
  createdAt: number;
  paidAt?: number;
};

type UpstreamPaymentSession = {
  session?: {
    id?: unknown;
    amount?: unknown;
    status?: unknown;
    payment_url?: unknown;
    status_url?: unknown;
    expired_at?: unknown;
    created_at?: unknown;
    paid_at?: unknown;
  };
};

type UpstreamBalance = {
  balance?: {
    credits?: unknown;
    credits_used?: unknown;
    balance?: unknown;
  };
};

function asSafeInteger(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function normalizeTokenPayBalance(
  payload: UpstreamBalance,
): TokenPayBalance | null {
  const creditsMicro = asSafeInteger(payload.balance?.credits);
  const creditsUsedMicro = asSafeInteger(payload.balance?.credits_used);
  const availableMicro = asSafeInteger(payload.balance?.balance);
  if (
    creditsMicro === null ||
    creditsMicro < 0 ||
    creditsUsedMicro === null ||
    creditsUsedMicro < 0 ||
    availableMicro === null
  ) {
    return null;
  }
  return { creditsMicro, creditsUsedMicro, availableMicro };
}

export function normalizeTokenPayPaymentSession(
  payload: UpstreamPaymentSession,
): TokenPayPaymentSession | null {
  const session = payload.session;
  const asSafeInteger = (value: unknown): number | null => {
    if (
      (typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && !value.trim())
    ) {
      return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  };
  if (
    !session ||
    typeof session.id !== "string" ||
    !["pending", "paid", "failed", "closed", "refunded"].includes(
      String(session.status),
    ) ||
    typeof session.payment_url !== "string" ||
    typeof session.status_url !== "string"
  ) {
    return null;
  }
  const amount = asSafeInteger(session.amount);
  const expiredAt = asSafeInteger(session.expired_at);
  const createdAt = asSafeInteger(session.created_at);
  const paidAt = asSafeInteger(session.paid_at);
  let paymentUrl: URL;
  let statusUrl: URL;
  try {
    paymentUrl = new URL(session.payment_url);
    statusUrl = new URL(session.status_url);
  } catch {
    return null;
  }
  const expectedStatusPath = `/portal/api/v1/payment/sessions/${encodeURIComponent(session.id)}`;
  if (
    amount === null ||
    amount < 1 ||
    amount > 100_000 ||
    expiredAt === null ||
    createdAt === null ||
    paymentUrl.protocol !== "https:" ||
    statusUrl.origin !== "https://tokendance.space" ||
    statusUrl.pathname !== expectedStatusPath ||
    statusUrl.search ||
    statusUrl.hash
  ) {
    return null;
  }
  return {
    id: session.id,
    amount,
    status: String(session.status),
    paymentUrl: paymentUrl.toString(),
    statusUrl: statusUrl.toString(),
    expiredAt,
    createdAt,
    ...(paidAt !== null ? { paidAt } : {}),
  };
}

function getEncryptionKey(): Buffer {
  const configured = process.env.TOKENPAY_ENCRYPTION_KEY?.trim();
  if (!configured) {
    throw new Error("TOKENPAY_ENCRYPTION_KEY is not configured");
  }

  const candidates = [
    /^[0-9a-f]{64}$/i.test(configured) ? Buffer.from(configured, "hex") : null,
    Buffer.from(configured, "base64"),
  ];
  const key = candidates.find((candidate) => candidate?.length === 32);
  if (!key) {
    throw new Error("TOKENPAY_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex value");
  }
  return key;
}

export function encryptTokenPaySecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    ENCRYPTED_VALUE_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptTokenPaySecret(value: string): string {
  const [version, encodedIv, encodedAuthTag, encodedCiphertext] = value.split(":");
  if (
    version !== ENCRYPTED_VALUE_VERSION ||
    !encodedIv ||
    !encodedAuthTag ||
    !encodedCiphertext
  ) {
    throw new Error("Unsupported TokenPay encrypted value");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprintApiKey(apiKey: string): string {
  return hashValue(apiKey).slice(0, 12);
}

export function readTokenPayRecoveryAction(response: Response): TokenPayRecoveryAction | null {
  const action = response.headers.get(TOKENPAY_RECOVERY_HEADER);
  return action === "top_up_balance" ||
    action === "reauthorize_api_key" ||
    action === "api_key_quota"
    ? action
    : null;
}

export async function createTokenPayAuthorization(
  userId: string,
  requestOrigin: string,
): Promise<string> {
  ensureAdminClient();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OAUTH_FLOW_TTL_MS);

  await supabaseAdmin
    .from("tokenpay_oauth_flows")
    .delete()
    .lt("expires_at", now.toISOString());

  const { error } = await supabaseAdmin.from("tokenpay_oauth_flows").insert({
    state_hash: hashValue(state),
    user_id: userId,
    encrypted_code_verifier: encryptTokenPaySecret(verifier),
    expires_at: expiresAt.toISOString(),
    consumed_at: null,
  });
  if (error) {
    console.error("[TokenPay] Failed to create OAuth flow", error);
    throw new Error("Failed to start TokenPay authorization");
  }

  const appUrl = getTokenPayAppUrl(requestOrigin);
  const callbackUrl = new URL("/api/tokenpay/oauth/callback", appUrl);
  callbackUrl.searchParams.set("state", state);

  const authorizationUrl = new URL(TOKENPAY_AUTH_URL);
  authorizationUrl.searchParams.set("callback_url", callbackUrl.toString());
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("app_url", appUrl);
  authorizationUrl.searchParams.set(
    "key_name",
    process.env.TOKENPAY_KEY_NAME?.trim() || TOKENPAY_KEY_NAME,
  );
  return authorizationUrl.toString();
}

export async function consumeTokenPayOAuthFlow(state: string): Promise<{
  userId: string;
  codeVerifier: string;
  stateHash: string;
}> {
  ensureAdminClient();
  const stateHash = hashValue(state);
  const consumedAt = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("tokenpay_oauth_flows")
    .update({ consumed_at: consumedAt })
    .eq("state_hash", stateHash)
    .is("consumed_at", null)
    .gt("expires_at", consumedAt)
    .select("user_id, encrypted_code_verifier")
    .maybeSingle();
  if (error || !data) {
    throw new Error("Invalid or expired TokenPay authorization state");
  }

  const codeVerifier = decryptTokenPaySecret(data.encrypted_code_verifier);
  return {
    userId: data.user_id,
    codeVerifier,
    stateHash,
  };
}

export async function releaseTokenPayOAuthFlow(stateHash: string): Promise<void> {
  ensureAdminClient();
  const { error } = await supabaseAdmin
    .from("tokenpay_oauth_flows")
    .update({ consumed_at: null })
    .eq("state_hash", stateHash)
    .gt("expires_at", new Date().toISOString());
  if (error) console.warn("[TokenPay] Failed to release OAuth flow", error);
}

export async function completeTokenPayOAuthFlow(stateHash: string): Promise<void> {
  ensureAdminClient();
  const { error } = await supabaseAdmin
    .from("tokenpay_oauth_flows")
    .delete()
    .eq("state_hash", stateHash);
  if (error) console.warn("[TokenPay] Failed to clean up OAuth flow", error);
}

export async function exchangeTokenPayAuthorizationCode(
  code: string,
  codeVerifier: string,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${TOKENPAY_PORTAL_API_URL}/auth/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          code_challenge_method: "S256",
        }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as { key?: unknown } | null;
      if (response.ok && typeof payload?.key === "string" && payload.key.trim()) {
        return payload.key.trim();
      }
      const error = Object.assign(
        new Error(`TokenPay code exchange failed (${response.status})`),
        { retryable: response.status >= 500 },
      );
      if (response.status < 500 || attempt === 2) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (
        error instanceof Error &&
        "retryable" in error &&
        error.retryable === false
      ) {
        throw error;
      }
      if (attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error("TokenPay code exchange failed");
}

export async function saveTokenPayConnection(userId: string, apiKey: string): Promise<void> {
  ensureAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("tokenpay_connections").upsert({
    user_id: userId,
    encrypted_api_key: encryptTokenPaySecret(apiKey),
    key_fingerprint: fingerprintApiKey(apiKey),
    status: "connected",
    connected_at: now,
    updated_at: now,
  }, { onConflict: "user_id" });
  if (error) {
    console.error("[TokenPay] Failed to save connection", error);
    throw new Error("Failed to save TokenPay connection");
  }
}

export async function getTokenPayConnection(
  userId: string,
): Promise<TokenPayConnectionSummary> {
  ensureAdminClient();
  const { data, error } = await supabaseAdmin
    .from("tokenpay_connections")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[TokenPay] Failed to read connection", error);
    throw new Error("Failed to read TokenPay connection");
  }
  if (!data) return { connected: false, status: null };
  return {
    connected: data.status === "connected",
    status: data.status,
  };
}

export async function hasConnectedTokenPay(userId: string): Promise<boolean> {
  const connection = await getTokenPayConnection(userId);
  return connection.connected;
}

export async function getConnectedTokenPayApiKey(userId: string): Promise<string | null> {
  ensureAdminClient();
  const { data, error } = await supabaseAdmin
    .from("tokenpay_connections")
    .select("encrypted_api_key, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[TokenPay] Failed to resolve connection", error);
    throw new Error("Failed to resolve TokenPay connection");
  }
  if (!data) return null;
  if (data.status !== "connected") return null;
  return decryptTokenPaySecret(data.encrypted_api_key);
}

export async function markTokenPayConnectionForReauthorization(userId: string): Promise<void> {
  ensureAdminClient();
  const { error } = await supabaseAdmin
    .from("tokenpay_connections")
    .update({ status: "reauthorize_required", updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) console.warn("[TokenPay] Failed to mark connection for reauthorization", error);
}

export async function deleteTokenPayConnection(userId: string): Promise<void> {
  ensureAdminClient();
  const { error } = await supabaseAdmin
    .from("tokenpay_connections")
    .delete()
    .eq("user_id", userId);
  if (error) {
    console.error("[TokenPay] Failed to delete connection", error);
    throw new Error("Failed to disconnect TokenPay");
  }
}

export async function fetchTokenPayPortal(
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const apiKey = await getConnectedTokenPayApiKey(userId);
  if (!apiKey) throw new Error("TokenPay connection is not available");
  const response = await fetch(`${TOKENPAY_PORTAL_API_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });
  if (response.status === 401 || readTokenPayRecoveryAction(response) === "reauthorize_api_key") {
    await markTokenPayConnectionForReauthorization(userId);
  }
  return response;
}
