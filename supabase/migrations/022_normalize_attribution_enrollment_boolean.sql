-- 022_normalize_attribution_enrollment_boolean.sql
-- Phase 6D: normalize canonical Attribution enrollment outcome to strict boolean.
-- This preserves Migration 021 semantics and changes only is_enrolled NULL -> false.
--
-- Canonical semantics:
--   First Touch          -> lead_attribution.first_touchpoint_id -> touchpoints
--                           fallback only when no canonical pointer exists:
--                           lead_attribution cached first_touch_* -> leads legacy first_touch_*
--   Lead Creation        -> lead_attribution.lead_creation_touchpoint_id -> touchpoints.channel
--                           fallback only when no canonical pointer exists:
--                           leads.lead_creation_channel
--   Last Marketing Touch -> lead_attribution.last_marketing_touchpoint_id -> touchpoints
--                           no general-last-touch fallback; absent pointer remains Unknown
--   Current Channel      -> leads.current_contact_channel
--   Conversion Touch     -> retained in facts for future use, but NOT exposed as a model yet.
--
-- Shape safety:
-- Existing v_attribution_lead_facts and v_attribution_model_rows columns are
-- preserved in the same order and with the same types.

begin;

-- ---------------------------------------------------------------------------
-- Preconditions
-- ---------------------------------------------------------------------------

do $$
declare
  missing text[];
begin
  select array_agg(req.object_name || '.' || req.column_name order by req.object_name, req.column_name)
  into missing
  from (
    values
      ('leads', 'organization_id'),
      ('payments', 'organization_id'),
      ('enrollments', 'organization_id'),
      ('courses', 'organization_id'),
      ('touchpoints', 'organization_id'),

      ('lead_attribution', 'first_touchpoint_id'),
      ('lead_attribution', 'lead_creation_touchpoint_id'),
      ('lead_attribution', 'last_marketing_touchpoint_id'),
      ('lead_attribution', 'conversion_touchpoint_id')
  ) as req(object_name, column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = req.object_name
      and c.column_name = req.column_name
  );

  if missing is not null then
    raise exception 'Migration 021 missing required columns: %', array_to_string(missing, ', ');
  end if;

  if to_regclass('public.v_attribution_lead_facts') is null then
    raise exception 'public.v_attribution_lead_facts is required';
  end if;

  if to_regclass('public.v_attribution_model_rows') is null then
    raise exception 'public.v_attribution_model_rows is required';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Canonical Attribution lead facts
-- ---------------------------------------------------------------------------

create or replace view public.v_attribution_lead_facts as
with payment_totals as (
  select
    p.organization_id,
    p.lead_id,

    coalesce(
      sum(
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
      ),
      0::numeric
    )::numeric(14,2) as revenue_inr,

    coalesce(
      sum(
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
      ),
      0::numeric
    )::numeric(14,2) as revenue_usd

  from public.payments p
  group by
    p.organization_id,
    p.lead_id
),

