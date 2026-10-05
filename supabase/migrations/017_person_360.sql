-- Phase 4 — Customer Journey / Customer 360
-- Migration 017: canonical Person 360 read model.
--
-- One row per (organization_id, person_id).
-- This is a derived read model only; no base-table data is mutated.
--
-- Design principles:
-- - persons remains the durable identity record.
-- - all operational/behavioral/commercial data is rolled up from source tables.
-- - current production is 1 Lead per Person, but the view supports multiple Leads per Person.
-- - payment totals are kept per currency; mixed currencies are never added together.
-- - security_invoker=true preserves underlying RLS behavior.

begin;

create or replace view public.v_person_360
with (security_invoker = true)
as
with
/* ============================================================
   IDENTIFIERS
   Deterministically choose one best identifier per type.
   ============================================================ */
identifier_ranked as (
  select
    pi.organization_id,
    pi.person_id,
    pi.identifier_type,
    pi.normalized_value,
    pi.verified,
    pi.confidence,
    pi.last_seen_at,
    pi.id,
    row_number() over (
      partition by
        pi.organization_id,
        pi.person_id,
        pi.identifier_type
      order by
        pi.verified desc,
        pi.confidence desc,
        pi.last_seen_at desc,
        pi.id desc
    ) as rn
  from public.person_identifiers pi
),

identifier_rollup as (
  select
    pi.organization_id,
    pi.person_id,
    count(*) as identifier_count,
    count(*) filter (where pi.verified) as verified_identifier_count,
    max(pi.normalized_value) filter (
      where pi.identifier_type = 'email'
        and pi.rn = 1
    ) as primary_email,
    max(pi.normalized_value) filter (
      where pi.identifier_type = 'phone'
        and pi.rn = 1
    ) as primary_phone,
    max(pi.normalized_value) filter (
      where pi.identifier_type = 'whatsapp'
        and pi.rn = 1
    ) as primary_whatsapp
  from identifier_ranked pi
  group by
    pi.organization_id,
    pi.person_id
),

/* ============================================================
   LEADS
   Support multiple Leads per Person.
   ============================================================ */
person_lead_rows as (
  select
    pl.organization_id,
    pl.person_id,
    l.id as lead_id,
    l.lead_code,
    coalesce(
      nullif(btrim(l.display_name), ''),
      nullif(
        btrim(concat_ws(' ', l.first_name, l.last_name)),
        ''
      ),
      l.lead_code
    ) as lead_name,
    l.current_stage,
    l.status as lead_status,
    l.intent,
    l.owner_user_id,
    l.interested_course_id,
    l.preferred_batch_id,
    l.preferred_location,
    l.preferred_month,
    l.preferred_mode,
    l.country,
    l.timezone,
    l.language,
    l.next_followup_at,
    l.last_contacted_at,
    l.last_inbound_at,
    l.last_outbound_at,
    l.created_at as lead_created_at,
    l.updated_at as lead_updated_at,
    row_number() over (
      partition by pl.organization_id, pl.person_id
      order by
        l.created_at desc,
        l.updated_at desc,
        l.id desc
    ) as latest_lead_rank
  from public.person_leads pl
  join public.leads l
    on l.id = pl.lead_id
   and l.organization_id = pl.organization_id
),

lead_rollup as (
  select
    plr.organization_id,
    plr.person_id,
    count(*) as lead_count,
    min(plr.lead_created_at) as first_lead_at,
    max(plr.lead_created_at) as latest_lead_at,
    max(plr.last_contacted_at) as last_contacted_at,
    max(plr.last_inbound_at) as last_inbound_at,
    max(plr.last_outbound_at) as last_outbound_at
  from person_lead_rows plr
  group by
    plr.organization_id,
    plr.person_id
),

