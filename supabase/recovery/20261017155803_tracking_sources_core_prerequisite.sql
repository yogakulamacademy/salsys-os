-- CI-only historical recovery prerequisite.
-- Derived from production migration 20261017155803_tracking_sources_and_event_contracts_v1.
-- This file is staged into supabase/migrations only by Migration Replay.
-- It is not part of the production migration ledger.

begin;

create table if not exists public.tracking_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  source_type text not null check (source_type in ('website','api','webhook','system')),
  source_system text not null,
  source_key text not null unique default ('src_' || replace(gen_random_uuid()::text,'-','')),
  auth_mode text not null check (auth_mode in ('origin','secret','hmac','internal')),
  hostname text,
  secret_hash text,
  secret_version integer not null default 1 check (secret_version >= 1),
  status text not null default 'active' check (status in ('active','paused','revoked')),
  allowed_event_prefixes text[] not null default '{}'::text[],
  max_payload_bytes integer not null default 32768 check (max_payload_bytes between 1024 and 1048576),
  rate_limit_per_minute integer not null default 600 check (rate_limit_per_minute between 1 and 100000),
  accepted_event_count bigint not null default 0,
  duplicate_event_count bigint not null default 0,
  rejected_event_count bigint not null default 0,
  last_seen_at timestamptz,
  last_rejected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((auth_mode = 'origin' and hostname is not null and secret_hash is null)
      or (auth_mode in ('secret','hmac') and secret_hash is not null)
      or (auth_mode = 'internal'))
);

create unique index if not exists uq_tracking_sources_org_hostname
  on public.tracking_sources(organization_id, hostname)
  where hostname is not null;

create index if not exists idx_tracking_sources_org_status
  on public.tracking_sources(organization_id, status, source_type);

create index if not exists idx_tracking_sources_hostname
  on public.tracking_sources(lower(hostname))
  where hostname is not null;

alter table public.raw_events
  add column if not exists tracking_source_id uuid references public.tracking_sources(id),
  add column if not exists event_family text,
  add column if not exists contract_version integer;

create index if not exists idx_raw_events_tracking_source
  on public.raw_events(organization_id,tracking_source_id,received_at desc)
  where tracking_source_id is not null;

create index if not exists idx_raw_events_family
  on public.raw_events(organization_id,event_family,received_at desc)
  where event_family is not null;

alter table public.tracking_sources enable row level security;

revoke all on public.tracking_sources from anon, authenticated;
grant select,insert,update,delete on public.tracking_sources to service_role;

commit;
