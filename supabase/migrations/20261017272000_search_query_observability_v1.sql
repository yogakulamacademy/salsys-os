-- Search query observability v1
-- Stores operational search telemetry without storing the user's raw query.

create table if not exists public.search_query_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  query_length integer not null default 0 check (query_length >= 0 and query_length <= 500),
  entity_types text[] not null default '{}'::text[],
  result_count integer not null default 0 check (result_count >= 0),
  took_ms integer not null default 0 check (took_ms >= 0),
  outcome text not null check (outcome in ('success','zero_result','error')),
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.search_query_events is
  'Tenant-scoped operational search telemetry. Raw query text is intentionally not stored.';

create index if not exists search_query_events_org_occurred_idx
  on public.search_query_events (organization_id, occurred_at desc);

create index if not exists search_query_events_org_outcome_occurred_idx
  on public.search_query_events (organization_id, outcome, occurred_at desc);

alter table public.search_query_events enable row level security;

revoke all on table public.search_query_events from public, anon, authenticated;
grant select, insert on table public.search_query_events to service_role;

create or replace view public.v_search_query_health_v1
with (security_invoker=true) as
select
  o.id as organization_id,
  count(e.id) filter (where e.occurred_at >= now() - interval '24 hours')::bigint as searches_24h,
  count(e.id) filter (
    where e.occurred_at >= now() - interval '24 hours'
      and e.outcome = 'zero_result'
  )::bigint as zero_result_24h,
  count(e.id) filter (
    where e.occurred_at >= now() - interval '24 hours'
      and e.outcome = 'error'
  )::bigint as errors_24h,
  count(e.id) filter (where e.occurred_at >= now() - interval '7 days')::bigint as searches_7d,
  round(
    avg(e.took_ms) filter (
      where e.occurred_at >= now() - interval '24 hours'
        and e.outcome <> 'error'
    )::numeric,
    1
  ) as avg_took_ms_24h,
  percentile_cont(0.95) within group (order by e.took_ms)
    filter (
      where e.occurred_at >= now() - interval '24 hours'
        and e.outcome <> 'error'
    ) as p95_took_ms_24h,
  max(e.occurred_at) as last_search_at,
  max(e.occurred_at) filter (where e.outcome = 'error') as last_error_at,
  max(e.error_code) filter (
    where e.occurred_at = (
      select max(e2.occurred_at)
      from public.search_query_events e2
      where e2.organization_id = o.id
        and e2.outcome = 'error'
    )
  ) as latest_error_code,
  now() as checked_at
from public.organizations o
left join public.search_query_events e
  on e.organization_id = o.id
  and e.occurred_at >= now() - interval '7 days'
group by o.id;

create or replace view public.v_search_observability_v1
with (security_invoker=true) as
select
  o.id as organization_id,
  coalesce(s.indexing_enabled, false) as indexing_enabled,
  coalesce(s.pilot_mode_enabled, true) as pilot_mode_enabled,
  s.pilot_started_at,
  coalesce(s.pilot_max_documents, 25) as pilot_max_documents,
  s.pilot_seeded_at,
  coalesce(h.pending, 0) as pending,
  coalesce(h.processing, 0) as processing,
  coalesce(h.retry, 0) as retry,
  coalesce(h.dead_letter, 0) as dead_letter,
  coalesce(h.done, 0) as done,
  h.oldest_waiting_at,
  h.last_completed_at,
  coalesce(q.searches_24h, 0) as searches_24h,
  coalesce(q.zero_result_24h, 0) as zero_result_24h,
  coalesce(q.errors_24h, 0) as errors_24h,
  coalesce(q.searches_7d, 0) as searches_7d,
  q.avg_took_ms_24h,
  q.p95_took_ms_24h,
  q.last_search_at,
  q.last_error_at,
  q.latest_error_code,
  now() as checked_at
from public.organizations o
left join public.search_index_settings s
  on s.organization_id = o.id
left join public.v_search_index_health_v1 h
  on h.organization_id = o.id
left join public.v_search_query_health_v1 q
  on q.organization_id = o.id;

revoke all on public.v_search_query_health_v1 from public, anon, authenticated;
revoke all on public.v_search_observability_v1 from public, anon, authenticated;
grant select on public.v_search_query_health_v1 to service_role;
grant select on public.v_search_observability_v1 to service_role;
