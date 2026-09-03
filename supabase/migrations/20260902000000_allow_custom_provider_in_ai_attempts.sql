-- 放宽 game_session_events.provider 的取值约束，允许自定义 OpenAI 兼容
-- Provider（provider = 'custom'）。其余取值保持不变。
alter table public.game_session_events
  drop constraint if exists game_session_events_provider_check;

alter table public.game_session_events
  add constraint game_session_events_provider_check
    check (provider is null or provider in ('zenmux', 'dashscope', 'tokendance', 'custom'));
