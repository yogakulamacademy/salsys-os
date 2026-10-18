-- R5 measurement health v1
-- Provides a tenant-safe, read-only health snapshot for attribution, funnel and revenue measurement.

begin;

create or replace function public.get_r5_measurement_health_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_leads bigint := 0;
  v_attribution_facts bigint := 0;
  v_model_rows bigint := 0;
  v_revenue_rows bigint := 0;
  v_duplicate_attribution bigint := 0;
  v_pointer_mismatches bigint := 0;
  v_first_known bigint := 0;
  v_last_known bigint := 0;
  v_hard_issue_count bigint := 0;
  v_reconciliation_issues bigint := 0;
  v_revenue_reconciliation jsonb := '[]'::jsonb;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  select count(*)
  into v_leads
  from public.leads l
  where l.organization_id = p_organization_id;

  select count(*)
  into v_attribution_facts
  from public.v_attribution_lead_facts f
  where f.organization_id = p_organization_id;

  select count(*)
  into v_model_rows
  from public.v_attribution_model_rows m
  where m.organization_id = p_organization_id;

  select count(*)
  into v_revenue_rows
  from public.v_lead_revenue_status r
  where r.organization_id = p_organization_id;

  select count(*)
  into v_duplicate_attribution
  from (
    select la.lead_id
    from public.lead_attribution la
    where la.organization_id = p_organization_id
    group by la.lead_id
    having count(*) > 1
  ) x;

  select count(*)
  into v_pointer_mismatches
  from public.lead_attribution la
  join public.leads l
    on l.id = la.lead_id
   and l.organization_id = p_organization_id
  left join public.touchpoints first_tp
    on first_tp.id = la.first_touchpoint_id
  left join public.touchpoints creation_tp
    on creation_tp.id = la.lead_creation_touchpoint_id
  left join public.touchpoints last_tp
    on last_tp.id = la.last_marketing_touchpoint_id
  left join public.touchpoints conversion_tp
    on conversion_tp.id = la.conversion_touchpoint_id
  where la.organization_id = p_organization_id
    and (
      (la.first_touchpoint_id is not null and (first_tp.id is null or first_tp.organization_id <> p_organization_id))
      or (la.lead_creation_touchpoint_id is not null and (creation_tp.id is null or creation_tp.organization_id <> p_organization_id))
      or (la.last_marketing_touchpoint_id is not null and (last_tp.id is null or last_tp.organization_id <> p_organization_id))
      or (la.conversion_touchpoint_id is not null and (conversion_tp.id is null or conversion_tp.organization_id <> p_organization_id))
    );

  select
    count(*) filter (where m.model_name = 'first_touch' and m.is_known),
    count(*) filter (where m.model_name = 'last_touch' and m.is_known)
  into v_first_known, v_last_known
  from public.v_attribution_model_rows m
  where m.organization_id = p_organization_id;

  with currencies as (
    select distinct upper(p.currency) as currency
    from public.payments p
    where p.organization_id = p_organization_id
      and nullif(btrim(p.currency), '') is not null
    union
    select distinct upper(v.currency) as currency
    from public.v_actual_revenue_by_currency v
    where v.organization_id = p_organization_id
      and nullif(btrim(v.currency), '') is not null
  ),
  ledger as (
    select
      upper(p.currency) as currency,
      coalesce(sum(
        case
          when p.payment_kind::text <> 'refund' and p.status::text = 'paid' then p.amount
          when p.payment_kind::text = 'refund' and p.status::text in ('refunded', 'paid') then -p.amount
          else 0::numeric
        end
      ), 0::numeric)::numeric(14,2) as actual_revenue
    from public.payments p
    where p.organization_id = p_organization_id
    group by upper(p.currency)
  ),
  reported as (
    select
      upper(v.currency) as currency,
      coalesce(v.actual_revenue, 0::numeric)::numeric(14,2) as actual_revenue
    from public.v_actual_revenue_by_currency v
    where v.organization_id = p_organization_id
  ),
  reconciliation as (
    select
      c.currency,
      coalesce(l.actual_revenue, 0::numeric)::numeric(14,2) as ledger_actual,
      coalesce(r.actual_revenue, 0::numeric)::numeric(14,2) as reported_actual,
      (coalesce(l.actual_revenue, 0::numeric) - coalesce(r.actual_revenue, 0::numeric))::numeric(14,2) as difference
    from currencies c
    left join ledger l on l.currency = c.currency
    left join reported r on r.currency = c.currency
  )
  select
    coalesce(jsonb_agg(to_jsonb(reconciliation) order by currency), '[]'::jsonb),
    count(*) filter (where difference <> 0)
  into v_revenue_reconciliation, v_reconciliation_issues
  from reconciliation;

  v_hard_issue_count :=
    (case when v_attribution_facts <> v_leads then 1 else 0 end)
    + (case when v_model_rows <> v_leads * 4 then 1 else 0 end)
    + (case when v_revenue_rows <> v_leads then 1 else 0 end)
    + v_duplicate_attribution
    + v_pointer_mismatches
    + v_reconciliation_issues;

  return jsonb_build_object(
    'integrity_ok', v_hard_issue_count = 0,
    'hard_issue_count', v_hard_issue_count,
    'lead_count', v_leads,
    'attribution_fact_count', v_attribution_facts,
    'attribution_model_row_count', v_model_rows,
    'expected_attribution_model_row_count', v_leads * 4,
    'revenue_status_row_count', v_revenue_rows,
    'duplicate_attribution_count', v_duplicate_attribution,
    'touchpoint_pointer_mismatch_count', v_pointer_mismatches,
    'first_touch_coverage_pct', case when v_leads > 0 then round(v_first_known::numeric / v_leads::numeric * 100, 2) else 0 end,
    'last_touch_coverage_pct', case when v_leads > 0 then round(v_last_known::numeric / v_leads::numeric * 100, 2) else 0 end,
    'revenue_reconciliation', v_revenue_reconciliation,
    'revenue_reconciliation_issue_count', v_reconciliation_issues,
    'note', 'Integrity checks validate internal measurement consistency. Attribution coverage describes evidence completeness and does not imply causation.'
  );
end;
$function$;

revoke all on function public.get_r5_measurement_health_v1(uuid) from public, anon;
grant execute on function public.get_r5_measurement_health_v1(uuid) to authenticated, service_role;

comment on function public.get_r5_measurement_health_v1(uuid) is
  'Tenant-safe R5 measurement health snapshot for attribution completeness, hard integrity invariants and payment-revenue reconciliation. Coverage is evidence completeness, not causal attribution.';

commit;
