-- 多人生命周期加固：原子退出/房主转移，以及可释放、可过期的局数占用。

create or replace function public.leave_multiplayer_room(
  p_room_id uuid,
  p_user_id uuid,
  p_expected_version bigint,
  p_patch jsonb,
  p_event_type text,
  p_event_payload jsonb
)
returns table(version bigint)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version bigint;
  v_next_host uuid;
  v_remaining integer;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'p_patch must be a JSON object';
  end if;

  select r.version into v_version
    from public.multiplayer_rooms r
   where r.id = p_room_id
   for update;
  if not found or v_version <> p_expected_version then return; end if;

  if not exists (
    select 1 from public.multiplayer_members m
     where m.room_id = p_room_id and m.user_id = p_user_id and m.role <> 'spectator'
  ) then return; end if;

  update public.multiplayer_members
     set role = 'spectator', seat = null, ready = false, connected = false,
         last_seen_at = now()
   where room_id = p_room_id and user_id = p_user_id;

  select m.user_id into v_next_host
    from public.multiplayer_members m
   where m.room_id = p_room_id and m.role <> 'spectator'
   order by m.seat asc nulls last, m.created_at asc
   limit 1;

  select count(*) into v_remaining
    from public.multiplayer_members m
   where m.room_id = p_room_id and m.role <> 'spectator';

  if v_next_host is not null then
    update public.multiplayer_members
       set role = case when user_id = v_next_host then 'host' else 'player' end
     where room_id = p_room_id and role <> 'spectator';
  end if;

  update public.multiplayer_rooms
     set host_user_id = coalesce(v_next_host, host_user_id),
         status = case
           when v_remaining = 0 then 'closed'
           when p_patch ? 'status' then p_patch->>'status'
           else status end,
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
         version = public.multiplayer_rooms.version + 1,
         updated_at = now()
   where id = p_room_id
   returning multiplayer_rooms.version into v_version;

  insert into public.multiplayer_events (
    room_id, version, type, visibility, visible_to_user_ids, actor_user_id, payload
  ) values (
    p_room_id, v_version, coalesce(p_event_type, 'member_left'),
    'public', null, p_user_id, coalesce(p_event_payload, '{}'::jsonb)
  );

  version := v_version;
  return next;
end;
$$;

revoke all on function public.leave_multiplayer_room(
  uuid, uuid, bigint, jsonb, text, jsonb
) from public, anon, authenticated;
grant execute on function public.leave_multiplayer_room(
  uuid, uuid, bigint, jsonb, text, jsonb
) to service_role;

alter table public.multiplayer_game_session_claims
  add column if not exists expires_at timestamptz not null default (now() + interval '4 hours'),
  add column if not exists released_at timestamptz;

alter table public.multiplayer_game_session_claims
  drop constraint if exists multiplayer_game_session_claims_room_id_key;

create unique index if not exists multiplayer_game_session_claims_active_room_idx
  on public.multiplayer_game_session_claims (room_id)
  where released_at is null;

create index if not exists multiplayer_game_session_claims_expiry_idx
  on public.multiplayer_game_session_claims (expires_at)
  where released_at is null;

create or replace function public.claim_multiplayer_game_session(
  p_session_id uuid,
  p_user_id uuid,
  p_room_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_claim public.multiplayer_game_session_claims%rowtype;
begin
  if p_session_id is null or p_user_id is null or p_room_id is null then return false; end if;

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
    return v_claim.room_id = p_room_id and v_claim.user_id = p_user_id;
  end if;

  perform 1 from public.game_sessions gs
   where gs.id = p_session_id
     and gs.user_id::text = p_user_id::text
     and gs.completed = false
     and gs.used_custom_key = false
     and gs.credit_authorized = true
     and gs.last_activity_at >= now() - interval '4 hours'
   for update;
  if not found then return false; end if;

  if exists (
    select 1 from public.multiplayer_game_session_claims c
     where c.room_id = p_room_id and c.released_at is null and c.session_id <> p_session_id
  ) then return false; end if;

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

  update public.game_sessions set last_activity_at = now() where id = p_session_id;
  return true;
exception when unique_violation then
  return false;
end;
$$;

create or replace function public.release_multiplayer_game_session(
  p_session_id uuid,
  p_user_id uuid,
  p_room_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.multiplayer_game_session_claims c
     set released_at = now()
   where c.session_id = p_session_id
     and c.user_id = p_user_id
     and c.room_id = p_room_id
     and c.released_at is null
     and exists (
       select 1 from public.multiplayer_rooms r
        where r.id = p_room_id and r.status in ('lobby', 'closed', 'finished')
     );
  return found;
end;
$$;

revoke all on function public.claim_multiplayer_game_session(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_multiplayer_game_session(uuid, uuid, uuid)
  to service_role;
revoke all on function public.release_multiplayer_game_session(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_multiplayer_game_session(uuid, uuid, uuid)
  to service_role;
