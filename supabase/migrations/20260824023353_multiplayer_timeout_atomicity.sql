-- 生命周期原子性：超时接管同时更新 server_state、成员身份、房主和事件。

alter table public.multiplayer_rooms
  add column if not exists game_session_owner_id uuid references auth.users(id) on delete set null;

-- owner 是开局时占用额度的用户，不随房主转移。server_state 保留同一字段以兼容
-- 已经由旧 RPC 写入的实例；触发器只允许首次写入，绝不覆盖已持久化 owner。
create or replace function public.sync_multiplayer_game_session_owner()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.game_session_owner_id is null
     and new.server_state is not null
     and (new.server_state->>'gameSessionOwnerId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    new.game_session_owner_id := (new.server_state->>'gameSessionOwnerId')::uuid;
  end if;
  return new;
end;
$$;

drop trigger if exists multiplayer_rooms_sync_game_session_owner on public.multiplayer_rooms;
create trigger multiplayer_rooms_sync_game_session_owner
before insert or update on public.multiplayer_rooms
for each row execute function public.sync_multiplayer_game_session_owner();

create or replace function public.takeover_multiplayer_timeout(
  p_room_id uuid,
  p_expected_version bigint,
  p_command_id text,
  p_actor_user_id uuid,
  p_timed_out_user_ids uuid[],
  p_patch jsonb,
  p_event_type text,
  p_event_payload jsonb
)
returns table(version bigint, duplicate boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version bigint;
  v_result_version bigint;
  v_next_host uuid;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'p_patch must be a JSON object';
  end if;

  select c.result_version into v_result_version
    from public.multiplayer_commands c
   where c.room_id = p_room_id and c.command_id = p_command_id;
  if found then
    version := v_result_version;
    duplicate := true;
    return next;
    return;
  end if;

  select r.version into v_version
    from public.multiplayer_rooms r
   where r.id = p_room_id
   for update;
  if not found then return; end if;

  -- 获取房间锁后再次查重，覆盖两个并发超时请求首次查重都为空的窗口。
  select c.result_version into v_result_version
    from public.multiplayer_commands c
   where c.room_id = p_room_id and c.command_id = p_command_id;
  if found then
    version := v_result_version;
    duplicate := true;
    return next;
    return;
  end if;
  if v_version <> p_expected_version then return; end if;

  -- 只有当前玩家才会被接管；已观战成员的 resume 不会重新占座。
  update public.multiplayer_members
     set role = 'spectator', seat = null, ready = false,
         connected = false, last_seen_at = now()
   where room_id = p_room_id
     and user_id = any(coalesce(p_timed_out_user_ids, '{}'::uuid[]))
     and role <> 'spectator';

  select m.user_id into v_next_host
    from public.multiplayer_members m
   where m.room_id = p_room_id and m.role <> 'spectator'
   order by m.seat asc nulls last, m.created_at asc
   limit 1;

  if v_next_host is not null then
    update public.multiplayer_members
       set role = case when user_id = v_next_host then 'host' else 'player' end
     where room_id = p_room_id and role <> 'spectator';
  end if;

  update public.multiplayer_rooms
     set status = case when p_patch ? 'status' then p_patch->>'status' else status end,
         phase = case when p_patch ? 'phase' then p_patch->>'phase' else phase end,
         day = case when p_patch ? 'day' then (p_patch->>'day')::integer else day end,
         winner = case when p_patch ? 'winner' then p_patch->>'winner' else winner end,
         server_state = case
           when p_patch ? 'serverState' then p_patch->'serverState'
           when p_patch ? 'server_state' then p_patch->'server_state'
           else server_state end,
         public_state = case
           when p_patch ? 'publicState' then p_patch->'publicState'
           when p_patch ? 'public_state' then p_patch->'public_state'
           else public_state end,
         host_user_id = coalesce(v_next_host, host_user_id),
         version = public.multiplayer_rooms.version + 1,
         updated_at = now()
   where id = p_room_id
   returning multiplayer_rooms.version into v_version;

  insert into public.multiplayer_commands (
    room_id, command_id, expected_version, result_version, actor_user_id
  ) values (p_room_id, p_command_id, p_expected_version, v_version, p_actor_user_id);

  insert into public.multiplayer_events (
    room_id, version, type, visibility, visible_to_user_ids, actor_user_id, payload
  ) values (
    p_room_id, v_version, coalesce(p_event_type, 'turn_expired'), 'public', null,
    p_actor_user_id, coalesce(p_event_payload, '{}'::jsonb)
  );

  version := v_version;
  duplicate := false;
  return next;
exception when unique_violation then
  -- 并发重试只能观察到已提交 command 的结果，不能再次推进版本。
  select c.result_version into version
    from public.multiplayer_commands c
   where c.room_id = p_room_id and c.command_id = p_command_id;
  if version is not null then
    duplicate := true;
    return next;
  end if;
  raise;
end;
$$;

revoke all on function public.takeover_multiplayer_timeout(
  uuid, bigint, text, uuid, uuid[], jsonb, text, jsonb
) from public, anon, authenticated;
grant execute on function public.takeover_multiplayer_timeout(
  uuid, bigint, text, uuid, uuid[], jsonb, text, jsonb
) to service_role;
