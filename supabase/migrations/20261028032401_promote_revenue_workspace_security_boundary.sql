begin;

alter function public.get_revenue_workspace(text,uuid)
rename to get_revenue_workspace_internal_v1;

revoke all on function public.get_revenue_workspace_internal_v1(text,uuid)
from public, anon, authenticated, service_role;

create function public.get_revenue_workspace(
  p_current_month text,
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_payload jsonb;
  v_stages jsonb;
  v_sources jsonb;
  v_locations jsonb;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  v_payload := public.get_revenue_workspace_internal_v1(
    p_current_month,
    p_organization_id
  );

  select coalesce(
    jsonb_agg(
      x
      order by
        case x->>'current_stage'
          when 'new' then 10
          when 'contacted' then 20
          when 'engaged' then 30
          when 'qualified' then 40
          when 'high_intent' then 50
          when 'payment_pending' then 60
          when 'closed_won' then 70
          when 'enrolled' then 80
          when 'nurture' then 90
          when 'not_now' then 100
          when 'lost' then 110
          when 'unqualified' then 120
          when 'duplicate' then 130
          else 1000
        end,
        x->>'currency',
        x->>'current_stage'
    ),
    '[]'::jsonb
  )
  into v_stages
  from jsonb_array_elements(
    coalesce(v_payload->'stages','[]'::jsonb)
  ) x;

  select coalesce(
    jsonb_agg(
      x
      order by
        lower(coalesce(x->>'source','')),
        x->>'currency'
    ),
    '[]'::jsonb
  )
  into v_sources
  from jsonb_array_elements(
    coalesce(v_payload->'sources','[]'::jsonb)
  ) x;

  select coalesce(
    jsonb_agg(
      x
      order by
        lower(coalesce(x->>'location','')),
        x->>'currency'
    ),
    '[]'::jsonb
  )
  into v_locations
  from jsonb_array_elements(
    coalesce(v_payload->'locations','[]'::jsonb)
  ) x;

  return jsonb_set(
    jsonb_set(
      jsonb_set(
        v_payload,
        '{stages}',
        v_stages,
        true
      ),
      '{sources}',
      v_sources,
      true
    ),
    '{locations}',
    v_locations,
    true
  );
end;
$function$;

revoke all on function public.get_revenue_workspace(text,uuid)
from public, anon, authenticated, service_role;

grant execute on function public.get_revenue_workspace(text,uuid)
to authenticated, service_role;

create or replace function public.get_revenue_workspace_v2(
  p_current_month text,
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  return public.get_revenue_workspace(
    p_current_month,
    p_organization_id
  );
end;
$function$;

revoke all on function public.get_revenue_workspace_v2(text,uuid)
from public, anon, authenticated, service_role;

grant execute on function public.get_revenue_workspace_v2(text,uuid)
to authenticated, service_role;

comment on function public.get_revenue_workspace(text,uuid) is
  'Tenant-authorized SECURITY DEFINER Revenue read boundary. Validates the caller bound organization, invokes the owner-only canonical aggregation implementation, and returns deterministic stage/source/location ordering.';

comment on function public.get_revenue_workspace_internal_v1(text,uuid) is
  'Internal owner-only canonical Revenue aggregation implementation. Direct API execution is revoked; use get_revenue_workspace instead.';

comment on function public.get_revenue_workspace_v2(text,uuid) is
  'Compatibility alias for the tenant-authorized Revenue workspace boundary.';

commit;
