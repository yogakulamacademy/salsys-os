begin;

-- Keep person and visitor aggregates independent so a future lead with multiple
-- person links cannot multiply visitor/session evidence through a many-to-many
-- join. This is a diagnostic/evidence-quality correction; privacy decisions
-- remain fail-closed.

create or replace view public.v_r10_lead_signal_quality_v1
with (security_invoker = true)
as
with
lead_people as (
  select distinct organization_id, lead_id, person_id
  from public.person_leads
),
lead_visitors as (
  select
    organization_id,
    lead_id,
    anonymous_visitor_id,
    count(*)::bigint as session_count,
    count(*) filter (where started_at >= now() - interval '30 days')::bigint as sessions_30d,
    max(coalesce(last_seen_at, started_at)) as latest_session_at
  from public.web_sessions
  where lead_id is not null
    and anonymous_visitor_id is not null
  group by organization_id, lead_id, anonymous_visitor_id
),
associated_subjects as (
  select l.organization_id, l.id as lead_id, 'lead:' || l.id::text as subject_key, 'lead'::text as subject_scope
  from public.leads l

  union all

  select lp.organization_id, lp.lead_id, 'person:' || lp.person_id::text, 'person'::text
  from lead_people lp

  union all

  select lv.organization_id, lv.lead_id, 'visitor:' || lv.anonymous_visitor_id, 'visitor'::text
  from lead_visitors lv
),
analytics_preferences as (
  select
    s.organization_id,
    s.lead_id,
    s.subject_scope,
    p.current_decision,
    p.effective_at
  from associated_subjects s
  join public.privacy_preferences p
    on p.organization_id = s.organization_id
   and p.subject_key = s.subject_key
   and p.purpose_key = 'analytics'
),
analytics_rollup as (
  select
    organization_id,
    lead_id,
    count(*)::bigint as preference_count,
    count(*) filter (where subject_scope in ('person','lead'))::bigint as known_subject_preference_count,
    count(*) filter (where subject_scope in ('person','lead') and current_decision = 'granted')::bigint as known_subject_grants,
    count(*) filter (where subject_scope in ('person','lead') and current_decision in ('denied','withdrawn','opted_out','limited'))::bigint as known_subject_non_grants,
    count(*) filter (where subject_scope = 'visitor')::bigint as visitor_preference_count,
    count(*) filter (where subject_scope = 'visitor' and current_decision = 'granted')::bigint as visitor_grants,
    count(*) filter (where subject_scope = 'visitor' and current_decision in ('denied','withdrawn','opted_out','limited'))::bigint as visitor_non_grants,
    max(effective_at) as latest_analytics_preference_at
  from analytics_preferences
  group by organization_id, lead_id
),
restriction_rows as (
  select
    r.organization_id,
    r.lead_id,
    r.block_optional_tracking,
    r.block_marketing,
    r.block_profiling,
    r.block_ad_exports,
    r.restrict_processing
  from public.privacy_subject_restrictions r
  where r.active = true
    and r.lead_id is not null

  union all

  select
    r.organization_id,
    lp.lead_id,
    r.block_optional_tracking,
    r.block_marketing,
    r.block_profiling,
    r.block_ad_exports,
    r.restrict_processing
  from public.privacy_subject_restrictions r
  join lead_people lp
    on lp.organization_id = r.organization_id
   and lp.person_id = r.person_id
  where r.active = true
    and r.person_id is not null

  union all

  select
    r.organization_id,
    lv.lead_id,
    r.block_optional_tracking,
    r.block_marketing,
    r.block_profiling,
    r.block_ad_exports,
    r.restrict_processing
  from public.privacy_subject_restrictions r
  join lead_visitors lv
    on lv.organization_id = r.organization_id
   and lv.anonymous_visitor_id = r.anonymous_visitor_id
  where r.active = true
    and r.anonymous_visitor_id is not null
),
restriction_rollup as (
  select
    organization_id,
    lead_id,
    bool_or(coalesce(block_optional_tracking,false)) as block_optional_tracking,
    bool_or(coalesce(block_marketing,false)) as block_marketing,
    bool_or(coalesce(block_profiling,false)) as block_profiling,
    bool_or(coalesce(block_ad_exports,false)) as block_ad_exports,
    bool_or(coalesce(restrict_processing,false)) as restrict_processing
  from restriction_rows
  group by organization_id, lead_id
),
person_rollup as (
  select
    organization_id,
    lead_id,
    count(distinct person_id)::bigint as linked_person_count
  from lead_people
  group by organization_id, lead_id
),
visitor_rollup as (
  select
    organization_id,
    lead_id,
    count(distinct anonymous_visitor_id)::bigint as linked_visitor_count,
    coalesce(sum(session_count),0)::bigint as linked_session_count,
    coalesce(sum(sessions_30d),0)::bigint as linked_sessions_30d,
    max(latest_session_at) as latest_linked_session_at
  from lead_visitors
  group by organization_id, lead_id
),
identity_rollup as (
  select
    l.organization_id,
    l.id as lead_id,
    coalesce(p.linked_person_count,0)::bigint as linked_person_count,
    coalesce(v.linked_visitor_count,0)::bigint as linked_visitor_count,
    coalesce(v.linked_session_count,0)::bigint as linked_session_count,
    coalesce(v.linked_sessions_30d,0)::bigint as linked_sessions_30d,
    v.latest_linked_session_at
  from public.leads l
  left join person_rollup p
    on p.organization_id = l.organization_id
   and p.lead_id = l.id
  left join visitor_rollup v
    on v.organization_id = l.organization_id
   and v.lead_id = l.id
),
base as (
  select
    l.organization_id,
    l.id as lead_id,
    coalesce(i.linked_person_count,0) as linked_person_count,
    coalesce(i.linked_visitor_count,0) as linked_visitor_count,
    coalesce(i.linked_session_count,0) as linked_session_count,
    coalesce(i.linked_sessions_30d,0) as linked_sessions_30d,
    i.latest_linked_session_at,
    coalesce(a.preference_count,0) as analytics_preference_count,
    coalesce(a.known_subject_preference_count,0) as known_subject_preference_count,
    coalesce(a.known_subject_grants,0) as known_subject_grants,
    coalesce(a.known_subject_non_grants,0) as known_subject_non_grants,
    coalesce(a.visitor_preference_count,0) as visitor_preference_count,
    coalesce(a.visitor_grants,0) as visitor_grants,
    coalesce(a.visitor_non_grants,0) as visitor_non_grants,
    a.latest_analytics_preference_at,
    coalesce(r.block_optional_tracking,false) as block_optional_tracking,
    coalesce(r.block_marketing,false) as block_marketing,
    coalesce(r.block_profiling,false) as block_profiling,
    coalesce(r.block_ad_exports,false) as block_ad_exports,
    coalesce(r.restrict_processing,false) as restrict_processing
  from public.leads l
  left join identity_rollup i
    on i.organization_id = l.organization_id
   and i.lead_id = l.id
  left join analytics_rollup a
    on a.organization_id = l.organization_id
   and a.lead_id = l.id
  left join restriction_rollup r
    on r.organization_id = l.organization_id
   and r.lead_id = l.id
),
classified as (
  select
    b.*,
    case
      when b.restrict_processing or b.block_profiling then 'restricted'
      when b.known_subject_non_grants > 0 then 'unavailable_known_subject_choice'
      when b.known_subject_grants > 0 then 'available_known_subject_grant'
      when b.visitor_preference_count = 0 then 'unavailable_unknown'
      when b.visitor_grants > 0 and b.visitor_non_grants = 0 then 'available_visitor_grant'
      when b.visitor_grants = 0 and b.visitor_non_grants > 0 then 'unavailable_no_consent'
      else 'unavailable_mixed_choices'
    end as analytics_evidence_state
  from base b
)
select
  c.organization_id,
  c.lead_id,
  c.linked_person_count,
  c.linked_visitor_count,
  c.linked_session_count,
  c.linked_sessions_30d,
  c.latest_linked_session_at,
  c.analytics_preference_count,
  c.known_subject_preference_count,
  c.known_subject_grants,
  c.known_subject_non_grants,
  c.visitor_preference_count,
  c.visitor_grants,
  c.visitor_non_grants,
  c.latest_analytics_preference_at,
  c.block_optional_tracking,
  c.block_marketing,
  c.block_profiling,
  c.block_ad_exports,
  c.restrict_processing,
  not (c.restrict_processing or c.block_profiling) as profiling_allowed,
  c.analytics_evidence_state,
  c.analytics_evidence_state in ('available_known_subject_grant','available_visitor_grant') as web_behavior_usable_for_profiling,
  case
    when c.restrict_processing or c.block_profiling then 'restricted'
    when c.linked_person_count > 0 and c.analytics_evidence_state in ('available_known_subject_grant','available_visitor_grant') then 'high'
    when c.linked_person_count > 0 or c.analytics_evidence_state in ('available_known_subject_grant','available_visitor_grant') then 'medium'
    else 'low'
  end as evidence_quality_band,
  case
    when c.linked_person_count > 0 then 'person_resolved'
    when c.linked_visitor_count > 0 then 'lead_visitor_linked'
    else 'lead_only'
  end as identity_evidence_state,
  array_remove(array[
    case when c.restrict_processing then 'processing_restricted' end,
    case when c.block_profiling then 'profiling_restricted' end,
    case when c.block_optional_tracking then 'optional_tracking_restricted' end,
    case when c.known_subject_non_grants > 0 then 'known_subject_analytics_not_granted' end,
    case when c.known_subject_grants > 0 then 'known_subject_analytics_granted' end,
    case when c.visitor_grants > 0 then 'visitor_analytics_grant_present' end,
    case when c.visitor_non_grants > 0 then 'visitor_analytics_non_grant_present' end,
    case when c.analytics_preference_count = 0 then 'analytics_choice_unknown' end,
    case when c.linked_person_count > 0 then 'person_identity_resolved' end,
    case when c.linked_visitor_count > 0 then 'visitor_history_linked' end
  ]::text[], null) as evidence_quality_reasons,
  now() as evaluated_at
from classified c;

commit;
