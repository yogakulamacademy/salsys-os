-- KB-01C synthetic local PostgreSQL fixture. Never run on a real tenant database.
create schema if not exists auth;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end;
$roles$;

create table public.organizations (
  id uuid primary key,
  name text not null default 'Synthetic test organization'
);
create table public.test_knowledge_admins (
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null,
  primary key (organization_id, user_id)
);

create function auth.jwt() returns jsonb language sql stable
as $fn$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$fn$;

create function public.can_manage_organization(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $fn$
  select exists(
    select 1 from public.test_knowledge_admins
    where organization_id = p_organization_id
    and user_id = nullif(auth.jwt()->>'sub', '')::uuid
    and auth.jwt()->>'role' = 'authenticated'
  );
$fn$;

create function public.set_updated_at() returns trigger language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

grant usage on schema auth, public to authenticated, service_role;
grant execute on function auth.jwt() to authenticated, service_role;
grant execute on function public.can_manage_organization(uuid) to authenticated, service_role;
