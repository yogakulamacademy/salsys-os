begin;

-- Phase 7A: provider-neutral audience activation foundation.
-- Conversion feedback already owns CRM conversion delivery. This migration adds
-- reusable audience definitions, membership truth, platform destinations and a
-- PII-minimized outbound queue for Meta / Google audience activation.

create table public.ad_audience_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  audience_key text not null,
  name text not null,
  description text,
  status text not null default 'draft',
  rules jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_audience_definitions_key_nonempty check (nullif(btrim(audience_key), '') is not null),
  constraint ad_audience_definitions_name_nonempty check (nullif(btrim(name), '') is not null),
  constraint ad_audience_definitions_status_check check (status in ('draft','active','paused','archived')),
  constraint ad_audience_definitions_rules_object check (jsonb_typeof(rules) = 'object'),
  constraint ad_audience_definitions_org_key_unique unique (organization_id, audience_key)
);

create table public.ad_audience_destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  audience_id uuid not null references public.ad_audience_definitions(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete restrict,
  integration_asset_id uuid references public.integration_assets(id) on delete restrict,
  destination_kind text not null,
  external_audience_id text,
  external_audience_name text,
  status text not null default 'inactive',
  sync_mode text not null default 'incremental',
  config jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_audience_destinations_kind_check check (destination_kind in ('customer_match','custom_audience')),
  constraint ad_audience_destinations_status_check check (status in ('inactive','active','paused','error')),
  constraint ad_audience_destinations_sync_mode_check check (sync_mode in ('incremental','replace')),
  constraint ad_audience_destinations_config_object check (jsonb_typeof(config) = 'object'),
  constraint ad_audience_destinations_audience_connection_unique unique (audience_id, connection_id, destination_kind)
);

commit;
