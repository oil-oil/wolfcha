\set ON_ERROR_STOP on

-- Run only against an isolated local database after applying the migration.
-- Every fixture and balance change is rolled back at the end.
begin;

insert into auth.users (id) values
  ('91000000-0000-4000-8000-000000000001'),
  ('91000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.user_credits (id, credits, referral_code)
values
  ('91000000-0000-4000-8000-000000000001', 4, 'QA91000001'),
  ('91000000-0000-4000-8000-000000000002', 0, 'QA91000002')
on conflict (id) do update set credits = excluded.credits;

do $$
declare
  v_host constant uuid := '91000000-0000-4000-8000-000000000001';
  v_empty constant uuid := '91000000-0000-4000-8000-000000000002';
  v_room_a constant uuid := '92000000-0000-4000-8000-000000000001';
  v_room_b constant uuid := '92000000-0000-4000-8000-000000000002';
  v_room_empty constant uuid := '92000000-0000-4000-8000-000000000003';
  v_room_legacy constant uuid := '92000000-0000-4000-8000-000000000004';
  v_room_expired constant uuid := '92000000-0000-4000-8000-000000000005';
  v_room_legacy_replay constant uuid := '92000000-0000-4000-8000-000000000006';
  v_legacy_session constant uuid := '93000000-0000-4000-8000-000000000001';
  v_completed_session constant uuid := '93000000-0000-4000-8000-000000000002';
  v_expired_session constant uuid := '93000000-0000-4000-8000-000000000003';
  v_session_a uuid;
  v_session_again uuid;
  v_session_b uuid;
  v_session_empty uuid;
  v_result record;
  v_balance integer;
  v_pending boolean;
  v_authorized boolean;
  v_session_room uuid;
  v_room_version bigint;
  v_room_status text;
  v_event_count bigint;
  v_patch jsonb := jsonb_build_object(
    'status', 'in_game',
    'phase', 'NIGHT_WOLF_ACTION',
    'day', 1,
    'startedAt', now(),
    'serverState', jsonb_build_object('phase', 'NIGHT_WOLF_ACTION', 'day', 1, 'players', '[]'::jsonb),
    'publicState', jsonb_build_object('phase', 'NIGHT_WOLF_ACTION', 'day', 1, 'players', '[]'::jsonb)
  );
begin
  perform public.create_multiplayer_room(
    v_room_a, 'QACREDIT1', v_host, 'lobby', 'LOBBY', 1, null,
    '{"playerCount":8,"difficulty":"normal","locale":"zh"}'::jsonb,
    null, '{"phase":"LOBBY","day":1,"players":[]}'::jsonb,
    now(), null, '房主', 0, true, true
  );
  perform public.create_multiplayer_room(
    v_room_b, 'QACREDIT2', v_host, 'lobby', 'LOBBY', 1, null,
    '{"playerCount":8,"difficulty":"normal","locale":"zh"}'::jsonb,
    null, '{"phase":"LOBBY","day":1,"players":[]}'::jsonb,
    now(), null, '房主', 0, true, true
  );
  perform public.create_multiplayer_room(
    v_room_empty, 'QACREDIT3', v_empty, 'lobby', 'LOBBY', 1, null,
    '{"playerCount":8,"difficulty":"normal","locale":"zh"}'::jsonb,
    null, '{"phase":"LOBBY","day":1,"players":[]}'::jsonb,
    now(), null, '空余额', 0, true, true
  );
  perform public.create_multiplayer_room(
    v_room_legacy, 'QACREDIT4', v_host, 'lobby', 'LOBBY', 1, null,
    '{"playerCount":8,"difficulty":"normal","locale":"zh"}'::jsonb,
    null, '{"phase":"LOBBY","day":1,"players":[]}'::jsonb,
    now(), null, '旧付费session', 0, true, true
  );
  perform public.create_multiplayer_room(
    v_room_expired, 'QACREDIT5', v_host, 'lobby', 'LOBBY', 1, null,
    '{"playerCount":8,"difficulty":"normal","locale":"zh"}'::jsonb,
    null, '{"phase":"LOBBY","day":1,"players":[]}'::jsonb,
    now(), null, '过期session', 0, true, true
  );
  perform public.create_multiplayer_room(
    v_room_legacy_replay, 'QACREDIT6', v_host, 'lobby', 'LOBBY', 1, null,
    '{"playerCount":8,"difficulty":"normal","locale":"zh"}'::jsonb,
    null, '{"phase":"LOBBY","day":1,"players":[]}'::jsonb,
    now(), null, '旧session跨房重放', 0, true, true
  );

  select session_id into v_session_a
    from public.reserve_multiplayer_game_session(v_host, v_room_a, 8, 'normal');
  select session_id into v_session_again
    from public.reserve_multiplayer_game_session(v_host, v_room_a, 8, 'normal');
  if v_session_a is distinct from v_session_again then
    raise exception '重复预约没有复用同一个 pending session';
  end if;
  select credits into v_balance from public.user_credits where id = v_host;
  select credit_authorized, credit_consumption_pending into v_authorized, v_pending
    from public.game_sessions where id = v_session_a;
  if v_balance <> 4 or v_authorized or not v_pending then
    raise exception '预约阶段扣费或授权标记不正确';
  end if;

  begin
    perform public.reserve_multiplayer_game_session(v_empty, v_room_a, 8, 'normal');
    raise exception '非房主预约应失败';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.game_sessions (
      user_id, player_count, completed, used_custom_key, credit_authorized,
      credit_consumption_pending, multiplayer_room_id
    ) values (v_host::text, 8, false, false, false, true, v_room_a);
    raise exception '同一房间不应有第二个 pending session';
  exception when unique_violation then
    null;
  end;

  -- Local storage may expire, but a server pending session has no four-hour
  -- authorization window and reservation lookup still returns the same id.
  update public.game_sessions set last_activity_at = now() - interval '1 day' where id = v_session_a;
  select session_id into v_session_again
    from public.reserve_multiplayer_game_session(v_host, v_room_a, 8, 'normal');
  if v_session_again is distinct from v_session_a then
    raise exception '隔夜预约没有找回同一个 pending session';
  end if;

  select version, status into v_room_version, v_room_status
    from public.multiplayer_rooms where id = v_room_a;
  select count(*) into v_event_count
    from public.multiplayer_events where room_id = v_room_a;
  select * into v_result from public.start_multiplayer_room(
    v_room_a, 99, v_session_a, v_host, v_patch, 'room_started', '{}'::jsonb
  );
  select credits into v_balance from public.user_credits where id = v_host;
  if v_result.authorized is true or v_balance <> 4
     or (select version from public.multiplayer_rooms where id = v_room_a) <> v_room_version
     or (select status from public.multiplayer_rooms where id = v_room_a) <> v_room_status
     or (select count(*) from public.multiplayer_events where room_id = v_room_a) <> v_event_count then
    raise exception 'CAS 版本冲突仍改变房间或扣费';
  end if;

  -- Force a later unique violation after the credit update. The function must
  -- roll back the balance update, reservation transition, and claim together.
  insert into public.multiplayer_events (room_id, version, type, actor_user_id, payload)
  values (v_room_a, 1, 'fixture_conflict', v_host, '{}'::jsonb);
  select * into v_result from public.start_multiplayer_room(
    v_room_a, 0, v_session_a, v_host, v_patch, 'room_started', '{}'::jsonb
  );
  select credits into v_balance from public.user_credits where id = v_host;
  select credit_consumption_pending into v_pending from public.game_sessions where id = v_session_a;
  if v_result.authorized is true or v_balance <> 4 or not v_pending
     or exists (select 1 from public.multiplayer_game_session_claims where session_id = v_session_a) then
    raise exception '开局后续事务失败没有回滚扣费和 claim';
  end if;
  delete from public.multiplayer_events where room_id = v_room_a and version = 1;

  -- A room-bound reservation cannot be used in another room.
  select * into v_result from public.start_multiplayer_room(
    v_room_b, 0, v_session_a, v_host, v_patch, 'room_started', '{}'::jsonb
  );
  select credits into v_balance from public.user_credits where id = v_host;
  if v_result.authorized is true or v_balance <> 4 then
    raise exception '跨房间复用 session 被允许或发生扣费';
  end if;

  select session_id into v_session_b
    from public.reserve_multiplayer_game_session(v_host, v_room_b, 8, 'normal');
  select * into v_result from public.start_multiplayer_room(
    v_room_a, 0, v_session_a, v_host, v_patch, 'room_started', '{}'::jsonb
  );
  if v_result.authorized is distinct from true then raise exception '合法开局未通过'; end if;
  select credits into v_balance from public.user_credits where id = v_host;
  if v_balance <> 3 then raise exception '合法开局应恰好扣 1 点'; end if;

  -- Replaying the exact request after a committed response cannot start the
  -- same room twice or consume another credit.
  select version, status into v_room_version, v_room_status
    from public.multiplayer_rooms where id = v_room_a;
  select count(*) into v_event_count
    from public.multiplayer_events
   where room_id = v_room_a and type = 'room_started';
  select * into v_result from public.start_multiplayer_room(
    v_room_a, 0, v_session_a, v_host, v_patch, 'room_started', '{}'::jsonb
  );
  select credits into v_balance from public.user_credits where id = v_host;
  if v_result.authorized is true or v_balance <> 3
     or (select version from public.multiplayer_rooms where id = v_room_a) <> v_room_version
     or (select status from public.multiplayer_rooms where id = v_room_a) <> v_room_status
     or (select count(*) from public.multiplayer_events
          where room_id = v_room_a and type = 'room_started') <> v_event_count then
    raise exception '成功开局请求重放后再次成功或重复扣费';
  end if;

  -- Even after the room releases its claim, a session created by the new
  -- room-bound flow cannot be used to start another room for free.
  update public.multiplayer_rooms set status = 'closed' where id = v_room_a;
  update public.multiplayer_game_session_claims
     set released_at = now()
   where session_id = v_session_a and room_id = v_room_a;
  select * into v_result from public.start_multiplayer_room(
    v_room_b, 0, v_session_a, v_host, v_patch, 'room_started', '{}'::jsonb
  );
  select credits into v_balance from public.user_credits where id = v_host;
  if v_result.authorized is true or v_balance <> 3
     or exists (select 1 from public.multiplayer_rooms where id = v_room_b and status <> 'lobby') then
    raise exception '已消费的 room-bound session 在 claim 释放后被跨房复用';
  end if;

  -- A second room/session remains an independent one-time charge.
  select * into v_result from public.start_multiplayer_room(
    v_room_b, 0, v_session_b, v_host, v_patch, 'room_started', '{}'::jsonb
  );
  select credits into v_balance from public.user_credits where id = v_host;
  if v_result.authorized is distinct from true or v_balance <> 2 then
    raise exception '第二个独立房间没有恰好扣 1 点';
  end if;

  insert into public.game_sessions (
    id, user_id, player_count, difficulty, credit_authorized, used_custom_key, completed
  ) values (
    v_legacy_session, v_host::text, 8, 'normal', true, false, false
  );
  select * into v_result from public.start_multiplayer_room(
    v_room_legacy, 0, v_legacy_session, v_host, v_patch, 'room_started', '{}'::jsonb
  );
  select credits into v_balance from public.user_credits where id = v_host;
  if v_result.authorized is distinct from true or v_balance <> 2 then
    raise exception '旧已扣费 session 被重复扣费或不能开局';
  end if;

  -- A legacy paid session can make its first start without a second charge.
  -- The successful start binds it to that room so claim release cannot make
  -- it reusable for free in another room.
  select multiplayer_room_id into strict v_session_room
    from public.game_sessions where id = v_legacy_session;
  if v_session_room <> v_room_legacy then
    raise exception '旧session首次成功开局未绑定到房间';
  end if;
  update public.multiplayer_rooms set status = 'closed' where id = v_room_legacy;
  update public.multiplayer_game_session_claims
     set released_at = now()
   where session_id = v_legacy_session and room_id = v_room_legacy;
  select * into v_result from public.start_multiplayer_room(
    v_room_legacy_replay, 0, v_legacy_session, v_host, v_patch, 'room_started', '{}'::jsonb
  );
  select credits into v_balance from public.user_credits where id = v_host;
  if v_result.authorized is true or v_balance <> 2
     or exists (select 1 from public.multiplayer_rooms where id = v_room_legacy_replay and status <> 'lobby') then
    raise exception '首次开局后的旧session在claim释放后仍可跨房重放';
  end if;

  insert into public.game_sessions (
    id, user_id, player_count, difficulty, credit_authorized, used_custom_key, completed, last_activity_at
  ) values (
    v_expired_session, v_host::text, 8, 'normal', true, false, false, now() - interval '5 hours'
  );
  select * into v_result from public.start_multiplayer_room(
    v_room_expired, 0, v_expired_session, v_host, v_patch, 'room_started', '{}'::jsonb
  );
  select credits into v_balance from public.user_credits where id = v_host;
  if v_result.authorized is true or v_balance <> 2
     or exists (select 1 from public.multiplayer_rooms where id = v_room_expired and status <> 'lobby') then
    raise exception '过期旧 session 被重新授权';
  end if;

  select session_id into v_session_empty
    from public.reserve_multiplayer_game_session(v_empty, v_room_empty, 8, 'normal');
  insert into public.game_sessions (
    id, user_id, player_count, difficulty, credit_authorized, used_custom_key, completed
  ) values (
    v_completed_session, v_empty::text, 8, 'normal', true, false, true
  );
  select * into v_result from public.start_multiplayer_room(
    v_room_empty, 0, v_completed_session, v_empty, v_patch, 'room_started', '{}'::jsonb
  );
  if v_result.authorized is true
     or exists (select 1 from public.multiplayer_rooms where id = v_room_empty and status <> 'lobby') then
    raise exception '已完成 session 被再次消费';
  end if;
  select * into v_result from public.start_multiplayer_room(
    v_room_empty, 0, v_session_empty, v_empty, v_patch, 'room_started', '{}'::jsonb
  );
  select credits into v_balance from public.user_credits where id = v_empty;
  select credit_consumption_pending into v_pending from public.game_sessions where id = v_session_empty;
  if v_result.authorized is true or v_balance <> 0 or not v_pending
     or exists (select 1 from public.multiplayer_game_session_claims where session_id = v_session_empty)
     or exists (select 1 from public.multiplayer_rooms where id = v_room_empty and status <> 'lobby') then
    raise exception '余额不足的开局没有保持原子失败';
  end if;
end;
$$;

rollback;
