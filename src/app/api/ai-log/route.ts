import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const LOG_DIR = process.env.NODE_ENV === "production" ? "/tmp" : process.cwd();
const LOG_FILE = path.join(LOG_DIR, "ai-logs.json");
const LEGACY_LOG_FILE = path.join(LOG_DIR, "ai-logs.jsonl");

// Simple mutex to prevent concurrent file writes
let writeLock: Promise<void> = Promise.resolve();

const safeParseJsonArray = (content: string) => {
  if (!content.trim()) return [];
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // If JSON is corrupted, return empty array and let it be overwritten
    console.warn("[ai-log] Failed to parse ai-logs.json, resetting to empty array");
    return [];
  }
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
  try {
    await fs.writeFile(LOG_FILE, content, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EROFS") {
      return;
    }
    throw error;
  }
};

// Serialize writes to prevent concurrent file corruption
const withWriteLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  const prevLock = writeLock;
  let resolve: () => void;
  writeLock = new Promise((r) => { resolve = r; });
  try {
    await prevLock;
    return await fn();
  } finally {
    resolve!();
  }
};

export async function POST(request: NextRequest) {
  // Skip logging in production to avoid filesystem issues on Vercel
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ success: true, skipped: true });
  }

  try {
    const logEntry = await request.json();

    const fullEntry = {
      ...logEntry,
      serverTimestamp: new Date().toISOString(),
    };

    // Use write lock to prevent concurrent file corruption
    await withWriteLock(async () => {
      const logs = await readLogs();
      logs.push(fullEntry);
      await writeLogs(logs);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EROFS") {
      return NextResponse.json({ success: true, warning: "read-only filesystem" });
    }
    console.error("Failed to write AI log:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Skip logging in production to avoid filesystem issues on Vercel
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ logs: [] });
  }

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
  // Skip logging in production to avoid filesystem issues on Vercel
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ success: true, skipped: true });
  }

  try {
    await withWriteLock(async () => {
      await writeLogs([]);
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EROFS") {
      return NextResponse.json({ success: true, warning: "read-only filesystem" });
    }
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
