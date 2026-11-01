-- Revenue final closeout v1
--
-- 1. Keep commercial value/currency semantics aligned between forecast and
--    payment/outstanding status by using the same lead -> latest enrollment
--    fallback as v_revenue_forecast.
-- 2. Expose an explicit, tenant-scoped Revenue readiness snapshot so missing
--    value / expected-close coverage cannot be mistaken for a healthy forecast.

begin;

create or replace view public.v_lead_revenue_status
with (security_invoker = true)
as
select
  l.id as lead_id,
  l.lead_code,
  coalesce(
    l.display_name,
    trim(concat_ws(' ', l.first_name, l.last_name)),
    l.lead_code
  ) as lead_name,
  l.current_stage,
  coalesce(l.potential_value, latest_enrollment.total_value)::numeric(12,2) as potential_value,
  upper(
    coalesce(
      l.potential_currency,
      latest_enrollment.currency,
      'INR'
    )
  ) as currency,
  coalesce(pt.gross_paid, 0)::numeric(14,2) as gross_paid,
  coalesce(pt.refunds, 0)::numeric(14,2) as refunds,
  coalesce(pt.net_paid, 0)::numeric(14,2) as net_paid,
  case
    when coalesce(l.potential_value, latest_enrollment.total_value) is null
      or coalesce(l.potential_value, latest_enrollment.total_value) <= 0
      then null::numeric
    else greatest(
      coalesce(l.potential_value, latest_enrollment.total_value) - coalesce(pt.net_paid, 0),
      0
    )
  end::numeric(14,2) as outstanding_balance,
  case
    when coalesce(l.potential_value, latest_enrollment.total_value) is null
      or coalesce(l.potential_value, latest_enrollment.total_value) <= 0
      then 'unvalued'::text
    when coalesce(pt.net_paid, 0) <= 0
      then 'unpaid'::text
    when coalesce(pt.net_paid, 0) >= coalesce(l.potential_value, latest_enrollment.total_value)
      then 'paid'::text
    else 'partially_paid'::text
  end as payment_status,
  l.organization_id
from public.leads l
left join lateral (
  select
    e.total_value,
    e.currency
  from public.enrollments e
  where e.lead_id = l.id
    and e.organization_id = l.organization_id
  order by e.created_at desc
  limit 1
) latest_enrollment on true
left join public.v_lead_payment_totals pt
  on pt.lead_id = l.id
 and pt.currency = upper(
   coalesce(
     l.potential_currency,
     latest_enrollment.currency,
     'INR'
   )
 )
 and pt.organization_id = l.organization_id
where l.status <> 'archived'::lead_status;

comment on view public.v_lead_revenue_status is
  'Canonical lead commercial/payment status. Potential value and currency use the same lead -> latest enrollment fallback as v_revenue_forecast; payment totals are matched only within that canonical currency.';

create or replace function public.get_revenue_readiness_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id using errcode = '42501';
  end if;

  select jsonb_build_object(
    'open_leads', count(*) filter (
      where f.current_stage::text not in ('enrolled','lost','unqualified','duplicate')
    ),
    'unvalued_leads', count(*) filter (
      where f.current_stage::text not in ('enrolled','lost','unqualified','duplicate')
        and coalesce(f.potential_value, 0) <= 0
    ),
    'undated_leads', count(*) filter (
      where f.current_stage::text not in ('enrolled','lost','unqualified','duplicate')
        and f.expected_close_date is null
    ),
    'valued_undated_leads', count(*) filter (
      where f.current_stage::text not in ('enrolled','lost','unqualified','duplicate')
        and coalesce(f.potential_value, 0) > 0
        and f.expected_close_date is null
    ),
    'pending_payment_requests', (
      select count(*)
      from public.payments p
      where p.organization_id = p_organization_id
        and p.status::text = 'pending'
    )
  )
  into v_payload
  from public.v_revenue_forecast f
  where f.organization_id = p_organization_id;

  return coalesce(
    v_payload,
    jsonb_build_object(
      'open_leads', 0,
      'unvalued_leads', 0,
      'undated_leads', 0,
      'valued_undated_leads', 0,
      'pending_payment_requests', 0
    )
  );
end;
$function$;

revoke all on function public.get_revenue_readiness_v1(uuid)
  from public, anon;
grant execute on function public.get_revenue_readiness_v1(uuid)
  to authenticated, service_role;

comment on function public.get_revenue_readiness_v1(uuid) is
  'Tenant-authorized Revenue forecast-readiness counts. Pending payment requests are counted as workflow items only and are never included in collected revenue.';

commit;
