import { NextResponse } from "next/server";
import { getDemoModeConfigServer } from "@/lib/demo-config-server";

export const dynamic = "force-dynamic";

/**
 * Public Demo Mode config snapshot for client consumption.
 */
export async function GET() {
  const snapshot = await getDemoModeConfigServer();
  return NextResponse.json(snapshot);
}
