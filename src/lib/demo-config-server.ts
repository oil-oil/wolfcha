import type { DemoModePublicConfigSnapshot } from "@/lib/demo-config";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";
import type { Database } from "@/types/database";

type DemoConfigRow = Database["public"]["Tables"]["demo_config"]["Row"];

const DEFAULT_CONFIG_ID = "default";

function buildInactiveSnapshot(now: Date = new Date()): DemoModePublicConfigSnapshot {
  return {
    source: "database",
    enabled: false,
    active: false,
    startsAt: null,
    expiresAt: null,
    serverNow: now.toISOString(),
  };
}

function isDemoModeActiveFromRow(
  row: Pick<DemoConfigRow, "enabled" | "starts_at" | "expires_at">,
  now: Date
): boolean {
  if (!row.enabled) return false;

  if (row.starts_at) {
    const startsAtMs = new Date(row.starts_at).getTime();
    if (Number.isFinite(startsAtMs) && now.getTime() < startsAtMs) {
      return false;
    }
  }

  if (row.expires_at) {
    const expiresAtMs = new Date(row.expires_at).getTime();
    if (Number.isFinite(expiresAtMs) && now.getTime() >= expiresAtMs) {
      return false;
    }
  }

  return true;
}

async function loadDemoConfigRow() {
  const primary = await supabaseAdmin
    .from("demo_config")
    .select("enabled, starts_at, expires_at")
    .eq("id", DEFAULT_CONFIG_ID)
    .maybeSingle();

  if (!primary.error) {
    return {
      row: (primary.data ?? null) as Pick<DemoConfigRow, "enabled" | "starts_at" | "expires_at"> | null,
      error: null,
    };
  }

  const legacy = await supabaseAdmin
    .from("demo_config")
    .select("enabled, expires_at")
    .eq("id", DEFAULT_CONFIG_ID)
    .maybeSingle();

  if (!legacy.error) {
    const legacyRow = legacy.data as { enabled: boolean; expires_at: string | null } | null;
    return {
      row: legacyRow
        ? {
            enabled: legacyRow.enabled,
            starts_at: null,
            expires_at: legacyRow.expires_at,
          }
        : null,
      error: null,
    };
  }

  return {
    row: null,
    error: primary.error,
  };
}

export async function getDemoModeConfigServer(): Promise<DemoModePublicConfigSnapshot> {
  const now = new Date();

  try {
    ensureAdminClient();
  } catch (error) {
    console.error("[demo-config] Missing Supabase admin client", error);
    return buildInactiveSnapshot(now);
  }

  try {
    const { row, error } = await loadDemoConfigRow();

    if (error) {
      console.error("[demo-config] Failed to load config", error);
      return buildInactiveSnapshot(now);
    }

    if (!row) {
      console.warn(`[demo-config] Missing config row: ${DEFAULT_CONFIG_ID}`);
      return buildInactiveSnapshot(now);
    }

    return {
      source: "database",
      enabled: row.enabled,
      active: isDemoModeActiveFromRow(row, now),
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      serverNow: now.toISOString(),
    };
  } catch (error) {
    console.error("[demo-config] Unexpected config read error", error);
    return buildInactiveSnapshot(now);
  }
}

export async function isDemoModeActiveServer(): Promise<boolean> {
  const snapshot = await getDemoModeConfigServer();
  return snapshot.active;
}
