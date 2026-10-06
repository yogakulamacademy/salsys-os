-- ============================================================
-- MIGRATION 030
-- CANONICAL LEAD SALES INTELLIGENCE
--
-- Creates:
--   v_lead_sales_intelligence
--
-- Principles:
--
-- stored intent      = human / CRM-entered value
-- derived intent     = computed sales readiness
-- engagement_score   = behavioural activity
-- priority_score     = sales urgency
-- affinity_score     = product preference strength
--
-- Does NOT:
--   update leads.intent
--   update leads.interested_course_id
--   create another generic lead_score
--   attach anonymous browser history to a Person
-- ============================================================

begin;


create or replace view public.v_lead_sales_intelligence
with (security_invoker = true)
as

with

-- ============================================================
-- 1. PAYMENT EVIDENCE
-- ============================================================

payment_rollup as (
  select
    p.organization_id,
    p.lead_id,

    count(*) as payment_rows,

    count(*) filter (
      where p.paid_at is not null
    ) as paid_rows,

    max(p.paid_at)
      as last_paid_at

  from public.payments p

  group by
    p.organization_id,
    p.lead_id
),


-- ============================================================
-- 2. SAFE LEAD → PERSON MAPPING
--
-- Recommendation is attached only when exactly one canonical
-- Person is mapped to the Lead.
-- ============================================================

person_for_lead_raw as (
  select
    pl.organization_id,
    pl.lead_id,

    count(
      distinct pl.person_id
    ) as person_count,

    min(
      pl.person_id::text
    )::uuid as candidate_person_id

  from public.person_leads pl

  group by
    pl.organization_id,
    pl.lead_id
),

person_for_lead as (
  select
    organization_id,
    lead_id,
    person_count,

    case
      when person_count = 1
        then candidate_person_id
      else null
    end as person_id,

    (person_count > 1)
      as person_mapping_conflict

  from person_for_lead_raw
),


-- ============================================================
-- 3. CANONICAL INPUTS
-- ============================================================

base as (
  select
    l.organization_id,

    l.id
      as lead_id,

    l.lead_code,

    l.display_name
      as lead_name,

    l.current_stage::text
      as current_stage,

    l.status::text
      as lead_status,

    l.intent::text
      as stored_intent,

    l.owner_user_id,

    l.created_at
      as lead_created_at,

    l.last_contacted_at,
    l.last_inbound_at,
    l.last_outbound_at,
    l.next_followup_at,

    coalesce(
      j.engagement_score,
      0
    )::integer
      as engagement_score,

    coalesce(
      j.behaviour_temperature,
      'unknown'
    )::text
      as behaviour_temperature,

    coalesce(
      j.high_intent_events_7d,
      0
    ) as high_intent_events_7d,

    coalesce(
      j.whatsapp_clicks_7d,
      0
    ) as whatsapp_clicks_7d,

    coalesce(
      j.reservation_starts_7d,
      0
    ) as reservation_starts_7d,

    coalesce(
      j.payment_starts_7d,
      0
    ) as payment_starts_7d,

    coalesce(
      j.enquiry_clicks_7d,
      0
    ) as enquiry_clicks_7d,

    coalesce(
      j.brochure_downloads_7d,
      0
    ) as brochure_downloads_7d,

    j.sessions_7d,
    j.page_views_7d,
    j.days_since_last_visit,
    j.has_returned_after_becoming_lead,
    j.is_reengaged,

    q.priority_score,
    q.priority_band,

    q.next_action_code,
    q.next_best_action,
    q.priority_reason,

    q.payment_status,
    q.net_paid,
    q.outstanding_balance,

    coalesce(
      pr.payment_rows,
      0
    ) as payment_rows,

    coalesce(
      pr.paid_rows,
      0
    ) as paid_rows,

    pr.last_paid_at,

    pfl.person_id,

    coalesce(
      pfl.person_count,
      0
    ) as person_count,

    coalesce(
      pfl.person_mapping_conflict,
      false
    ) as person_mapping_conflict,

    r.recommended_course_id,
    r.recommended_course_code,
    r.recommended_course_name,

    r.recommended_affinity_score,

    r.recommendation_basis,
    r.recommendation_reason_codes,

    r.candidate_course_count

  from public.leads l

  left join public.v_lead_journey_intelligence j
    on j.organization_id =
       l.organization_id

   and j.lead_id =
       l.id

  left join public.v_admissions_priority_queue q
    on q.organization_id =
       l.organization_id

   and q.lead_id =
       l.id

  left join payment_rollup pr
    on pr.organization_id =
       l.organization_id

   and pr.lead_id =
       l.id

  left join person_for_lead pfl
    on pfl.organization_id =
       l.organization_id

   and pfl.lead_id =
       l.id

  left join public.v_person_course_recommendation r
    on r.organization_id =
       l.organization_id

   and r.person_id =
       pfl.person_id
),


