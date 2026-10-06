-- Phase 4 — Customer Journey / Customer 360
-- Migration 018: canonical Person Journey timeline.
--
-- One normalized chronological event stream per tenant + Person.
-- This is a derived read model only; no base-table data is mutated.
--
-- Design principles:
-- - every row carries organization_id + person_id explicitly;
-- - operational sources link upward through person_leads;
-- - anonymous/website touchpoints can link through person_sessions;
-- - if a touchpoint has a Lead, the canonical Person↔Lead link is authoritative;
-- - event_at is always the best source timestamp available;
-- - journey_event_key is stable and deterministic for UI ordering/pagination;
-- - security_invoker=true preserves underlying RLS behavior;
-- - raw_events are not queried directly: touchpoint.event_id remains evidence linkage.

begin;

create or replace view public.v_person_journey
with (security_invoker = true)
as

with
/* ============================================================
   TOUCHPOINT → PERSON MAPPING

   Priority:
   1) If the touchpoint has lead_id, resolve through person_leads.
   2) Otherwise resolve through person_sessions.

   This avoids representing the same touchpoint twice when both
   a Lead and a Session are linked to the same Person.
   ============================================================ */
touchpoint_person_map as (

  select
    t.organization_id,
    pl.person_id,
    t.id as touchpoint_id
  from public.touchpoints t
  join public.person_leads pl
    on pl.organization_id = t.organization_id
   and pl.lead_id = t.lead_id
  where t.lead_id is not null

  union all

  select
    t.organization_id,
    ps.person_id,
    t.id as touchpoint_id
  from public.touchpoints t
  join public.person_sessions ps
    on ps.organization_id = t.organization_id
   and ps.web_session_id = t.web_session_id
  where t.web_session_id is not null
    and (
      t.lead_id is null
      or not exists (
        select 1
        from public.person_leads pl
        where pl.organization_id = t.organization_id
          and pl.lead_id = t.lead_id
      )
    )
),

/* ============================================================
   DIGITAL / MARKETING TOUCHPOINTS
   ============================================================ */
touchpoint_events as (

  select
    t.organization_id,
    tpm.person_id,
    t.occurred_at as event_at,
    'digital'::text as event_category,
    t.event_type::text as event_type,
    ('touchpoints:' || t.id::text) as journey_event_key,
    'touchpoints'::text as source_table,
    t.id::text as source_record_id,
    t.lead_id,
    t.web_session_id,
    t.channel::text as channel,
    coalesce(
      nullif(t.source, ''),
      nullif(t.utm_source, ''),
      nullif(t.platform, '')
    ) as source,
    initcap(replace(t.event_type, '_', ' ')) as title,
    nullif(
      concat_ws(
        ' · ',
        nullif(t.landing_page, ''),
        nullif(t.campaign_name, ''),
        nullif(t.utm_campaign, '')
      ),
      ''
    ) as summary,
    coalesce(t.metadata, '{}'::jsonb)
      ||
      jsonb_strip_nulls(
        jsonb_build_object(
          'event_id', t.event_id,
          'anonymous_visitor_id', t.anonymous_visitor_id,
          'medium', coalesce(nullif(t.medium, ''), nullif(t.utm_medium, '')),
          'campaign', coalesce(nullif(t.campaign_name, ''), nullif(t.utm_campaign, '')),
          'content', coalesce(nullif(t.content, ''), nullif(t.utm_content, '')),
          'term', coalesce(nullif(t.term, ''), nullif(t.utm_term, '')),
          'landing_page', t.landing_page,
          'referrer', t.referrer,
          'platform', t.platform,
          'gclid', t.gclid,
          'gbraid', t.gbraid,
          'wbraid', t.wbraid,
          'fbclid', t.fbclid,
          'external_campaign_id', t.external_campaign_id,
          'external_adset_id', t.external_adset_id,
          'external_ad_id', t.external_ad_id,
          'geo_country', t.geo_country,
          'geo_region', t.geo_region,
          'geo_city', t.geo_city
        )
      ) as metadata
  from touchpoint_person_map tpm
  join public.touchpoints t
    on t.id = tpm.touchpoint_id
   and t.organization_id = tpm.organization_id
),

/* ============================================================
   LEAD CREATED
   ============================================================ */
