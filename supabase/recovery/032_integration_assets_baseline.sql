-- PH-5.2B.1k — cold-recovery compatibility only.
--
-- Purpose:
--   Migration 032_conversion_feedback_foundation.sql references
--   public.integration_assets, but the recorded migration chain through 031
--   never creates that table. This baseline reconstructs only the structural
--   contract needed at the 031 -> 032 boundary.
--
-- Important:
--   - This file is NOT part of the normal production migration ledger.
--   - Never run it against current production.
--   - It copies no production asset rows.
--   - The asset_type constraint is intentionally limited to the two types that
--     migration 032 itself proves it requires: google_ads_customer and
--     meta_ad_account. Later provider expansions must remain owned by their
--     later historical boundaries.

create table if not exists public.integration_assets (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null
    references public.integration_connections(id)
    on delete cascade,
  asset_type text not null,
  external_id text not null,
  name text,
  status text not null default 'available'::text,
  is_selected boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  constraint integration_assets_asset_type_check
    check (asset_type = any(array[
      'google_ads_customer'::text,
      'meta_ad_account'::text
    ])),
  constraint integration_assets_status_check
    check (status = any(array[
      'available'::text,
      'selected'::text,
      'unavailable'::text
    ])),
  constraint integration_assets_connection_id_asset_type_external_id_key
    unique (connection_id, asset_type, external_id)
);

create index if not exists integration_assets_connection_idx
  on public.integration_assets(connection_id);

create index if not exists integration_assets_selected_idx
  on public.integration_assets(connection_id, is_selected)
  where is_selected = true;

create index if not exists idx_integration_assets_organization
  on public.integration_assets(organization_id);

create or replace function public.set_integration_child_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_organization_id uuid;
begin
  if new.connection_id is null then
    return new;
  end if;

  select organization_id
  into v_organization_id
  from public.integration_connections
  where id = new.connection_id;

  if not found then
    raise exception
      'Integration connection % does not exist',
      new.connection_id;
  end if;

  if v_organization_id is null then
    raise exception
      'Integration connection % has no organization',
      new.connection_id;
  end if;

  new.organization_id := v_organization_id;
  return new;
end;
$function$;

drop trigger if exists integration_assets_set_organization
  on public.integration_assets;
create trigger integration_assets_set_organization
before insert or update of connection_id, organization_id
on public.integration_assets
for each row
execute function public.set_integration_child_organization();

drop trigger if exists trg_integration_assets_updated_at
  on public.integration_assets;
create trigger trg_integration_assets_updated_at
before update on public.integration_assets
for each row
execute function public.touch_integration_updated_at();

alter table public.integration_assets enable row level security;

drop policy if exists deny_direct_client_access
  on public.integration_assets;
create policy deny_direct_client_access
on public.integration_assets
for all
to public
using (false)
with check (false);