-- ============================================================
-- 4. STAGE BASELINE
-- ============================================================

stage_baseline as (
  select
    b.*,

    case

      when b.current_stage in (
        'enrolled',
        'payment_pending'
      )
        then 'very_high'

      when b.current_stage =
           'high_intent'
        then 'high'

      when b.current_stage in (
        'qualified',
        'engaged'
      )
        then 'medium'

      when b.current_stage in (
        'contacted',
        'new',
        'nurture',
        'not_now',
        'lost',
        'unqualified',
        'duplicate'
      )
        then 'low'

      else 'unknown'

    end::text
      as stage_baseline_intent

  from base b
),


-- ============================================================
-- 5. DERIVED INTENT
-- ============================================================

classified as (
  select
    b.*,

    case

      when b.paid_rows > 0
        then 'very_high'

      when b.current_stage in (
        'enrolled',
        'payment_pending'
      )
        then 'very_high'

      when b.current_stage =
           'high_intent'
        then 'high'

      when b.payment_starts_7d > 0
        then 'high'

      when b.reservation_starts_7d > 0
        then 'high'

      when b.current_stage =
           'qualified'
       and b.high_intent_events_7d > 0
        then 'high'

      when b.high_intent_events_7d >= 2
       and b.whatsapp_clicks_7d > 0
        then 'high'

      when b.current_stage =
           'qualified'
        then 'medium'

      when b.current_stage =
           'engaged'
        then 'medium'

      when b.high_intent_events_7d > 0
        then 'medium'

      when b.behaviour_temperature in (
        'warm',
        'hot'
      )
        then 'medium'

      when b.current_stage in (
        'contacted',
        'new',
        'nurture',
        'not_now',
        'lost',
        'unqualified',
        'duplicate'
      )
        then 'low'

      else 'unknown'

    end::text
      as derived_intent,


    -- ========================================================
    -- INTENT CONFIDENCE
    -- ========================================================

    case

      when b.paid_rows > 0
        then 'high'

      when b.current_stage in (
        'enrolled',
        'payment_pending',
        'high_intent',
        'qualified'
      )
        then 'high'

      when b.payment_starts_7d > 0
        then 'high'

      when b.reservation_starts_7d > 0
        then 'high'

      when b.current_stage =
           'engaged'
        then 'medium'

      when b.high_intent_events_7d > 0
        then 'medium'

      when b.whatsapp_clicks_7d > 0
        then 'medium'

      when b.behaviour_temperature in (
        'warm',
        'hot'
      )
        then 'medium'

      else 'low'

    end::text
      as intent_confidence,


    -- ========================================================
    -- INTENT BASIS
    -- ========================================================

    case

      when b.paid_rows > 0
        then 'payment'

      when b.current_stage in (
        'enrolled',
        'payment_pending',
        'high_intent'
      )
        then 'crm_stage'

      when b.payment_starts_7d > 0
        then 'commercial_behavior'

      when b.reservation_starts_7d > 0
        then 'commercial_behavior'

      when b.current_stage =
           'qualified'
       and b.high_intent_events_7d > 0
        then 'stage_plus_behavior'

      when b.high_intent_events_7d >= 2
       and b.whatsapp_clicks_7d > 0
        then 'behavior_override'

      when b.current_stage in (
        'qualified',
        'engaged'
      )
        then 'crm_stage'

      when b.current_stage in (
        'new',
        'contacted',
        'nurture',
        'not_now',
        'lost',
        'unqualified',
        'duplicate'
      )

      and (
        b.high_intent_events_7d > 0

        or b.whatsapp_clicks_7d > 0

        or b.behaviour_temperature in (
          'warm',
          'hot'
        )
      )
        then 'behavior'

      when b.current_stage in (
        'new',
        'contacted',
        'nurture',
        'not_now',
        'lost',
        'unqualified',
        'duplicate'
      )
        then 'crm_stage'

      when b.high_intent_events_7d > 0

        or b.whatsapp_clicks_7d > 0

        or b.behaviour_temperature in (
          'warm',
          'hot'
        )
        then 'behavior'

      else 'insufficient_evidence'

    end::text
      as intent_basis,


    -- ========================================================
    -- EXPLAINABLE INTENT REASON CODES
    -- ========================================================

    array_remove(
      array[

        case
          when b.paid_rows > 0
            then 'paid_payment'
        end,

        case
          when b.current_stage = 'enrolled'
            then 'stage_enrolled'
        end,

        case
          when b.current_stage = 'payment_pending'
            then 'stage_payment_pending'
        end,

        case
          when b.current_stage = 'high_intent'
            then 'stage_high_intent'
        end,

        case
          when b.current_stage = 'qualified'
            then 'stage_qualified'
        end,

        case
          when b.current_stage = 'engaged'
            then 'stage_engaged'
        end,

        case
          when b.current_stage = 'contacted'
            then 'stage_contacted'
        end,

        case
          when b.current_stage = 'new'
            then 'stage_new'
        end,

        case
          when b.current_stage = 'nurture'
            then 'stage_nurture'
        end,

        case
          when b.current_stage = 'not_now'
            then 'stage_not_now'
        end,

        case
          when b.current_stage = 'lost'
            then 'stage_lost'
        end,

        case
          when b.current_stage = 'unqualified'
            then 'stage_unqualified'
        end,

        case
          when b.current_stage = 'duplicate'
            then 'stage_duplicate'
        end,

        case
          when b.payment_starts_7d > 0
            then 'recent_payment_start'
        end,

        case
          when b.reservation_starts_7d > 0
            then 'recent_reservation_start'
        end,

        case
          when b.whatsapp_clicks_7d > 0
            then 'recent_whatsapp_click'
        end,

        case
          when b.high_intent_events_7d > 0
            then 'recent_high_intent_event'
        end,

        case
          when b.high_intent_events_7d >= 2
            then 'multiple_recent_high_intent_events'
        end,

        case
          when b.behaviour_temperature = 'hot'
            then 'hot_behavior'
        end,

        case
          when b.behaviour_temperature = 'warm'
            then 'warm_behavior'
        end

      ]::text[],

      null
    ) as intent_reason_codes

  from stage_baseline b
)


