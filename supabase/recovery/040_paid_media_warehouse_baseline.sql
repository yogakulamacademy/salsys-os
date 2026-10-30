-- =============================================================================
-- PH-5.2B.1m COLD-RECOVERY COMPATIBILITY BASELINE
-- Migration 040 prerequisite: Google Ads + Meta Ads warehouse foundation
--
-- This file is NOT part of the normal production migration ledger.
-- It exists only to reconstruct historical live-only objects that migration 040
-- assumes already exist during an isolated cold rebuild.
--
-- Never run it against current production.
-- No production ad rows, credentials, connection rows, or provider assets copy.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Provider updated-at helpers
-- -----------------------------------------------------------------------------

create or replace function public.google_ads_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.meta_ads_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- -----------------------------------------------------------------------------
-- Google Ads warehouse
-- -----------------------------------------------------------------------------

create table if not exists public.google_ads_sync_runs (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'running'::text,
  triggered_by text not null default 'manual'::text,
  campaign_rows integer not null default 0,
  ad_group_rows integer not null default 0,
  keyword_rows integer not null default 0,
  search_term_rows integer not null default 0,
  geo_rows integer not null default 0,
  device_rows integer not null default 0,
  total_rows integer not null default 0,
  error_message text,
  request_ids jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  constraint google_ads_sync_runs_status_check
    check (status = any(array['running'::text,'success'::text,'failed'::text]))
);

