-- =============================================================================
-- CI-ONLY HISTORICAL RECOVERY PREREQUISITE
-- Admissions execution ledger + pre-R10 canonical System Health base view
--
-- The production database contains public.admissions_auto_task_runs and the
-- canonical public.v_system_health contract, but their original creators are
-- absent from the repository migration history. PH-3 later versions that base
-- view, so a clean replay must reconstruct the historical boundary first.
--
-- This recovery intentionally models the pre-R10 health contract. The later
-- R10 outcome-learning migration adds the intelligence_outcomes system and its
-- system_intelligence_outcome_runs source normally.
--
-- CI only. Never apply this recovery file directly to current production.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Admissions automation execution ledger recovered from production catalog.
-- -----------------------------------------------------------------------------

create table if not exists public.admissions_auto_task_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_source text not null default 'cron'::text,
  status text not null default 'running'::text,
  processed_count integer not null default 0,
  created_count integer not null default 0,
  failed_count integer not null default 0,
  result_rows jsonb not null default '[]'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  constraint admissions_auto_task_runs_trigger_source_check
    check (trigger_source = any (array['cron'::text, 'manual'::text, 'system'::text])),
  constraint admissions_auto_task_runs_status_check
    check (status = any (array['running'::text, 'success'::text, 'partial'::text, 'failed'::text]))
);

create index if not exists idx_admissions_auto_task_runs_organization
  on public.admissions_auto_task_runs (organization_id);
create index if not exists idx_admissions_auto_task_runs_started
  on public.admissions_auto_task_runs (started_at desc);
create index if not exists idx_admissions_auto_task_runs_status
  on public.admissions_auto_task_runs (status, started_at desc);

alter table public.admissions_auto_task_runs enable row level security;

drop policy if exists admissions_auto_task_runs_read on public.admissions_auto_task_runs;
create policy admissions_auto_task_runs_read
on public.admissions_auto_task_runs
for select
to authenticated
using (
  public.is_crm_user()
  and public.is_organization_member(organization_id)
);

grant select on public.admissions_auto_task_runs to authenticated;
grant all on public.admissions_auto_task_runs to service_role;

-- -----------------------------------------------------------------------------
-- Canonical System Health base view, reconstructed at the pre-R10 boundary.
-- The current production definition is the same operational contract plus the
-- later R10 intelligence_outcomes source, which is deliberately omitted here.
-- -----------------------------------------------------------------------------

