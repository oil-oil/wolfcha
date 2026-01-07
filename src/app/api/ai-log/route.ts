import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const LOG_FILE = path.join(process.cwd(), "ai-logs.jsonl");

export async function POST(request: NextRequest) {
  try {
    const logEntry = await request.json();
    
    const logLine = JSON.stringify({
      ...logEntry,
      serverTimestamp: new Date().toISOString(),
    }) + "\n";

    await fs.appendFile(LOG_FILE, logLine, "utf-8");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to write AI log:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const content = await fs.readFile(LOG_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const logs = lines.map((line) => JSON.parse(line));
    
    return NextResponse.json({ logs });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ logs: [] });
    }
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await fs.writeFile(LOG_FILE, "", "utf-8");
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
