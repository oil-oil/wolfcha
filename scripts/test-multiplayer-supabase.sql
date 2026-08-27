\set ON_ERROR_STOP on

begin;

insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');

insert into public.game_sessions (
  id, user_id, player_count, difficulty, credit_authorized, used_custom_key, completed
) values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  8,
  'normal',
  true,
  false,
  false
);

select public.increment_multiplayer_ai_usage(
  '30000000-0000-4000-8000-000000000001', 1, 100, 20, 30, 10
);
select public.increment_multiplayer_ai_usage(
  '30000000-0000-4000-8000-000000000001', 2, 200, 40, 60, 20
);

select * from public.create_multiplayer_room(
  '20000000-0000-4000-8000-000000000001',
  'DBTEST',
  '10000000-0000-4000-8000-000000000001',
  'lobby',
  'LOBBY',
  1,
  null,
  '{"playerCount":8,"difficulty":"normal","locale":"zh"}'::jsonb,
  null,
  '{"phase":"LOBBY","day":1,"players":[]}'::jsonb,
  now(),
  null,
  '房主',
  0,
  true,
  true
);

select * from public.upsert_multiplayer_member(
  '20000000-0000-4000-8000-000000000001',
  0,
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002',
  '朋友',
  'player',
  1,
  true,
  true,
  'member_joined',
  '{}'::jsonb
);

select * from public.takeover_multiplayer_timeout(
  '20000000-0000-4000-8000-000000000001',
  1,
  'db-timeout-1',
  '10000000-0000-4000-8000-000000000001',
  array['10000000-0000-4000-8000-000000000001'::uuid],
  jsonb_build_object(
    'status', 'in_game',
    'phase', 'NIGHT_WOLF_ACTION',
    'day', 1,
    'serverState', jsonb_build_object(
      'phase', 'NIGHT_WOLF_ACTION',
      'day', 1,
      'players', '[]'::jsonb,
      'winner', null,
      'gameSessionOwnerId', '10000000-0000-4000-8000-000000000001'
    )
  ),
  'turn_expired',
  '{}'::jsonb
);

do $$
declare
  v_duplicate boolean;
begin
  if not exists (
    select 1 from public.game_sessions
     where id = '30000000-0000-4000-8000-000000000001'
       and ai_calls_count = 3
       and ai_input_chars = 300
       and ai_output_chars = 60
       and ai_prompt_tokens = 90
       and ai_completion_tokens = 30
  ) then
    raise exception 'AI 用量 RPC 未正确累加';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.increment_multiplayer_ai_usage(uuid,integer,integer,integer,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated 不应有 AI 用量 RPC 权限';
  end if;

  if not exists (
    select 1 from public.multiplayer_members
     where room_id = '20000000-0000-4000-8000-000000000001'
       and user_id = '10000000-0000-4000-8000-000000000001'
       and role = 'spectator' and seat is null and connected = false
  ) then
    raise exception '超时玩家没有被原子转为观战';
  end if;

  if not exists (
    select 1 from public.multiplayer_rooms
     where id = '20000000-0000-4000-8000-000000000001'
       and version = 2
       and host_user_id = '10000000-0000-4000-8000-000000000002'
       and game_session_owner_id = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception '房主转移、版本或 session owner 持久化不正确';
  end if;

  select duplicate into v_duplicate
    from public.takeover_multiplayer_timeout(
      '20000000-0000-4000-8000-000000000001',
      1,
      'db-timeout-1',
      '10000000-0000-4000-8000-000000000001',
      array['10000000-0000-4000-8000-000000000001'::uuid],
      '{}'::jsonb,
      'turn_expired',
      '{}'::jsonb
    );
  if v_duplicate is distinct from true then
    raise exception '超时 command 没有幂等返回';
  end if;
end;
$$;

rollback;
