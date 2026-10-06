-- ============================================================
-- MIGRATION 031
-- CANONICAL LEAD CONVERSION FACTS
--
-- Creates:
--   public.v_lead_conversion_facts
--
-- Principles:
--
-- 1. One row per real conversion fact.
-- 2. Payment, enrollment and CRM outcomes remain distinct.
-- 3. Revenue semantics reuse existing payment rules.
-- 4. CRM "won" is operational, not transactional enrollment.
-- 5. Marketing influence is frozen AS OF conversion time.
-- 6. Conversion Touch is only an explicit recognized event.
-- 7. Current contact channel is never inferred as conversion.
--
-- Does NOT mutate:
--   payments
--   enrollments
--   leads
--   lead_stage_history
--   lead_attribution
--   touchpoints
-- ============================================================

begin;


create or replace view public.v_lead_conversion_facts
with (security_invoker = true)
as

with

-- ============================================================
-- 1. PAYMENT SUCCESS
--
-- Reuses existing revenue semantics:
--   non-refund payment
--   status = paid
--
-- Timestamped fact additionally requires paid_at.
-- ============================================================

payment_success_facts as (
  select
    p.organization_id,
    p.lead_id,

    'payment_success'::text
      as conversion_type,

    'transactional'::text
      as authority_level,

    'payments'::text
      as source_table,

    p.id
      as source_id,

    p.paid_at
      as conversion_at,

    p.amount::numeric
      as amount,

    upper(p.currency)::text
      as currency,

    p.payment_kind::text
      as payment_kind,

    p.enrollment_id,

    e.course_id,
    e.batch_id,

    true
      as is_revenue_conversion,

    false
      as is_refund,

    false
      as is_enrollment_conversion,

    false
      as is_crm_outcome

  from public.payments p

  left join public.enrollments e
    on e.id =
       p.enrollment_id

   and e.organization_id =
       p.organization_id

  where p.payment_kind::text <>
        'refund'

    and p.status::text =
        'paid'

    and p.paid_at
        is not null
),


-- ============================================================
-- 2. PAYMENT REFUND
--
-- Reuses existing refund semantics:
--   payment_kind = refund
--   status = refunded OR paid
--
-- Amount is represented as a negative revenue delta.
-- ============================================================

payment_refund_facts as (
  select
    p.organization_id,
    p.lead_id,

    'payment_refund'::text
      as conversion_type,

    'transactional'::text
      as authority_level,

    'payments'::text
      as source_table,

    p.id
      as source_id,

    p.paid_at
      as conversion_at,

    (0 - p.amount)::numeric
      as amount,

    upper(p.currency)::text
      as currency,

    p.payment_kind::text
      as payment_kind,

    p.enrollment_id,

    e.course_id,
    e.batch_id,

    true
      as is_revenue_conversion,

    true
      as is_refund,

    false
      as is_enrollment_conversion,

    false
      as is_crm_outcome

  from public.payments p

  left join public.enrollments e
    on e.id =
       p.enrollment_id

   and e.organization_id =
       p.organization_id

  where p.payment_kind::text =
        'refund'

    and p.status::text in (
      'refunded',
      'paid'
    )

    and p.paid_at
        is not null
),


-- ============================================================
-- 3. AUTHORITATIVE ENROLLMENT
--
-- Confirmed and completed enrollment rows are transactional
-- enrollment facts.
--
-- enrolled_at is required for an event-level timestamp.
-- ============================================================

enrollment_facts as (
  select
    e.organization_id,
    e.lead_id,

    'enrollment_confirmed'::text
      as conversion_type,

    'transactional'::text
      as authority_level,

    'enrollments'::text
      as source_table,

    e.id
      as source_id,

    e.enrolled_at
      as conversion_at,

    null::numeric
      as amount,

    upper(e.currency)::text
      as currency,

    null::text
      as payment_kind,

    e.id
      as enrollment_id,

    e.course_id,
    e.batch_id,

    false
      as is_revenue_conversion,

    false
      as is_refund,

    true
      as is_enrollment_conversion,

    false
      as is_crm_outcome

  from public.enrollments e

  where e.status::text in (
      'confirmed',
      'completed'
    )

    and e.enrolled_at
        is not null
),


