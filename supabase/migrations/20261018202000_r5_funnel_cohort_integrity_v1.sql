-- R5 Attribution / Funnel / Revenue integrity closeout v1
-- Keep the 30-day funnel cohort-consistent across lead, paid and enrollment stages.
--
-- Before this migration, paid_leads was counted from payments that happened in
-- the last 30 days, while lead/qualified/enrolled stages were counted from leads
-- created in the last 30 days. That mixes a period metric into a cohort funnel.
--
-- This migration makes paid_leads cohort-consistent: only leads created inside
-- the same 30-day lead cohort are eligible for the paid stage. Enrollment also
-- recognizes a confirmed/completed enrollment record in addition to CRM stage.

begin;

create or replace view public.v_end_to_end_funnel_30d
with (security_invoker = true)
as
with bounds as (
  select
    now() - interval '30 days' as start_at,
    now() as end_at
),
visible_organizations as (
  select o.id as organization_id
  from public.organizations o
),
traffic as (
  select
    ws.organization_id,
    count(distinct ws.anonymous_visitor_id) as visitors,
    count(*) as sessions
  from public.web_sessions ws
  cross join bounds b
  where ws.started_at >= b.start_at
    and ws.started_at < b.end_at
  group by ws.organization_id
),
events as (
  select
    t.organization_id,
    count(*) filter (
      where t.event_type = 'page_view'
    ) as page_views,
    count(distinct t.anonymous_visitor_id) filter (
      where t.event_type = 'form_start'
    ) as form_start_visitors,
    count(distinct t.anonymous_visitor_id) filter (
      where t.event_type = 'lead_form_submit'
    ) as form_submit_visitors,
    count(distinct t.anonymous_visitor_id) filter (
      where t.event_type = any (
        array[
          'course_enquire_click'::text,
          'whatsapp_click'::text,
          'reservation_start'::text,
          'payment_start'::text,
          'brochure_download'::text
        ]
      )
    ) as intent_visitors,
    count(distinct t.anonymous_visitor_id) filter (
      where t.event_type = any (
        array[
          'whatsapp_click'::text,
          'reservation_start'::text,
          'payment_start'::text
        ]
      )
    ) as high_intent_visitors
  from public.touchpoints t
  cross join bounds b
  where t.occurred_at >= b.start_at
    and t.occurred_at < b.end_at
  group by t.organization_id
),
lead_cohort as (
  select
    l.organization_id,
    l.id as lead_id,
    l.current_stage
  from public.leads l
  cross join bounds b
  where l.created_at >= b.start_at
    and l.created_at < b.end_at
),
lead_counts as (
  select
    lc.organization_id,
    count(*) as leads,
    count(*) filter (
      where lc.current_stage = any (
        array[
          'qualified'::lead_stage,
          'high_intent'::lead_stage,
          'payment_pending'::lead_stage,
          'enrolled'::lead_stage
        ]
      )
      or exists (
        select 1
        from public.enrollments e
        where e.organization_id = lc.organization_id
          and e.lead_id = lc.lead_id
          and e.status::text = any (
            array['confirmed'::text, 'completed'::text]
          )
      )
    ) as qualified_leads,
    count(*) filter (
      where lc.current_stage = 'payment_pending'::lead_stage
    ) as payment_pending_leads,
    count(*) filter (
      where lc.current_stage = 'enrolled'::lead_stage
        or exists (
          select 1
          from public.enrollments e
          where e.organization_id = lc.organization_id
            and e.lead_id = lc.lead_id
            and e.status::text = any (
              array['confirmed'::text, 'completed'::text]
            )
        )
    ) as enrolled_leads
  from lead_cohort lc
  group by lc.organization_id
),
paid as (
  select
    lc.organization_id,
    count(distinct lc.lead_id) as paid_leads
  from lead_cohort lc
  join public.payments p
    on p.organization_id = lc.organization_id
   and p.lead_id = lc.lead_id
  where p.payment_kind <> 'refund'::payment_kind
    and p.status = 'paid'::payment_status
  group by lc.organization_id
)
select
  coalesce(t.visitors, 0::bigint) as visitors,
  coalesce(t.sessions, 0::bigint) as sessions,
  coalesce(e.page_views, 0::bigint) as page_views,
  coalesce(e.intent_visitors, 0::bigint) as intent_visitors,
  coalesce(e.high_intent_visitors, 0::bigint) as high_intent_visitors,
  coalesce(e.form_start_visitors, 0::bigint) as form_start_visitors,
  coalesce(e.form_submit_visitors, 0::bigint) as form_submit_visitors,
  coalesce(l.leads, 0::bigint) as leads,
  coalesce(l.qualified_leads, 0::bigint) as qualified_leads,
  coalesce(l.payment_pending_leads, 0::bigint) as payment_pending_leads,
  coalesce(p.paid_leads, 0::bigint) as paid_leads,
  coalesce(l.enrolled_leads, 0::bigint) as enrolled_leads,
  case
    when coalesce(t.sessions, 0::bigint) > 0
      then round(
        coalesce(l.leads, 0::bigint)::numeric /
        t.sessions::numeric * 100::numeric,
        2
      )
    else 0::numeric
  end as session_to_lead_rate,
  case
    when coalesce(l.leads, 0::bigint) > 0
      then round(
        coalesce(l.qualified_leads, 0::bigint)::numeric /
        l.leads::numeric * 100::numeric,
        2
      )
    else 0::numeric
  end as lead_to_qualified_rate,
  case
    when coalesce(l.leads, 0::bigint) > 0
      then round(
        coalesce(l.enrolled_leads, 0::bigint)::numeric /
        l.leads::numeric * 100::numeric,
        2
      )
    else 0::numeric
  end as lead_to_enrollment_rate,
  vo.organization_id
from visible_organizations vo
left join traffic t
  on t.organization_id = vo.organization_id
left join events e
  on e.organization_id = vo.organization_id
left join lead_counts l
  on l.organization_id = vo.organization_id
left join paid p
  on p.organization_id = vo.organization_id;

comment on view public.v_end_to_end_funnel_30d is
  'R5 tenant-safe 30-day funnel. Traffic is period-based; lead, qualified, paid and enrolled stages are evaluated on the same 30-day lead-created cohort.';

revoke all on public.v_end_to_end_funnel_30d from public, anon;
grant select on public.v_end_to_end_funnel_30d to authenticated, service_role;

commit;
