-- Set new-user initial credits to 1.
--
-- Run this in Supabase Dashboard > SQL Editor for project cdnjwnoltenblkxakwvk.
-- It first lists auth.users triggers and their function definitions. Inspect the
-- returned function, then replace the `credits` value from 3 to 1 in the matching
-- CREATE OR REPLACE FUNCTION statement below.

select
  t.tgname as trigger_name,
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = p.pronamespace
where t.tgrelid = 'auth.users'::regclass
  and not t.tgisinternal;

-- Most Supabase projects use a function shaped like this:
--
-- create or replace function public.handle_new_user()
-- returns trigger
-- language plpgsql
-- security definer set search_path = public
-- as $$
-- begin
--   insert into public.user_credits (id, credits, referral_code)
--   values (new.id, 1, upper(substr(md5(new.id::text), 1, 8)))
--   on conflict (id) do nothing;
--   return new;
-- end;
-- $$;
--
-- Do not paste the template blindly if your function has additional fields or
-- custom referral-code logic. Use pg_get_functiondef output above, change only
-- the initial credits literal from 3 to 1, and rerun it.
