-- 多人房间必须独占一个已扣费的 game session，避免同一额度跨房复用。
create table if not exists public.multiplayer_game_session_claims (
  session_id uuid primary key references public.game_sessions(id) on delete cascade,
  room_id uuid not null unique references public.multiplayer_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now()
);

create index if not exists multiplayer_game_session_claims_user_idx
  on public.multiplayer_game_session_claims (user_id, claimed_at desc);

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
  v_existing_room_id uuid;
  v_existing_user_id uuid;
  v_valid boolean;
begin
  if p_session_id is null or p_user_id is null or p_room_id is null then
    return false;
  end if;

  select c.room_id, c.user_id into v_existing_room_id, v_existing_user_id
    from public.multiplayer_game_session_claims c
   where c.session_id = p_session_id;
  if found then
    return v_existing_room_id = p_room_id and v_existing_user_id = p_user_id;
  end if;

  select true into v_valid
    from public.game_sessions gs
   where gs.id = p_session_id
     and gs.user_id::text = p_user_id::text
     and gs.completed = false
     and gs.used_custom_key = false
     and gs.credit_authorized = true
     and gs.last_activity_at >= now() - interval '4 hours'
   for update;
  if not found then
    return false;
  end if;

  insert into public.multiplayer_game_session_claims (
    session_id, room_id, user_id
  ) values (
    p_session_id, p_room_id, p_user_id
  )
  on conflict (session_id) do nothing;

  select c.room_id, c.user_id into v_existing_room_id, v_existing_user_id
    from public.multiplayer_game_session_claims c
   where c.session_id = p_session_id;
  if v_existing_room_id <> p_room_id or v_existing_user_id <> p_user_id then
    return false;
  end if;

  update public.game_sessions
     set last_activity_at = now()
   where id = p_session_id;
  return true;
end;
$$;

alter table public.multiplayer_game_session_claims enable row level security;
revoke all on table public.multiplayer_game_session_claims from public, anon, authenticated;
grant all on table public.multiplayer_game_session_claims to service_role;

revoke all on function public.claim_multiplayer_game_session(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.claim_multiplayer_game_session(
  uuid, uuid, uuid
) to service_role;

-- 历史扣费 RPC 存在时一并收紧；兼容尚未安装该函数的新环境。
do $$
begin
  if to_regprocedure(
    'public.consume_credit_for_authorized_game_session(uuid,integer,text,text,text,text)'
  ) is not null then
    execute 'revoke all on function public.consume_credit_for_authorized_game_session(uuid, integer, text, text, text, text) from public, anon, authenticated';
    execute 'grant execute on function public.consume_credit_for_authorized_game_session(uuid, integer, text, text, text, text) to service_role';
  end if;
end;
$$;
