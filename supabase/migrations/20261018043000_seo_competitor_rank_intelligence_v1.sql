-- SEO Competitor + Ranking Intelligence V1

create table if not exists public.seo_competitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null,
  display_name text,
  is_active boolean not null default true,
  competitor_type text not null default 'organic' check (competitor_type in ('organic','commercial','content','local','ai_visibility')),
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, domain)
);

create table if not exists public.seo_rank_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid references public.seo_sites(id) on delete cascade,
  query text not null,
  surface text not null check (surface in ('seo','aeo','geo')),
  locale text not null default 'en-IN',
  country_code text not null default 'IN',
  device text not null default 'desktop' check (device in ('desktop','mobile')),
  engine text not null default 'google',
  is_active boolean not null default true,
  priority smallint not null default 50 check (priority between 1 and 100),
  check_interval_minutes integer not null default 360 check (check_interval_minutes between 60 and 10080),
  last_checked_at timestamptz,
  next_check_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, query, surface, locale, country_code, device, engine)
);

create index if not exists idx_seo_rank_targets_due
  on public.seo_rank_targets (organization_id, is_active, next_check_at, priority desc);

create table if not exists public.seo_rank_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_id uuid not null references public.seo_rank_targets(id) on delete cascade,
  observed_at timestamptz not null default now(),
  source_provider text not null,
  own_position numeric,
  own_url text,
  own_title text,
  answer_visibility boolean,
  ai_cited boolean,
  ai_citation_position numeric,
  ai_provider text,
  competitor_results jsonb not null default '[]'::jsonb,
  serp_features jsonb not null default '[]'::jsonb,
  raw_reference jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_seo_rank_snapshots_target_time
  on public.seo_rank_snapshots (organization_id, target_id, observed_at desc);

create table if not exists public.seo_competitor_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid references public.seo_sites(id) on delete set null,
  status text not null default 'completed' check (status in ('queued','running','completed','failed')),
  scope text not null default 'portfolio',
  provider text not null default 'deterministic',
  model text,
  competitor_ids uuid[] not null default '{}'::uuid[],
  summary jsonb not null default '{}'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  error_category text,
  created_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_seo_competitor_analysis_org_time
  on public.seo_competitor_analysis_runs (organization_id, created_at desc);

create table if not exists public.seo_intelligence_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  export_type text not null check (export_type in ('competitor_analysis','ranking_report','seo_portfolio','decision_workspace')),
  format text not null check (format in ('csv','pdf','docx')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  filters jsonb not null default '{}'::jsonb,
  file_name text,
  storage_path text,
  content_hash text,
  row_count integer,
  error_category text,
  requested_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.seo_competitors enable row level security;
alter table public.seo_rank_targets enable row level security;
alter table public.seo_rank_snapshots enable row level security;
alter table public.seo_competitor_analysis_runs enable row level security;
alter table public.seo_intelligence_exports enable row level security;

revoke all on public.seo_competitors from public, anon, authenticated;
revoke all on public.seo_rank_targets from public, anon, authenticated;
revoke all on public.seo_rank_snapshots from public, anon, authenticated;
revoke all on public.seo_competitor_analysis_runs from public, anon, authenticated;
revoke all on public.seo_intelligence_exports from public, anon, authenticated;

grant select, insert, update, delete on public.seo_competitors to service_role;
grant select, insert, update, delete on public.seo_rank_targets to service_role;
grant select, insert, update, delete on public.seo_rank_snapshots to service_role;
grant select, insert, update, delete on public.seo_competitor_analysis_runs to service_role;
grant select, insert, update, delete on public.seo_intelligence_exports to service_role;

create or replace view public.v_seo_rank_latest_v1
with (security_invoker = true) as
select distinct on (t.organization_id, t.id)
  t.organization_id,
  t.id as target_id,
  t.site_id,
  t.query,
  t.surface,
  t.locale,
  t.country_code,
  t.device,
  t.engine,
  t.priority,
  s.observed_at,
  s.own_position,
  s.own_url,
  s.answer_visibility,
  s.ai_cited,
  s.ai_citation_position,
  s.ai_provider,
  s.competitor_results,
  s.serp_features
from public.seo_rank_targets t
left join public.seo_rank_snapshots s
  on s.organization_id = t.organization_id
 and s.target_id = t.id
where t.is_active = true
order by t.organization_id, t.id, s.observed_at desc nulls last;

revoke all on public.v_seo_rank_latest_v1 from public, anon, authenticated;
grant select on public.v_seo_rank_latest_v1 to service_role;