create table if not exists public.google_ads_campaign_daily (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  date date not null,
  campaign_id text not null,
  campaign_name text,
  campaign_status text,
  advertising_channel_type text,
  currency_code text,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  interactions bigint not null default 0,
  cost_micros bigint not null default 0,
  conversions numeric not null default 0,
  conversions_value numeric not null default 0,
  all_conversions numeric not null default 0,
  all_conversions_value numeric not null default 0,
  sync_run_id uuid references public.google_ads_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.google_ads_keyword_daily (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  date date not null,
  campaign_id text not null,
  campaign_name text,
  ad_group_id text not null,
  ad_group_name text,
  criterion_id text not null,
  keyword_text text,
  match_type text,
  criterion_status text,
  currency_code text,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  cost_micros bigint not null default 0,
  conversions numeric not null default 0,
  conversions_value numeric not null default 0,
  sync_run_id uuid references public.google_ads_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.google_ads_search_term_daily (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  date date not null,
  campaign_id text not null,
  campaign_name text,
  ad_group_id text not null,
  ad_group_name text,
  search_term text not null,
  search_term_status text,
  currency_code text,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  cost_micros bigint not null default 0,
  conversions numeric not null default 0,
  conversions_value numeric not null default 0,
  sync_run_id uuid references public.google_ads_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.google_ads_geo_daily (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  date date not null,
  country_criterion_id text not null,
  country_name text,
  location_type text not null default 'UNKNOWN'::text,
  currency_code text,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  cost_micros bigint not null default 0,
  conversions numeric not null default 0,
  conversions_value numeric not null default 0,
  sync_run_id uuid references public.google_ads_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.google_ads_device_daily (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  date date not null,
  device text not null,
  currency_code text,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  cost_micros bigint not null default 0,
  conversions numeric not null default 0,
  conversions_value numeric not null default 0,
  sync_run_id uuid references public.google_ads_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create unique index if not exists uq_google_ads_campaign_daily_org
  on public.google_ads_campaign_daily(organization_id, customer_id, date, campaign_id);
create unique index if not exists uq_google_ads_keyword_daily_org
  on public.google_ads_keyword_daily(organization_id, customer_id, date, campaign_id, ad_group_id, criterion_id);
create unique index if not exists uq_google_ads_search_term_daily_org
  on public.google_ads_search_term_daily(organization_id, customer_id, date, campaign_id, ad_group_id, search_term);
create unique index if not exists uq_google_ads_geo_daily_org
  on public.google_ads_geo_daily(organization_id, customer_id, date, country_criterion_id, location_type);
create unique index if not exists uq_google_ads_device_daily_org
  on public.google_ads_device_daily(organization_id, customer_id, date, device);

create index if not exists idx_google_ads_campaign_org_date
  on public.google_ads_campaign_daily(organization_id, date desc);
create index if not exists idx_google_ads_keyword_org_date
  on public.google_ads_keyword_daily(organization_id, date desc);
create index if not exists idx_google_ads_search_term_org_date
  on public.google_ads_search_term_daily(organization_id, date desc);
create index if not exists idx_google_ads_geo_org_date
  on public.google_ads_geo_daily(organization_id, date desc);
create index if not exists idx_google_ads_device_org_date
  on public.google_ads_device_daily(organization_id, date desc);
create index if not exists idx_google_ads_sync_runs_org_started
  on public.google_ads_sync_runs(organization_id, started_at desc);

-- -----------------------------------------------------------------------------
-- Meta Ads warehouse needed by the pre-040 Campaigns CRM view
-- -----------------------------------------------------------------------------

create table if not exists public.meta_ads_sync_runs (
  id uuid primary key default gen_random_uuid(),
  ad_account_id text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'running'::text,
  triggered_by text not null default 'manual'::text,
  campaign_rows integer not null default 0,
  adset_rows integer not null default 0,
  ad_rows integer not null default 0,
  publisher_rows integer not null default 0,
  country_rows integer not null default 0,
  device_rows integer not null default 0,
  total_rows integer not null default 0,
  error_message text,
  request_metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  constraint meta_ads_sync_runs_status_check
    check (status = any(array['running'::text,'success'::text,'failed'::text]))
);

create table if not exists public.meta_ads_campaign_daily (
  id uuid primary key default gen_random_uuid(),
  ad_account_id text not null,
  date date not null,
  campaign_id text not null,
  campaign_name text,
  objective text,
  currency_code text,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  inline_link_clicks bigint not null default 0,
  ctr numeric not null default 0,
  cpc numeric not null default 0,
  cpm numeric not null default 0,
  frequency numeric not null default 0,
  actions jsonb not null default '[]'::jsonb,
  action_values jsonb not null default '[]'::jsonb,
  sync_run_id uuid references public.meta_ads_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.meta_ads_adset_daily (
  id uuid primary key default gen_random_uuid(),
  ad_account_id text not null,
  date date not null,
  campaign_id text not null,
  campaign_name text,
  adset_id text not null,
  adset_name text,
  currency_code text,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  inline_link_clicks bigint not null default 0,
  ctr numeric not null default 0,
  cpc numeric not null default 0,
  cpm numeric not null default 0,
  frequency numeric not null default 0,
  actions jsonb not null default '[]'::jsonb,
  action_values jsonb not null default '[]'::jsonb,
  sync_run_id uuid references public.meta_ads_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create table if not exists public.meta_ads_ad_daily (
  id uuid primary key default gen_random_uuid(),
  ad_account_id text not null,
  date date not null,
  campaign_id text not null,
  campaign_name text,
  adset_id text not null,
  adset_name text,
  ad_id text not null,
  ad_name text,
  currency_code text,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  inline_link_clicks bigint not null default 0,
  ctr numeric not null default 0,
  cpc numeric not null default 0,
  cpm numeric not null default 0,
  frequency numeric not null default 0,
  actions jsonb not null default '[]'::jsonb,
  action_values jsonb not null default '[]'::jsonb,
  sync_run_id uuid references public.meta_ads_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create unique index if not exists uq_meta_ads_campaign_daily_org
  on public.meta_ads_campaign_daily(organization_id, ad_account_id, date, campaign_id);
create unique index if not exists uq_meta_ads_adset_daily_org
  on public.meta_ads_adset_daily(organization_id, ad_account_id, date, campaign_id, adset_id);
create unique index if not exists uq_meta_ads_ad_daily_org
  on public.meta_ads_ad_daily(organization_id, ad_account_id, date, campaign_id, adset_id, ad_id);
create index if not exists idx_meta_ads_campaign_daily_org
  on public.meta_ads_campaign_daily(organization_id, date desc);
create index if not exists idx_meta_ads_adset_daily_org
  on public.meta_ads_adset_daily(organization_id, date desc);
create index if not exists idx_meta_ads_ad_daily_org
  on public.meta_ads_ad_daily(organization_id, date desc);
create index if not exists idx_meta_ads_sync_runs_org_started
  on public.meta_ads_sync_runs(organization_id, started_at desc);

-- -----------------------------------------------------------------------------
-- Updated-at triggers
-- -----------------------------------------------------------------------------

create trigger google_ads_campaign_daily_set_updated_at
before update on public.google_ads_campaign_daily
for each row execute function public.google_ads_set_updated_at();
create trigger google_ads_keyword_daily_set_updated_at
before update on public.google_ads_keyword_daily
for each row execute function public.google_ads_set_updated_at();
create trigger google_ads_search_term_daily_set_updated_at
before update on public.google_ads_search_term_daily
for each row execute function public.google_ads_set_updated_at();
create trigger google_ads_geo_daily_set_updated_at
before update on public.google_ads_geo_daily
for each row execute function public.google_ads_set_updated_at();
create trigger google_ads_device_daily_set_updated_at
before update on public.google_ads_device_daily
for each row execute function public.google_ads_set_updated_at();
create trigger meta_ads_campaign_daily_set_updated_at
before update on public.meta_ads_campaign_daily
for each row execute function public.meta_ads_set_updated_at();
create trigger meta_ads_adset_daily_set_updated_at
before update on public.meta_ads_adset_daily
for each row execute function public.meta_ads_set_updated_at();
create trigger meta_ads_ad_daily_set_updated_at
before update on public.meta_ads_ad_daily
for each row execute function public.meta_ads_set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS + explicit Data API privileges
-- -----------------------------------------------------------------------------

do $block$
declare
  v_table text;
  v_google text[] := array[
    'google_ads_sync_runs','google_ads_campaign_daily','google_ads_keyword_daily',
    'google_ads_search_term_daily','google_ads_geo_daily','google_ads_device_daily'
  ];
  v_meta text[] := array[
    'meta_ads_sync_runs','meta_ads_campaign_daily','meta_ads_adset_daily','meta_ads_ad_daily'
  ];
begin
  foreach v_table in array v_google loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_read', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_organization_member(organization_id))',
      v_table || '_read', v_table
    );
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', v_table);
    execute format('grant select on table public.%I to authenticated', v_table);
    execute format('grant all on table public.%I to service_role', v_table);
  end loop;

  foreach v_table in array v_meta loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_read', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_crm_user() and public.is_organization_member(organization_id))',
      v_table || '_read', v_table
    );
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', v_table);
    execute format('grant select on table public.%I to authenticated', v_table);
    execute format('grant all on table public.%I to service_role', v_table);
  end loop;
end;
$block$;

-- Historical boundary note:
-- Current production google_ads_sync_runs/meta_ads_sync_runs also contain
-- connection_id and integration_asset_id. Migration 040 does not reference them,
-- and checked pre-040 migration history does not prove they belonged here, so
-- this compatibility baseline deliberately does not pull them backward.

commit;
