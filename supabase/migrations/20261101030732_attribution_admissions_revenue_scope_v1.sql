create or replace function public.get_attribution_investigation_lead_ids_v1(
  p_organization_id uuid,
  p_creation_channel text default null::text,
  p_last_touch_source text default null::text
)
returns table(lead_id uuid)
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_creation_channel text := nullif(btrim(coalesce(p_creation_channel, '')), '');
  v_last_touch_source text := nullif(btrim(coalesce(p_last_touch_source, '')), '');
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if v_creation_channel is null and v_last_touch_source is null then
    raise exception 'At least one exact attribution dimension is required';
  end if;

  if not v_is_service and not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id using errcode = '42501';
  end if;

  return query
  select v.id
  from public.v_leads_overview v
  where v.organization_id = p_organization_id
    and (v_is_service or public.can_access_lead(v.id))
    and (
      v_creation_channel is null
      or coalesce(v.lead_creation_channel::text, '') = v_creation_channel
    )
    and (
      v_last_touch_source is null
      or coalesce(v.last_touch_source, '') = v_last_touch_source
    )
  order by v.id;
end;
$function$;

revoke all on function public.get_attribution_investigation_lead_ids_v1(uuid,text,text) from public, anon;
grant execute on function public.get_attribution_investigation_lead_ids_v1(uuid,text,text) to authenticated, service_role;

comment on function public.get_attribution_investigation_lead_ids_v1(uuid,text,text) is
  'Authorized exact lead-ID cohort for Lead Creation and Last Marketing Touch investigations. Uses canonical v_leads_overview evidence and per-lead access checks.';

create or replace function public.get_revenue_attribution_opportunities_v1(
  p_organization_id uuid,
  p_current_month text,
  p_first_touch_source text default null::text,
  p_creation_channel text default null::text,
  p_last_touch_source text default null::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_first_touch_source text := nullif(btrim(coalesce(p_first_touch_source, '')), '');
  v_creation_channel text := nullif(btrim(coalesce(p_creation_channel, '')), '');
  v_last_touch_source text := nullif(btrim(coalesce(p_last_touch_source, '')), '');
  v_current_month text := coalesce(
    nullif(btrim(coalesce(p_current_month, '')), ''),
    to_char(now() at time zone 'UTC', 'YYYY-MM')
  );
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_payload jsonb;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if v_first_touch_source is null
     and v_creation_channel is null
     and v_last_touch_source is null then
    raise exception 'At least one exact attribution dimension is required';
  end if;

  if not v_is_service and not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id using errcode = '42501';
  end if;

  with scoped as materialized (
    select
      f.id,
      f.lead_code,
      f.lead_name,
      f.current_stage::text as current_stage,
      f.preferred_location,
      o.first_touch_source,
      o.lead_creation_channel::text as lead_creation_channel,
      o.last_touch_source,
      f.expected_close_date,
      f.potential_value,
      f.currency,
      f.weighted_value,
      coalesce(r.net_paid, 0) as net_paid
    from public.v_revenue_forecast f
    join public.v_leads_overview o
      on o.id = f.id
     and o.organization_id = f.organization_id
    left join public.v_lead_revenue_status r
      on r.lead_id = f.id
     and r.organization_id = f.organization_id
    where f.organization_id = p_organization_id
      and (v_is_service or public.can_access_lead(f.id))
      and (
        v_first_touch_source is null
        or coalesce(o.first_touch_source, '') = v_first_touch_source
      )
      and (
        v_creation_channel is null
        or coalesce(o.lead_creation_channel::text, '') = v_creation_channel
      )
      and (
        v_last_touch_source is null
        or coalesce(o.last_touch_source, '') = v_last_touch_source
      )
  ),
  open_valued as materialized (
    select *
    from scoped
    where current_stage not in ('enrolled','lost','unqualified','duplicate')
      and coalesce(potential_value, 0) > 0
  ),
  top_rows as (
    select *
    from open_valued
    order by coalesce(weighted_value, 0) desc, id
    limit 10
  ),
  closing_rows as (
    select *
    from open_valued
    where expected_close_date is not null
      and left(expected_close_date::text, 7) = v_current_month
    order by coalesce(weighted_value, 0) desc, expected_close_date asc, id
    limit 25
  )
  select jsonb_build_object(
    'matching_leads', (select count(*) from scoped),
    'matching_open_valued', (select count(*) from open_valued),
    'top_opportunities', coalesce(
      (select jsonb_agg(to_jsonb(x) order by coalesce(x.weighted_value, 0) desc, x.id) from top_rows x),
      '[]'::jsonb
    ),
    'closing_this_month', coalesce(
      (select jsonb_agg(to_jsonb(x) order by coalesce(x.weighted_value, 0) desc, x.expected_close_date asc, x.id) from closing_rows x),
      '[]'::jsonb
    )
  )
  into v_payload;

  return coalesce(
    v_payload,
    jsonb_build_object(
      'matching_leads', 0,
      'matching_open_valued', 0,
      'top_opportunities', '[]'::jsonb,
      'closing_this_month', '[]'::jsonb
    )
  );
end;
$function$;

revoke all on function public.get_revenue_attribution_opportunities_v1(uuid,text,text,text,text) from public, anon;
grant execute on function public.get_revenue_attribution_opportunities_v1(uuid,text,text,text,text) to authenticated, service_role;

comment on function public.get_revenue_attribution_opportunities_v1(uuid,text,text,text,text) is
  'Authorized Revenue action read for exact First Touch, Lead Creation, and Last Marketing Touch cohorts. Commercial values come from v_revenue_forecast; attribution evidence comes from canonical v_leads_overview. Global Revenue summaries are intentionally unchanged.';