latest_lead as (
  select
    plr.organization_id,
    plr.person_id,
    plr.lead_id as latest_lead_id,
    plr.lead_code as latest_lead_code,
    plr.lead_name as latest_lead_name,
    plr.current_stage,
    plr.lead_status,
    plr.intent,
    plr.owner_user_id,
    plr.interested_course_id,
    plr.preferred_batch_id,
    plr.preferred_location,
    plr.preferred_month,
    plr.preferred_mode,
    plr.country,
    plr.timezone,
    plr.language,
    plr.next_followup_at
  from person_lead_rows plr
  where plr.latest_lead_rank = 1
),

latest_lead_journey as (
  select
    plr.organization_id,
    plr.person_id,
    j.engagement_score as latest_lead_engagement_score,
    j.behaviour_temperature as latest_lead_behaviour_temperature,
    j.behaviour_reason as latest_lead_behaviour_reason,
    j.first_session_source as latest_lead_first_session_source,
    j.first_session_medium as latest_lead_first_session_medium,
    j.first_session_campaign as latest_lead_first_session_campaign,
    j.last_session_source as latest_lead_last_session_source,
    j.last_session_medium as latest_lead_last_session_medium,
    j.last_session_campaign as latest_lead_last_session_campaign,
    j.days_first_visit_to_lead as latest_lead_days_first_visit_to_lead
  from person_lead_rows plr
  left join public.v_lead_journey_intelligence j
    on j.organization_id = plr.organization_id
   and j.lead_id = plr.lead_id
  where plr.latest_lead_rank = 1
),

/* ============================================================
   SESSIONS
   Canonical Person-session links are the authority here.
   ============================================================ */
session_rollup as (
  select
    ps.organization_id,
    ps.person_id,
    count(distinct ps.web_session_id) as session_count,
    min(ws.started_at) as first_session_at,
    max(
      coalesce(
        ws.last_seen_at,
        ws.ended_at,
        ws.started_at
      )
    ) as last_session_at,
    count(distinct ps.web_session_id) filter (
      where ws.started_at >= (now() - interval '7 days')
    ) as sessions_7d,
    count(distinct ps.web_session_id) filter (
      where ws.started_at >= (now() - interval '30 days')
    ) as sessions_30d
  from public.person_sessions ps
  join public.web_sessions ws
    on ws.id = ps.web_session_id
   and ws.organization_id = ps.organization_id
  group by
    ps.organization_id,
    ps.person_id
),

/* ============================================================
   TOUCHPOINTS
   A touchpoint can be linked through a Lead, a Session, or both.
   UNION removes double representation of the same touchpoint.
   ============================================================ */
person_touchpoint_rows as (
  select
    pl.organization_id,
    pl.person_id,
    t.id as touchpoint_id,
    t.event_type,
    t.occurred_at
  from public.person_leads pl
  join public.touchpoints t
    on t.organization_id = pl.organization_id
   and t.lead_id = pl.lead_id

  union

  select
    ps.organization_id,
    ps.person_id,
    t.id as touchpoint_id,
    t.event_type,
    t.occurred_at
  from public.person_sessions ps
  join public.touchpoints t
    on t.organization_id = ps.organization_id
   and t.web_session_id = ps.web_session_id
),

touchpoint_rollup as (
  select
    ptr.organization_id,
    ptr.person_id,
    count(*) as touchpoint_count,
    count(*) filter (
      where ptr.event_type = 'page_view'
    ) as page_view_count,
    count(*) filter (
      where ptr.occurred_at >= (now() - interval '7 days')
        and ptr.event_type = any (
          array[
            'lead_form_submit'::text,
            'course_enquire_click'::text,
            'whatsapp_click'::text,
            'reservation_start'::text,
            'payment_start'::text
          ]
        )
    ) as high_intent_events_7d,
    min(ptr.occurred_at) as first_touchpoint_at,
    max(ptr.occurred_at) as last_touchpoint_at
  from person_touchpoint_rows ptr
  group by
    ptr.organization_id,
    ptr.person_id
),

/* ============================================================
   COMMUNICATIONS
   Roll up through Person -> Lead.
   ============================================================ */
