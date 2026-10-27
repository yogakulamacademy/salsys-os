create or replace function public.get_person_journey_workspace_v2(
  p_organization_id uuid,
  p_lead_id uuid,
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_person_id uuid;
  v_person jsonb;
  v_journey jsonb := '[]'::jsonb;
  v_journey_total integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  if p_organization_id is null or p_lead_id is null then
    raise exception 'Organization ID and lead ID are required';
  end if;

  if not public.is_organization_member(p_organization_id)
     or not public.can_access_lead(p_lead_id) then
    raise exception 'Not authorized for requested lead';
  end if;

  select pl.person_id
    into v_person_id
  from public.person_leads pl
  where pl.organization_id = p_organization_id
    and pl.lead_id = p_lead_id
  limit 1;

  if v_person_id is null then
    return jsonb_build_object(
      'person_id', null,
      'person', null,
      'journey', '[]'::jsonb,
      'journey_total', 0
    );
  end if;

  select to_jsonb(v)
    into v_person
  from public.v_person_360 v
  where v.organization_id = p_organization_id
    and v.person_id = v_person_id
  limit 1;

  if v_person is not null and not public.can_view_lead_pii() then
    v_person := (v_person - 'primary_email' - 'primary_phone' - 'primary_whatsapp')
      || jsonb_build_object(
        'primary_email', null,
        'primary_phone', null,
        'primary_whatsapp', null
      );
  end if;

  select count(*)::integer
    into v_journey_total
  from public.v_person_journey j
  where j.organization_id = p_organization_id
    and j.person_id = v_person_id;

  select coalesce(
    jsonb_agg(to_jsonb(j) order by j.event_at desc, j.journey_event_key desc),
    '[]'::jsonb
  )
    into v_journey
  from (
    select *
    from public.v_person_journey
    where organization_id = p_organization_id
      and person_id = v_person_id
    order by event_at desc, journey_event_key desc
    limit v_limit
  ) j;

  return jsonb_build_object(
    'person_id', v_person_id,
    'person', v_person,
    'journey', v_journey,
    'journey_total', coalesce(v_journey_total, 0)
  );
end;
$function$;

revoke all on function public.get_person_journey_workspace_v2(uuid, uuid, integer) from public;
revoke all on function public.get_person_journey_workspace_v2(uuid, uuid, integer) from anon;
grant execute on function public.get_person_journey_workspace_v2(uuid, uuid, integer) to authenticated;
grant execute on function public.get_person_journey_workspace_v2(uuid, uuid, integer) to service_role;

comment on function public.get_person_journey_workspace_v2(uuid, uuid, integer) is
  'Tenant- and lead-authorized Person 360 + Journey read model. Evaluates row authorization once, returns scoped aggregates, and masks primary contact PII for non-admin callers.';
