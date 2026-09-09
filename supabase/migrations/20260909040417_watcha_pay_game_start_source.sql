-- 在现有幂等开局来源中增加爱猹收，不改写历史记录或权限。
set lock_timeout = '5s';
alter table public.game_sessions
  drop constraint if exists game_sessions_start_request_source_check;
alter table public.game_sessions
  add constraint game_sessions_start_request_source_check
  check (start_request_source is null or start_request_source in (
    'demo', 'external', 'spring_quota', 'project_credit', 'watcha_pay'
  )) not valid;
alter table public.game_sessions
  validate constraint game_sessions_start_request_source_check;
