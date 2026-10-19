create table if not exists public.system_intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_version text not null default 'r10-awareness-v1',
  awareness_status text not null,
  urgency_score integer not null default 0,
  top_issue_code text,
  top_issue_summary text,
  awareness_payload jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  captured_by text not null default 'system'
);

create index if not exists idx_system_intelligence_snapshots_org_captured
  on public.system_intelligence_snapshots (organization_id, captured_at desc);

alter table public.system_intelligence_snapshots enable row level security;

revoke all on public.system_intelligence_snapshots from public, anon;
grant select on public.system_intelligence_snapshots to authenticated;
grant all on public.system_intelligence_snapshots to service_role;

drop policy if exists system_intelligence_snapshots_member_select
  on public.system_intelligence_snapshots;
create policy system_intelligence_snapshots_member_select
  on public.system_intelligence_snapshots
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create or replace view public.v_r10_system_awareness_v1
with (security_invoker = true)
as
with lead_state as (
  select
    organization_id,
    count(*) filter (
      where current_stage in ('new','contacted','engaged','qualified','high_intent','payment_pending')
    )::bigint as active_leads,
    count(*) filter (where needs_reply is true)::bigint as needs_reply,
    count(*) filter (where has_overdue_followup is true)::bigint as overdue_followups,
    count(*) filter (where current_stage = 'high_intent')::bigint as high_intent_leads,
    count(*) filter (where current_stage = 'payment_pending')::bigint as payment_pending_leads,
    count(*) filter (
      where owner_user_id is null
        and current_stage in ('new','contacted','engaged','qualified','high_intent','payment_pending')
    )::bigint as unowned_active_leads,
    count(*) filter (where coalesce(priority_score, 0) >= 90)::bigint as critical_priority_leads,
    count(*) filter (where coalesce(priority_score, 0) between 75 and 89)::bigint as high_priority_leads,
    coalesce(max(priority_score), 0)::integer as max_priority_score
  from public.v_admissions_owner_lead_signals
  group by organization_id
), journey_state as (
  select
    organization_id,
    count(*) filter (where is_reengaged is true)::bigint as reengaged_leads,
    count(*) filter (where behaviour_temperature = 'hot')::bigint as hot_behaviour_leads,
    coalesce(sum(high_intent_events_7d), 0)::bigint as high_intent_events_7d
  from public.v_lead_journey_intelligence
  group by organization_id
), system_state as (
  select
    organization_id,
    coalesce(sum(activity_count), 0)::bigint as system_activity_24h,
    coalesce(sum(successful_count), 0)::bigint as system_successes_24h,
    coalesce(sum(failure_count), 0)::bigint as system_failures_24h,
    coalesce(sum(pending_count), 0)::bigint as system_pending_24h,
    count(*) filter (where coalesce(failure_count, 0) > 0)::bigint as failing_systems,
    count(*) filter (where coalesce(pending_count, 0) >= 10)::bigint as backlogged_systems,
    max(latest_activity_at) as latest_system_activity_at
  from public.v_system_activity_24h
  group by organization_id
), base as (
  select
    o.id as organization_id,
    coalesce(l.active_leads, 0) as active_leads,
    coalesce(l.needs_reply, 0) as needs_reply,
    coalesce(l.overdue_followups, 0) as overdue_followups,
    coalesce(l.high_intent_leads, 0) as high_intent_leads,
    coalesce(l.payment_pending_leads, 0) as payment_pending_leads,
    coalesce(l.unowned_active_leads, 0) as unowned_active_leads,
    coalesce(l.critical_priority_leads, 0) as critical_priority_leads,
    coalesce(l.high_priority_leads, 0) as high_priority_leads,
    coalesce(l.max_priority_score, 0) as max_priority_score,
    coalesce(j.reengaged_leads, 0) as reengaged_leads,
    coalesce(j.hot_behaviour_leads, 0) as hot_behaviour_leads,
    coalesce(j.high_intent_events_7d, 0) as high_intent_events_7d,
    coalesce(s.system_activity_24h, 0) as system_activity_24h,
    coalesce(s.system_successes_24h, 0) as system_successes_24h,
    coalesce(s.system_failures_24h, 0) as system_failures_24h,
    coalesce(s.system_pending_24h, 0) as system_pending_24h,
    coalesce(s.failing_systems, 0) as failing_systems,
    coalesce(s.backlogged_systems, 0) as backlogged_systems,
    s.latest_system_activity_at,
    coalesce(p.predictive_readiness_status, 'unknown') as predictive_readiness_status,
    coalesce(p.prediction_generation_allowed, false) as prediction_generation_allowed,
    coalesce(p.recommendation_calibration_ready, false) as recommendation_calibration_ready,
    coalesce(p.total_leads, 0) as total_leads,
    coalesce(p.labeled_outcomes, 0) as labeled_outcomes,
    coalesce(p.labeled_outcome_rate_pct, 0) as labeled_outcome_rate_pct
  from public.organizations o
  left join lead_state l on l.organization_id = o.id
  left join journey_state j on j.organization_id = o.id
  left join system_state s on s.organization_id = o.id
  left join public.v_r10_predictive_readiness_v1 p on p.organization_id = o.id
), scored as (
  select
    b.*,
    least(
      100,
      (b.system_failures_24h * 12)
      + (b.failing_systems * 8)
      + (b.needs_reply * 5)
      + (b.overdue_followups * 4)
      + (b.critical_priority_leads * 5)
      + (b.unowned_active_leads * 2)
      + least(b.system_pending_24h / 10, 10)
    )::integer as urgency_score
  from base b
)
select
  organization_id,
  case
    when system_failures_24h > 0
      or failing_systems > 0
      or needs_reply >= 5
      or overdue_followups >= 5
      then 'urgent'
    when needs_reply > 0
      or overdue_followups > 0
      or critical_priority_leads > 0
      or payment_pending_leads > 0
      or backlogged_systems > 0
      then 'attention'
    when reengaged_leads > 0
      or high_intent_leads > 0
      or hot_behaviour_leads > 0
      then 'opportunity'
    else 'healthy'
  end as awareness_status,
  urgency_score,
  case
    when system_failures_24h > 0 then 'system_failures'
    when needs_reply > 0 then 'reply_backlog'
    when overdue_followups > 0 then 'overdue_followups'
    when critical_priority_leads > 0 then 'critical_leads'
    when payment_pending_leads > 0 then 'payment_pending'
    when backlogged_systems > 0 then 'processor_backlog'
    when reengaged_leads > 0 then 'reengagement_opportunity'
    when high_intent_leads > 0 then 'high_intent_opportunity'
    else 'no_dominant_issue'
  end as top_issue_code,
  case
    when system_failures_24h > 0 then system_failures_24h || ' backend/system failures were observed in the last 24 hours.'
    when needs_reply > 0 then needs_reply || ' active lead conversations currently need a reply.'
    when overdue_followups > 0 then overdue_followups || ' lead follow-ups are overdue.'
    when critical_priority_leads > 0 then critical_priority_leads || ' leads are currently in the critical priority band.'
    when payment_pending_leads > 0 then payment_pending_leads || ' leads are waiting in payment pending.'
    when backlogged_systems > 0 then backlogged_systems || ' backend processors have elevated pending queues.'
    when reengaged_leads > 0 then reengaged_leads || ' known leads have recently re-engaged.'
    when high_intent_leads > 0 then high_intent_leads || ' active leads are currently high intent.'
    else 'No dominant operating issue is currently above the deterministic alert thresholds.'
  end as top_issue_summary,
  active_leads,
  needs_reply,
  overdue_followups,
  high_intent_leads,
  payment_pending_leads,
  unowned_active_leads,
  critical_priority_leads,
  high_priority_leads,
  max_priority_score,
  reengaged_leads,
  hot_behaviour_leads,
  high_intent_events_7d,
  system_activity_24h,
  system_successes_24h,
  system_failures_24h,
  system_pending_24h,
  failing_systems,
  backlogged_systems,
  latest_system_activity_at,
  predictive_readiness_status,
  prediction_generation_allowed,
  recommendation_calibration_ready,
  total_leads,
  labeled_outcomes,
  labeled_outcome_rate_pct,
  jsonb_build_object(
    'pipeline', jsonb_build_object(
      'active_leads', active_leads,
      'needs_reply', needs_reply,
      'overdue_followups', overdue_followups,
      'high_intent_leads', high_intent_leads,
      'payment_pending_leads', payment_pending_leads,
      'unowned_active_leads', unowned_active_leads,
      'critical_priority_leads', critical_priority_leads,
      'max_priority_score', max_priority_score
    ),
    'behaviour', jsonb_build_object(
      'reengaged_leads', reengaged_leads,
      'hot_behaviour_leads', hot_behaviour_leads,
      'high_intent_events_7d', high_intent_events_7d
    ),
    'operations', jsonb_build_object(
      'activity_24h', system_activity_24h,
      'successes_24h', system_successes_24h,
      'failures_24h', system_failures_24h,
      'pending_24h', system_pending_24h,
      'failing_systems', failing_systems,
      'backlogged_systems', backlogged_systems,
      'latest_activity_at', latest_system_activity_at
    ),
    'learning', jsonb_build_object(
      'predictive_readiness_status', predictive_readiness_status,
      'prediction_generation_allowed', prediction_generation_allowed,
      'recommendation_calibration_ready', recommendation_calibration_ready,
      'total_leads', total_leads,
      'labeled_outcomes', labeled_outcomes,
      'labeled_outcome_rate_pct', labeled_outcome_rate_pct
    )
  ) as awareness_payload,
  now() as observed_at
from scored;

comment on view public.v_r10_system_awareness_v1 is
  'R10 live system-awareness model. Correlates current sales execution, behavioural re-engagement, backend processor health, and predictive-readiness state without inventing probabilistic claims.';

revoke all on public.v_r10_system_awareness_v1 from public, anon;
grant select on public.v_r10_system_awareness_v1 to authenticated, service_role;