create or replace view public.v_system_health
with (security_invoker = true)
as
with systems as (
  select
    'ga4'::text as system_key,
    'Google Analytics 4'::text as system_name,
    'analytics'::text as system_group,
    1800::integer as stale_after_minutes

  union all

  select 'gsc'::text, 'Google Search Console'::text, 'analytics'::text, 1800::integer

  union all

  select 'google_ads'::text, 'Google Ads'::text, 'advertising'::text, 1800::integer

  union all

  select 'meta_ads'::text, 'Meta Ads'::text, 'advertising'::text, 1800::integer

  union all

  select 'admissions'::text, 'Admissions Automation'::text, 'automation'::text, 360::integer

  union all

  select 'whatsapp'::text, 'WhatsApp'::text, 'messaging'::text, null::integer

  union all

  select 'lead_capture'::text, 'Website Lead Capture'::text, 'lead_capture'::text, null::integer
),
events as (
  select
    'ga4'::text as system_key,
    coalesce(r.completed_at, r.started_at, r.created_at) as event_at,
    r.status,
    lower(r.status) = any (array['success'::text, 'completed'::text]) as is_success,
    lower(r.status) = any (array['failed'::text, 'error'::text]) as is_failure,
    false as is_pending,
    r.error_message,
    r.organization_id
  from public.ga4_sync_runs r

  union all

  select
    'gsc'::text,
    coalesce(r.completed_at, r.started_at),
    r.status,
    lower(r.status) = any (array['success'::text, 'completed'::text]),
    lower(r.status) = any (array['failed'::text, 'error'::text]),
    false,
    r.error_message,
    r.organization_id
  from public.gsc_sync_runs r

  union all

  select
    'google_ads'::text,
    coalesce(r.completed_at, r.started_at),
    r.status,
    lower(r.status) = any (array['success'::text, 'completed'::text]),
    lower(r.status) = any (array['failed'::text, 'error'::text]),
    false,
    r.error_message,
    r.organization_id
  from public.google_ads_sync_runs r

  union all

  select
    'meta_ads'::text,
    coalesce(r.completed_at, r.started_at),
    r.status,
    lower(r.status) = any (array['success'::text, 'completed'::text]),
    lower(r.status) = any (array['failed'::text, 'error'::text]),
    false,
    r.error_message,
    r.organization_id
  from public.meta_ads_sync_runs r

  union all

  select
    'admissions'::text,
    coalesce(r.completed_at, r.started_at),
    r.status,
    lower(r.status) = any (array['success'::text, 'completed'::text]),
    lower(r.status) = any (array['failed'::text, 'error'::text]),
    lower(r.status) = any (array['pending'::text, 'running'::text, 'processing'::text]),
    r.error_message,
    r.organization_id
  from public.admissions_auto_task_runs r

  union all

  select
    'whatsapp'::text,
    coalesce(e.processed_at, e.received_at),
    e.processing_status,
    lower(e.processing_status) = any (array['processed'::text, 'ignored'::text]),
    lower(e.processing_status) = any (array['failed'::text, 'error'::text]),
    lower(e.processing_status) = any (array['received'::text, 'pending'::text, 'processing'::text])
      and e.processed_at is null,
    e.processing_error,
    e.organization_id
  from public.whatsapp_webhook_events e

  union all

  select
    'lead_capture'::text,
    e.received_at,
    e.status,
    lower(e.status) = any (array['processed'::text, 'duplicate'::text, 'success'::text, 'completed'::text]),
    lower(e.status) = any (array['failed'::text, 'error'::text]),
    lower(e.status) = any (array['received'::text, 'pending'::text, 'processing'::text]),
    coalesce(
      e.metadata ->> 'error'::text,
      e.metadata ->> 'error_message'::text,
      e.metadata ->> 'message'::text
    ),
    e.organization_id
  from public.lead_ingest_events e
),
aggregated as (
  select
    e.organization_id,
    e.system_key,
    max(e.event_at) as latest_activity_at,
    max(e.event_at) filter (where e.is_success) as last_success_at,
    max(e.event_at) filter (where e.is_failure) as last_failure_at,
    count(*) filter (where e.event_at >= now() - interval '24 hours') as activity_24h,
    count(*) filter (
      where e.is_failure
        and e.event_at >= now() - interval '24 hours'
    ) as failures_24h,
    count(*) filter (where e.is_pending) as pending_count,
    min(e.event_at) filter (where e.is_pending) as oldest_pending_at
  from events e
  group by e.organization_id, e.system_key
),
latest_event as (
  select distinct on (e.organization_id, e.system_key)
    e.organization_id,
    e.system_key,
    e.status as latest_status,
    e.error_message as latest_error,
    e.event_at
  from events e
  order by e.organization_id, e.system_key, e.event_at desc nulls last
)
select
  s.system_key,
  s.system_name,
  s.system_group,
  case
    when s.system_key = 'whatsapp'
      and a.oldest_pending_at is not null
      and a.oldest_pending_at < now() - interval '15 minutes'
      then 'critical'::text
    when s.system_key = 'lead_capture'
      and a.oldest_pending_at is not null
      and a.oldest_pending_at < now() - interval '15 minutes'
      then 'critical'::text
    when a.last_failure_at is not null
      and (a.last_success_at is null or a.last_failure_at > a.last_success_at)
      then 'critical'::text
    when a.latest_activity_at is null
      then 'warning'::text
    when s.stale_after_minutes is not null
      and (
        a.last_success_at is null
        or a.last_success_at < now() - make_interval(mins => s.stale_after_minutes)
      )
      then 'warning'::text
    when coalesce(a.failures_24h, 0::bigint) > 0
      then 'warning'::text
    else 'healthy'::text
  end as health_status,
  l.latest_status,
  a.latest_activity_at,
  a.last_success_at,
  a.last_failure_at,
  coalesce(a.activity_24h, 0::bigint) as activity_24h,
  coalesce(a.failures_24h, 0::bigint) as failures_24h,
  coalesce(a.pending_count, 0::bigint) as pending_count,
  a.oldest_pending_at,
  case
    when a.oldest_pending_at is not null
      then extract(epoch from now() - a.oldest_pending_at) / 60.0
    else null::numeric
  end as oldest_pending_minutes,
  l.latest_error,
  s.stale_after_minutes,
  o.id as organization_id
from public.organizations o
cross join systems s
left join aggregated a
  on a.organization_id = o.id
 and a.system_key = s.system_key
left join latest_event l
  on l.organization_id = o.id
 and l.system_key = s.system_key;

comment on view public.v_system_health is
  'Canonical operational health baseline reconstructed for cold replay before the later R10 outcome-learning extension.';

grant select on public.v_system_health to authenticated, service_role;

commit;
