create or replace view public.v_r10_lead_outcome_evidence_v1
with (security_invoker = true)
as
with payment_outcomes as (
  select
    p.organization_id,
    p.lead_id,
    min(coalesce(p.paid_at, p.updated_at, p.created_at)) filter (where p.status::text = 'paid') as paid_outcome_at,
    count(*) filter (where p.status::text = 'paid')::bigint as paid_rows
  from public.payments p
  where p.lead_id is not null
  group by p.organization_id, p.lead_id
), enrollment_outcomes as (
  select
    e.organization_id,
    e.lead_id,
    min(coalesce(e.enrolled_at, e.updated_at, e.created_at)) filter (
      where e.status::text in ('confirmed', 'completed')
    ) as enrolled_outcome_at,
    count(*) filter (where e.status::text in ('confirmed', 'completed'))::bigint as confirmed_enrollment_rows
  from public.enrollments e
  where e.lead_id is not null
  group by e.organization_id, e.lead_id
), stage_outcomes as (
  select
    l.organization_id,
    h.lead_id,
    min(h.changed_at) filter (where h.to_stage::text = 'enrolled') as enrolled_stage_at,
    min(h.changed_at) filter (where h.to_stage::text in ('lost', 'unqualified')) as negative_stage_at,
    count(*) filter (where h.to_stage::text = 'enrolled')::bigint as enrolled_stage_events,
    count(*) filter (where h.to_stage::text in ('lost', 'unqualified'))::bigint as negative_stage_events
  from public.lead_stage_history h
  join public.leads l on l.id = h.lead_id
  group by l.organization_id, h.lead_id
), evidence as (
  select
    l.organization_id,
    l.id as lead_id,
    l.current_stage::text as current_stage,
    l.status::text as lead_status,
    l.created_at as lead_created_at,
    p.paid_outcome_at,
    coalesce(p.paid_rows, 0)::bigint as paid_rows,
    e.enrolled_outcome_at,
    coalesce(e.confirmed_enrollment_rows, 0)::bigint as confirmed_enrollment_rows,
    s.enrolled_stage_at,
    coalesce(s.enrolled_stage_events, 0)::bigint as enrolled_stage_events,
    coalesce(
      s.negative_stage_at,
      case when l.current_stage::text in ('lost', 'unqualified') then l.updated_at end
    ) as negative_outcome_at,
    coalesce(s.negative_stage_events, 0)::bigint as negative_stage_events
  from public.leads l
  left join payment_outcomes p
    on p.organization_id = l.organization_id
   and p.lead_id = l.id
  left join enrollment_outcomes e
    on e.organization_id = l.organization_id
   and e.lead_id = l.id
  left join stage_outcomes s
    on s.organization_id = l.organization_id
   and s.lead_id = l.id
), classified as (
  select
    e.*,
    case
      when e.paid_outcome_at is not null
        or e.enrolled_outcome_at is not null
        or e.enrolled_stage_at is not null
        then 'positive'
      when e.negative_outcome_at is not null
        then 'negative'
      else null
    end as outcome_label,
    case
      when e.paid_outcome_at is not null
        or e.enrolled_outcome_at is not null
        or e.enrolled_stage_at is not null
        then least(
          coalesce(e.paid_outcome_at, 'infinity'::timestamptz),
          coalesce(e.enrolled_outcome_at, 'infinity'::timestamptz),
          coalesce(e.enrolled_stage_at, 'infinity'::timestamptz)
        )
      when e.negative_outcome_at is not null
        then e.negative_outcome_at
      else null
    end as outcome_at,
    case
      when e.enrolled_outcome_at is not null then 'enrollment_confirmed_or_completed'
      when e.paid_outcome_at is not null then 'payment_paid'
      when e.enrolled_stage_at is not null then 'lead_stage_enrolled'
      when e.negative_outcome_at is not null and e.negative_stage_events > 0 then 'lead_stage_history_negative'
      when e.negative_outcome_at is not null then 'current_lead_stage_negative'
      else null
    end as outcome_source
  from evidence e
)
select
  organization_id,
  lead_id,
  current_stage,
  lead_status,
  lead_created_at,
  outcome_label,
  outcome_at,
  outcome_source,
  case
    when outcome_label = 'positive' and (confirmed_enrollment_rows > 0 or paid_rows > 0) then 'high'
    when outcome_label is not null then 'medium'
    else 'unlabeled'
  end as outcome_confidence,
  paid_outcome_at,
  paid_rows,
  enrolled_outcome_at,
  confirmed_enrollment_rows,
  enrolled_stage_at,
  enrolled_stage_events,
  negative_outcome_at,
  negative_stage_events,
  jsonb_build_object(
    'paid_rows', paid_rows,
    'paid_outcome_at', paid_outcome_at,
    'confirmed_enrollment_rows', confirmed_enrollment_rows,
    'enrolled_outcome_at', enrolled_outcome_at,
    'enrolled_stage_events', enrolled_stage_events,
    'enrolled_stage_at', enrolled_stage_at,
    'negative_stage_events', negative_stage_events,
    'negative_outcome_at', negative_outcome_at,
    'current_stage', current_stage,
    'lead_status', lead_status
  ) as outcome_evidence,
  now() as evaluated_at
from classified;

comment on view public.v_r10_lead_outcome_evidence_v1 is
  'R10 auditable lead-outcome evidence for predictive lead scoring. Positive labels require observed paid/enrolled evidence; negative labels require lost/unqualified evidence. Unlabeled leads remain unlabeled and are not guessed.';

revoke all on public.v_r10_lead_outcome_evidence_v1 from public, anon;
grant select on public.v_r10_lead_outcome_evidence_v1 to authenticated, service_role;