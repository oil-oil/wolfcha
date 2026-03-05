/**
 * 观猹 OAuth2 Authorization Code 流程工具函数（机密客户端）
 */

const WATCHA_BASE_URL = "https://watcha.cn";

export const WATCHA_OAUTH_CONFIG = {
  authorizeUrl: `${WATCHA_BASE_URL}/oauth/authorize`,
  tokenUrl: `${WATCHA_BASE_URL}/oauth/api/token`,
  userinfoUrl: `${WATCHA_BASE_URL}/oauth/api/userinfo`,
} as const;

export function getWatchaClientId(): string {
  const id = process.env.NEXT_PUBLIC_WATCHA_CLIENT_ID;
  if (!id) throw new Error("Missing NEXT_PUBLIC_WATCHA_CLIENT_ID");
  return id;
}

export function getWatchaClientSecret(): string {
  const secret = process.env.WATCHA_CLIENT_SECRET;
  if (!secret) throw new Error("Missing WATCHA_CLIENT_SECRET");
  return secret;
}

export function buildWatchaAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getWatchaClientId(),
    redirect_uri: redirectUri,
    scope: "read",
    state,
  });
  return `${WATCHA_OAUTH_CONFIG.authorizeUrl}?${params.toString()}`;
}

export interface WatchaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<WatchaTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: getWatchaClientId(),
    client_secret: getWatchaClientSecret(),
  });

  const res = await fetch(WATCHA_OAUTH_CONFIG.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Watcha token exchange failed: ${(err as Record<string, string>).error_description || res.statusText}`
    );
  }

  return res.json() as Promise<WatchaTokenResponse>;
}

export interface WatchaUserInfo {
  user_id: number;
  nickname: string;
  avatar_url?: string;
}

export async function fetchWatchaUserInfo(accessToken: string): Promise<WatchaUserInfo> {
  const res = await fetch(
    `${WATCHA_OAUTH_CONFIG.userinfoUrl}?access_token=${encodeURIComponent(accessToken)}`
  );

  if (!res.ok) {
    throw new Error(`Watcha userinfo request failed: ${res.statusText}`);
  }

  const json = (await res.json()) as { statusCode: number; data: WatchaUserInfo; code?: string; message?: string };
  if (json.statusCode !== 200 || !json.data) {
    throw new Error(`Watcha userinfo error: ${json.message || "unknown"}`);
  }

  return json.data;
}
