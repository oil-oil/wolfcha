import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin, ensureAdminClient } from "@/lib/supabase-admin";
import { exchangeCodeForToken, fetchWatchaUserInfo } from "@/lib/watcha-oauth";

export const dynamic = "force-dynamic";

/** 观猹用户在 Supabase 中的虚拟邮箱 */
function watchaEmail(watchaUserId: number): string {
  return `watcha_${watchaUserId}@watcha.oauth.local`;
}

/**
 * GET /api/auth/watcha/callback
 * 观猹 OAuth2 回调：code 换 token → 拿 userinfo → 关联 Supabase 用户 → 设置 session
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // 用户拒绝授权或出错
  if (errorParam) {
    console.warn("[Watcha OAuth] Authorization denied:", errorParam);
    return NextResponse.redirect(`${origin}?watcha_error=${encodeURIComponent(errorParam)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}?watcha_error=missing_params`);
  }

  // 校验 state 防 CSRF
  const cookieStore = await cookies();
  const savedState = cookieStore.get("watcha_oauth_state")?.value;
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(`${origin}?watcha_error=invalid_state`);
  }

  try {
    ensureAdminClient();
  } catch {
    console.error("[Watcha OAuth] Supabase admin client not configured");
    return NextResponse.redirect(`${origin}?watcha_error=server_error`);
  }

  try {
    const redirectUri = `${origin}/api/auth/watcha/callback`;

    // 1. 用 code 换 token
    const tokenData = await exchangeCodeForToken(code, redirectUri);

    // 2. 拿用户信息
    const watchaUser = await fetchWatchaUserInfo(tokenData.access_token);

    // 3. 在 Supabase 中查找或创建用户
    const email = watchaEmail(watchaUser.user_id);
    const metadata = {
      watcha_user_id: watchaUser.user_id,
      nickname: watchaUser.nickname,
      avatar_url: watchaUser.avatar_url,
      provider: "watcha",
    };

    let supabaseUserId: string;

    // 尝试创建用户（如果已存在会报错）
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (!createError && newUser.user) {
      supabaseUserId = newUser.user.id;

      // 新用户初始化积分
      await supabaseAdmin
        .from("user_credits")
        .upsert(
          { id: supabaseUserId, credits: 3, updated_at: new Date().toISOString() } as never,
          { onConflict: "id" }
        );
    } else {
      // 用户已存在，通过 listUsers 查找
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000, page: 1 });
      const existing = users?.find((u) => u.email === email);
      if (!existing) {
        throw createError || new Error("User creation failed and existing user not found");
      }
      supabaseUserId = existing.id;
    }

    // 4. 更新用户 metadata（昵称/头像可能变化）
    await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, {
      user_metadata: metadata,
    });

    // 5. 生成 magic link 让前端自动登录
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError || !linkData) {
      throw linkError || new Error("Failed to generate login link");
    }

    const hashed_token = linkData.properties?.hashed_token;
    if (!hashed_token) {
      throw new Error("No hashed_token in magic link response");
    }

    // 重定向到 Supabase verify 端点，它会设置 session 然后跳回首页
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const verifyUrl = `${supabaseUrl}/auth/v1/verify?token=${hashed_token}&type=magiclink&redirect_to=${encodeURIComponent(origin)}`;

    const response = NextResponse.redirect(verifyUrl);
    response.cookies.delete("watcha_oauth_state");

    return response;
  } catch (err) {
    console.error("[Watcha OAuth] Callback error:", err);
    return NextResponse.redirect(`${origin}?watcha_error=auth_failed`);
  }
}
