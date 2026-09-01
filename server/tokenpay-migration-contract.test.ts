import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260827040803_tokenpay_oauth.sql"),
  "utf8",
).toLowerCase();
const databaseTypes = readFileSync(join(process.cwd(), "src/types/database.ts"), "utf8");

test("TokenPay 连接和 OAuth flow 表结构符合一次性 API key 合约", () => {
  assert.match(migration, /create table public\.tokenpay_connections/);
  assert.match(migration, /user_id uuid primary key references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /encrypted_api_key text not null/);
  assert.match(migration, /key_fingerprint text not null/);
  assert.match(migration, /status text not null default 'connected'/);
  assert.match(migration, /status in \('connected', 'reauthorize_required'\)/);
  assert.match(migration, /connected_at timestamptz not null default now\(\)/);
  assert.match(migration, /updated_at timestamptz not null default now\(\)/);

  assert.match(migration, /create table public\.tokenpay_oauth_flows/);
  assert.match(migration, /state_hash text primary key/);
  assert.match(migration, /user_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /encrypted_code_verifier text not null/);
  assert.match(migration, /expires_at timestamptz not null/);
  assert.match(migration, /consumed_at timestamptz/);
  assert.match(migration, /created_at timestamptz not null default now\(\)/);
  assert.match(migration, /create index tokenpay_oauth_flows_expires_idx[\s\S]*on public\.tokenpay_oauth_flows \(expires_at\)/);
});

test("TokenPay 表启用 RLS 且仅向 service_role 暴露", () => {
  for (const table of ["tokenpay_connections", "tokenpay_oauth_flows"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`),
    );
    assert.match(migration, new RegExp(`grant all on table public\\.${table} to service_role`));
  }
});

test("TokenPay 合约不允许保存明文 API key 或 token", () => {
  assert.doesNotMatch(migration, /\bapi_key\s+text\b/);
  assert.doesNotMatch(migration, /\b(?:access|refresh|oauth)_token\b/);
  assert.doesNotMatch(databaseTypes, /\b(?:api_key|access_token|refresh_token|oauth_token)\s*:/);
  assert.match(databaseTypes, /encrypted_api_key: string/);
  assert.match(databaseTypes, /encrypted_code_verifier: string/);
});

test("Database 类型同步暴露两张 TokenPay 表及状态联合类型", () => {
  assert.match(databaseTypes, /tokenpay_connections: \{/);
  assert.match(databaseTypes, /status: "connected" \| "reauthorize_required";/);
  assert.match(databaseTypes, /tokenpay_oauth_flows: \{/);
  assert.match(databaseTypes, /state_hash: string;/);
  assert.match(databaseTypes, /consumed_at: string \| null;/);
});
