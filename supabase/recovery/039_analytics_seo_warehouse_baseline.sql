-- =============================================================================
-- PH-5.2B.1l COLD-RECOVERY COMPATIBILITY BASELINE
-- Migration 039 prerequisite: Analytics + SEO warehouse tables
--
-- This file is NOT part of the normal production migration ledger.
-- It exists only to reconstruct historical objects that migration 039 assumes
-- already exist during an isolated cold rebuild.
--
-- Never run it against current production.
-- No production analytics rows, credentials, or provider assets are copied.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- GA4 warehouse
-- -----------------------------------------------------------------------------

create table if not exists public.ga4_daily (
  id bigserial primary key,
  property_id text not null,
  analytics_date date not null,
  sessions bigint not null default 0,
  total_users bigint not null default 0,
  active_users bigint not null default 0,
  new_users bigint not null default 0,
  page_views bigint not null default 0,
  engaged_sessions bigint not null default 0,
  engagement_rate numeric not null default 0,
  average_session_duration numeric not null default 0,
  key_events numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.ga4_source_medium_daily (
  id bigserial primary key,
  property_id text not null,
  analytics_date date not null,
  source text not null default '(not set)'::text,
  medium text not null default '(not set)'::text,
  sessions bigint not null default 0,
  total_users bigint not null default 0,
  new_users bigint not null default 0,
  engaged_sessions bigint not null default 0,
  key_events numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.ga4_landing_page_daily (
  id bigserial primary key,
  property_id text not null,
  analytics_date date not null,
  landing_page text not null default '(not set)'::text,
  sessions bigint not null default 0,
  total_users bigint not null default 0,
  new_users bigint not null default 0,
  engaged_sessions bigint not null default 0,
  key_events numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.ga4_campaign_daily (
  id bigserial primary key,
  property_id text not null,
  analytics_date date not null,
  campaign text not null default '(not set)'::text,
  source text not null default '(not set)'::text,
  medium text not null default '(not set)'::text,
  sessions bigint not null default 0,
  total_users bigint not null default 0,
  engaged_sessions bigint not null default 0,
  key_events numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.ga4_country_daily (
  id bigserial primary key,
  property_id text not null,
  analytics_date date not null,
  country text not null default '(not set)'::text,
  sessions bigint not null default 0,
  total_users bigint not null default 0,
  new_users bigint not null default 0,
  engaged_sessions bigint not null default 0,
  key_events numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.ga4_sync_runs (
  id uuid primary key default gen_random_uuid(),
  property_id text not null,
  status text not null default 'running'::text,
  from_date date,
  to_date date,
  overview_rows integer not null default 0,
  source_rows integer not null default 0,
  landing_page_rows integer not null default 0,
  campaign_rows integer not null default 0,
  country_rows integer not null default 0,
  total_rows integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  constraint ga4_sync_runs_status_check
    check (status = any(array['running'::text,'completed'::text,'failed'::text]))
);

create unique index if not exists uq_ga4_daily_org
  on public.ga4_daily(organization_id, property_id, analytics_date);
create index if not exists idx_ga4_daily_date
  on public.ga4_daily(analytics_date desc);
create index if not exists idx_ga4_daily_property_date
  on public.ga4_daily(property_id, analytics_date desc);
create index if not exists idx_ga4_daily_org_date
  on public.ga4_daily(organization_id, analytics_date desc);

create unique index if not exists uq_ga4_source_medium_daily_org
  on public.ga4_source_medium_daily(organization_id, property_id, analytics_date, source, medium);
create index if not exists idx_ga4_source_medium_date
  on public.ga4_source_medium_daily(analytics_date desc);
create index if not exists idx_ga4_source_medium_source
  on public.ga4_source_medium_daily(source, medium);
create index if not exists idx_ga4_source_medium_org_date
  on public.ga4_source_medium_daily(organization_id, analytics_date desc);

create unique index if not exists uq_ga4_landing_page_daily_org
  on public.ga4_landing_page_daily(organization_id, property_id, analytics_date, landing_page);
create index if not exists idx_ga4_landing_page_date
  on public.ga4_landing_page_daily(analytics_date desc);
create index if not exists idx_ga4_landing_page_org_date
  on public.ga4_landing_page_daily(organization_id, analytics_date desc);

create unique index if not exists uq_ga4_campaign_daily_org
  on public.ga4_campaign_daily(organization_id, property_id, analytics_date, campaign, source, medium);
create index if not exists idx_ga4_campaign_date
  on public.ga4_campaign_daily(analytics_date desc);
create index if not exists idx_ga4_campaign_name
  on public.ga4_campaign_daily(campaign);
create index if not exists idx_ga4_campaign_org_date
  on public.ga4_campaign_daily(organization_id, analytics_date desc);

create unique index if not exists uq_ga4_country_daily_org
  on public.ga4_country_daily(organization_id, property_id, analytics_date, country);
create index if not exists idx_ga4_country_date
  on public.ga4_country_daily(analytics_date desc);
create index if not exists idx_ga4_country_name
  on public.ga4_country_daily(country);
create index if not exists idx_ga4_country_org_date
  on public.ga4_country_daily(organization_id, analytics_date desc);

create index if not exists idx_ga4_sync_runs_started
  on public.ga4_sync_runs(started_at desc);
create index if not exists idx_ga4_sync_runs_org_started
  on public.ga4_sync_runs(organization_id, started_at desc);

-- -----------------------------------------------------------------------------
-- GSC warehouse
-- -----------------------------------------------------------------------------

create table if not exists public.gsc_sync_runs (
  id uuid primary key default gen_random_uuid(),
  site_url text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'running'::text,
  triggered_by text not null default 'manual'::text,
  total_rows integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  constraint gsc_sync_runs_status_check
    check (status = any(array['running'::text,'success'::text,'failed'::text])),
  constraint gsc_sync_runs_triggered_by_check
    check (triggered_by = any(array['manual'::text,'cron'::text,'system'::text]))
);

create table if not exists public.gsc_daily (
  id uuid primary key default gen_random_uuid(),
  site_url text not null,
  date date not null,
  search_type text not null default 'web'::text,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric not null default 0,
  avg_position numeric not null default 0,
  sync_run_id uuid references public.gsc_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.gsc_query_daily (
  id uuid primary key default gen_random_uuid(),
  site_url text not null,
  date date not null,
  search_type text not null default 'web'::text,
  query text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric not null default 0,
  avg_position numeric not null default 0,
  sync_run_id uuid references public.gsc_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.gsc_page_daily (
  id uuid primary key default gen_random_uuid(),
  site_url text not null,
  date date not null,
  search_type text not null default 'web'::text,
  page text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric not null default 0,
  avg_position numeric not null default 0,
  sync_run_id uuid references public.gsc_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.gsc_country_daily (
  id uuid primary key default gen_random_uuid(),
  site_url text not null,
  date date not null,
  search_type text not null default 'web'::text,
  country text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric not null default 0,
  avg_position numeric not null default 0,
  sync_run_id uuid references public.gsc_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.gsc_device_daily (
  id uuid primary key default gen_random_uuid(),
  site_url text not null,
  date date not null,
  search_type text not null default 'web'::text,
  device text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric not null default 0,
  avg_position numeric not null default 0,
  sync_run_id uuid references public.gsc_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.gsc_search_appearance_daily (
  id uuid primary key default gen_random_uuid(),
  site_url text not null,
  date date not null,
  search_type text not null default 'web'::text,
  search_appearance text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric not null default 0,
  avg_position numeric not null default 0,
  sync_run_id uuid references public.gsc_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create index if not exists idx_gsc_sync_runs_site_url
  on public.gsc_sync_runs(site_url);
create index if not exists idx_gsc_sync_runs_status
  on public.gsc_sync_runs(status);
create index if not exists idx_gsc_sync_runs_started_at
  on public.gsc_sync_runs(started_at desc);
create index if not exists idx_gsc_sync_runs_org_started
  on public.gsc_sync_runs(organization_id, started_at desc);

create unique index if not exists uq_gsc_daily_org
  on public.gsc_daily(organization_id, site_url, date, search_type);
create index if not exists idx_gsc_daily_date
  on public.gsc_daily(date desc);
create index if not exists idx_gsc_daily_site_date
  on public.gsc_daily(site_url, date desc);
create index if not exists idx_gsc_daily_org_date
  on public.gsc_daily(organization_id, date desc);

create unique index if not exists uq_gsc_query_daily_org
  on public.gsc_query_daily(organization_id, site_url, date, search_type, query);
create index if not exists idx_gsc_query_daily_site_date
  on public.gsc_query_daily(site_url, date desc);
create index if not exists idx_gsc_query_daily_query
  on public.gsc_query_daily(query);
create index if not exists idx_gsc_query_daily_clicks
  on public.gsc_query_daily(clicks desc);
create index if not exists idx_gsc_query_org_date
  on public.gsc_query_daily(organization_id, date desc);

create unique index if not exists uq_gsc_page_daily_org
  on public.gsc_page_daily(organization_id, site_url, date, search_type, page);
create index if not exists idx_gsc_page_daily_site_date
  on public.gsc_page_daily(site_url, date desc);
create index if not exists idx_gsc_page_daily_page
  on public.gsc_page_daily(page);
create index if not exists idx_gsc_page_daily_clicks
  on public.gsc_page_daily(clicks desc);
create index if not exists idx_gsc_page_org_date
  on public.gsc_page_daily(organization_id, date desc);

create unique index if not exists uq_gsc_country_daily_org
  on public.gsc_country_daily(organization_id, site_url, date, search_type, country);
create index if not exists idx_gsc_country_daily_site_date
  on public.gsc_country_daily(site_url, date desc);
create index if not exists idx_gsc_country_daily_country
  on public.gsc_country_daily(country);
create index if not exists idx_gsc_country_org_date
  on public.gsc_country_daily(organization_id, date desc);

create unique index if not exists uq_gsc_device_daily_org
  on public.gsc_device_daily(organization_id, site_url, date, search_type, device);
create index if not exists idx_gsc_device_daily_site_date
  on public.gsc_device_daily(site_url, date desc);
create index if not exists idx_gsc_device_daily_device
  on public.gsc_device_daily(device);
create index if not exists idx_gsc_device_org_date
  on public.gsc_device_daily(organization_id, date desc);

create unique index if not exists uq_gsc_search_appearance_daily_org
  on public.gsc_search_appearance_daily(organization_id, site_url, date, search_type, search_appearance);
create index if not exists idx_gsc_search_appearance_daily_site_date
  on public.gsc_search_appearance_daily(site_url, date desc);
create index if not exists idx_gsc_search_appearance_daily_appearance
  on public.gsc_search_appearance_daily(search_appearance);
create index if not exists idx_gsc_search_appearance_org_date
  on public.gsc_search_appearance_daily(organization_id, date desc);

-- Preserve the production GSC updated-at behavior. set_updated_at() is already
-- created by migration 001 and is therefore present at this recovery boundary.
drop trigger if exists trg_gsc_daily_updated_at on public.gsc_daily;
create trigger trg_gsc_daily_updated_at before update on public.gsc_daily
for each row execute function public.set_updated_at();

drop trigger if exists trg_gsc_query_daily_updated_at on public.gsc_query_daily;
create trigger trg_gsc_query_daily_updated_at before update on public.gsc_query_daily
for each row execute function public.set_updated_at();

drop trigger if exists trg_gsc_page_daily_updated_at on public.gsc_page_daily;
create trigger trg_gsc_page_daily_updated_at before update on public.gsc_page_daily
for each row execute function public.set_updated_at();

drop trigger if exists trg_gsc_country_daily_updated_at on public.gsc_country_daily;
create trigger trg_gsc_country_daily_updated_at before update on public.gsc_country_daily
for each row execute function public.set_updated_at();

drop trigger if exists trg_gsc_device_daily_updated_at on public.gsc_device_daily;
create trigger trg_gsc_device_daily_updated_at before update on public.gsc_device_daily
for each row execute function public.set_updated_at();

drop trigger if exists trg_gsc_search_appearance_daily_updated_at on public.gsc_search_appearance_daily;
create trigger trg_gsc_search_appearance_daily_updated_at before update on public.gsc_search_appearance_daily
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS + explicit Data API privileges
-- -----------------------------------------------------------------------------

do $block$
declare
  v_table text;
  v_tables text[] := array[
    'ga4_daily','ga4_source_medium_daily','ga4_landing_page_daily',
    'ga4_campaign_daily','ga4_country_daily','ga4_sync_runs',
    'gsc_daily','gsc_query_daily','gsc_page_daily','gsc_country_daily',
    'gsc_device_daily','gsc_search_appearance_daily','gsc_sync_runs'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_read', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_organization_member(organization_id))',
      v_table || '_read',
      v_table
    );
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', v_table);
    execute format('grant select on table public.%I to authenticated', v_table);
    execute format('grant all on table public.%I to service_role', v_table);
  end loop;
end;
$block$;

-- The GA4 bigint identity sequences are worker-owned; no client sequence access.
grant usage, select on sequence
  public.ga4_daily_id_seq,
  public.ga4_source_medium_daily_id_seq,
  public.ga4_landing_page_daily_id_seq,
  public.ga4_campaign_daily_id_seq,
  public.ga4_country_daily_id_seq
to service_role;

-- Historical boundary note:
-- Current production ga4_sync_runs/gsc_sync_runs also contain connection_id and
-- integration_asset_id. Migration 039 does not reference those columns and the
-- checked migration history does not prove they belonged to the pre-039 shape,
-- so this compatibility baseline deliberately does not pull them backward.

commit;
