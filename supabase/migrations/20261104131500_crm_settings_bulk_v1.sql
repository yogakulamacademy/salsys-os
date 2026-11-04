begin;

-- One authenticated, tenant-bound transaction for the CRM Rules Save Changes UI.
-- Existing v2 mutation RPCs own all writes, authorization and audit entries.
-- Any stale value or validation error aborts the entire PostgreSQL statement.
create or replace function public.update_crm_settings_bulk_v1(
  p_organization_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_prob_changes jsonb;
  v_aging_changes jsonb;
  v_item jsonb;
  v_stage text;
  v_seen_prob text[] := array[]::text[];
  v_seen_aging text[] := array[]::text[];
  v_old_percent numeric;
  v_new_percent numeric;
  v_current_percent numeric;
  v_old_warning numeric;
  v_old_stuck numeric;
  v_new_warning numeric;
  v_new_stuck numeric;
  v_current_warning numeric;
  v_current_stuck numeric;
  v_forecast_saved integer := 0;
  v_aging_saved integer := 0;
begin
  if auth.role() <> 'authenticated' or auth.uid() is null then
    raise exception 'Authenticated organization session required';
  end if;

  if p_organization_id is null
     or public.current_tenant_organization_id() is distinct from p_organization_id then
    raise exception 'Settings changes must target the selected workspace';
  end if;

  if not public.can_administer_organization_crm(p_organization_id) then
    raise exception 'Only organization CRM administrators/managers may change settings';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Invalid changes payload';
  end if;

  v_prob_changes := p_changes->'probabilities';
  v_aging_changes := p_changes->'aging';
  if jsonb_typeof(v_prob_changes) is distinct from 'array'
     or jsonb_typeof(v_aging_changes) is distinct from 'array' then
    raise exception 'Forecast and aging change lists are required';
  end if;

  if jsonb_array_length(v_prob_changes) > 24 or jsonb_array_length(v_aging_changes) > 24 then
    raise exception 'Too many settings changes in a single submission';
  end if;
  if jsonb_array_length(v_prob_changes) + jsonb_array_length(v_aging_changes) = 0 then
    return jsonb_build_object('ok', true, 'forecast_saved', 0, 'aging_saved', 0);
  end if;

  for v_item in select value from jsonb_array_elements(v_prob_changes) as changes(value)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or not (v_item ?& array['stage','old_percent','new_percent']) then
      raise exception 'Malformed forecast change';
    end if;
    v_stage := nullif(lower(trim(v_item->>'stage')), '');
    if v_stage is null or v_stage = any(v_seen_prob) then
      raise exception 'Missing or duplicated forecast stage';
    end if;
    v_seen_prob := array_append(v_seen_prob, v_stage);

    v_old_percent := (v_item->>'old_percent')::numeric;
    v_new_percent := (v_item->>'new_percent')::numeric;
    if v_old_percent is null or v_new_percent is null
       or v_new_percent < 0 or v_new_percent > 100
       or v_old_percent < 0 or v_old_percent > 100 then
      raise exception 'Forecast percentages must be between 0 and 100';
    end if;

    select round(p.probability * 100, 2)
      into v_current_percent
      from public.organization_lead_stage_probabilities p
      where p.organization_id = p_organization_id and p.stage = v_stage
      for update;
    if not found then
      raise exception 'Unknown forecast stage: %', v_stage;
    end if;
    if v_current_percent is distinct from v_old_percent then
      raise exception 'Forecast stage % changed since this page loaded. Refresh before saving.', v_stage;
    end if;
    if v_new_percent is distinct from v_current_percent then
      perform public.update_crm_stage_probability_v2(p_organization_id, v_stage, v_new_percent / 100);
      v_forecast_saved := v_forecast_saved + 1;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(v_aging_changes) as changes(value)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or not (v_item ?& array['stage','old_warning_hours','old_stuck_hours','warning_hours','stuck_hours']) then
      raise exception 'Malformed pipeline aging change';
    end if;
    v_stage := nullif(lower(trim(v_item->>'stage')), '');
    if v_stage is null or v_stage = any(v_seen_aging) then
      raise exception 'Missing or duplicated aging stage';
    end if;
    v_seen_aging := array_append(v_seen_aging, v_stage);

    v_old_warning := (v_item->>'old_warning_hours')::numeric;
    v_old_stuck := (v_item->>'old_stuck_hours')::numeric;
    v_new_warning := (v_item->>'warning_hours')::numeric;
    v_new_stuck := (v_item->>'stuck_hours')::numeric;
    if v_old_warning is null or v_old_stuck is null
       or v_new_warning is null or v_new_stuck is null
       or v_old_warning < 0 or v_old_stuck <= v_old_warning
       or v_new_warning < 0 or v_new_stuck <= v_new_warning then
      raise exception 'Stuck threshold must be greater than non-negative warning threshold';
    end if;

    select r.warning_after_days * 24, r.stuck_after_days * 24
      into v_current_warning, v_current_stuck
      from public.organization_pipeline_stage_aging_rules r
      where r.organization_id = p_organization_id and r.stage = v_stage
      for update;
    if not found then
      raise exception 'Unknown pipeline aging stage: %', v_stage;
    end if;
    if v_current_warning is distinct from v_old_warning
       or v_current_stuck is distinct from v_old_stuck then
      raise exception 'Aging stage % changed since this page loaded. Refresh before saving.', v_stage;
    end if;
    if v_new_warning is distinct from v_current_warning
       or v_new_stuck is distinct from v_current_stuck then
      perform public.update_crm_pipeline_aging_rule_v2(
        p_organization_id, v_stage, v_new_warning, v_new_stuck
      );
      v_aging_saved := v_aging_saved + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'forecast_saved', v_forecast_saved,
    'aging_saved', v_aging_saved
  );
end;
$function$;

revoke all on function public.update_crm_settings_bulk_v1(uuid, jsonb)
  from public, anon;
grant execute on function public.update_crm_settings_bulk_v1(uuid, jsonb)
  to authenticated, service_role;

commit;
