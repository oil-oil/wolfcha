-- 多人房间状态由权威 Socket.IO 服务端读写，浏览器角色不授予下方表权限。

create extension if not exists pgcrypto;

-- 旧项目最初通过控制台维护 game_sessions，未留下可从零重放的建表迁移。
-- 多人额度 claim 依赖它，因此在全新/本地环境补齐兼容基线；线上已有表时不会改写。
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  player_count integer not null check (player_count > 0),
  difficulty text,
  winner text check (winner is null or winner in ('wolf', 'villager')),
  completed boolean not null default false,
  rounds_played integer not null default 0,
  duration_seconds integer,
  ai_calls_count integer not null default 0,
  ai_input_chars integer not null default 0,
  ai_output_chars integer not null default 0,
  ai_prompt_tokens integer not null default 0,
  ai_completion_tokens integer not null default 0,
  used_custom_key boolean not null default false,
  credit_authorized boolean not null default false,
  model_used text,
  user_email text,
  region text,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table public.game_sessions enable row level security;
revoke all on table public.game_sessions from public, anon, authenticated;
grant all on table public.game_sessions to service_role;

create table if not exists public.multiplayer_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby'
    check (status in ('lobby', 'in_game', 'finished', 'closed')),
  phase text not null default 'LOBBY'
    check (phase in (
      'LOBBY', 'SETUP', 'NIGHT_START', 'NIGHT_GUARD_ACTION',
      'NIGHT_WOLF_ACTION', 'NIGHT_WITCH_ACTION', 'NIGHT_SEER_ACTION',
      'NIGHT_RESOLVE', 'DAY_START', 'DAY_BADGE_SIGNUP',
      'DAY_BADGE_SPEECH', 'DAY_BADGE_ELECTION', 'DAY_PK_SPEECH',
      'DAY_SPEECH', 'DAY_LAST_WORDS', 'DAY_VOTE', 'DAY_RESOLVE',
      'BADGE_TRANSFER', 'HUNTER_SHOOT', 'WHITE_WOLF_KING_BOOM',
      'GAME_END'
    )),
  day integer not null default 0 check (day >= 0),
  winner text check (winner is null or winner in ('village', 'wolf')),
  version bigint not null default 0 check (version >= 0),
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object'),
  server_state jsonb default null
    check (server_state is null or jsonb_typeof(server_state) = 'object'),
  public_state jsonb default null
    check (public_state is null or jsonb_typeof(public_state) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint multiplayer_rooms_code_format_check
    check (char_length(code) between 4 and 16)
);

create table if not exists public.multiplayer_members (
  room_id uuid not null references public.multiplayer_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 80),
  role text not null default 'player'
    check (role in ('host', 'player', 'spectator')),
  seat integer check (seat is null or seat between 0 and 11),
  ready boolean not null default false,
  connected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  primary key (room_id, user_id)
);

create table if not exists public.multiplayer_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.multiplayer_rooms(id) on delete cascade,
  version bigint not null check (version >= 0),
  type text not null
    check (char_length(btrim(type)) between 1 and 64),
  visibility text not null default 'public'
    check (visibility in ('public', 'private')),
  visible_to_user_ids uuid[],
  actor_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (room_id, version),
  constraint multiplayer_events_visibility_targets_check
    check (
      (visibility = 'public' and visible_to_user_ids is null)
      or visibility = 'private'
    )
);

create index if not exists multiplayer_rooms_status_updated_idx
  on public.multiplayer_rooms (status, updated_at desc);

create index if not exists multiplayer_rooms_host_idx
  on public.multiplayer_rooms (host_user_id);

create index if not exists multiplayer_members_room_idx
  on public.multiplayer_members (room_id, role, seat);

create unique index if not exists multiplayer_members_room_seat_idx
  on public.multiplayer_members (room_id, seat)
  where seat is not null;

create unique index if not exists multiplayer_members_one_host_idx
  on public.multiplayer_members (room_id)
  where role = 'host';

create index if not exists multiplayer_events_room_version_idx
  on public.multiplayer_events (room_id, version desc);

create or replace function public.touch_multiplayer_room_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists multiplayer_rooms_set_updated_at on public.multiplayer_rooms;
create trigger multiplayer_rooms_set_updated_at
before update on public.multiplayer_rooms
for each row execute function public.touch_multiplayer_room_updated_at();

create or replace function public.touch_multiplayer_member_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists multiplayer_members_set_updated_at on public.multiplayer_members;
create trigger multiplayer_members_set_updated_at
before update on public.multiplayer_members
for each row execute function public.touch_multiplayer_member_updated_at();

-- 原子创建房间、房主成员及首个公开事件。
create or replace function public.create_multiplayer_room(
  p_room_id uuid,
  p_code text,
  p_host_user_id uuid,
  p_status text,
  p_phase text,
  p_day integer,
  p_winner text,
  p_settings jsonb,
  p_server_state jsonb,
  p_public_state jsonb,
  p_created_at timestamptz,
  p_started_at timestamptz,
  p_display_name text,
  p_seat integer,
  p_ready boolean,
  p_connected boolean
)
returns table(room_id uuid, version bigint)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.multiplayer_rooms (
    id, code, host_user_id, status, phase, day, winner, version,
    settings, server_state, public_state, created_at, started_at
  ) values (
    p_room_id, p_code, p_host_user_id, p_status, p_phase, p_day, p_winner, 0,
    p_settings, p_server_state, p_public_state, coalesce(p_created_at, now()), p_started_at
  );

  insert into public.multiplayer_members (
    room_id, user_id, display_name, role, seat, ready, connected
  ) values (
    p_room_id, p_host_user_id, p_display_name, 'host', p_seat, p_ready, p_connected
  );

  insert into public.multiplayer_events (
    room_id, version, type, visibility, visible_to_user_ids,
    actor_user_id, payload
  ) values (
    p_room_id, 0, 'room_created', 'public', null, p_host_user_id,
    jsonb_build_object('settings', p_settings)
  );

  room_id := p_room_id;
  version := 0;
  return next;
