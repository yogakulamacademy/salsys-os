create table if not exists public.system_intelligence_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_version text not null default 'r10-event-v1',
  event_key text not null,
  event_type text not null,
  severity text not null default 'info',
  title text not null,
  summary text not null,
  previous_snapshot_id uuid references public.system_intelligence_snapshots(id) on delete set null,
  source_snapshot_id uuid references public.system_intelligence_snapshots(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  observational boolean not null default true,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint system_intelligence_events_event_type_check check (
    event_type in (
      'issue_appeared',
      'issue_resolved',
      'issue_changed',
      'urgency_escalated',
      'urgency_deescalated',
      'reply_backlog_changed',
      'high_intent_changed',
      'system_failure_appeared',
      'system_failure_resolved'
    )
  ),
  constraint system_intelligence_events_severity_check check (
    severity in ('info', 'warning', 'critical', 'opportunity')
  ),
  constraint system_intelligence_events_org_event_key_unique unique (organization_id, event_key)
);

create index if not exists idx_system_intelligence_events_org_occurred
  on public.system_intelligence_events (organization_id, occurred_at desc);

create index if not exists idx_system_intelligence_events_org_type_occurred
  on public.system_intelligence_events (organization_id, event_type, occurred_at desc);

alter table public.system_intelligence_events enable row level security;

revoke all on public.system_intelligence_events from public, anon;
grant select on public.system_intelligence_events to authenticated;
grant all on public.system_intelligence_events to service_role;

drop policy if exists system_intelligence_events_member_select
  on public.system_intelligence_events;
create policy system_intelligence_events_member_select
  on public.system_intelligence_events
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create or replace view public.v_r10_system_event_memory_v1
with (security_invoker = true)
as
with recent as (
  select
    e.*,
    row_number() over (
      partition by e.organization_id
      order by e.occurred_at desc, e.created_at desc, e.id desc
    ) as recency_rank
  from public.system_intelligence_events e
  where e.occurred_at >= now() - interval '24 hours'
), aggregates as (
  select
    organization_id,
    count(*)::bigint as events_24h,
    count(*) filter (where severity = 'critical')::bigint as critical_events_24h,
    count(*) filter (where severity = 'warning')::bigint as warning_events_24h,
    count(*) filter (where severity = 'opportunity')::bigint as opportunity_events_24h,
    count(*) filter (
      where event_type in ('issue_appeared', 'issue_changed', 'urgency_escalated', 'system_failure_appeared')
    )::bigint as deterioration_events_24h,
    count(*) filter (
      where event_type in ('issue_resolved', 'urgency_deescalated', 'system_failure_resolved')
    )::bigint as recovery_events_24h,
    max(occurred_at) as latest_event_at
  from recent
  group by organization_id
), latest as (
  select
    organization_id,
    event_type as latest_event_type,
    severity as latest_event_severity,
    title as latest_event_title,
    summary as latest_event_summary,
    evidence as latest_event_evidence,
    occurred_at as latest_event_at
  from recent
  where recency_rank = 1
)
select
  o.id as organization_id,
  coalesce(a.events_24h, 0)::bigint as events_24h,
  coalesce(a.critical_events_24h, 0)::bigint as critical_events_24h,
  coalesce(a.warning_events_24h, 0)::bigint as warning_events_24h,
  coalesce(a.opportunity_events_24h, 0)::bigint as opportunity_events_24h,
  coalesce(a.deterioration_events_24h, 0)::bigint as deterioration_events_24h,
  coalesce(a.recovery_events_24h, 0)::bigint as recovery_events_24h,
  l.latest_event_type,
  l.latest_event_severity,
  l.latest_event_title,
  l.latest_event_summary,
  l.latest_event_evidence,
  coalesce(l.latest_event_at, a.latest_event_at) as latest_event_at,
  now() as evaluated_at
from public.organizations o
left join aggregates a on a.organization_id = o.id
left join latest l on l.organization_id = o.id;

comment on table public.system_intelligence_events is
  'R10 append-only operational event memory derived from meaningful changes between observed system-awareness snapshots. Events are observational and must not imply causation.';

comment on view public.v_r10_system_event_memory_v1 is
  'R10 tenant-safe 24-hour operational event-memory summary for System Intelligence and Owner Command Center surfaces.';

revoke all on public.v_r10_system_event_memory_v1 from public, anon;
grant select on public.v_r10_system_event_memory_v1 to authenticated, service_role;