latest_enrollment as (
  select distinct on (
    e.organization_id,
    e.lead_id
  )
    e.organization_id,
    e.lead_id,
    e.status::text as enrollment_status,
    e.enrolled_at,
    e.created_at

  from public.enrollments e

  order by
    e.organization_id,
    e.lead_id,
    coalesce(e.enrolled_at, e.created_at) desc,
    e.created_at desc
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

  -- First Touch:
  -- pointer wins whenever it exists. Cached/text fields are historical fallback
  -- only when there is no canonical first_touchpoint_id.
  case
    when first_tp.id is not null
      then nullif(btrim(first_tp.source), '')
    else coalesce(
      nullif(btrim(la.first_touch_source), ''),
      nullif(btrim(l.first_touch_source), '')
    )
  end as first_touch_source,

  case
    when first_tp.id is not null
      then nullif(btrim(first_tp.medium), '')
    else coalesce(
      nullif(btrim(la.first_touch_medium), ''),
      nullif(btrim(l.first_touch_medium), '')
    )
  end as first_touch_medium,

  case
    when first_tp.id is not null
      then nullif(btrim(first_tp.campaign_name), '')
    else coalesce(
      nullif(btrim(la.first_touch_campaign), ''),
      nullif(btrim(l.first_touch_campaign), '')
    )
  end as first_touch_campaign,

  -- Lead Creation:
  -- canonical creation touchpoint channel wins when pointer exists.
  case
    when creation_tp.id is not null
      then nullif(btrim(creation_tp.channel::text), '')
    else nullif(btrim(l.lead_creation_channel::text), '')
  end as lead_creation_channel,

  -- Current conversation channel remains CRM operational state.
  l.current_contact_channel::text as current_contact_channel,

  -- Last Touch model intentionally means Last Marketing Touch.
  -- No fallback to last_touchpoint or legacy last_touch_* values.
  -- If no canonical marketing pointer exists, attribution stays Unknown.
  nullif(btrim(last_marketing_tp.source), '') as last_touch_source,
  nullif(btrim(last_marketing_tp.medium), '') as last_touch_medium,
  nullif(btrim(last_marketing_tp.campaign_name), '') as last_touch_campaign,

  -- Conversion pointer remains exposed only as a fact for future use.
  la.conversion_touchpoint_id,
  conversion_tp.source as conversion_touch_source,
  conversion_tp.medium as conversion_touch_medium,
  conversion_tp.campaign_name as conversion_touch_campaign,
  conversion_tp.channel::text as conversion_touch_channel,
  conversion_tp.occurred_at as conversion_touch_at,

  l.current_stage::text = any (
    array[
      'qualified'::text,
      'high_intent'::text,
      'payment_pending'::text,
      'enrolled'::text
    ]
  ) as is_qualified_plus,

  coalesce(
    (
      l.current_stage::text = 'enrolled'::text
      or le.enrollment_status = any (
        array['confirmed'::text, 'completed'::text]
      )
    ),
    false
  ) as is_enrolled,

  le.enrollment_status,

  coalesce(
    pt.revenue_inr,
    0::numeric
  )::numeric(14,2) as revenue_inr,

  coalesce(
    pt.revenue_usd,
    0::numeric
  )::numeric(14,2) as revenue_usd,

  l.organization_id as organization_id

from public.leads l

-- Tenant-safe course lookup.
left join public.courses c
  on c.id = l.interested_course_id
 and c.organization_id = l.organization_id

-- lead_attribution derives tenant ownership from its required parent lead.
left join public.lead_attribution la
  on la.lead_id = l.id

-- Canonical attribution pointers.
left join public.touchpoints first_tp
  on first_tp.id = la.first_touchpoint_id
 and first_tp.organization_id = l.organization_id

left join public.touchpoints creation_tp
  on creation_tp.id = la.lead_creation_touchpoint_id
 and creation_tp.organization_id = l.organization_id

left join public.touchpoints last_marketing_tp
  on last_marketing_tp.id = la.last_marketing_touchpoint_id
 and last_marketing_tp.organization_id = l.organization_id

-- Conversion remains future-facing and is not yet a selectable attribution model.
left join public.touchpoints conversion_tp
  on conversion_tp.id = la.conversion_touchpoint_id
 and conversion_tp.organization_id = l.organization_id

-- Tenant-safe revenue and enrollment joins.
left join payment_totals pt
  on pt.lead_id = l.id
 and pt.organization_id = l.organization_id

left join latest_enrollment le
  on le.lead_id = l.id
 and le.organization_id = l.organization_id;

alter view public.v_attribution_lead_facts
  set (security_invoker = true);

comment on view public.v_attribution_lead_facts is
  'Canonical tenant-aware Attribution facts. First Touch and Lead Creation prefer authoritative touchpoint pointers; Last Touch means Last Marketing Touch and requires last_marketing_touchpoint_id; Current Channel remains CRM operational state. Payment, enrollment, course and touchpoint joins are organization-safe. is_enrolled is a strict non-null boolean. Conversion Touch remains fact-only for future use.';

-- ---------------------------------------------------------------------------
-- Attribution model rows
-- Preserve the existing four model names and exact output shape.
-- ---------------------------------------------------------------------------

create or replace view public.v_attribution_model_rows as
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
        array[
          'unknown'::text,
          'unattributed'::text,
          '(not set)'::text,
          'not set'::text
        ]
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
        array[
          'unknown'::text,
          'unattributed'::text,
          '(not set)'::text,
          'not set'::text
        ]
      )
      then false

    else true
  end as is_known,

  f.is_qualified_plus,
  f.is_enrolled,
  f.revenue_inr,
  f.revenue_usd,
  f.organization_id as organization_id

from public.v_attribution_lead_facts f

cross join lateral (
  values
    (
      'first_touch'::text,
      f.first_touch_source,
      f.first_touch_medium,
      f.first_touch_campaign
    ),

    (
      'lead_creation'::text,
      f.lead_creation_channel,
      null::text,
      null::text
    ),

    (
      'last_touch'::text,
      f.last_touch_source,
      f.last_touch_medium,
      f.last_touch_campaign
    ),

    (
      'current_channel'::text,
      f.current_contact_channel,
      null::text,
      null::text
    )
) model(
  model_name,
  raw_value,
  medium,
  campaign
);

alter view public.v_attribution_model_rows
  set (security_invoker = true);

comment on view public.v_attribution_model_rows is
  'Canonical tenant-aware Attribution model rows. Models remain First Touch, Lead Creation, Last Marketing Touch (stored as last_touch), and Current Channel. Missing canonical attribution remains explicitly Unknown; Conversion Touch is intentionally not exposed yet.';

commit;