end;
$$;

-- 以房间版本做 CAS；成功后再写成员与对应公开事件，失败返回零行。
create or replace function public.upsert_multiplayer_member(
  p_room_id uuid,
  p_expected_version bigint,
  p_actor_user_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_role text,
  p_seat integer,
  p_ready boolean,
  p_connected boolean,
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
begin
  update public.multiplayer_rooms
  set version = public.multiplayer_rooms.version + 1,
      updated_at = now()
  where id = p_room_id
    and public.multiplayer_rooms.version = p_expected_version
  returning multiplayer_rooms.version into v_version;

  if not found then
    return;
  end if;

  insert into public.multiplayer_members (
    room_id, user_id, display_name, role, seat, ready, connected
  ) values (
    p_room_id, p_user_id, p_display_name, p_role, p_seat, p_ready, p_connected
  )
  on conflict (room_id, user_id) do update set
    display_name = excluded.display_name,
    role = excluded.role,
    seat = excluded.seat,
    ready = excluded.ready,
    connected = excluded.connected;

  insert into public.multiplayer_events (
    room_id, version, type, visibility, visible_to_user_ids,
    actor_user_id, payload
  ) values (
    p_room_id, v_version, coalesce(p_event_type, 'member_updated'),
    'public', null, p_actor_user_id, coalesce(p_event_payload, '{}'::jsonb)
  );

  version := v_version;
  return next;
end;
$$;

-- 以房间版本做 CAS，并在同一事务写入公开状态变更事件。
create or replace function public.transition_multiplayer_room(
  p_room_id uuid,
  p_expected_version bigint,
  p_actor_user_id uuid,
  p_status text,
  p_phase text,
  p_day integer,
  p_winner text,
  p_server_state jsonb,
  p_public_state jsonb,
  p_started_at timestamptz,
  p_finished_at timestamptz,
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
begin
  update public.multiplayer_rooms
  set status = coalesce(p_status, status),
      phase = coalesce(p_phase, phase),
      day = coalesce(p_day, day),
      winner = coalesce(p_winner, winner),
      server_state = coalesce(p_server_state, server_state),
      public_state = coalesce(p_public_state, public_state),
      started_at = coalesce(p_started_at, started_at),
      finished_at = coalesce(p_finished_at, finished_at),
      version = public.multiplayer_rooms.version + 1,
      updated_at = now()
  where id = p_room_id
    and public.multiplayer_rooms.version = p_expected_version
  returning multiplayer_rooms.version into v_version;

  if not found then
    return;
  end if;

  insert into public.multiplayer_events (
    room_id, version, type, visibility, visible_to_user_ids,
    actor_user_id, payload
  ) values (
    p_room_id, v_version, coalesce(p_event_type, 'room_transition'),
    'public', null, p_actor_user_id, coalesce(p_event_payload, '{}'::jsonb)
  );

  version := v_version;
  return next;
end;
$$;

-- 不创建浏览器策略；撤销继承的表权限及 Supabase 浏览器角色权限，
-- 仅权威后端 service_role 可访问这些表。
alter table public.multiplayer_rooms enable row level security;
alter table public.multiplayer_members enable row level security;
alter table public.multiplayer_events enable row level security;

revoke all on table public.multiplayer_rooms from public, anon, authenticated;
revoke all on table public.multiplayer_members from public, anon, authenticated;
revoke all on table public.multiplayer_events from public, anon, authenticated;

grant all on table public.multiplayer_rooms to service_role;
grant all on table public.multiplayer_members to service_role;
grant all on table public.multiplayer_events to service_role;

revoke all on function public.touch_multiplayer_room_updated_at() from public, anon, authenticated;
grant execute on function public.touch_multiplayer_room_updated_at() to service_role;
revoke all on function public.touch_multiplayer_member_updated_at() from public, anon, authenticated;
grant execute on function public.touch_multiplayer_member_updated_at() to service_role;

revoke all on function public.create_multiplayer_room(
  uuid, text, uuid, text, text, integer, text, jsonb, jsonb, jsonb,
  timestamptz, timestamptz, text, integer, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.create_multiplayer_room(
  uuid, text, uuid, text, text, integer, text, jsonb, jsonb, jsonb,
  timestamptz, timestamptz, text, integer, boolean, boolean
) to service_role;

revoke all on function public.upsert_multiplayer_member(
  uuid, bigint, uuid, uuid, text, text, integer, boolean, boolean, text, jsonb
) from public, anon, authenticated;
grant execute on function public.upsert_multiplayer_member(
  uuid, bigint, uuid, uuid, text, text, integer, boolean, boolean, text, jsonb
) to service_role;

revoke all on function public.transition_multiplayer_room(
  uuid, bigint, uuid, text, text, integer, text, jsonb, jsonb,
  timestamptz, timestamptz, text, jsonb
) from public, anon, authenticated;
grant execute on function public.transition_multiplayer_room(
  uuid, bigint, uuid, text, text, integer, text, jsonb, jsonb,
  timestamptz, timestamptz, text, jsonb
) to service_role;
