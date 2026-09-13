import { NextResponse } from "next/server";

// 旧客户端也不得继续创建 Stripe 订单；历史订单仍由 webhook 处理。
export async function POST() {
  return NextResponse.json(
    {
      code: "payment_method_retired",
      error: "此支付方式已停用，请刷新页面后使用爱猹收或 TokenPay。",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
