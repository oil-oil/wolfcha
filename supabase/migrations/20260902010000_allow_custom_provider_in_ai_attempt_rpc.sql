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
