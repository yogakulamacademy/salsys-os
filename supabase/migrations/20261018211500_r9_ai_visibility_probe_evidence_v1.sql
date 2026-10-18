-- R9 AI visibility probe evidence v1
-- Adds an evidence-first ledger for directly observed model mentions, recommendations and citations.
-- This does not create synthetic visibility signals and does not treat deterministic readiness as observed model visibility.

create table if not exists public.seo_ai_visibility_probe_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid null,
  provider text not null,
  model_name text null,
  probe_kind text not null,
  prompt_text text not null,
  locale text null,
  country_code text null,
  status text not null default 'queued',
  requested_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  error_message text null,
  created_by uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seo_ai_visibility_probe_runs_site_org_fk
    foreign key (site_id, organization_id)
    references public.organization_sites(id, organization_id)
    on delete cascade,
  constraint seo_ai_visibility_probe_runs_provider_chk
    check (length(btrim(provider)) between 1 and 80),
  constraint seo_ai_visibility_probe_runs_probe_kind_chk
    check (probe_kind in ('brand_visibility','answer_visibility','recommendation_visibility','citation_visibility')),
  constraint seo_ai_visibility_probe_runs_prompt_chk
    check (length(btrim(prompt_text)) between 1 and 4000),
  constraint seo_ai_visibility_probe_runs_status_chk
    check (status in ('queued','running','completed','failed','cancelled')),
  constraint seo_ai_visibility_probe_runs_time_chk
    check (
      (started_at is null or started_at >= requested_at)
      and (completed_at is null or started_at is not null)
      and (completed_at is null or completed_at >= started_at)
    )
);

create index if not exists idx_seo_ai_visibility_probe_runs_org_status
  on public.seo_ai_visibility_probe_runs (organization_id, status, requested_at desc);

create index if not exists idx_seo_ai_visibility_probe_runs_org_provider
  on public.seo_ai_visibility_probe_runs (organization_id, provider, requested_at desc);

create table if not exists public.seo_ai_visibility_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null,
  observed_at timestamptz not null default now(),
  brand_mentioned boolean not null default false,
  brand_recommended boolean not null default false,
  mention_count integer not null default 0,
  recommendation_position integer null,
  response_excerpt text null,
  evidence_hash text null,
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint seo_ai_visibility_observations_run_org_fk
    foreign key (run_id, organization_id)
    references public.seo_ai_visibility_probe_runs(id, organization_id)
    on delete cascade,
  constraint seo_ai_visibility_observations_mention_count_chk
    check (mention_count >= 0),
  constraint seo_ai_visibility_observations_position_chk
    check (recommendation_position is null or recommendation_position >= 1),
  constraint seo_ai_visibility_observations_excerpt_chk
    check (response_excerpt is null or length(response_excerpt) <= 2000)
);

create unique index if not exists seo_ai_visibility_probe_runs_id_org_uidx
  on public.seo_ai_visibility_probe_runs (id, organization_id);

create index if not exists idx_seo_ai_visibility_observations_org_observed
  on public.seo_ai_visibility_observations (organization_id, observed_at desc);

create table if not exists public.seo_ai_visibility_citations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  observation_id uuid not null,
  cited_url text not null,
  cited_domain text not null,
  citation_position integer null,
  is_owned_domain boolean not null default false,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint seo_ai_visibility_citations_observation_org_fk
    foreign key (observation_id, organization_id)
    references public.seo_ai_visibility_observations(id, organization_id)
    on delete cascade,
  constraint seo_ai_visibility_citations_url_chk
    check (length(btrim(cited_url)) between 1 and 4000),
  constraint seo_ai_visibility_citations_domain_chk
    check (length(btrim(cited_domain)) between 1 and 255),
  constraint seo_ai_visibility_citations_position_chk
    check (citation_position is null or citation_position >= 1)
);

create unique index if not exists seo_ai_visibility_observations_id_org_uidx
  on public.seo_ai_visibility_observations (id, organization_id);

create index if not exists idx_seo_ai_visibility_citations_org_observed
  on public.seo_ai_visibility_citations (organization_id, observed_at desc);

create index if not exists idx_seo_ai_visibility_citations_org_domain
  on public.seo_ai_visibility_citations (organization_id, cited_domain, observed_at desc);

alter table public.seo_ai_visibility_probe_runs enable row level security;
alter table public.seo_ai_visibility_observations enable row level security;
alter table public.seo_ai_visibility_citations enable row level security;

revoke all on table public.seo_ai_visibility_probe_runs from public, anon;
revoke all on table public.seo_ai_visibility_observations from public, anon;
revoke all on table public.seo_ai_visibility_citations from public, anon;

grant select on table public.seo_ai_visibility_probe_runs to authenticated, service_role;
grant select on table public.seo_ai_visibility_observations to authenticated, service_role;
grant select on table public.seo_ai_visibility_citations to authenticated, service_role;
grant insert, update, delete on table public.seo_ai_visibility_probe_runs to service_role;
grant insert, update, delete on table public.seo_ai_visibility_observations to service_role;
grant insert, update, delete on table public.seo_ai_visibility_citations to service_role;

create policy seo_ai_visibility_probe_runs_member_select
  on public.seo_ai_visibility_probe_runs
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create policy seo_ai_visibility_observations_member_select
  on public.seo_ai_visibility_observations
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create policy seo_ai_visibility_citations_member_select
  on public.seo_ai_visibility_citations
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create or replace view public.v_seo_ai_visibility_evidence_v1
with (security_invoker = true)
as
select
  r.organization_id,
  r.site_id,
  r.provider,
  r.model_name,
  r.probe_kind,
  count(distinct r.id) filter (where r.status='completed')::bigint as completed_probes,
  count(distinct o.id)::bigint as observations,
  count(distinct o.id) filter (where o.brand_mentioned)::bigint as mention_observations,
  count(distinct o.id) filter (where o.brand_recommended)::bigint as recommendation_observations,
  count(distinct c.id)::bigint as citations_observed,
  count(distinct c.id) filter (where c.is_owned_domain)::bigint as owned_domain_citations,
  min(o.observed_at) as first_observed_at,
  max(o.observed_at) as last_observed_at
from public.seo_ai_visibility_probe_runs r
left join public.seo_ai_visibility_observations o
  on o.organization_id=r.organization_id
 and o.run_id=r.id
left join public.seo_ai_visibility_citations c
  on c.organization_id=o.organization_id
 and c.observation_id=o.id
group by r.organization_id, r.site_id, r.provider, r.model_name, r.probe_kind;

revoke all on table public.v_seo_ai_visibility_evidence_v1 from public, anon;
grant select on table public.v_seo_ai_visibility_evidence_v1 to authenticated, service_role;

comment on table public.seo_ai_visibility_probe_runs is
'R9 model-probe execution ledger. A row is a concrete provider/model prompt request, not inferred visibility.';

comment on table public.seo_ai_visibility_observations is
'R9 normalized observations from completed model probes. Mention/recommendation fields represent directly observed response evidence only.';

comment on table public.seo_ai_visibility_citations is
'R9 citations directly observed in model-probe responses. Readiness scores and AI referral traffic must not populate this table.';

comment on view public.v_seo_ai_visibility_evidence_v1 is
'R9 tenant-safe aggregation of directly measured AI model mentions, recommendations and citations. It intentionally excludes deterministic readiness and referral inference.';