-- ============================================================
-- 4. FIRST CRM-WON EVENT
--
-- CRM enrolled is an operational outcome.
-- It remains separate from transactional enrollment.
-- ============================================================

crm_won_ranked as (
  select
    l.organization_id,

    l.id
      as lead_id,

    h.id
      as history_id,

    h.changed_at,

    row_number() over (
      partition by
        l.organization_id,
        l.id

      order by
        h.changed_at,
        h.id
    ) as rn

  from public.leads l

  join public.lead_stage_history h
    on h.lead_id =
       l.id

   and h.to_stage::text =
       'enrolled'
),


crm_won_facts as (
  select
    organization_id,
    lead_id,

    'crm_won'::text
      as conversion_type,

    'operational'::text
      as authority_level,

    'lead_stage_history'::text
      as source_table,

    history_id
      as source_id,

    changed_at
      as conversion_at,

    null::numeric
      as amount,

    null::text
      as currency,

    null::text
      as payment_kind,

    null::uuid
      as enrollment_id,

    null::uuid
      as course_id,

    null::uuid
      as batch_id,

    false
      as is_revenue_conversion,

    false
      as is_refund,

    false
      as is_enrollment_conversion,

    true
      as is_crm_outcome

  from crm_won_ranked

  where rn = 1
),


-- ============================================================
-- 5. EVENT-LEVEL UNION
-- ============================================================

conversion_facts as (
  select *
  from payment_success_facts

  union all

  select *
  from payment_refund_facts

  union all

  select *
  from enrollment_facts

  union all

  select *
  from crm_won_facts
),


-- ============================================================
-- 6. LEAD CONTEXT
-- ============================================================

facts_with_lead as (
  select
    f.*,

    l.lead_code,

    coalesce(
      nullif(
        btrim(l.display_name),
        ''
      ),

      nullif(
        btrim(
          concat_ws(
            ' ',
            l.first_name,
            l.last_name
          )
        ),
        ''
      ),

      l.lead_code
    ) as lead_name,

    l.current_stage::text
      as current_stage,

    l.status::text
      as lead_status,

    l.created_at
      as lead_created_at

  from conversion_facts f

  join public.leads l
    on l.id =
       f.lead_id

   and l.organization_id =
       f.organization_id
),


-- ============================================================
-- 7. MARKETING INFLUENCE AS OF CONVERSION
--
-- Exact eligibility semantics used by the existing attribution
-- engine:
--
-- eligible when:
--   any ad click ID exists
--   OR source is not Direct / Unknown
--
-- excluding:
--   medium = internal
--
-- This is deliberately NOT today's last marketing touch.
-- ============================================================

facts_with_marketing as (
  select
    f.*,

    mt.id
      as last_marketing_touchpoint_id,

    mt.occurred_at
      as last_marketing_touch_at,

    mt.source
      as last_marketing_source,

    mt.medium
      as last_marketing_medium,

    mt.campaign_name
      as last_marketing_campaign,

    mt.channel::text
      as last_marketing_channel,

    mt.event_type
      as last_marketing_event_type,

    mt.platform
      as last_marketing_platform,

    mt.campaign_id
      as last_marketing_campaign_id,

    mt.ad_id
      as last_marketing_ad_id,

    mt.external_campaign_id
      as last_marketing_external_campaign_id,

    mt.external_adset_id
      as last_marketing_external_adset_id,

    mt.external_ad_id
      as last_marketing_external_ad_id,

    mt.gclid
      as last_marketing_gclid,

    mt.gbraid
      as last_marketing_gbraid,

    mt.wbraid
      as last_marketing_wbraid,

    mt.fbclid
      as last_marketing_fbclid

  from facts_with_lead f

  left join lateral (

    select t.*

    from public.touchpoints t

    where t.organization_id =
          f.organization_id

      and t.lead_id =
          f.lead_id

      and t.occurred_at <=
          f.conversion_at

      and (
        t.gclid is not null
        or t.gbraid is not null
        or t.wbraid is not null
        or t.fbclid is not null

        or coalesce(
          nullif(
            lower(t.source),
            ''
          ),
          'direct'
        ) not in (
          'direct',
          'unknown'
        )
      )

      and coalesce(
        lower(t.medium),
        ''
      ) <> 'internal'

    order by
      t.occurred_at desc,
      t.created_at desc,
      t.id desc

    limit 1

  ) mt
    on true
),


