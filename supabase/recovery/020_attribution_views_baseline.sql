-- PH-5.2B.1h — cold-recovery compatibility only.
-- Reconstructs the historical attribution read models required before
-- migration 020_attribution_workspace_tenant_scope.
--
-- Migration 020 uses CREATE OR REPLACE VIEW and appends organization_id as
-- the final column. These pre-020 views therefore intentionally match the
-- current column order/types except for organization_id.
--
-- This file is NOT part of the normal production migration ledger.

create or replace view public.v_attribution_lead_facts
with (security_invoker = true)
as
with payment_totals as (
  select
    p.lead_id,
    coalesce(sum(
      case
        when upper(p.currency) = 'INR'
          and p.payment_kind::text <> 'refund'
          and p.status::text = 'paid'
          then p.amount
        when upper(p.currency) = 'INR'
          and p.payment_kind::text = 'refund'
          and p.status::text = any (array['refunded'::text, 'paid'::text])
          then -p.amount
        else 0::numeric
      end
    ), 0::numeric)::numeric(14,2) as revenue_inr,
    coalesce(sum(
      case
        when upper(p.currency) = 'USD'
          and p.payment_kind::text <> 'refund'
          and p.status::text = 'paid'
          then p.amount
        when upper(p.currency) = 'USD'
          and p.payment_kind::text = 'refund'
          and p.status::text = any (array['refunded'::text, 'paid'::text])
          then -p.amount
        else 0::numeric
      end
    ), 0::numeric)::numeric(14,2) as revenue_usd
  from public.payments p
  group by p.lead_id
),
latest_enrollment as (
  select distinct on (e.lead_id)
    e.lead_id,
    e.status::text as enrollment_status,
    e.enrolled_at,
    e.created_at
  from public.enrollments e
  order by e.lead_id, coalesce(e.enrolled_at, e.created_at) desc, e.created_at desc
)
select
  l.id as lead_id,
  l.lead_code,
  coalesce(
    nullif(btrim(l.display_name), ''),
    nullif(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
    l.lead_code
  ) as lead_name,
  l.created_at,
  l.current_stage::text as current_stage,
  l.status::text as lead_status,
  l.intent::text as intent,
  l.interested_course_id as course_id,
  c.name as course_name,
  l.preferred_location,
  l.country,
  coalesce(nullif(btrim(l.first_touch_source), ''), nullif(btrim(la.first_touch_source), '')) as first_touch_source,
  coalesce(nullif(btrim(l.first_touch_medium), ''), nullif(btrim(la.first_touch_medium), '')) as first_touch_medium,
  coalesce(nullif(btrim(l.first_touch_campaign), ''), nullif(btrim(la.first_touch_campaign), '')) as first_touch_campaign,
  l.lead_creation_channel::text as lead_creation_channel,
  l.current_contact_channel::text as current_contact_channel,
  coalesce(nullif(btrim(l.last_touch_source), ''), nullif(btrim(la.last_touch_source), '')) as last_touch_source,
  coalesce(nullif(btrim(l.last_touch_medium), ''), nullif(btrim(la.last_touch_medium), '')) as last_touch_medium,
  coalesce(nullif(btrim(l.last_touch_campaign), ''), nullif(btrim(la.last_touch_campaign), '')) as last_touch_campaign,
  la.conversion_touchpoint_id,
  conversion_tp.source as conversion_touch_source,
  conversion_tp.medium as conversion_touch_medium,
  conversion_tp.campaign_name as conversion_touch_campaign,
  conversion_tp.channel::text as conversion_touch_channel,
  conversion_tp.occurred_at as conversion_touch_at,
  l.current_stage::text = any (
    array['qualified'::text, 'high_intent'::text, 'payment_pending'::text, 'enrolled'::text]
  ) as is_qualified_plus,
  (
    l.current_stage::text = 'enrolled'::text
    or le.enrollment_status = any (array['confirmed'::text, 'completed'::text])
  ) as is_enrolled,
  le.enrollment_status,
  coalesce(pt.revenue_inr, 0::numeric)::numeric(14,2) as revenue_inr,
  coalesce(pt.revenue_usd, 0::numeric)::numeric(14,2) as revenue_usd
from public.leads l
left join public.courses c on c.id = l.interested_course_id
left join public.lead_attribution la on la.lead_id = l.id
left join public.touchpoints conversion_tp on conversion_tp.id = la.conversion_touchpoint_id
left join payment_totals pt on pt.lead_id = l.id
left join latest_enrollment le on le.lead_id = l.id;

create or replace view public.v_attribution_model_rows
with (security_invoker = true)
as
select
  f.lead_id,
  f.lead_code,
  f.lead_name,
  f.created_at,
  f.current_stage,
  f.lead_status,
  f.intent,
  f.course_id,
  f.course_name,
  f.preferred_location,
  f.country,
  model.model_name,
  case
    when model.raw_value is null
      or btrim(model.raw_value) = ''
      or lower(btrim(model.raw_value)) = any (
        array['unknown'::text, 'unattributed'::text, '(not set)'::text, 'not set'::text]
      )
      then 'Unknown'::text
    else btrim(model.raw_value)
  end as attribution_value,
  model.medium,
  model.campaign,
  case
    when model.raw_value is null
      or btrim(model.raw_value) = ''
      or lower(btrim(model.raw_value)) = any (
        array['unknown'::text, 'unattributed'::text, '(not set)'::text, 'not set'::text]
      )
      then false
    else true
  end as is_known,
  f.is_qualified_plus,
  f.is_enrolled,
  f.revenue_inr,
  f.revenue_usd
from public.v_attribution_lead_facts f
cross join lateral (
  values
    ('first_touch'::text, f.first_touch_source, f.first_touch_medium, f.first_touch_campaign),
    ('lead_creation'::text, f.lead_creation_channel, null::text, null::text),
    ('last_touch'::text, f.last_touch_source, f.last_touch_medium, f.last_touch_campaign),
    ('current_channel'::text, f.current_contact_channel, null::text, null::text)
) model(model_name, raw_value, medium, campaign);
