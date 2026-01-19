import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const LOG_FILE = path.join(process.cwd(), "ai-logs.json");
const LEGACY_LOG_FILE = path.join(process.cwd(), "ai-logs.jsonl");

const safeParseJsonArray = (content: string) => {
  if (!content.trim()) return [];
  const parsed = JSON.parse(content);
  return Array.isArray(parsed) ? parsed : [];
};

const readLegacyJsonl = async () => {
  const content = await fs.readFile(LEGACY_LOG_FILE, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  return lines.map((line) => JSON.parse(line));
};

const readLogs = async () => {
  try {
    const content = await fs.readFile(LOG_FILE, "utf-8");
    return safeParseJsonArray(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      try {
        return await readLegacyJsonl();
      } catch (legacyError) {
        if ((legacyError as NodeJS.ErrnoException).code === "ENOENT") {
          return [];
        }
        throw legacyError;
      }
    }
    throw error;
  }
};

const writeLogs = async (logs: unknown[]) => {
  const content = JSON.stringify(logs, null, 2) + "\n";
  await fs.writeFile(LOG_FILE, content, "utf-8");
};

export async function POST(request: NextRequest) {
  try {
    const logEntry = await request.json();

    const fullEntry = {
      ...logEntry,
      serverTimestamp: new Date().toISOString(),
    };

    const logs = await readLogs();
    logs.push(fullEntry);
    await writeLogs(logs);

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
    const logs = await readLogs();
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
    await writeLogs([]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
