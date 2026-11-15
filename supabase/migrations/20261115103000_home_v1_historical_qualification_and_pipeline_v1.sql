-- Home V1 Phase 2: credible historical qualification and open opportunity values.
-- Staging/review only until tested with owner, manager, admissions, revoked,
-- wrong-tenant and unbound sessions. No production changes from this PR.
begin;

create or replace function public.get_home_v1_qualification_snapshot(
  p_organization_id uuid,
  p_start timestamptz,
  p_end_exclusive timestamptz
)
returns jsonb
language plpgsql stable security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if p_organization_id is null
     or p_start is null
     or p_end_exclusive is null
     or p_end_exclusive <= p_start
     or p_end_exclusive - p_start > interval '366 days'
  then
    raise exception 'invalid Home reporting period' using errcode = '22023';
  end if;

  if not (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and public.has_organization_role(
        p_organization_id,
        array['owner','admin','manager']::text[]
      )
      and public.session_is_bound_to_organization(p_organization_id)
    )
  ) then
    raise exception 'not authorized for Home qualification'
      using errcode = '42501';
  end if;

  with cohort as materialized (
    select
      l.id,
      coalesce(nullif(trim(l.first_touch_source), ''), 'Unknown') as source
    from public.leads l
    where l.organization_id = p_organization_id
      and l.status <> 'archived'::lead_status
      and l.created_at >= p_start
      and l.created_at < p_end_exclusive
  ),
  scored as materialized (
    select c.id, c.source,
      exists (
        select 1 from public.lead_stage_history h
        where h.lead_id = c.id
          and h.changed_at < p_end_exclusive
      ) as has_history,
      exists (
        select 1 from public.lead_stage_history h
        where h.lead_id = c.id
          and h.changed_at < p_end_exclusive
          and h.to_stage::text in (
            'qualified','high_intent','payment_pending','enrolled'
          )
      ) as reached_qualified
    from cohort c
  ),
  source_rows as (
    select
      s.source,
      count(*)::bigint as leads,
      count(*) filter (where s.reached_qualified)::bigint as qualified
    from scored s
    group by s.source
    order by count(*) desc, s.source asc
    limit 25
  )
  select jsonb_build_object(
    'cohort_leads', (select count(*) from scored),
    'qualified_leads', (
      select count(*) from scored where reached_qualified
    ),
    'history_covered', (
      select count(*) from scored where has_history
    ),
    'sources', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'source', source, 'leads', leads, 'qualified', qualified
          ) order by leads desc, source asc
        ),
        '[]'::jsonb
      )
      from source_rows
    ),
    'basis', 'reached_qualification_milestone_by_period_end'
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.get_home_v1_pipeline_snapshot(
  p_organization_id uuid
)
returns jsonb
language plpgsql stable security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if p_organization_id is null then
    raise exception 'invalid organization' using errcode = '22023';
  end if;

  if not (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and public.has_organization_role(
        p_organization_id,
        array['owner','admin','manager']::text[]
      )
      and public.session_is_bound_to_organization(p_organization_id)
    )
  ) then
    raise exception 'not authorized for Home pipeline'
      using errcode = '42501';
  end if;

  with eligible as materialized (
    select
      l.id,
      l.potential_value,
      nullif(upper(trim(l.potential_currency)), '') as currency
    from public.leads l
    where l.organization_id = p_organization_id
      and l.status = 'open'::lead_status
      and l.current_stage::text in (
        'new','contacted','engaged','qualified',
        'high_intent','payment_pending'
      )
  ),
  valued as (
    select *
    from eligible
    where potential_value > 0 and currency is not null
  ),
  per_currency as (
    select
      currency,
      sum(potential_value)::numeric as amount,
      count(*)::bigint as opportunities
    from valued
    group by currency
  )
  select jsonb_build_object(
    'eligible_count', (select count(*) from eligible),
    'valued_count', (select count(*) from valued),
    'missing_value_count', (
      select count(*) from eligible
      where potential_value is null or potential_value <= 0
    ),
    'missing_currency_count', (
      select count(*) from eligible
      where potential_value > 0 and currency is null
    ),
    'currencies', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'currency', currency,
            'amount', amount,
            'opportunities', opportunities
          ) order by amount desc, currency asc
        ),
        '[]'::jsonb
      ) from per_currency
    ),
    'valuation_source', 'leads.potential_value',
    'basis', 'open_eligible_leads_snapshot'
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_home_v1_qualification_snapshot(uuid,timestamptz,timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_home_v1_pipeline_snapshot(uuid)
  from public, anon, authenticated;

grant execute on function public.get_home_v1_qualification_snapshot(uuid,timestamptz,timestamptz)
  to authenticated, service_role;
grant execute on function public.get_home_v1_pipeline_snapshot(uuid)
  to authenticated, service_role;

comment on function public.get_home_v1_qualification_snapshot(uuid,timestamptz,timestamptz) is
  'Counts current nonarchived lead cohorts reaching a qualified milestone before the report cutoff. The event date defines historical qualification, not the current CRM stage.';
comment on function public.get_home_v1_pipeline_snapshot(uuid) is
  'Separates currently open eligible leads with positive, explicit opportunity value and currency from unvalued leads. No weighted probabilities, implicit FX, or closed opportunity stages.';

commit;
