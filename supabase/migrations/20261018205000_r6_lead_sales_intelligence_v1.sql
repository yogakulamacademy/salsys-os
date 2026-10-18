-- R6 — Intent, Product Affinity & Sales Intelligence V1
-- Combines observed CRM intent, behavioural evidence, Person-level course affinity,
-- operational priority and deterministic next-best-action without turning correlation
-- into a causal or predictive claim.

begin;

create or replace view public.v_lead_sales_intelligence_v1
with (security_invoker = true)
as
select
  l.organization_id,
  l.id as lead_id,
  l.lead_code,
  coalesce(
    nullif(btrim(l.display_name), ''),
    nullif(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
    l.lead_code
  ) as lead_name,
  l.current_stage::text as current_stage,
  l.status::text as lead_status,
  l.intent::text as crm_intent,
  l.interested_course_id,
  current_course.name as interested_course_name,
  l.preferred_location,
  l.preferred_month,
  l.preferred_mode,
  l.owner_user_id,

  pl.person_id,
  pl.resolution_method as person_resolution_method,
  pl.confidence as person_resolution_confidence,

  coalesce(j.behaviour_temperature, 'unknown') as behaviour_temperature,
  coalesce(j.engagement_score, 0) as engagement_score,
  coalesce(j.is_reengaged, false) as is_reengaged,
  j.behaviour_reason,
  j.last_visit_at,
  coalesce(j.sessions_7d, 0) as sessions_7d,
  coalesce(j.page_views_7d, 0) as page_views_7d,
  coalesce(j.high_intent_events_7d, 0) as high_intent_events_7d,

  current_affinity.affinity_score as current_course_affinity_score,
  current_affinity.primary_evidence as current_course_affinity_evidence,
  current_affinity.last_signal_at as current_course_affinity_last_signal_at,
  current_affinity.reason_codes as current_course_affinity_reason_codes,

  top_affinity.course_id as strongest_affinity_course_id,
  top_affinity.course_name as strongest_affinity_course_name,
  top_affinity.affinity_score as strongest_affinity_score,
  top_affinity.primary_evidence as strongest_affinity_evidence,
  top_affinity.last_signal_at as strongest_affinity_last_signal_at,

  alternate_affinity.course_id as alternate_affinity_course_id,
  alternate_affinity.course_name as alternate_affinity_course_name,
  alternate_affinity.affinity_score as alternate_affinity_score,
  alternate_affinity.primary_evidence as alternate_affinity_evidence,
  alternate_affinity.last_signal_at as alternate_affinity_last_signal_at,

  coalesce(affinity_counts.affinity_course_count, 0) as affinity_course_count,

  coalesce(q.needs_reply, false) as needs_reply,
  q.last_inbound_at,
  q.last_contacted_at,
  coalesce(q.has_overdue_followup, false) as has_overdue_followup,
  coalesce(q.priority_score, 0) as priority_score,
  coalesce(q.priority_band, 'low') as priority_band,
  q.next_best_action,
  q.payment_status,
  q.outstanding_balance,
  q.currency,

  case
    when l.intent::text in ('very_high', 'high') then 'crm_intent'
    when coalesce(j.high_intent_events_7d, 0) > 0 then 'recent_high_intent_behavior'
    when coalesce(j.is_reengaged, false) then 'reengagement'
    when top_affinity.affinity_score is not null then 'product_affinity'
    else 'limited_evidence'
  end as primary_sales_signal,

  array_remove(array[
    case when l.intent is not null and l.intent::text <> 'unknown' then 'CRM intent: ' || replace(l.intent::text, '_', ' ') end,
    case when j.behaviour_temperature is not null then 'Behaviour: ' || j.behaviour_temperature end,
    case when coalesce(j.high_intent_events_7d, 0) > 0 then 'High-intent website events (7d): ' || j.high_intent_events_7d::text end,
    case when coalesce(j.is_reengaged, false) then 'Recently re-engaged' end,
    case when top_affinity.course_name is not null then 'Strongest course affinity: ' || top_affinity.course_name || ' (' || top_affinity.affinity_score::text || ')' end,
    case when coalesce(q.needs_reply, false) then 'Customer reply pending' end,
    case when coalesce(q.has_overdue_followup, false) then 'Follow-up overdue' end,
    case when q.payment_status is not null then 'Payment status: ' || replace(q.payment_status, '_', ' ') end
  ], null) as sales_evidence

from public.leads l
left join public.courses current_course
  on current_course.organization_id = l.organization_id
 and current_course.id = l.interested_course_id
left join lateral (
  select x.person_id, x.resolution_method, x.confidence
  from public.person_leads x
  where x.organization_id = l.organization_id
    and x.lead_id = l.id
  order by x.confidence desc nulls last, x.linked_at desc, x.id
  limit 1
) pl on true
left join public.v_lead_journey_intelligence j
  on j.organization_id = l.organization_id
 and j.lead_id = l.id
left join public.v_admissions_owner_lead_signals q
  on q.organization_id = l.organization_id
 and q.lead_id = l.id
left join lateral (
  select a.affinity_score, a.primary_evidence, a.last_signal_at, a.reason_codes
  from public.v_person_course_affinity a
  where a.organization_id = l.organization_id
    and a.person_id = pl.person_id
    and a.course_id = l.interested_course_id
  order by a.affinity_score desc, a.last_signal_at desc nulls last, a.course_id
  limit 1
) current_affinity on true
left join lateral (
  select a.course_id, a.course_name, a.affinity_score, a.primary_evidence, a.last_signal_at
  from public.v_person_course_affinity a
  where a.organization_id = l.organization_id
    and a.person_id = pl.person_id
  order by a.affinity_score desc, a.last_signal_at desc nulls last, a.course_id
  limit 1
) top_affinity on true
left join lateral (
  select a.course_id, a.course_name, a.affinity_score, a.primary_evidence, a.last_signal_at
  from public.v_person_course_affinity a
  where a.organization_id = l.organization_id
    and a.person_id = pl.person_id
    and (l.interested_course_id is null or a.course_id <> l.interested_course_id)
  order by a.affinity_score desc, a.last_signal_at desc nulls last, a.course_id
  limit 1
) alternate_affinity on true
left join lateral (
  select count(*)::integer as affinity_course_count
  from public.v_person_course_affinity a
  where a.organization_id = l.organization_id
    and a.person_id = pl.person_id
) affinity_counts on true
where l.status <> 'archived'::lead_status;

comment on view public.v_lead_sales_intelligence_v1 is
  'R6 tenant-safe lead sales intelligence. Combines observed CRM intent, behaviour, Person course affinity, operational priority and deterministic next action. Evidence is descriptive, not causal or predictive.';

revoke all on public.v_lead_sales_intelligence_v1 from public, anon;
grant select on public.v_lead_sales_intelligence_v1 to authenticated, service_role;

commit;
