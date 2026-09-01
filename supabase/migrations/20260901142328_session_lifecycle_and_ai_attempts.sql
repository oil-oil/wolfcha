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
