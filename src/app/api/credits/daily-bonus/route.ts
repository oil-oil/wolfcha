import { NextResponse } from "next/server";
import { supabaseAdmin, ensureAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const DAILY_BONUS_AMOUNT = 2;
const MAX_CREDITS = 10;

export async function POST(request: Request) {
  try {
    ensureAdminClient();
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Server misconfiguration: missing SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 获取用户当前积分和最后签到日期
  const { data, error } = await supabaseAdmin
    .from("user_credits")
    .select("credits, last_daily_bonus_at, created_at")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to read user credits" }, { status: 500 });
  }

  const creditsRow = data as {
    credits: number;
    last_daily_bonus_at: string | null;
    created_at: string;
  };

  // 获取今天的日期（UTC）
  const today = new Date().toISOString().split("T")[0];
  
  // 获取用户注册日期
  const createdDate = new Date(creditsRow.created_at).toISOString().split("T")[0];

  // 检查是否是注册当天（注册当天已送5局，不再送2局）
  if (createdDate === today) {
    return NextResponse.json({
      success: true,
      credits: creditsRow.credits,
      bonusClaimed: false,
      reason: "first_day",
    });
  }

  // 检查今天是否已经领取过
  if (creditsRow.last_daily_bonus_at === today) {
    return NextResponse.json({
      success: true,
      credits: creditsRow.credits,
      bonusClaimed: false,
      reason: "already_claimed",
    });
  }

  // 计算新积分（最多10局）
  const newCredits = Math.min(creditsRow.credits + DAILY_BONUS_AMOUNT, MAX_CREDITS);
  const actualBonus = newCredits - creditsRow.credits;

  // 更新积分和签到日期
  const { error: updateError } = await supabaseAdmin
    .from("user_credits")
    .update({
      credits: newCredits,
      last_daily_bonus_at: today,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to update credits" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    credits: newCredits,
    bonusClaimed: true,
    bonusAmount: actualBonus,
  });
}
