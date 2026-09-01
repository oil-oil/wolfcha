-- TokenPay OAuth 凭证仅以密文存储；OAuth 回调返回的是一次性长期 API key。
create table public.tokenpay_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_api_key text not null,
  key_fingerprint text not null,
  status text not null default 'connected',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tokenpay_connections_status_check
    check (status in ('connected', 'reauthorize_required'))
);

create table public.tokenpay_oauth_flows (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_code_verifier text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index tokenpay_oauth_flows_expires_idx
  on public.tokenpay_oauth_flows (expires_at);

alter table public.tokenpay_connections enable row level security;
alter table public.tokenpay_oauth_flows enable row level security;

revoke all on table public.tokenpay_connections from public, anon, authenticated;
revoke all on table public.tokenpay_oauth_flows from public, anon, authenticated;
grant all on table public.tokenpay_connections to service_role;
grant all on table public.tokenpay_oauth_flows to service_role;
