-- Cold-recovery compatibility only.
--
-- Production created this table in the applied migration
-- 20261014140808_w6_semantic_processing_and_page_query_grain, which is missing
-- from Git history. The complete authoritative W6 migration remains separately
-- mapped for later ledger-parity recovery. This narrow prerequisite reconstructs
-- only the page+query Search Console grain required by
-- 20261015065001_seo_keyword_serp_intelligence_v1.
--
-- No production rows are copied. Never apply this recovery file to production.

begin;

create table if not exists public.gsc_page_query_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_url text not null,
  date date not null,
  search_type text not null default 'web',
  page text not null,
  query text not null,
  clicks integer not null default 0 check (clicks >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  ctr numeric not null default 0 check (ctr >= 0),
  avg_position numeric not null default 0 check (avg_position >= 0),
  sync_run_id uuid references public.gsc_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gsc_page_query_daily_nonblank_page check (btrim(page) <> ''),
  constraint gsc_page_query_daily_nonblank_query check (btrim(query) <> ''),
  unique (organization_id, site_url, date, search_type, page, query)
);

create index if not exists gsc_page_query_daily_org_date_idx
  on public.gsc_page_query_daily(organization_id, date desc);
create index if not exists gsc_page_query_daily_page_idx
  on public.gsc_page_query_daily(organization_id, page, date desc);
create index if not exists gsc_page_query_daily_query_idx
  on public.gsc_page_query_daily(organization_id, query, date desc);

alter table public.gsc_page_query_daily enable row level security;
revoke all on public.gsc_page_query_daily from anon, authenticated;
grant select on public.gsc_page_query_daily to authenticated;
grant all on public.gsc_page_query_daily to service_role;

create policy gsc_page_query_daily_read on public.gsc_page_query_daily
  for select to authenticated
  using (public.is_organization_member(organization_id));

create trigger gsc_page_query_daily_set_updated_at
  before update on public.gsc_page_query_daily
  for each row execute function public.set_updated_at();

comment on table public.gsc_page_query_daily is
  'Joint page+query Search Console grain for query-to-page semantic mapping, cannibalization and intent analysis.';

commit;
