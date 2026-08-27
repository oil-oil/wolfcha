-- 幂等多人命令：同一房间内 command_id 只允许成功推进一次版本。
create table if not exists public.multiplayer_commands (
  room_id uuid not null references public.multiplayer_rooms(id) on delete cascade,
  command_id text not null check (char_length(btrim(command_id)) between 1 and 128),
  expected_version bigint not null check (expected_version >= 0),
  result_version bigint not null check (result_version >= 0),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (room_id, command_id)
);

create index if not exists multiplayer_commands_room_created_idx
  on public.multiplayer_commands (room_id, created_at desc);

-- 在同一事务内完成：查重、锁房间并做 CAS、更新快照、记录命令结果及事件。
create or replace function public.apply_multiplayer_command(
  p_room_id uuid,
  p_expected_version bigint,
  p_command_id text,
  p_actor_user_id uuid,
  p_patch jsonb,
  p_event_type text,
  p_event_payload jsonb,
  p_event_visibility text default 'public',
  p_visible_to_user_ids uuid[] default null
)
returns table(version bigint, duplicate boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version bigint;
  v_result_version bigint;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'p_patch must be a JSON object';
  end if;

  -- 只有房间 CAS 成功后才写入命令；房间行锁串行化并发命令。
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
  if not found then
    return;
  end if;

  -- 获取房间行锁后再次查重，避免并发重试在首次查重时尚未提交。
  select c.result_version into v_result_version
    from public.multiplayer_commands c
   where c.room_id = p_room_id and c.command_id = p_command_id;
  if found then
    version := v_result_version;
    duplicate := true;
    return next;
    return;
  end if;
  if v_version <> p_expected_version then
    return;
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
         started_at = case
           when p_patch ? 'startedAt' then (p_patch->>'startedAt')::timestamptz
           when p_patch ? 'started_at' then (p_patch->>'started_at')::timestamptz
           else started_at end,
         finished_at = case
           when p_patch ? 'finishedAt' then (p_patch->>'finishedAt')::timestamptz
           when p_patch ? 'finished_at' then (p_patch->>'finished_at')::timestamptz
           else finished_at end,
         version = public.multiplayer_rooms.version + 1,
         updated_at = now()
   where id = p_room_id;
  v_version := v_version + 1;

  insert into public.multiplayer_commands (
    room_id, command_id, expected_version, result_version, actor_user_id
  ) values (
    p_room_id, p_command_id, p_expected_version, v_version, p_actor_user_id
  );

  insert into public.multiplayer_events (
    room_id, version, type, visibility, visible_to_user_ids, actor_user_id, payload
  ) values (
    p_room_id, v_version, coalesce(p_event_type, 'room_command'),
    coalesce(p_event_visibility, 'public'),
    case when coalesce(p_event_visibility, 'public') = 'private'
      then p_visible_to_user_ids else null end,
    p_actor_user_id, coalesce(p_event_payload, '{}'::jsonb)
  );

  version := v_version;
  duplicate := false;
  return next;
end;
$$;

alter table public.multiplayer_commands enable row level security;
revoke all on table public.multiplayer_commands from public, anon, authenticated;
grant all on table public.multiplayer_commands to service_role;

revoke all on function public.apply_multiplayer_command(
  uuid, bigint, text, uuid, jsonb, text, jsonb, text, uuid[]
) from public, anon, authenticated;
grant execute on function public.apply_multiplayer_command(
  uuid, bigint, text, uuid, jsonb, text, jsonb, text, uuid[]
) to service_role;
