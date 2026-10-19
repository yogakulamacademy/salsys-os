create or replace view public.v_r10_system_awareness_trend_v1
with (security_invoker = true)
as
with ranked as (
  select
    s.*,
    row_number() over (
      partition by s.organization_id
      order by s.captured_at desc, s.id desc
    ) as rn
  from public.system_intelligence_snapshots s
), latest as (
  select * from ranked where rn = 1
), previous as (
  select * from ranked where rn = 2
), recent as (
  select
    organization_id,
    count(*) filter (where captured_at >= now() - interval '6 hours')::bigint as snapshots_6h,
    count(*) filter (where captured_at >= now() - interval '24 hours')::bigint as snapshots_24h,
    round(avg(urgency_score) filter (where captured_at >= now() - interval '6 hours'), 1) as avg_urgency_6h,
    min(urgency_score) filter (where captured_at >= now() - interval '6 hours') as min_urgency_6h,
    max(urgency_score) filter (where captured_at >= now() - interval '6 hours') as max_urgency_6h,
    count(*) filter (
      where captured_at >= now() - interval '6 hours'
        and awareness_status = 'urgent'
    )::bigint as urgent_snapshots_6h
  from public.system_intelligence_snapshots
  group by organization_id
), issue_persistence as (
  select
    l.organization_id,
    count(*) filter (
      where s.captured_at >= now() - interval '6 hours'
        and s.top_issue_code is not distinct from l.top_issue_code
    )::bigint as same_top_issue_snapshots_6h,
    min(s.captured_at) filter (
      where s.captured_at >= now() - interval '6 hours'
        and s.top_issue_code is not distinct from l.top_issue_code
    ) as same_top_issue_first_seen_6h
  from latest l
  join public.system_intelligence_snapshots s
    on s.organization_id = l.organization_id
  group by l.organization_id, l.top_issue_code
)
select
  o.id as organization_id,
  coalesce(r.snapshots_6h, 0) as snapshots_6h,
  coalesce(r.snapshots_24h, 0) as snapshots_24h,
  l.captured_at as latest_snapshot_at,
  p.captured_at as previous_snapshot_at,
  l.awareness_status as latest_awareness_status,
  p.awareness_status as previous_awareness_status,
  l.urgency_score as latest_urgency_score,
  p.urgency_score as previous_urgency_score,
  case
    when l.urgency_score is null or p.urgency_score is null then null
    else l.urgency_score - p.urgency_score
  end as urgency_delta,
  r.avg_urgency_6h,
  r.min_urgency_6h,
  r.max_urgency_6h,
  coalesce(r.urgent_snapshots_6h, 0) as urgent_snapshots_6h,
  l.top_issue_code as latest_top_issue_code,
  l.top_issue_summary as latest_top_issue_summary,
  p.top_issue_code as previous_top_issue_code,
  coalesce(ip.same_top_issue_snapshots_6h, 0) as same_top_issue_snapshots_6h,
  ip.same_top_issue_first_seen_6h,
  case
    when ip.same_top_issue_first_seen_6h is null then null
    else round(extract(epoch from (l.captured_at - ip.same_top_issue_first_seen_6h)) / 3600.0, 1)
  end as top_issue_persistence_hours_6h,
  coalesce((l.awareness_payload #>> '{pipeline,needs_reply}')::bigint, 0) as latest_needs_reply,
  coalesce((p.awareness_payload #>> '{pipeline,needs_reply}')::bigint, 0) as previous_needs_reply,
  case
    when l.id is null or p.id is null then null
    else coalesce((l.awareness_payload #>> '{pipeline,needs_reply}')::bigint, 0)
       - coalesce((p.awareness_payload #>> '{pipeline,needs_reply}')::bigint, 0)
  end as needs_reply_delta,
  coalesce((l.awareness_payload #>> '{pipeline,high_intent_leads}')::bigint, 0) as latest_high_intent_leads,
  coalesce((p.awareness_payload #>> '{pipeline,high_intent_leads}')::bigint, 0) as previous_high_intent_leads,
  case
    when l.id is null or p.id is null then null
    else coalesce((l.awareness_payload #>> '{pipeline,high_intent_leads}')::bigint, 0)
       - coalesce((p.awareness_payload #>> '{pipeline,high_intent_leads}')::bigint, 0)
  end as high_intent_delta,
  coalesce((l.awareness_payload #>> '{operations,failures_24h}')::bigint, 0) as latest_system_failures_24h,
  coalesce((p.awareness_payload #>> '{operations,failures_24h}')::bigint, 0) as previous_system_failures_24h,
  case
    when l.id is null or p.id is null then null
    else coalesce((l.awareness_payload #>> '{operations,failures_24h}')::bigint, 0)
       - coalesce((p.awareness_payload #>> '{operations,failures_24h}')::bigint, 0)
  end as system_failures_delta,
  case
    when coalesce(r.snapshots_24h, 0) = 0 then 'collecting_history'
    when coalesce(r.snapshots_24h, 0) = 1 then 'baseline_captured'
    when l.urgency_score > p.urgency_score + 5 then 'worsening'
    when l.urgency_score < p.urgency_score - 5 then 'improving'
    when l.top_issue_code is distinct from p.top_issue_code then 'issue_changed'
    else 'stable'
  end as trend_status,
  case
    when coalesce(r.snapshots_24h, 0) = 0
      then 'No system-awareness snapshots have been captured yet. The hourly worker will establish the first baseline.'
    when coalesce(r.snapshots_24h, 0) = 1
      then 'The first awareness baseline exists. A second scheduled snapshot is required before directional change can be measured.'
    when l.urgency_score > p.urgency_score + 5
      then 'Operating urgency increased materially since the previous snapshot.'
    when l.urgency_score < p.urgency_score - 5
      then 'Operating urgency decreased materially since the previous snapshot.'
    when l.top_issue_code is distinct from p.top_issue_code
      then 'The dominant operating issue changed since the previous snapshot.'
    else 'No material directional change is detected between the two most recent snapshots.'
  end as trend_summary,
  case
    when coalesce(r.snapshots_24h, 0) < 2 then false
    else true
  end as directional_evidence_available,
  now() as evaluated_at
from public.organizations o
left join latest l on l.organization_id = o.id
left join previous p on p.organization_id = o.id
left join recent r on r.organization_id = o.id
left join issue_persistence ip on ip.organization_id = o.id;

comment on view public.v_r10_system_awareness_trend_v1 is
  'R10 deterministic change-detection model over persisted system-awareness snapshots. Reports directional evidence only after at least two real observations and does not infer causation.';

revoke all on public.v_r10_system_awareness_trend_v1 from public, anon;
grant select on public.v_r10_system_awareness_trend_v1 to authenticated, service_role;