-- ============================================================
-- 8. EXPLICIT CONVERSION TOUCH
--
-- Reuses the exact recognized event types from the existing
-- attribution engine.
--
-- We never infer current contact channel as conversion channel.
-- ============================================================

facts_with_conversion_touch as (
  select
    f.*,

    ct.id
      as explicit_conversion_touchpoint_id,

    ct.occurred_at
      as explicit_conversion_touch_at,

    ct.source
      as explicit_conversion_source,

    ct.medium
      as explicit_conversion_medium,

    ct.campaign_name
      as explicit_conversion_campaign,

    ct.channel::text
      as explicit_conversion_channel,

    ct.event_type
      as explicit_conversion_event_type,

    ct.platform
      as explicit_conversion_platform,

    ct.campaign_id
      as explicit_conversion_campaign_id,

    ct.ad_id
      as explicit_conversion_ad_id,

    ct.external_campaign_id
      as explicit_conversion_external_campaign_id,

    ct.external_adset_id
      as explicit_conversion_external_adset_id,

    ct.external_ad_id
      as explicit_conversion_external_ad_id

  from facts_with_marketing f

  left join lateral (

    select t.*

    from public.touchpoints t

    where t.organization_id =
          f.organization_id

      and t.lead_id =
          f.lead_id

      and t.occurred_at <=
          f.conversion_at

      and t.event_type in (
        'deposit_paid',
        'payment_completed',
        'enrolled',
        'conversion'
      )

    order by
      t.occurred_at desc,
      t.created_at desc,
      t.id desc

    limit 1

  ) ct
    on true
)


-- ============================================================
-- 9. CANONICAL OUTPUT
-- ============================================================

select
  organization_id,

  (
    source_table
    || ':'
    || source_id::text
  )::text
    as conversion_fact_key,

  lead_id,
  lead_code,
  lead_name,

  conversion_type,
  authority_level,

  source_table,
  source_id,

  conversion_at,

  amount,
  currency,
  payment_kind,

  enrollment_id,
  course_id,
  batch_id,

  is_revenue_conversion,
  is_refund,
  is_enrollment_conversion,
  is_crm_outcome,

  (
    last_marketing_touchpoint_id
    is not null
  ) as has_marketing_influence,

  last_marketing_touchpoint_id,
  last_marketing_touch_at,
  last_marketing_source,
  last_marketing_medium,
  last_marketing_campaign,
  last_marketing_channel,
  last_marketing_event_type,
  last_marketing_platform,

  last_marketing_campaign_id,
  last_marketing_ad_id,

  last_marketing_external_campaign_id,
  last_marketing_external_adset_id,
  last_marketing_external_ad_id,

  last_marketing_gclid,
  last_marketing_gbraid,
  last_marketing_wbraid,
  last_marketing_fbclid,

  (
    explicit_conversion_touchpoint_id
    is not null
  ) as has_explicit_conversion_touch,

  explicit_conversion_touchpoint_id,
  explicit_conversion_touch_at,
  explicit_conversion_source,
  explicit_conversion_medium,
  explicit_conversion_campaign,
  explicit_conversion_channel,
  explicit_conversion_event_type,
  explicit_conversion_platform,

  explicit_conversion_campaign_id,
  explicit_conversion_ad_id,

  explicit_conversion_external_campaign_id,
  explicit_conversion_external_adset_id,
  explicit_conversion_external_ad_id,

  current_stage,
  lead_status,
  lead_created_at

from facts_with_conversion_touch;


-- ============================================================
-- 10. PERMISSIONS
-- ============================================================

revoke all
on public.v_lead_conversion_facts
from public, anon;


grant select
on public.v_lead_conversion_facts
to authenticated, service_role;


commit;