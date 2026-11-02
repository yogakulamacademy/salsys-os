-- C1 reporting precedence: lead potential value is forecast; enrollment total
-- value is the agreed contract once a canonical enrollment exists.
-- Column names/types stay unchanged so dependent views remain compatible.

create or replace view public.v_lead_revenue_status
with (security_invoker = true)
as
select
  l.id as lead_id,
  l.lead_code,
  coalesce(
    l.display_name,
    trim(both from concat_ws(' ', l.first_name, l.last_name)),
    l.lead_code
  ) as lead_name,
  l.current_stage,
  coalesce(latest_enrollment.total_value, l.potential_value)::numeric(12,2) as potential_value,
  upper(coalesce(latest_enrollment.currency, l.potential_currency, 'INR')) as currency,
  coalesce(pt.gross_paid, 0::numeric)::numeric(14,2) as gross_paid,
  coalesce(pt.refunds, 0::numeric)::numeric(14,2) as refunds,
  coalesce(pt.net_paid, 0::numeric)::numeric(14,2) as net_paid,
  case
    when coalesce(latest_enrollment.total_value, l.potential_value) is null
      or coalesce(latest_enrollment.total_value, l.potential_value) <= 0::numeric
      then null::numeric
    else greatest(
      coalesce(latest_enrollment.total_value, l.potential_value)
        - coalesce(pt.net_paid, 0::numeric),
      0::numeric
    )
  end::numeric(14,2) as outstanding_balance,
  case
    when coalesce(latest_enrollment.total_value, l.potential_value) is null
      or coalesce(latest_enrollment.total_value, l.potential_value) <= 0::numeric
      then 'unvalued'::text
    when coalesce(pt.net_paid, 0::numeric) <= 0::numeric
      then 'unpaid'::text
    when coalesce(pt.net_paid, 0::numeric)
      >= coalesce(latest_enrollment.total_value, l.potential_value)
      then 'paid'::text
    else 'partially_paid'::text
  end as payment_status,
  l.organization_id
from public.leads l
left join lateral (
  select e.total_value, e.currency
  from public.enrollments e
  where e.lead_id = l.id
    and e.organization_id = l.organization_id
  order by e.created_at desc
  limit 1
) latest_enrollment on true
left join public.v_lead_payment_totals pt
  on pt.lead_id = l.id
 and pt.currency = upper(coalesce(latest_enrollment.currency, l.potential_currency, 'INR'))
 and pt.organization_id = l.organization_id
where l.status <> 'archived'::public.lead_status;

create or replace view public.v_revenue_forecast
with (security_invoker = true)
as
select
  l.id,
  l.lead_code,
  trim(both from concat_ws(' ', l.first_name, l.last_name)) as lead_name,
  l.current_stage,
  l.preferred_location,
  l.preferred_month,
  l.preferred_mode,
  l.first_touch_source,
  l.first_touch_medium,
  l.first_touch_campaign,
  l.lead_creation_channel,
  l.expected_close_date,
  l.created_at,
  coalesce(latest_enrollment.total_value, l.potential_value) as potential_value,
  coalesce(latest_enrollment.currency, l.potential_currency, 'INR') as currency,
  coalesce(tenant_probability.probability, default_probability.probability, 0::numeric) as probability,
  round(
    coalesce(latest_enrollment.total_value, l.potential_value, 0::numeric)
      * coalesce(tenant_probability.probability, default_probability.probability, 0::numeric),
    2
  ) as weighted_value,
  case
    when l.current_stage = 'enrolled'::public.lead_stage
      then coalesce(latest_enrollment.total_value, l.potential_value, 0::numeric)
    else 0::numeric
  end as actual_revenue,
  date_trunc(
    'month',
    coalesce(l.expected_close_date, l.created_at::date)::timestamptz
  )::date as forecast_month,
  l.organization_id
from public.leads l
left join public.organization_lead_stage_probabilities tenant_probability
  on tenant_probability.organization_id = l.organization_id
 and tenant_probability.stage = l.current_stage::text
left join public.lead_stage_probabilities default_probability
  on default_probability.stage = l.current_stage::text
left join lateral (
  select e.total_value, e.currency
  from public.enrollments e
  where e.lead_id = l.id
    and e.organization_id = l.organization_id
  order by e.created_at desc
  limit 1
) latest_enrollment on true;

comment on view public.v_lead_revenue_status is
  'Canonical lead revenue status. Lead potential value is pre-enrollment forecast; latest enrollment total value is authoritative contract value after enrollment.';
comment on view public.v_revenue_forecast is
  'Revenue forecast with enrollment-first contract value precedence once a canonical enrollment exists.';
