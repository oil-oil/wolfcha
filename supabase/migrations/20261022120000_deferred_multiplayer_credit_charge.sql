-- Multiplayer room creation keeps an unpaid, room-bound session. The balance is
-- charged only when start_multiplayer_room commits the lobby transition.
alter table public.game_sessions
  add column if not exists credit_consumption_pending boolean not null default false,
  add column if not exists multiplayer_room_id uuid;

create unique index if not exists game_sessions_pending_multiplayer_room_idx
  on public.game_sessions (user_id, multiplayer_room_id)
  where credit_consumption_pending = true and completed = false;

create or replace function public.reserve_multiplayer_game_session(
  p_user_id uuid,
  p_room_id uuid,
  p_player_count integer,
  p_difficulty text default null,
  p_model_used text default null,
  p_user_email text default null,
  p_region text default null
)
returns table(session_id uuid, credits integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_host_user_id uuid;
  v_status text;
  v_room_player_count integer;
  v_session_id uuid;
  v_credits integer;
begin
  if p_user_id is null or p_room_id is null or p_player_count is null or p_player_count <= 0 then
    raise exception 'invalid_multiplayer_reservation' using errcode = '22023';
  end if;

  select r.host_user_id, r.status, (r.settings->>'playerCount')::integer
    into v_host_user_id, v_status, v_room_player_count
    from public.multiplayer_rooms r
   where r.id = p_room_id
   for update;
  if not found or v_host_user_id <> p_user_id or v_status <> 'lobby'
     or v_room_player_count <> p_player_count then
    raise exception 'multiplayer_room_not_reservable' using errcode = '42501';
  end if;

  insert into public.game_sessions (
    user_id, player_count, difficulty, completed, used_custom_key,
    credit_authorized, credit_consumption_pending, multiplayer_room_id,
    model_used, user_email, region, last_activity_at
  ) values (
    p_user_id::text, p_player_count, p_difficulty, false, false,
    false, true, p_room_id, p_model_used, p_user_email, p_region, now()
  )
  on conflict (user_id, multiplayer_room_id)
    where credit_consumption_pending = true and completed = false
  do update set
    last_activity_at = now()
  returning id into v_session_id;

  select uc.credits into v_credits
    from public.user_credits uc
   where uc.id = p_user_id;

  return query select v_session_id, coalesce(v_credits, 0);
end;
$$;

revoke all on function public.reserve_multiplayer_game_session(
  uuid, uuid, integer, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.reserve_multiplayer_game_session(
  uuid, uuid, integer, text, text, text, text
) to service_role;

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
  v_session public.game_sessions%rowtype;
  v_credits integer;
  v_pending boolean := false;
  v_claim_found boolean := false;
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

  if p_session_id is null then
    version := v_version;
    authorized := false;
    return next;
    return;
  end if;

  select * into v_session
    from public.game_sessions gs
   where gs.id = p_session_id
   for update;
  if not found
     or v_session.user_id::text <> p_user_id::text
     or v_session.completed = true
     or v_session.used_custom_key = true then
    version := v_version;
    authorized := false;
    return next;
    return;
  end if;
  if v_session.multiplayer_room_id is not null
     and v_session.multiplayer_room_id <> p_room_id then
    version := v_version;
    authorized := false;
    return next;
    return;
  end if;
  if exists (
    select 1 from public.multiplayer_game_session_claims c
     where c.session_id = p_session_id and c.room_id <> p_room_id
  ) then
    version := v_version;
    authorized := false;
    return next;
    return;
  end if;
  v_pending := coalesce(v_session.credit_consumption_pending, false);

  select * into v_claim
    from public.multiplayer_game_session_claims c
   where c.session_id = p_session_id
   for update;
  v_claim_found := found;

  if v_pending and v_claim_found then
    version := v_version;
    authorized := false;
    return next;
    return;
  end if;

  if v_claim_found and v_claim.released_at is null then
    if v_claim.room_id <> p_room_id or v_claim.user_id <> p_user_id then
      version := v_version;
      authorized := false;
      return next;
      return;
    end if;
  elsif v_pending then
    if v_session.credit_authorized = true
       or v_session.multiplayer_room_id is distinct from p_room_id then
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

    select uc.credits into v_credits
      from public.user_credits uc
     where uc.id = p_user_id
     for update;
    if not found or v_credits <= 0 then
      version := v_version;
      authorized := false;
      return next;
      return;
    end if;

    update public.user_credits
       set credits = v_credits - 1,
           updated_at = now()
     where id = p_user_id;

    update public.game_sessions
       set credit_authorized = true,
           credit_consumption_pending = false,
           last_activity_at = now()
     where id = p_session_id;
  else
    if v_session.credit_authorized <> true
       or v_session.last_activity_at < now() - interval '4 hours' then
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
  end if;

  if not v_claim_found or v_claim.released_at is not null then
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

  update public.game_sessions
     set multiplayer_room_id = coalesce(multiplayer_room_id, p_room_id),
         last_activity_at = now()
   where id = p_session_id;

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
