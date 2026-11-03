-- Compatibility functions for disposable local PostgreSQL tests only.
-- These read synthetic claims; they do not issue or validate Supabase sessions.
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt()->>'sub','')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt()->>'role';
$$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;
