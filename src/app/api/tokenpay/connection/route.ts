import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import {
  deleteTokenPayConnection,
  getTokenPayConnection,
} from "@/lib/tokenpay";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request as unknown as Request);
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json(await getTokenPayConnection(auth.user.id));
  } catch (error) {
    console.error("[TokenPay] Failed to load connection", error);
    return NextResponse.json({ error: "Failed to load TokenPay connection" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request as unknown as Request);
  if ("error" in auth) return auth.error;
  try {
    await deleteTokenPayConnection(auth.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[TokenPay] Failed to disconnect", error);
    return NextResponse.json({ error: "Failed to disconnect TokenPay" }, { status: 500 });
  }
}
