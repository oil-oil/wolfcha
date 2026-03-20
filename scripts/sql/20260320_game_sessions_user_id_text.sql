begin;

alter table public.game_sessions
  drop constraint if exists game_sessions_user_id_fkey;

alter table public.game_sessions
  alter column user_id type text using user_id::text;

alter table public.game_sessions
  drop constraint if exists game_sessions_user_id_format_check;

alter table public.game_sessions
  add constraint game_sessions_user_id_format_check
  check (
    user_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or user_id like 'guest_%'
  );

create index if not exists idx_game_sessions_user_id
  on public.game_sessions (user_id);

commit;