conversation_rollup as (
  select
    pl.organization_id,
    pl.person_id,
    count(distinct c.id) as conversation_count,
    max(
      coalesce(
        c.last_message_at,
        c.started_at,
        c.created_at
      )
    ) as last_conversation_activity_at
  from public.person_leads pl
  join public.conversations c
    on c.organization_id = pl.organization_id
   and c.lead_id = pl.lead_id
  group by
    pl.organization_id,
    pl.person_id
),

message_rollup as (
  select
    pl.organization_id,
    pl.person_id,
    count(distinct m.id) as message_count,
    max(
      coalesce(
        m.received_at,
        m.sent_at,
        m.created_at
      )
    ) as last_message_at
  from public.person_leads pl
  join public.messages m
    on m.organization_id = pl.organization_id
   and m.lead_id = pl.lead_id
  group by
    pl.organization_id,
    pl.person_id
),

/* ============================================================
   ENROLLMENTS
   Enrollment is optional; Person 360 does not depend on it.
   ============================================================ */
enrollment_rollup as (
  select
    pl.organization_id,
    pl.person_id,
    count(distinct e.id) as enrollment_count,
    count(distinct e.id) filter (
      where e.status::text = any (
        array[
          'confirmed'::text,
          'completed'::text
        ]
      )
    ) as confirmed_or_completed_enrollment_count,
    max(
      coalesce(
        e.enrolled_at,
        e.created_at
      )
    ) as last_enrollment_at
  from public.person_leads pl
  join public.enrollments e
    on e.organization_id = pl.organization_id
   and e.lead_id = pl.lead_id
  group by
    pl.organization_id,
    pl.person_id
),

/* ============================================================
   PAYMENTS
   Never add different currencies together.
   "paid" is the only currently recognized successful status.
   ============================================================ */
payment_base as (
  select
    pl.organization_id,
    pl.person_id,
    p.id as payment_id,
    p.status,
    p.payment_kind,
    p.amount,
    p.currency,
    p.paid_at,
    p.created_at
  from public.person_leads pl
  join public.payments p
    on p.organization_id = pl.organization_id
   and p.lead_id = pl.lead_id
),

payment_counts as (
  select
    pb.organization_id,
    pb.person_id,
    count(distinct pb.payment_id) as payment_count,
    count(distinct pb.payment_id) filter (
      where pb.status::text = 'paid'
    ) as paid_payment_count,
    max(pb.paid_at) filter (
      where pb.status::text = 'paid'
    ) as last_paid_at
  from payment_base pb
  group by
    pb.organization_id,
    pb.person_id
),

paid_by_currency as (
  select
    pb.organization_id,
    pb.person_id,
    pb.currency,
    sum(pb.amount) as paid_amount
  from payment_base pb
  where pb.status::text = 'paid'
  group by
    pb.organization_id,
    pb.person_id,
    pb.currency
),

payment_currency_rollup as (
  select
    pbc.organization_id,
    pbc.person_id,
    count(*) as paid_currency_count,
    jsonb_object_agg(
      pbc.currency,
      to_jsonb(pbc.paid_amount)
      order by pbc.currency
    ) as paid_amount_by_currency
  from paid_by_currency pbc
  group by
    pbc.organization_id,
    pbc.person_id
)

/* ============================================================
   CANONICAL PERSON 360
   One row per tenant + Person.
   ============================================================ */
