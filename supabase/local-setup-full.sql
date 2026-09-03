-- ============================================================
-- Wolfcha 本地/自部署完整 schema 初始化
-- 基础表由 src/types/database.ts Row 类型生成；
-- 有仓库权威迁移定义的表/列以迁移为准（base DDL 跳过）；
-- 可重复执行（IF NOT EXISTS / OR REPLACE / drop+重建幂等）。
-- ============================================================
create extension if not exists pgcrypto;

create table if not exists public.user_credits (
  id uuid not null primary key,
  credits integer default 0 not null,
  referral_code text not null,
  referred_by text,
  total_referrals integer default 0 not null,
  last_daily_bonus_at timestamptz default now(),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.user_credits enable row level security;

create table if not exists public.referral_records (
  id uuid not null primary key,
  referrer_id text not null,
  referred_id text not null,
  referral_code text not null,
  credits_granted integer default 0 not null,
  created_at timestamptz default now() not null
);
alter table public.referral_records enable row level security;

create table if not exists public.campaign_daily_quota (
  id uuid default gen_random_uuid() not null primary key,
  user_id text not null,
  campaign_code text not null,
  quota_date text not null,
  granted_quota integer default 0 not null,
  consumed_quota integer default 0 not null,
  expires_at timestamptz not null,
  claimed_at timestamptz default now() not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.campaign_daily_quota enable row level security;

create table if not exists public.demo_config (
  id text not null primary key,
  enabled boolean default false not null,
  starts_at timestamptz default now(),
  expires_at timestamptz default now(),
  updated_at timestamptz default now() not null,
  updated_by text,
  notes text
);
alter table public.demo_config enable row level security;

create table if not exists public.sponsor_clicks (
  id uuid default gen_random_uuid() not null primary key,
  sponsor_id text not null,
  ref text,
  user_agent text,
  created_at timestamptz default now() not null
);
alter table public.sponsor_clicks enable row level security;

create table if not exists public.redemption_codes (
  id uuid not null primary key,
  code text not null,
  credits_amount integer default 0 not null,
  is_redeemed boolean default false not null,
  redeemed_by text,
  redeemed_at timestamptz default now(),
  created_at timestamptz default now() not null
);
alter table public.redemption_codes enable row level security;

create table if not exists public.redemption_records (
  id uuid default gen_random_uuid() not null primary key,
  user_id text not null,
  code text not null,
  credits_granted integer not null,
  created_at timestamptz default now() not null
);
alter table public.redemption_records enable row level security;

create table if not exists public.game_sessions (
  id uuid default gen_random_uuid() not null primary key,
  user_id text not null,
  player_count integer not null,
  difficulty text,
  winner text,
  completed boolean default false not null,
  lifecycle_status text,
  started_at timestamptz default now() not null,
  rounds_played integer default 0 not null,
  duration_seconds integer default 0,
  ai_calls_count integer default 0 not null,
  ai_input_chars integer default 0 not null,
  ai_output_chars integer default 0 not null,
  ai_prompt_tokens integer default 0 not null,
  ai_completion_tokens integer default 0 not null,
  used_custom_key boolean default false not null,
  model_used text,
  user_email text,
  region text,
  created_at timestamptz default now() not null,
  ended_at timestamptz default now()
);
alter table public.game_sessions enable row level security;

create table if not exists public.custom_characters (
  id uuid not null primary key,
  user_id text not null,
  display_name text not null,
  gender text not null,
  age integer not null,
  mbti text not null,
  basic_info text,
  style_label text,
  avatar_seed text,
  is_deleted boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.custom_characters enable row level security;

create table if not exists public.payment_transactions (
  id uuid default gen_random_uuid() not null primary key,
  user_id text not null,
  stripe_session_id text not null,
  stripe_payment_intent_id text,
  amount_cents integer not null,
  currency text not null,
  quantity integer not null,
  credits_added integer not null,
  status text not null,
  created_at timestamptz default now() not null
);
alter table public.payment_transactions enable row level security;

-- demo 配置默认行（demo 模式默认关闭）
insert into public.demo_config (id, enabled) values ('default', false)
  on conflict (id) do nothing;

-- 新用户初始化：注册时创建积分行（初始 1 积分 + 8 位推荐码）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_credits (id, credits, referral_code)
  values (new.id, 1, upper(substr(md5(new.id::text), 1, 8)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ======== scripts/sql/20260320_game_sessions_user_id_text.sql ========
begin;

alter table public.game_sessions
  drop constraint if exists game_sessions_user_id_fkey;

alter table public.game_sessions
  alter column user_id type text using user_id::text;

alter table public.game_sessions
  drop constraint if exists game_sessions_user_id_format_check;

alter table public.game_sessions
  add constraint game_sessions_user_id_format_check
  check (
    user_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or user_id like 'guest_%'
  );

create index if not exists idx_game_sessions_user_id
  on public.game_sessions (user_id);

commit;


-- ======== scripts/sql/20260623_credit_authorized_game_sessions.sql ========
alter table public.game_sessions
  add column if not exists credit_authorized boolean not null default false;

alter table public.game_sessions
  add column if not exists last_activity_at timestamptz;

update public.game_sessions
set last_activity_at = coalesce(ended_at, created_at, now())
where last_activity_at is null;

alter table public.game_sessions
  alter column last_activity_at set default now(),
  alter column last_activity_at set not null;

create index if not exists game_sessions_authorized_active_idx
  on public.game_sessions (user_id, last_activity_at desc)
  where completed = false
    and used_custom_key = false
    and credit_authorized = true;

alter table public.demo_config
  add column if not exists starts_at timestamptz,
  add column if not exists updated_by uuid,
  add column if not exists notes text;

create or replace function public.consume_credit_for_authorized_game_session(
  p_user_id uuid,
  p_player_count integer,
  p_difficulty text default null,
  p_model_used text default null,
  p_user_email text default null,
  p_region text default null
)
returns table(session_id uuid, credits integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits integer;
  v_session_id uuid;
begin
  if p_player_count is null or p_player_count <= 0 then
    raise exception 'invalid_player_count' using errcode = '22023';
  end if;

  select uc.credits
    into v_credits
  from public.user_credits uc
  where uc.id = p_user_id
  for update;

  if not found then
    raise exception 'credits_not_found' using errcode = 'P0002';
  end if;

  if v_credits <= 0 then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  update public.user_credits
  set credits = v_credits - 1,
      updated_at = now()
  where id = p_user_id
  returning user_credits.credits into v_credits;

  insert into public.game_sessions (
    user_id,
    player_count,
    difficulty,
    completed,
    used_custom_key,
    credit_authorized,
    model_used,
    user_email,
    region,
    last_activity_at
  ) values (
    p_user_id::text,
    p_player_count,
    p_difficulty,
    false,
    false,
    true,
    p_model_used,
    p_user_email,
    p_region,
    now()
  )
  returning id into v_session_id;

  return query select v_session_id, v_credits;
end;
$$;


-- ======== supabase/migrations/20260827040803_tokenpay_oauth.sql ========
-- tokenpay 两表若以旧 base DDL 版本存在，drop 后由迁移权威定义重建
drop table if exists public.tokenpay_oauth_flows cascade;
drop table if exists public.tokenpay_connections cascade;

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


-- ======== supabase/migrations/20260830035127_tokenpay_oauth_flow_user_index.sql ========
create index tokenpay_oauth_flows_user_id_idx
  on public.tokenpay_oauth_flows (user_id);


-- ======== supabase/migrations/20260901132040_idempotent_game_start_requests.sql ========
-- 开局请求的幂等键。新列均允许历史记录保持 NULL；只有新 v2 RPC 写入这些列。
alter table public.game_sessions
  add column if not exists start_request_id uuid;

alter table public.game_sessions
  add column if not exists start_request_fingerprint text;

-- source 需要持久化，才能拒绝同一幂等键被另一种扣费来源重放。
alter table public.game_sessions
  add column if not exists start_request_source text;

-- 历史行的 request_id 都是 NULL，使用部分唯一索引即可保证新请求唯一，
-- 同时避免为历史空值创建无意义索引项。生产发布会先在线并发创建同名索引；
-- 这里保留 IF NOT EXISTS，确保全新环境也能完整迁移。
create unique index if not exists game_sessions_user_start_request_uidx
  on public.game_sessions (user_id, start_request_id)
  where start_request_id is not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.game_sessions'::regclass
       and conname = 'game_sessions_start_request_source_check'
  ) then
    alter table public.game_sessions
      add constraint game_sessions_start_request_source_check
      check (
        start_request_source is null
        or start_request_source in ('demo', 'external', 'spring_quota', 'project_credit')
      ) not valid;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.game_sessions'::regclass
       and conname = 'game_sessions_start_request_fields_check'
  ) then
    alter table public.game_sessions
      add constraint game_sessions_start_request_fields_check
      check (
        (start_request_id is null
         and start_request_fingerprint is null
         and start_request_source is null)
        or
        (start_request_id is not null
         and start_request_fingerprint is not null
         and start_request_source is not null
         and start_request_fingerprint ~ '^[0-9a-f]{64}$')
      ) not valid;
  end if;
end;
$$;

alter table public.game_sessions
  validate constraint game_sessions_start_request_source_check;

alter table public.game_sessions
  validate constraint game_sessions_start_request_fields_check;

-- 新 RPC 使用 security invoker：只有明确获授 execute 的 service_role 可以调用，
-- 由 service_role 自身的表权限完成事务内读写。旧 RPC 保留给迁移期间的旧应用。
create or replace function public.consume_credit_for_authorized_game_session_v2(
  p_user_id uuid,
  p_player_count integer,
  p_difficulty text default null,
  p_model_used text default null,
  p_user_email text default null,
  p_region text default null,
  p_start_request_id uuid default null,
  p_start_request_fingerprint text default null
)
returns table(session_id uuid, credits integer, replayed boolean)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_credits integer;
  v_session_id uuid;
  v_existing_fingerprint text;
  v_existing_source text;
begin
  if p_player_count is null or p_player_count <= 0 then
    raise exception 'invalid_player_count' using errcode = '22023';
  end if;

  if p_start_request_id is null
     or p_start_request_fingerprint is null
     or p_start_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_idempotency_request' using errcode = '22023';
  end if;

  -- 先锁额度行，保证同一用户的并发扣费请求串行化。
  select uc.credits
    into v_credits
    from public.user_credits uc
   where uc.id = p_user_id
   for update;

  if not found then
    raise exception 'credits_not_found' using errcode = 'P0002';
  end if;

  -- 必须先查重放，再检查余额；重放不得因当前余额变化而再次扣费或失败。
  select gs.id, gs.start_request_fingerprint, gs.start_request_source
    into v_session_id, v_existing_fingerprint, v_existing_source
    from public.game_sessions gs
   where gs.user_id = p_user_id::text
     and gs.start_request_id = p_start_request_id
   for update;

  if found then
    if v_existing_fingerprint is distinct from p_start_request_fingerprint
       or v_existing_source is distinct from 'project_credit' then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;

    return query select v_session_id, v_credits, true;
    return;
  end if;

  if v_credits <= 0 then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  update public.user_credits
     set credits = v_credits - 1,
         updated_at = now()
   where id = p_user_id
   returning user_credits.credits into v_credits;

  insert into public.game_sessions (
    user_id,
    player_count,
    difficulty,
    completed,
    used_custom_key,
    credit_authorized,
    model_used,
    user_email,
    region,
    start_request_id,
    start_request_fingerprint,
    start_request_source,
    last_activity_at
  ) values (
    p_user_id::text,
    p_player_count,
    p_difficulty,
    false,
    false,
    true,
    p_model_used,
    p_user_email,
    p_region,
    p_start_request_id,
    p_start_request_fingerprint,
    'project_credit',
    now()
  )
  returning id into v_session_id;

  return query select v_session_id, v_credits, false;
end;
$$;

-- 春季额度必须和 session 写入处于同一个函数事务；函数失败时两者一并回滚。
create or replace function public.consume_spring_quota_for_authorized_game_session_v2(
  p_user_id uuid,
  p_campaign_code text,
  p_quota_date date,
  p_player_count integer,
  p_difficulty text default null,
  p_model_used text default null,
  p_user_email text default null,
  p_region text default null,
  p_start_request_id uuid default null,
  p_start_request_fingerprint text default null
)
returns table(
  session_id uuid,
  granted_quota integer,
  consumed_quota integer,
  expires_at timestamptz,
  replayed boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_session_id uuid;
  v_existing_fingerprint text;
  v_existing_source text;
  v_granted_quota integer;
  v_consumed_quota integer;
  v_expires_at timestamptz;
begin
  if p_player_count is null or p_player_count <= 0 then
    raise exception 'invalid_player_count' using errcode = '22023';
  end if;

  if p_campaign_code is null
     or btrim(p_campaign_code) = ''
     or p_quota_date is null
     or p_start_request_id is null
     or p_start_request_fingerprint is null
     or p_start_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_idempotency_request' using errcode = '22023';
  end if;

  -- 先锁 quota 行；同一 quota 的并发请求会在这里串行化。
  select q.granted_quota, q.consumed_quota, q.expires_at
    into v_granted_quota, v_consumed_quota, v_expires_at
    from public.campaign_daily_quota q
   where q.user_id = p_user_id
     and q.campaign_code = p_campaign_code
     and q.quota_date = p_quota_date
   for update;

  if not found then
    raise exception 'spring_quota_not_found' using errcode = 'P0002';
  end if;

  -- 重放返回原 session 和当前 quota 状态；不可因 quota 已过期/耗尽而重复扣除。
  select gs.id, gs.start_request_fingerprint, gs.start_request_source
    into v_session_id, v_existing_fingerprint, v_existing_source
    from public.game_sessions gs
   where gs.user_id = p_user_id::text
     and gs.start_request_id = p_start_request_id
   for update;

  if found then
    if v_existing_fingerprint is distinct from p_start_request_fingerprint
       or v_existing_source is distinct from 'spring_quota' then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;

    return query
      select v_session_id,
             v_granted_quota,
             v_consumed_quota,
             v_expires_at,
             true;
    return;
  end if;

  if v_expires_at <= now() then
    raise exception 'spring_quota_expired' using errcode = 'P0001';
  end if;

  if v_consumed_quota >= v_granted_quota then
    raise exception 'insufficient_spring_quota' using errcode = 'P0001';
  end if;

  update public.campaign_daily_quota
     set consumed_quota = v_consumed_quota + 1,
         updated_at = now()
   where user_id = p_user_id
     and campaign_code = p_campaign_code
     and quota_date = p_quota_date;

  insert into public.game_sessions (
    user_id,
    player_count,
    difficulty,
    completed,
    used_custom_key,
    credit_authorized,
    model_used,
    user_email,
    region,
    start_request_id,
    start_request_fingerprint,
    start_request_source,
    last_activity_at
  ) values (
    p_user_id::text,
    p_player_count,
    p_difficulty,
    false,
    false,
    true,
    p_model_used,
    p_user_email,
    p_region,
    p_start_request_id,
    p_start_request_fingerprint,
    'spring_quota',
    now()
  )
  returning id into v_session_id;

  return query
    select v_session_id,
           v_granted_quota,
           v_consumed_quota + 1,
           v_expires_at,
           false;
end;
$$;

revoke all on function public.consume_credit_for_authorized_game_session_v2(
  uuid, integer, text, text, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.consume_credit_for_authorized_game_session_v2(
  uuid, integer, text, text, text, text, uuid, text
) to service_role;

revoke all on function public.consume_spring_quota_for_authorized_game_session_v2(
  uuid, text, date, integer, text, text, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.consume_spring_quota_for_authorized_game_session_v2(
  uuid, text, date, integer, text, text, text, text, uuid, text
) to service_role;


-- ======== supabase/migrations/20260901142328_session_lifecycle_and_ai_attempts.sql ========
-- game_session_events 若以旧 base DDL 版本存在，drop 后由迁移权威定义重建
drop table if exists public.game_session_events cascade;

-- 游戏会话可观测性只保留一张结构化事件表。
-- 不保存 prompt、response、API key 或玩家身份/角色等内容。

-- 运行时代码已全部切换到 security-invoker v2。删除仍向匿名角色开放的
-- 旧 SECURITY DEFINER 扣费入口，避免绕过服务端 API 直接指定任意用户扣费。
drop function if exists public.consume_credit_for_authorized_game_session(
  uuid, integer, text, text, text, text
);

alter table public.game_sessions
  add column if not exists lifecycle_status text,
  add column if not exists started_at timestamptz;

update public.game_sessions
   set lifecycle_status = case
         when completed then 'completed'
         when last_activity_at >= now() - interval '24 hours' then 'running'
         else 'abandoned'
       end,
       started_at = coalesce(started_at, created_at)
 where lifecycle_status is null
    or started_at is null;

alter table public.game_sessions
  alter column lifecycle_status set default 'starting',
  alter column lifecycle_status set not null,
  alter column started_at set default now(),
  alter column started_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.game_sessions'::regclass
       and conname = 'game_sessions_lifecycle_status_check'
  ) then
    alter table public.game_sessions
      add constraint game_sessions_lifecycle_status_check
      check (lifecycle_status in ('starting', 'running', 'failed', 'abandoned', 'completed'));
  end if;
end;
$$;

create index if not exists game_sessions_lifecycle_status_activity_idx
  on public.game_sessions (lifecycle_status, last_activity_at desc);

create index if not exists game_sessions_user_started_idx
  on public.game_sessions (user_id, started_at desc);

create table if not exists public.game_session_events (
  event_id uuid primary key default gen_random_uuid(),
  session_id uuid references public.game_sessions(id) on delete cascade,
  user_id text not null,
  event_type text not null
    check (event_type in ('lifecycle', 'credit_consume', 'ai_attempt')),
  lifecycle_status text,
  request_id text,
  attempt integer not null default 1 check (attempt > 0),
  provider text,
  prompt_scope text,
  mode text,
  outcome text,
  http_status integer,
  duration_ms integer not null default 0 check (duration_ms >= 0),
  error_code text,
  model text,
  input_chars integer not null default 0 check (input_chars >= 0),
  output_chars integer not null default 0 check (output_chars >= 0),
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  created_at timestamptz not null default now(),
  constraint game_session_events_lifecycle_status_check
    check (lifecycle_status is null or lifecycle_status in (
      'starting', 'running', 'failed', 'abandoned', 'completed'
    )),
  constraint game_session_events_structured_shape_check
    check (
      (
        event_type = 'lifecycle'
        and session_id is not null
        and lifecycle_status is not null
        and outcome = lifecycle_status
        and request_id is null
        and provider is null
        and prompt_scope is null
        and mode is null
        and http_status is null
        and duration_ms = 0
        and error_code is null
        and model is null
        and input_chars = 0
        and output_chars = 0
        and prompt_tokens = 0
        and completion_tokens = 0
      )
      or
      (
        event_type = 'credit_consume'
        and lifecycle_status is null
        and outcome in ('success', 'replay', 'reject')
        and request_id is not null
        and provider is null
        and prompt_scope is null
        and mode is null
        and http_status is null
        and duration_ms = 0
        and (error_code is null or outcome = 'reject')
        and model is null
        and input_chars = 0
        and output_chars = 0
        and prompt_tokens = 0
        and completion_tokens = 0
      )
      or
      (
        event_type = 'ai_attempt'
        and session_id is not null
        and lifecycle_status is null
        and request_id is not null
        and provider is not null
        and prompt_scope is not null
        and mode is not null
        and outcome in ('success', 'http_error', 'network_error', 'cancelled', 'interrupted', 'error')
        and model is not null
      )
    ),
  constraint game_session_events_provider_check
    check (provider is null or provider in ('zenmux', 'dashscope', 'tokendance')),
  constraint game_session_events_prompt_scope_check
    check (prompt_scope is null or prompt_scope in ('gameplay', 'utility')),
  constraint game_session_events_mode_check
    check (mode is null or mode in ('completion', 'batch', 'stream')),
  constraint game_session_events_outcome_check
    check (outcome is null or outcome in (
      'starting', 'running', 'failed', 'abandoned', 'completed',
      'success', 'replay', 'reject',
      'http_error', 'network_error', 'cancelled', 'interrupted', 'error'
    )),
  constraint game_session_events_http_status_check
    check (http_status is null or http_status between 100 and 599),
  constraint game_session_events_request_id_length_check
    check (request_id is null or char_length(btrim(request_id)) between 1 and 128),
  constraint game_session_events_error_code_length_check
    check (error_code is null or char_length(btrim(error_code)) between 1 and 128),
  constraint game_session_events_model_length_check
    check (model is null or char_length(btrim(model)) between 1 and 256)
);

create index if not exists game_session_events_session_created_idx
  on public.game_session_events (session_id, created_at desc);

create index if not exists game_session_events_request_created_idx
  on public.game_session_events (user_id, request_id, created_at desc)
  where request_id is not null;

alter table public.game_session_events enable row level security;
revoke all on table public.game_session_events from public, anon, authenticated;
grant all on table public.game_session_events to service_role;

-- 生命周期事件由 game_sessions 的真实状态变化自动产生。触发器和状态写入
-- 处于同一事务，因此不会漏记迁移，也不会把 running 心跳误记成状态变化。
create or replace function public.record_game_session_lifecycle_event()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.lifecycle_status is not distinct from new.lifecycle_status then
      return new;
    end if;
  end if;

  insert into public.game_session_events (
    session_id,
    user_id,
    event_type,
    lifecycle_status,
    outcome
  ) values (
    new.id,
    new.user_id,
    'lifecycle',
    new.lifecycle_status,
    new.lifecycle_status
  );
  return new;
end;
$$;

revoke all on function public.record_game_session_lifecycle_event() from public, anon, authenticated;
grant execute on function public.record_game_session_lifecycle_event() to service_role;

drop trigger if exists game_sessions_lifecycle_event_trigger on public.game_sessions;
create trigger game_sessions_lifecycle_event_trigger
after insert or update of lifecycle_status on public.game_sessions
for each row execute function public.record_game_session_lifecycle_event();

-- AI attempt 的 event_id 是幂等键。session 行锁同时保证事件写入和累计值在
-- 同一个函数事务中完成；函数失败时两者一起回滚。
create or replace function public.record_game_session_ai_attempt(
  p_event_id uuid,
  p_session_id uuid,
  p_user_id text,
  p_request_id text,
  p_attempt integer,
  p_provider text,
  p_prompt_scope text,
  p_mode text,
  p_outcome text,
  p_http_status integer,
  p_duration_ms integer,
  p_error_code text,
  p_model text,
  p_input_chars integer,
  p_output_chars integer,
  p_prompt_tokens integer,
  p_completion_tokens integer
)
returns table(event_id uuid, replayed boolean)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_session_user_id text;
  v_existing_event_id uuid;
  v_existing_session_id uuid;
  v_existing_user_id text;
  v_existing_event_type text;
  v_existing_request_id text;
  v_existing_attempt integer;
  v_existing_provider text;
  v_existing_prompt_scope text;
  v_existing_mode text;
  v_existing_outcome text;
  v_existing_http_status integer;
  v_existing_duration_ms integer;
  v_existing_error_code text;
  v_existing_model text;
  v_existing_input_chars integer;
  v_existing_output_chars integer;
  v_existing_prompt_tokens integer;
  v_existing_completion_tokens integer;
begin
  if p_event_id is null
     or p_session_id is null
     or p_user_id is null
     or btrim(p_user_id) = ''
     or p_request_id is null
     or btrim(p_request_id) = ''
     or p_attempt is null
     or p_attempt <= 0
     or p_provider is null
     or p_provider not in ('zenmux', 'dashscope', 'tokendance')
     or p_prompt_scope is null
     or p_prompt_scope not in ('gameplay', 'utility')
     or p_mode is null
     or p_mode not in ('completion', 'batch', 'stream')
     or p_outcome is null
     or p_outcome not in ('success', 'http_error', 'network_error', 'cancelled', 'interrupted', 'error')
     or p_http_status is not null and (p_http_status < 100 or p_http_status > 599)
     or p_duration_ms is null
     or p_duration_ms < 0
     or p_error_code is not null and btrim(p_error_code) = ''
     or p_model is null
     or btrim(p_model) = ''
     or p_input_chars is null
     or p_input_chars < 0
     or p_output_chars is null
     or p_output_chars < 0
     or p_prompt_tokens is null
     or p_prompt_tokens < 0
     or p_completion_tokens is null
     or p_completion_tokens < 0 then
    raise exception 'invalid_game_session_ai_attempt' using errcode = '22023';
  end if;

  -- 先锁并验证 session，禁止把别人的 session 作为写入目标。
  select gs.user_id
    into v_session_user_id
    from public.game_sessions gs
   where gs.id = p_session_id
   for update;

  if not found then
    raise exception 'game_session_not_found' using errcode = 'P0002';
  end if;

  if v_session_user_id is distinct from p_user_id then
    raise exception 'game_session_user_mismatch' using errcode = '42501';
  end if;

  insert into public.game_session_events (
    event_id,
    session_id,
    user_id,
    event_type,
    request_id,
    attempt,
    provider,
    prompt_scope,
    mode,
    outcome,
    http_status,
    duration_ms,
    error_code,
    model,
    input_chars,
    output_chars,
    prompt_tokens,
    completion_tokens
  ) values (
    p_event_id,
    p_session_id,
    p_user_id,
    'ai_attempt',
    p_request_id,
    p_attempt,
    p_provider,
    p_prompt_scope,
    p_mode,
    p_outcome,
    p_http_status,
    p_duration_ms,
    p_error_code,
    p_model,
    p_input_chars,
    p_output_chars,
    p_prompt_tokens,
    p_completion_tokens
  )
  on conflict on constraint game_session_events_pkey do nothing;

  if not found then
    -- 同一 event_id 的重放必须完全匹配原 attempt，且不能再次累加。
    select e.event_id,
           e.session_id,
           e.user_id,
           e.event_type,
           e.request_id,
           e.attempt,
           e.provider,
           e.prompt_scope,
           e.mode,
           e.outcome,
           e.http_status,
           e.duration_ms,
           e.error_code,
           e.model,
           e.input_chars,
           e.output_chars,
           e.prompt_tokens,
           e.completion_tokens
      into v_existing_event_id,
           v_existing_session_id,
           v_existing_user_id,
           v_existing_event_type,
           v_existing_request_id,
           v_existing_attempt,
           v_existing_provider,
           v_existing_prompt_scope,
           v_existing_mode,
           v_existing_outcome,
           v_existing_http_status,
           v_existing_duration_ms,
           v_existing_error_code,
           v_existing_model,
           v_existing_input_chars,
           v_existing_output_chars,
           v_existing_prompt_tokens,
           v_existing_completion_tokens
      from public.game_session_events e
     where e.event_id = p_event_id
     for update;

    if v_existing_session_id is distinct from p_session_id
       or v_existing_user_id is distinct from p_user_id
       or v_existing_event_type is distinct from 'ai_attempt'
       or v_existing_request_id is distinct from p_request_id
       or v_existing_attempt is distinct from p_attempt
       or v_existing_provider is distinct from p_provider
       or v_existing_prompt_scope is distinct from p_prompt_scope
       or v_existing_mode is distinct from p_mode
       or v_existing_outcome is distinct from p_outcome
       or v_existing_http_status is distinct from p_http_status
       or v_existing_duration_ms is distinct from p_duration_ms
       or v_existing_error_code is distinct from p_error_code
       or v_existing_model is distinct from p_model
       or v_existing_input_chars is distinct from p_input_chars
       or v_existing_output_chars is distinct from p_output_chars
       or v_existing_prompt_tokens is distinct from p_prompt_tokens
       or v_existing_completion_tokens is distinct from p_completion_tokens then
      raise exception 'game_session_ai_attempt_idempotency_conflict' using errcode = 'P0001';
    end if;

    event_id := p_event_id;
    replayed := true;
    return next;
    return;
  end if;

  update public.game_sessions
     set ai_calls_count = coalesce(ai_calls_count, 0) + 1,
         ai_input_chars = coalesce(ai_input_chars, 0) + p_input_chars,
         ai_output_chars = coalesce(ai_output_chars, 0) + p_output_chars,
         ai_prompt_tokens = coalesce(ai_prompt_tokens, 0) + p_prompt_tokens,
         ai_completion_tokens = coalesce(ai_completion_tokens, 0) + p_completion_tokens,
         last_activity_at = now()
   where id = p_session_id
     and user_id = p_user_id;

  if not found then
    raise exception 'game_session_update_failed' using errcode = 'P0002';
  end if;

  event_id := p_event_id;
  replayed := false;
  return next;
end;
$$;

revoke all on function public.record_game_session_ai_attempt(
  uuid, uuid, text, text, integer, text, text, text, text, integer, integer, text,
  text, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.record_game_session_ai_attempt(
  uuid, uuid, text, text, integer, text, text, text, text, integer, integer, text,
  text, integer, integer, integer, integer
) to service_role;


-- ======== supabase/migrations/20260902000000_allow_custom_provider_in_ai_attempts.sql ========
-- 放宽 game_session_events.provider 的取值约束，允许自定义 OpenAI 兼容
-- Provider（provider = 'custom'）。其余取值保持不变。
alter table public.game_session_events
  drop constraint if exists game_session_events_provider_check;

alter table public.game_session_events
  add constraint game_session_events_provider_check
    check (provider is null or provider in ('zenmux', 'dashscope', 'tokendance', 'custom'));

-- ======== supabase/migrations/20260902010000_allow_custom_provider_in_ai_attempt_rpc.sql ========
-- 让自定义 OpenAI 兼容 Provider（provider = 'custom'）写入对局可观测性事件。
--
-- 20260901142328_session_lifecycle_and_ai_attempts.sql 里的 RPC 白名单只允许
-- zenmux/dashscope/tokendance；加 custom 支持后，走自定义 Key 的对局调用
-- 会被 RPC 以 invalid_game_session_ai_attempt 拒绝（开局角色生成会失败回滚）。
-- 本迁移：放宽表约束 + 重建 RPC（provider 白名单加 custom；prompt/completion
-- token 允许 NULL 时归零，因为部分自定义 Provider 的流式响应无 usage 统计）。

-- 1) 宽表约束
alter table public.game_session_events
  drop constraint if exists game_session_events_provider_check;

alter table public.game_session_events
  add constraint game_session_events_provider_check
    check (provider is null or provider in ('zenmux', 'dashscope', 'tokendance', 'custom'));

-- 2) 重建 RPC，放开 custom + 允许 token 为 NULL
create or replace function public.record_game_session_ai_attempt(
  p_event_id uuid,
  p_session_id uuid,
  p_user_id text,
  p_request_id text,
  p_attempt integer,
  p_provider text,
  p_prompt_scope text,
  p_mode text,
  p_outcome text,
  p_http_status integer,
  p_duration_ms integer,
  p_error_code text,
  p_model text,
  p_input_chars integer,
  p_output_chars integer,
  p_prompt_tokens integer,
  p_completion_tokens integer
)
returns table(event_id uuid, replayed boolean)
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_session_user_id text;
  v_existing_event_id uuid;
  v_existing_session_id uuid;
  v_existing_user_id text;
  v_existing_event_type text;
  v_existing_request_id text;
  v_existing_attempt integer;
  v_existing_provider text;
  v_existing_prompt_scope text;
  v_existing_mode text;
  v_existing_outcome text;
  v_existing_http_status integer;
  v_existing_duration_ms integer;
  v_existing_error_code text;
  v_existing_model text;
  v_existing_input_chars integer;
  v_existing_output_chars integer;
  v_existing_prompt_tokens integer;
  v_existing_completion_tokens integer;
begin
  if p_event_id is null
     or p_session_id is null
     or p_user_id is null
     or btrim(p_user_id) = ''
     or p_request_id is null
     or btrim(p_request_id) = ''
     or p_attempt is null
     or p_attempt <= 0
     or p_provider is null
     or p_provider not in ('zenmux', 'dashscope', 'tokendance', 'custom')
     or p_prompt_scope is null
     or p_prompt_scope not in ('gameplay', 'utility')
     or p_mode is null
     or p_mode not in ('completion', 'batch', 'stream')
     or p_outcome is null
     or p_outcome not in ('success', 'http_error', 'network_error', 'cancelled', 'interrupted', 'error')
     or p_http_status is not null and (p_http_status < 100 or p_http_status > 599)
     or p_duration_ms is null
     or p_duration_ms < 0
     or p_error_code is not null and btrim(p_error_code) = ''
     or p_model is null
     or btrim(p_model) = ''
     or p_input_chars is null
     or p_input_chars < 0
     or p_output_chars is null
     or p_output_chars < 0 then
    raise exception 'invalid_game_session_ai_attempt' using errcode = '22023';
  end if;

  -- 先锁并验证 session，禁止把别人的 session 作为写入目标。
  select gs.user_id
    into v_session_user_id
    from public.game_sessions gs
   where gs.id = p_session_id
   for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_session_user_id is distinct from p_user_id then
    raise exception 'session_user_mismatch' using errcode = '22023';
  end if;

  select ge.event_id, ge.session_id, ge.user_id, ge.event_type, ge.request_id,
         ge.attempt, ge.provider, ge.prompt_scope, ge.mode, ge.outcome,
         ge.http_status, ge.duration_ms, ge.error_code, ge.model,
         ge.input_chars, ge.output_chars, ge.prompt_tokens, ge.completion_tokens
    into v_existing_event_id, v_existing_session_id, v_existing_user_id,
         v_existing_event_type, v_existing_request_id, v_existing_attempt,
         v_existing_provider, v_existing_prompt_scope, v_existing_mode,
         v_existing_outcome, v_existing_http_status, v_existing_duration_ms,
         v_existing_error_code, v_existing_model, v_existing_input_chars,
         v_existing_output_chars, v_existing_prompt_tokens, v_existing_completion_tokens
    from public.game_session_events ge
   where ge.event_id = p_event_id
   for update;

  if found then
    -- 同一 event_id 重放：只有字段完全一致才幂等返回，否则视为异常。
    if v_existing_session_id is distinct from p_session_id
       or v_existing_user_id is distinct from p_user_id
       or v_existing_event_type is distinct from 'ai_attempt'
       or v_existing_request_id is distinct from p_request_id
       or v_existing_attempt is distinct from p_attempt
       or v_existing_provider is distinct from p_provider
       or v_existing_prompt_scope is distinct from p_prompt_scope
       or v_existing_mode is distinct from p_mode
       or v_existing_outcome is distinct from p_outcome
       or v_existing_http_status is distinct from p_http_status
       or v_existing_duration_ms is distinct from p_duration_ms
       or v_existing_error_code is distinct from p_error_code
       or v_existing_model is distinct from p_model
       or v_existing_input_chars is distinct from p_input_chars
       or v_existing_output_chars is distinct from p_output_chars
       or v_existing_prompt_tokens is distinct from p_prompt_tokens
       or v_existing_completion_tokens is distinct from p_completion_tokens then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;

    return query select p_event_id, true;
    return;
  end if;

  insert into public.game_session_events (
    event_id, session_id, user_id, event_type, request_id, attempt,
    provider, prompt_scope, mode, outcome, http_status, duration_ms,
    error_code, model, input_chars, output_chars, prompt_tokens,
    completion_tokens, created_at
  ) values (
    p_event_id, p_session_id, p_user_id, 'ai_attempt', p_request_id, p_attempt,
    p_provider, p_prompt_scope, p_mode, p_outcome, p_http_status, p_duration_ms,
    p_error_code, p_model, p_input_chars, p_output_chars,
    coalesce(p_prompt_tokens, 0), coalesce(p_completion_tokens, 0),
    now()
  );

  return query select p_event_id, false;
end;
$$;

grant execute on function public.record_game_session_ai_attempt(
  uuid, uuid, text, text, integer, text, text, text, text, integer,
  integer, text, text, integer, integer, integer, integer
) to service_role;
