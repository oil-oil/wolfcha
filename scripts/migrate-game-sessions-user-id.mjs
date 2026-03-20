import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function executeViaRpc(supabaseUrl, serviceRoleKey, sql) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ sql }),
  });

  if (!response.ok) {
    throw new Error(`RPC failed: ${response.status} ${await response.text()}`);
  }
}

async function executeViaPgQuery(supabaseUrl, serviceRoleKey, sql) {
  const response = await fetch(`${supabaseUrl}/pg/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    throw new Error(`pg/query failed: ${response.status} ${await response.text()}`);
  }
}

async function verifyGuestInsert(supabaseUrl, serviceRoleKey) {
  const marker = `guest_migration_verify_${Date.now()}`;
  const endpoint = `${supabaseUrl}/rest/v1/game_sessions`;
  const headers = {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: "return=representation",
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      user_id: marker,
      player_count: 9,
      difficulty: "normal",
      completed: false,
      used_custom_key: false,
      model_used: "migration-verify",
    }),
  });

  if (!response.ok) {
    throw new Error(`Verification insert failed: ${response.status} ${await response.text()}`);
  }

  const rows = await response.json();
  const insertedId = rows?.[0]?.id;
  if (!insertedId) {
    throw new Error("Verification insert succeeded but returned no row id");
  }

  const cleanup = await fetch(`${endpoint}?id=eq.${insertedId}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: "return=minimal",
    },
  });

  if (!cleanup.ok) {
    throw new Error(`Verification cleanup failed: ${cleanup.status} ${await cleanup.text()}`);
  }
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const sqlPath = path.resolve(
    process.cwd(),
    "scripts/sql/20260320_game_sessions_user_id_text.sql"
  );
  const sql = fs.readFileSync(sqlPath, "utf-8");

  try {
    await executeViaRpc(supabaseUrl, serviceRoleKey, sql);
    console.log("Migration executed via RPC.");
  } catch (rpcError) {
    console.warn("RPC execution failed:", rpcError instanceof Error ? rpcError.message : rpcError);
    await executeViaPgQuery(supabaseUrl, serviceRoleKey, sql);
    console.log("Migration executed via pg/query.");
  }

  await verifyGuestInsert(supabaseUrl, serviceRoleKey);
  console.log("Guest session schema verified.");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  console.error(
    "Run the SQL manually in Supabase SQL Editor if this environment does not have database-management access."
  );
  console.error(
    "SQL file: scripts/sql/20260320_game_sessions_user_id_text.sql"
  );
  process.exit(1);
});