select
  p.id as person_id,
  p.organization_id,
  p.status as person_status,
  p.created_at as person_created_at,
  p.updated_at as person_updated_at,

  /* identity */
  ir.primary_email,
  ir.primary_phone,
  ir.primary_whatsapp,
  coalesce(ir.identifier_count, 0::bigint) as identifier_count,
  coalesce(
    ir.verified_identifier_count,
    0::bigint
  ) as verified_identifier_count,

  /* CRM */
  coalesce(lr.lead_count, 0::bigint) as lead_count,
  lr.first_lead_at,
  lr.latest_lead_at,
  ll.latest_lead_id,
  ll.latest_lead_code,
  ll.latest_lead_name,
  ll.current_stage,
  ll.lead_status,
  ll.intent,
  ll.owner_user_id,
  ll.interested_course_id,
  ll.preferred_batch_id,
  ll.preferred_location,
  ll.preferred_month,
  ll.preferred_mode,
  ll.country,
  ll.timezone,
  ll.language,
  ll.next_followup_at,
  lr.last_contacted_at,
  lr.last_inbound_at,
  lr.last_outbound_at,

  /* behavior */
  coalesce(sr.session_count, 0::bigint) as session_count,
  sr.first_session_at,
  sr.last_session_at,
  coalesce(sr.sessions_7d, 0::bigint) as sessions_7d,
  coalesce(sr.sessions_30d, 0::bigint) as sessions_30d,
  coalesce(tr.touchpoint_count, 0::bigint) as touchpoint_count,
  coalesce(tr.page_view_count, 0::bigint) as page_view_count,
  coalesce(
    tr.high_intent_events_7d,
    0::bigint
  ) as high_intent_events_7d,
  tr.first_touchpoint_at,
  tr.last_touchpoint_at,

  /* latest Lead journey */
  llj.latest_lead_engagement_score,
  llj.latest_lead_behaviour_temperature,
  llj.latest_lead_behaviour_reason,
  llj.latest_lead_first_session_source,
  llj.latest_lead_first_session_medium,
  llj.latest_lead_first_session_campaign,
  llj.latest_lead_last_session_source,
  llj.latest_lead_last_session_medium,
  llj.latest_lead_last_session_campaign,
  llj.latest_lead_days_first_visit_to_lead,

  /* communications */
  coalesce(
    cr.conversation_count,
    0::bigint
  ) as conversation_count,
  coalesce(
    mr.message_count,
    0::bigint
  ) as message_count,
  cr.last_conversation_activity_at,
  mr.last_message_at,

  /* commercial */
  coalesce(
    er.enrollment_count,
    0::bigint
  ) as enrollment_count,
  coalesce(
    er.confirmed_or_completed_enrollment_count,
    0::bigint
  ) as confirmed_or_completed_enrollment_count,
  er.last_enrollment_at,
  coalesce(
    pc.payment_count,
    0::bigint
  ) as payment_count,
  coalesce(
    pc.paid_payment_count,
    0::bigint
  ) as paid_payment_count,
  pc.last_paid_at,
  coalesce(
    pcr.paid_currency_count,
    0::bigint
  ) as paid_currency_count,
  coalesce(
    pcr.paid_amount_by_currency,
    '{}'::jsonb
  ) as paid_amount_by_currency

from public.persons p

left join identifier_rollup ir
  on ir.organization_id = p.organization_id
 and ir.person_id = p.id

left join lead_rollup lr
  on lr.organization_id = p.organization_id
 and lr.person_id = p.id

left join latest_lead ll
  on ll.organization_id = p.organization_id
 and ll.person_id = p.id

left join latest_lead_journey llj
  on llj.organization_id = p.organization_id
 and llj.person_id = p.id

left join session_rollup sr
  on sr.organization_id = p.organization_id
 and sr.person_id = p.id

left join touchpoint_rollup tr
  on tr.organization_id = p.organization_id
 and tr.person_id = p.id

left join conversation_rollup cr
  on cr.organization_id = p.organization_id
 and cr.person_id = p.id

left join message_rollup mr
  on mr.organization_id = p.organization_id
 and mr.person_id = p.id

left join enrollment_rollup er
  on er.organization_id = p.organization_id
 and er.person_id = p.id

left join payment_counts pc
  on pc.organization_id = p.organization_id
 and pc.person_id = p.id

left join payment_currency_rollup pcr
  on pcr.organization_id = p.organization_id
 and pcr.person_id = p.id;


comment on view public.v_person_360 is
  'Canonical tenant-aware Person 360 read model. One row per organization_id/person_id, combining identity, CRM, behavior, communications, enrollment and per-currency paid payment summaries.';

revoke all on public.v_person_360 from public, anon;
grant select on public.v_person_360 to authenticated, service_role;

commit;
