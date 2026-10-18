-- SEO / AEO / GEO ranking provider control plane v1
-- Stores non-secret tenant controls only. Provider credentials remain server-side.

create table if not exists public.seo_rank_provider_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  provider_key text not null default 'external_http',
  enabled boolean not null default false,
  seo_enabled boolean not null default true,
  aeo_enabled boolean not null default true,
  geo_enabled boolean not null default true,
  min_interval_minutes integer not null default 60 check (min_interval_minutes between 60 and 10080),
  max_checks_per_hour integer not null default 20 check (max_checks_per_hour between 1 and 500),
  max_checks_per_day integer not null default 200 check (max_checks_per_day between 1 and 5000),
  test_query text,
  test_country_code text not null default 'IN',
  test_locale text not null default 'en-IN',
  last_health_status text check (last_health_status is null or last_health_status in ('ok','degraded','failed','not_configured')),
  last_health_checked_at timestamptz,
  last_health_latency_ms integer,
  last_health_error_category text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seo_rank_provider_health_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_key text not null,
  surface text not null check (surface in ('seo','aeo','geo')),
  query text not null,
  status text not null check (status in ('ok','degraded','failed','not_configured')),
  latency_ms integer,
  normalized_ok boolean not null default false,
  provider_name text,
  error_category text,
  result_summary jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_seo_rank_provider_health_org_time
  on public.seo_rank_provider_health_runs (organization_id, created_at desc);

alter table public.seo_rank_provider_settings enable row level security;
alter table public.seo_rank_provider_health_runs enable row level security;

revoke all on public.seo_rank_provider_settings from public, anon, authenticated;
revoke all on public.seo_rank_provider_health_runs from public, anon, authenticated;
grant select, insert, update, delete on public.seo_rank_provider_settings to service_role;
grant select, insert, update, delete on public.seo_rank_provider_health_runs to service_role;

insert into public.seo_rank_provider_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;
