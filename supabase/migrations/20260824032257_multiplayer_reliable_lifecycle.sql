-- 多人开局、结算和 AI 用量都必须是可恢复的数据库事务。

create or replace function public.start_multiplayer_room(
  p_room_id uuid,
  p_expected_version bigint,
  p_session_id uuid,
  p_user_id uuid,
  p_patch jsonb,
  p_event_type text,
  p_event_payload jsonb
)
returns table(version bigint, authorized boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version bigint;
  v_host_user_id uuid;
  v_status text;
  v_claim public.multiplayer_game_session_claims%rowtype;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'p_patch must be a JSON object';
  end if;

  select r.version, r.host_user_id, r.status
    into v_version, v_host_user_id, v_status
    from public.multiplayer_rooms r
   where r.id = p_room_id
   for update;
  if not found or v_version <> p_expected_version or v_host_user_id <> p_user_id or v_status <> 'lobby' then
    return;
  end if;

  update public.multiplayer_game_session_claims
     set released_at = now()
   where released_at is null
     and expires_at <= now()
     and exists (
       select 1 from public.multiplayer_rooms r
        where r.id = multiplayer_game_session_claims.room_id
          and r.status in ('lobby', 'closed', 'finished')
     );

  select * into v_claim
    from public.multiplayer_game_session_claims c
   where c.session_id = p_session_id
   for update;

  if found and v_claim.released_at is null then
    if v_claim.room_id <> p_room_id or v_claim.user_id <> p_user_id then
      version := v_version;
      authorized := false;
      return next;
      return;
    end if;
  else
    perform 1 from public.game_sessions gs
     where gs.id = p_session_id
       and gs.user_id::text = p_user_id::text
       and gs.completed = false
       and gs.used_custom_key = false
       and gs.credit_authorized = true
       and gs.last_activity_at >= now() - interval '4 hours'
     for update;
    if not found then
      version := v_version;
      authorized := false;
      return next;
      return;
    end if;

    if exists (
      select 1 from public.multiplayer_game_session_claims c
       where c.room_id = p_room_id and c.released_at is null and c.session_id <> p_session_id
    ) then
      version := v_version;
      authorized := false;
      return next;
      return;
    end if;

    insert into public.multiplayer_game_session_claims (
      session_id, room_id, user_id, claimed_at, expires_at, released_at
    ) values (
      p_session_id, p_room_id, p_user_id, now(), now() + interval '4 hours', null
    )
    on conflict (session_id) do update set
      room_id = excluded.room_id,
      user_id = excluded.user_id,
      claimed_at = excluded.claimed_at,
      expires_at = excluded.expires_at,
      released_at = null;
  end if;

  update public.multiplayer_rooms
     set status = p_patch->>'status',
         phase = p_patch->>'phase',
         day = (p_patch->>'day')::integer,
         winner = case when p_patch ? 'winner' then p_patch->>'winner' else winner end,
         server_state = p_patch->'serverState',
         public_state = p_patch->'publicState',
         game_session_owner_id = p_user_id,
         started_at = (p_patch->>'startedAt')::timestamptz,
         version = public.multiplayer_rooms.version + 1,
         updated_at = now()
   where id = p_room_id
   returning multiplayer_rooms.version into v_version;

  update public.game_sessions set last_activity_at = now() where id = p_session_id;

  insert into public.multiplayer_events (
    room_id, version, type, visibility, visible_to_user_ids, actor_user_id, payload
  ) values (
    p_room_id, v_version, coalesce(p_event_type, 'room_started'),
    'public', null, p_user_id, coalesce(p_event_payload, '{}'::jsonb)
  );

  version := v_version;
  authorized := true;
  return next;
exception when unique_violation then
  version := v_version;
  authorized := false;
  return next;
end;
$$;

revoke all on function public.start_multiplayer_room(
  uuid, bigint, uuid, uuid, jsonb, text, jsonb
) from public, anon, authenticated;
grant execute on function public.start_multiplayer_room(
  uuid, bigint, uuid, uuid, jsonb, text, jsonb
) to service_role;

-- 每次真实发出的模型请求单独原子累加；即使房间状态 CAS 失败，也保留已产生的成本。
create or replace function public.increment_multiplayer_ai_usage(
  p_session_id uuid,
  p_calls integer,
  p_input_chars integer,
  p_output_chars integer,
  p_prompt_tokens integer,
  p_completion_tokens integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_calls is null
    or p_input_chars is null
    or p_output_chars is null
    or p_prompt_tokens is null
    or p_completion_tokens is null
    or p_calls < 0
    or p_input_chars < 0
    or p_output_chars < 0
    or p_prompt_tokens < 0
    or p_completion_tokens < 0 then
    raise exception 'AI usage increments must be non-negative';
  end if;

  update public.game_sessions
     set ai_calls_count = coalesce(ai_calls_count, 0) + p_calls,
         ai_input_chars = coalesce(ai_input_chars, 0) + p_input_chars,
         ai_output_chars = coalesce(ai_output_chars, 0) + p_output_chars,
         ai_prompt_tokens = coalesce(ai_prompt_tokens, 0) + p_prompt_tokens,
         ai_completion_tokens = coalesce(ai_completion_tokens, 0) + p_completion_tokens,
         last_activity_at = now()
   where id = p_session_id;
  return found;
end;
$$;

revoke all on function public.increment_multiplayer_ai_usage(
  uuid, integer, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.increment_multiplayer_ai_usage(
  uuid, integer, integer, integer, integer, integer
) to service_role;

create or replace function public.complete_multiplayer_game_session()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session_id uuid;
begin
  if new.status <> 'finished' or old.status = 'finished' then return new; end if;
  if not ((new.server_state->>'gameSessionId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
    return new;
  end if;
  v_session_id := (new.server_state->>'gameSessionId')::uuid;
  update public.game_sessions
     set completed = true,
         winner = case when new.winner = 'village' then 'villager' else 'wolf' end,
         rounds_played = new.day,
         ended_at = now(),
         last_activity_at = now()
   where id = v_session_id and completed = false;
  if not found then
    if not exists (select 1 from public.game_sessions where id = v_session_id and completed = true) then
      raise exception 'multiplayer game session % cannot be completed', v_session_id;
    end if;
  end if;
  update public.multiplayer_game_session_claims
     set released_at = coalesce(released_at, now())
   where session_id = v_session_id;
  return new;
end;
$$;

drop trigger if exists multiplayer_rooms_complete_game_session on public.multiplayer_rooms;
create trigger multiplayer_rooms_complete_game_session
after update of status on public.multiplayer_rooms
for each row execute function public.complete_multiplayer_game_session();

revoke all on function public.complete_multiplayer_game_session() from public, anon, authenticated;

create or replace function public.set_multiplayer_finished_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'finished' and old.status <> 'finished' then
    new.finished_at := coalesce(new.finished_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists multiplayer_rooms_set_finished_at on public.multiplayer_rooms;
create trigger multiplayer_rooms_set_finished_at
before update of status on public.multiplayer_rooms
for each row execute function public.set_multiplayer_finished_at();

-- 修复触发器上线前可能已经结束但未完成结算的房间，避免旧 claim 过期后额度被复用。
update public.game_sessions gs
   set completed = true,
       winner = case when r.winner = 'village' then 'villager' else 'wolf' end,
       rounds_played = r.day,
       ended_at = coalesce(gs.ended_at, r.finished_at, now()),
       last_activity_at = now()
  from public.multiplayer_rooms r
 where r.status = 'finished'
   and (r.server_state->>'gameSessionId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   and gs.id = (r.server_state->>'gameSessionId')::uuid
   and gs.completed = false;

update public.multiplayer_game_session_claims c
   set released_at = coalesce(c.released_at, now())
 where exists (
   select 1 from public.game_sessions gs
    where gs.id = c.session_id and gs.completed = true
 );

create or replace function public.purge_multiplayer_history(p_retention_days integer default 30)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted bigint;
begin
  if p_retention_days < 7 or p_retention_days > 3650 then
    raise exception 'retention days must be between 7 and 3650';
  end if;
  with deleted as (
    delete from public.multiplayer_rooms
     where status <> 'in_game'
       and coalesce(finished_at, updated_at) < now() - make_interval(days => p_retention_days)
     returning id
  )
  select count(*) into v_deleted from deleted;
  return v_deleted;
end;
$$;

revoke all on function public.purge_multiplayer_history(integer) from public, anon, authenticated;
grant execute on function public.purge_multiplayer_history(integer) to service_role;
