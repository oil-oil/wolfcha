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
