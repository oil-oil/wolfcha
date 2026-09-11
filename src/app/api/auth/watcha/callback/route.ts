import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { supabaseAdmin, ensureAdminClient } from "@/lib/supabase-admin";
import { exchangeCodeForToken, fetchWatchaUserInfo } from "@/lib/watcha-oauth";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

/** 观猹用户在 Supabase 中的虚拟邮箱 */
function watchaEmail(watchaUserId: number): string {
  return `watcha_${watchaUserId}@watcha.oauth.local`;
}

/**
 * GET /api/auth/watcha/callback
 * 观猹 OAuth2 回调：code 换 token → 拿 userinfo → 关联 Supabase 用户 → 设置 session
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // 用户拒绝授权或出错
  if (errorParam) {
    console.warn("[Watcha OAuth] Authorization denied");
    return NextResponse.redirect(`${origin}?watcha_error=${encodeURIComponent(errorParam)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}?watcha_error=missing_params`);
  }

  // 校验 state 防 CSRF
  const savedState = request.cookies.get("watcha_oauth_state")?.value;
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(`${origin}?watcha_error=invalid_state`);
  }

  try {
    ensureAdminClient();
  } catch {
    console.error("[Watcha OAuth] Supabase admin client not configured");
    return NextResponse.redirect(`${origin}?watcha_error=server_error`);
  }

  let stage = "token_exchange";
  try {
    const redirectUri = `${origin}/api/auth/watcha/callback`;

    // 1. 用 code 换 token
    const tokenData = await exchangeCodeForToken(code, redirectUri);

    // 2. 拿用户信息
    stage = "userinfo";
    const watchaUser = await fetchWatchaUserInfo(tokenData.access_token);
    if (!Number.isSafeInteger(watchaUser.user_id) || watchaUser.user_id <= 0) {
      throw new Error("Invalid Watcha user ID");
    }

    // 3. 在 Supabase 中查找或创建用户
    const email = watchaEmail(watchaUser.user_id);
    const metadata = {
      watcha_user_id: watchaUser.user_id,
      nickname: watchaUser.nickname,
      avatar_url: watchaUser.avatar_url,
      provider: "watcha",
    };

    // 尝试创建用户（如果已存在会报错）
    stage = "create_user";
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (createError && !["email_exists", "user_already_exists"].includes(createError.code ?? "")) {
      throw createError;
    }
    if (!createError && !newUser.user) {
      throw new Error("User creation returned no user");
    }

    // 4. 按已验证的观猹 ID 对应邮箱生成链接，并直接取得对应用户。
    // 不扫描 listUsers：只查第一页会导致第 1000 名之后的老用户无法登录。
    stage = "generate_link";
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError || !linkData?.user) {
      throw linkError || new Error("Failed to generate login link");
    }

    const supabaseUserId = linkData.user.id;
    if (!supabaseUserId || linkData.user.email !== email ||
        (newUser.user && newUser.user.id !== supabaseUserId)) {
      throw new Error("Login link user does not match Watcha identity");
    }

    const hashed_token = linkData.properties?.hashed_token;
    if (!hashed_token) {
      throw new Error("No hashed_token in magic link response");
    }

    stage = "update_user";
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, {
      user_metadata: metadata,
    });
    if (updateError) throw updateError;

    stage = "initialize_credits";
    // 缺失时初始化，已有记录一律不改；允许重试修复首次注册中断留下的缺行。
    const initialCredits = {
      id: supabaseUserId,
      credits: 1,
      referral_code: randomBytes(8).toString("hex").toUpperCase(),
      updated_at: new Date().toISOString(),
    } satisfies Database["public"]["Tables"]["user_credits"]["Insert"];
    const { error: creditsError } = await supabaseAdmin
      .from("user_credits")
      .upsert(
        initialCredits as never,
        { onConflict: "id", ignoreDuplicates: true }
      );
    if (creditsError) throw creditsError;

    // 重定向到 Supabase verify 端点，它会设置 session 然后跳回首页
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const verifyUrl = new URL(`${supabaseUrl}/auth/v1/verify`);
    verifyUrl.search = new URLSearchParams({ token: hashed_token, type: "magiclink", redirect_to: origin }).toString();

    const response = NextResponse.redirect(verifyUrl);
    response.cookies.delete("watcha_oauth_state");

    return response;
  } catch (err) {
    // 不记录授权码、令牌、邮箱或上游原始错误内容，但保留失败阶段便于排查。
    const error = err as { code?: unknown; status?: unknown } | null;
    console.error("[Watcha OAuth] Callback error", {
      stage,
      code: typeof error?.code === "string" && /^[a-z_]{1,64}$/.test(error.code) ? error.code : "unknown",
      status: typeof error?.status === "number" ? error.status : undefined,
    });
    const response = NextResponse.redirect(`${origin}?watcha_error=auth_failed`);
    response.cookies.delete("watcha_oauth_state");
    return response;
  }
}
