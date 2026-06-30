alter table public.game_sessions
  add column if not exists credit_authorized boolean not null default false;

alter table public.game_sessions
  add column if not exists last_activity_at timestamptz;

update public.game_sessions
set last_activity_at = coalesce(ended_at, created_at, now())
where last_activity_at is null;

alter table public.game_sessions
  alter column last_activity_at set default now(),
  alter column last_activity_at set not null;

create index if not exists game_sessions_authorized_active_idx
  on public.game_sessions (user_id, last_activity_at desc)
  where completed = false
    and used_custom_key = false
    and credit_authorized = true;

alter table public.demo_config
  add column if not exists starts_at timestamptz,
  add column if not exists updated_by uuid,
  add column if not exists notes text;

create or replace function public.consume_credit_for_authorized_game_session(
  p_user_id uuid,
  p_player_count integer,
  p_difficulty text default null,
  p_model_used text default null,
  p_user_email text default null,
  p_region text default null
)
returns table(session_id uuid, credits integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits integer;
  v_session_id uuid;
begin
  if p_player_count is null or p_player_count <= 0 then
    raise exception 'invalid_player_count' using errcode = '22023';
  end if;

  select uc.credits
    into v_credits
  from public.user_credits uc
  where uc.id = p_user_id
  for update;

  if not found then
    raise exception 'credits_not_found' using errcode = 'P0002';
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
    now()
  )
  returning id into v_session_id;

  return query select v_session_id, v_credits;
end;
$$;
