-- PH-5.2B.1i — cold-recovery compatibility only.
-- Reconstructs the missing historical integration connection foundation
-- required before migration 023_integration_api_credentials.
--
-- No production connection rows or credentials are copied here.
-- Provider/auth-mode checks are deliberately left to migration 023, which
-- immediately drops/recreates those constraints as part of its own contract.
-- This file is NOT part of the normal production migration ledger.

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  auth_mode text not null default 'oauth_user'::text,
  status text not null default 'pending'::text,
  parent_connection_id uuid null,
  external_account_id text null,
  account_name text null,
  account_email text null,
  scopes text[] not null default '{}'::text[],
  access_token_ciphertext text null,
  refresh_token_ciphertext text null,
  token_expires_at timestamptz null,
  token_type text null,
  provider_metadata jsonb not null default '{}'::jsonb,
  connected_by uuid null
    references public.profiles(id)
    on delete set null,
  connected_at timestamptz null,
  last_verified_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  constraint integration_connections_status_check
    check (
      status = any (
        array[
          'pending'::text,
          'connected'::text,
          'expired'::text,
          'error'::text,
          'revoked'::text,
          'disconnected'::text
        ]
      )
    )
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.integration_connections'::regclass
      and conname = 'integration_connections_parent_connection_id_fkey'
  ) then
    alter table public.integration_connections
      add constraint integration_connections_parent_connection_id_fkey
      foreign key (parent_connection_id)
      references public.integration_connections(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_integration_connections_organization
  on public.integration_connections(organization_id);

create index if not exists integration_connections_provider_status_idx
  on public.integration_connections(provider, status);

create index if not exists integration_connections_parent_idx
  on public.integration_connections(parent_connection_id);

create unique index if not exists integration_connections_org_provider_external_uidx
  on public.integration_connections(
    organization_id,
    provider,
    external_account_id
  )
  where external_account_id is not null;

create or replace function public.touch_integration_updated_at()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.enforce_integration_connection_parent_org()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_parent_organization_id uuid;
begin
  if new.parent_connection_id is null then
    return new;
  end if;

  select organization_id
    into v_parent_organization_id
  from public.integration_connections
  where id = new.parent_connection_id;

  if not found then
    raise exception
      'Parent integration connection % does not exist',
      new.parent_connection_id;
  end if;

  if v_parent_organization_id is distinct from new.organization_id then
    raise exception
      'Parent integration connection must belong to the same organization';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_integration_connections_updated_at
  on public.integration_connections;
create trigger trg_integration_connections_updated_at
before update on public.integration_connections
for each row
execute function public.touch_integration_updated_at();

drop trigger if exists trg_integration_connections_parent_org_guard
  on public.integration_connections;
create trigger trg_integration_connections_parent_org_guard
before insert or update on public.integration_connections
for each row
execute function public.enforce_integration_connection_parent_org();

alter table public.integration_connections enable row level security;

drop policy if exists deny_direct_client_access
  on public.integration_connections;
create policy deny_direct_client_access
on public.integration_connections
for all
to public
using (false)
with check (false);