-- ============================================================
-- 6. CANONICAL OUTPUT
-- ============================================================

select
  organization_id,

  lead_id,
  lead_code,
  lead_name,

  person_id,
  person_count,
  person_mapping_conflict,

  current_stage,
  lead_status,

  stored_intent,

  derived_intent,
  intent_confidence,
  intent_basis,
  intent_reason_codes,

  stage_baseline_intent,

  engagement_score,
  behaviour_temperature,

  high_intent_events_7d,
  whatsapp_clicks_7d,
  reservation_starts_7d,
  payment_starts_7d,
  enquiry_clicks_7d,
  brochure_downloads_7d,

  sessions_7d,
  page_views_7d,
  days_since_last_visit,

  has_returned_after_becoming_lead,
  is_reengaged,

  priority_score,
  priority_band,
  priority_reason,

  next_action_code,
  next_best_action,

  payment_status,
  payment_rows,
  paid_rows,
  last_paid_at,
  net_paid,
  outstanding_balance,

  recommended_course_id,
  recommended_course_code,
  recommended_course_name,

  recommended_affinity_score,

  recommendation_basis,
  recommendation_reason_codes,

  candidate_course_count,

  owner_user_id,

  lead_created_at,
  last_contacted_at,
  last_inbound_at,
  last_outbound_at,
  next_followup_at

from classified;


-- ============================================================
-- 7. PERMISSIONS
-- ============================================================

revoke all
on public.v_lead_sales_intelligence
from public, anon;


grant select
on public.v_lead_sales_intelligence
to authenticated, service_role;


commit;