lead_created_events as (

  select
    pl.organization_id,
    pl.person_id,
    l.created_at as event_at,
    'crm'::text as event_category,
    'lead_created'::text as event_type,
    ('leads:' || l.id::text) as journey_event_key,
    'leads'::text as source_table,
    l.id::text as source_record_id,
    l.id as lead_id,
    null::uuid as web_session_id,
    l.lead_creation_channel::text as channel,
    coalesce(
      nullif(l.lead_origin, ''),
      nullif(l.first_touch_source, '')
    ) as source,
    'Lead created'::text as title,
    coalesce(
      nullif(btrim(l.display_name), ''),
      nullif(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
      l.lead_code
    ) as summary,
    coalesce(l.metadata, '{}'::jsonb)
      ||
      jsonb_strip_nulls(
        jsonb_build_object(
          'lead_code', l.lead_code,
          'current_stage', l.current_stage::text,
          'status', l.status::text,
          'intent', l.intent::text,
          'interested_course_id', l.interested_course_id,
          'preferred_batch_id', l.preferred_batch_id,
          'preferred_location', l.preferred_location,
          'preferred_month', l.preferred_month,
          'preferred_mode', l.preferred_mode,
          'country', l.country,
          'first_touch_source', l.first_touch_source,
          'first_touch_medium', l.first_touch_medium,
          'first_touch_campaign', l.first_touch_campaign
        )
      ) as metadata
  from public.person_leads pl
  join public.leads l
    on l.id = pl.lead_id
   and l.organization_id = pl.organization_id
),

/* ============================================================
   CRM STAGE CHANGES
   ============================================================ */
stage_change_events as (

  select
    pl.organization_id,
    pl.person_id,
    h.changed_at as event_at,
    'crm'::text as event_category,
    'stage_changed'::text as event_type,
    ('lead_stage_history:' || h.id::text) as journey_event_key,
    'lead_stage_history'::text as source_table,
    h.id::text as source_record_id,
    h.lead_id,
    null::uuid as web_session_id,
    null::text as channel,
    h.changed_by_type::text as source,
    'Lead stage changed'::text as title,
    concat_ws(
      ' → ',
      coalesce(h.from_stage::text, 'none'),
      h.to_stage::text
    ) as summary,
    jsonb_strip_nulls(
      jsonb_build_object(
        'from_stage', h.from_stage::text,
        'to_stage', h.to_stage::text,
        'changed_by_type', h.changed_by_type::text,
        'changed_by_id', h.changed_by_id,
        'reason', h.reason
      )
    ) as metadata
  from public.lead_stage_history h
  join public.person_leads pl
    on pl.lead_id = h.lead_id
),

/* ============================================================
   HUMAN / CRM CONTACT LOGS
   ============================================================ */
contact_log_events as (

  select
    pl.organization_id,
    pl.person_id,
    lcl.contacted_at as event_at,
    'contact'::text as event_category,
    'contact_logged'::text as event_type,
    ('lead_contact_logs:' || lcl.id::text) as journey_event_key,
    'lead_contact_logs'::text as source_table,
    lcl.id::text as source_record_id,
    lcl.lead_id,
    null::uuid as web_session_id,
    lcl.method::text as channel,
    lcl.source::text as source,
    concat_ws(
      ' ',
      initcap(coalesce(lcl.direction, 'contact')),
      initcap(coalesce(lcl.method, 'interaction'))
    ) as title,
    nullif(lcl.comment, '') as summary,
    coalesce(lcl.metadata, '{}'::jsonb)
      ||
      jsonb_strip_nulls(
        jsonb_build_object(
          'direction', lcl.direction,
          'outcome', lcl.outcome,
          'employee_user_id', lcl.employee_user_id,
          'employee_name_snapshot', lcl.employee_name_snapshot,
          'call_duration_seconds', lcl.call_duration_seconds,
          'external_reference', lcl.external_reference
        )
      ) as metadata
  from public.lead_contact_logs lcl
  join public.person_leads pl
    on pl.lead_id = lcl.lead_id
),

/* ============================================================
   CONVERSATIONS
   ============================================================ */
conversation_events as (

  select
    pl.organization_id,
    pl.person_id,
    c.started_at as event_at,
    'conversation'::text as event_category,
    'conversation_started'::text as event_type,
    ('conversations:' || c.id::text) as journey_event_key,
    'conversations'::text as source_table,
    c.id::text as source_record_id,
    c.lead_id,
    null::uuid as web_session_id,
    c.channel::text as channel,
    nullif(c.external_account_id, '') as source,
    'Conversation started'::text as title,
    concat_ws(
      ' · ',
      initcap(c.channel::text),
      initcap(c.status)
    ) as summary,
    coalesce(c.metadata, '{}'::jsonb)
      ||
      jsonb_strip_nulls(
        jsonb_build_object(
          'status', c.status,
          'assigned_to', c.assigned_to,
          'external_conversation_id', c.external_conversation_id,
          'external_account_id', c.external_account_id,
          'last_message_at', c.last_message_at
        )
      ) as metadata
  from public.conversations c
  join public.person_leads pl
    on pl.organization_id = c.organization_id
   and pl.lead_id = c.lead_id
),

/* ============================================================
   MESSAGES
   ============================================================ */
message_events as (

  select
    pl.organization_id,
    pl.person_id,
    coalesce(
      m.received_at,
      m.sent_at,
      m.created_at
    ) as event_at,
    'conversation'::text as event_category,
    ('message_' || m.direction::text) as event_type,
    ('messages:' || m.id::text) as journey_event_key,
    'messages'::text as source_table,
    m.id::text as source_record_id,
    m.lead_id,
    null::uuid as web_session_id,
    c.channel::text as channel,
    m.sender_type::text as source,
    concat_ws(
      ' ',
      initcap(m.direction::text),
      'message'
    ) as title,
    nullif(left(m.body, 240), '') as summary,
    coalesce(m.metadata, '{}'::jsonb)
      ||
      jsonb_strip_nulls(
        jsonb_build_object(
          'conversation_id', m.conversation_id,
          'external_message_id', m.external_message_id,
          'sender_type', m.sender_type::text,
          'sender_id', m.sender_id,
          'message_type', m.message_type,
          'template_key', m.template_key,
          'status', m.status::text,
          'ai_generated', m.ai_generated,
          'human_approved', m.human_approved,
          'sent_at', m.sent_at,
          'delivered_at', m.delivered_at,
          'read_at', m.read_at,
          'received_at', m.received_at
        )
      ) as metadata
  from public.messages m
  join public.person_leads pl
    on pl.organization_id = m.organization_id
   and pl.lead_id = m.lead_id
  left join public.conversations c
    on c.id = m.conversation_id
   and c.organization_id = m.organization_id
   and c.lead_id = m.lead_id
),

/* ============================================================
   ENROLLMENTS
   ============================================================ */
enrollment_events as (

  select
    pl.organization_id,
    pl.person_id,
    coalesce(
      e.enrolled_at,
      e.created_at
    ) as event_at,
    'enrollment'::text as event_category,
    ('enrollment_' || e.status::text) as event_type,
    ('enrollments:' || e.id::text) as journey_event_key,
    'enrollments'::text as source_table,
    e.id::text as source_record_id,
    e.lead_id,
    null::uuid as web_session_id,
    null::text as channel,
    null::text as source,
    'Enrollment'::text as title,
    concat_ws(
      ' · ',
      initcap(e.status::text),
      case
        when e.total_value is not null
          then concat(e.total_value::text, ' ', coalesce(e.currency, ''))
        else null
      end
    ) as summary,
    coalesce(e.metadata, '{}'::jsonb)
      ||
      jsonb_strip_nulls(
        jsonb_build_object(
          'course_id', e.course_id,
          'batch_id', e.batch_id,
          'status', e.status::text,
          'total_value', e.total_value,
          'currency', e.currency,
          'enrolled_at', e.enrolled_at
        )
      ) as metadata
  from public.enrollments e
  join public.person_leads pl
    on pl.organization_id = e.organization_id
   and pl.lead_id = e.lead_id
),

/* ============================================================
   PAYMENTS
   ============================================================ */
payment_events as (

  select
    pl.organization_id,
    pl.person_id,
    coalesce(
      p.paid_at,
      p.payment_link_sent_at,
      p.created_at
    ) as event_at,
    'payment'::text as event_category,
    ('payment_' || p.status::text) as event_type,
    ('payments:' || p.id::text) as journey_event_key,
    'payments'::text as source_table,
    p.id::text as source_record_id,
    p.lead_id,
    null::uuid as web_session_id,
    nullif(p.provider, '') as channel,
    nullif(p.provider, '') as source,
    'Payment'::text as title,
    concat_ws(
      ' · ',
      initcap(p.status::text),
      concat(p.amount::text, ' ', p.currency),
      initcap(p.payment_kind::text)
    ) as summary,
    coalesce(p.metadata, '{}'::jsonb)
      ||
      jsonb_strip_nulls(
        jsonb_build_object(
          'enrollment_id', p.enrollment_id,
          'provider', p.provider,
          'external_payment_id', p.external_payment_id,
          'payment_kind', p.payment_kind::text,
          'status', p.status::text,
          'amount', p.amount,
          'currency', p.currency,
          'payment_link_sent_at', p.payment_link_sent_at,
          'paid_at', p.paid_at
        )
      ) as metadata
  from public.payments p
  join public.person_leads pl
    on pl.organization_id = p.organization_id
   and pl.lead_id = p.lead_id
),

/* ============================================================
   NORMALIZED UNION
   ============================================================ */
journey as (

  select * from touchpoint_events
  union all
  select * from lead_created_events
  union all
  select * from stage_change_events
  union all
  select * from contact_log_events
  union all
  select * from conversation_events
  union all
  select * from message_events
  union all
  select * from enrollment_events
  union all
  select * from payment_events

)

select
  organization_id,
  person_id,
  event_at,
  event_category,
  event_type,
  journey_event_key,
  source_table,
  source_record_id,
  lead_id,
  web_session_id,
  channel,
  source,
  title,
  summary,
  metadata
from journey;


comment on view public.v_person_journey is
  'Canonical tenant-aware Person journey timeline. Normalizes digital touchpoints, Lead lifecycle, contact logs, conversations/messages, enrollments and payments into one chronological read model.';

revoke all on public.v_person_journey from public, anon;
grant select on public.v_person_journey to authenticated, service_role;

commit;
