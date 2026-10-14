begin;

-- W8 Tenant Isolation: tenant-bound CRM settings read/write RPCs.

create or replace function public.get_crm_stage_settings_v2(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  probability_rows jsonb := '[]'::jsonb;
  aging_rows jsonb := '[]'::jsonb;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if auth.role() <> 'service_role'
     and not public.is_organization_member(p_organization_id)
  then
    raise exception 'Not authorized for organization';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stage', p.stage,
        'probability', p.probability,
        'probability_percent', round(p.probability * 100, 2),
        'updated_at', p.updated_at
      )
      order by
        case p.stage
          when 'new' then 10 when 'contacted' then 20 when 'engaged' then 30
          when 'qualified' then 40 when 'high_intent' then 50
          when 'payment_pending' then 60 when 'enrolled' then 70
          when 'nurture' then 80 when 'not_now' then 90 when 'lost' then 100
          when 'unqualified' then 110 when 'duplicate' then 120 else 999
        end,
        p.stage
    ),
    '[]'::jsonb
  )
  into probability_rows
  from public.organization_lead_stage_probabilities p
  where p.organization_id = p_organization_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stage', r.stage,
        'warning_hours', r.warning_after_days * 24,
        'stuck_hours', r.stuck_after_days * 24
      )
      order by
        case r.stage
          when 'new' then 10 when 'contacted' then 20 when 'engaged' then 30
          when 'qualified' then 40 when 'high_intent' then 50
          when 'payment_pending' then 60 when 'enrolled' then 70
          when 'nurture' then 80 when 'not_now' then 90 when 'lost' then 100
          when 'unqualified' then 110 when 'duplicate' then 120 else 999
        end,
        r.stage
    ),
    '[]'::jsonb
  )
  into aging_rows
  from public.organization_pipeline_stage_aging_rules r
  where r.organization_id = p_organization_id;

  return jsonb_build_object(
    'forecast_probabilities', probability_rows,
    'pipeline_aging', aging_rows,
    'pipeline_aging_schema', jsonb_build_object(
      'table_exists', true,
      'stage_column', 'stage',
      'warning_column', 'warning_after_days',
      'stuck_column', 'stuck_after_days',
      'warning_unit', 'days',
      'stuck_unit', 'days'
    ),
    'permissions', jsonb_build_object(
      'can_manage', public.can_administer_organization_crm(p_organization_id)
    )
  );
end;
$function$;

create or replace function public.get_crm_settings_audit_v2(
  p_organization_id uuid,
  p_limit integer default 30
)
returns table (
  id uuid,
  setting_group text,
  setting_key text,
  previous_value jsonb,
  new_value jsonb,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select
    a.id,
    a.setting_group,
    a.setting_key,
    a.previous_value,
    a.new_value,
    a.changed_by,
    p.full_name as changed_by_name,
    a.changed_at
  from public.organization_crm_settings_audit a
  left join public.profiles p on p.id = a.changed_by
  where a.organization_id = p_organization_id
    and (
      auth.role() = 'service_role'
      or public.is_organization_member(p_organization_id)
    )
  order by a.changed_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$function$;

create or replace function public.update_crm_stage_probability_v2(
  p_organization_id uuid,
  p_stage text,
  p_probability numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_stage text;
  previous_probability numeric(5,4);
  updated_probability numeric(5,4);
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if auth.role() <> 'service_role'
     and not public.can_administer_organization_crm(p_organization_id)
  then
    raise exception 'Only organization CRM administrators/managers can change forecast probabilities';
  end if;

  v_stage := lower(trim(p_stage));
  if v_stage is null or v_stage = '' then
    raise exception 'Stage is required';
  end if;

  if p_probability is null or p_probability < 0 or p_probability > 1 then
    raise exception 'Probability must be between 0 and 1';
  end if;

  select probability
  into previous_probability
  from public.organization_lead_stage_probabilities
  where organization_id = p_organization_id
    and stage = v_stage
  for update;

  if not found then
    raise exception 'Unknown forecast stage: %', v_stage;
  end if;

  update public.organization_lead_stage_probabilities
  set probability = round(p_probability, 4),
      updated_at = now()
  where organization_id = p_organization_id
    and stage = v_stage
  returning probability into updated_probability;

  insert into public.organization_crm_settings_audit (
    organization_id,
    setting_group,
    setting_key,
    previous_value,
    new_value,
    changed_by
  ) values (
    p_organization_id,
    'revenue_forecast',
    v_stage,
    jsonb_build_object('probability', previous_probability),
    jsonb_build_object('probability', updated_probability),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'stage', v_stage,
    'probability', updated_probability,
    'probability_percent', round(updated_probability * 100, 2)
  );
end;
$function$;

create or replace function public.update_crm_pipeline_aging_rule_v2(
  p_organization_id uuid,
  p_stage text,
  p_warning_hours numeric,
  p_stuck_hours numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_stage text;
  v_previous jsonb;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if auth.role() <> 'service_role'
     and not public.can_administer_organization_crm(p_organization_id)
  then
    raise exception 'Only organization CRM administrators/managers can change pipeline aging rules';
  end if;

  v_stage := lower(trim(p_stage));
  if v_stage is null or v_stage = '' then
    raise exception 'Stage is required';
  end if;

  if p_warning_hours is null or p_warning_hours < 0 then
    raise exception 'Warning threshold must be 0 hours or greater';
  end if;

  if p_stuck_hours is null or p_stuck_hours <= p_warning_hours then
    raise exception 'Stuck threshold must be greater than warning threshold';
  end if;

  select jsonb_build_object(
    'warning_hours', warning_after_days * 24,
    'stuck_hours', stuck_after_days * 24
  )
  into v_previous
  from public.organization_pipeline_stage_aging_rules
  where organization_id = p_organization_id
    and stage = v_stage
  for update;

  if not found then
    raise exception 'No pipeline aging rule exists for stage: %', v_stage;
  end if;

  update public.organization_pipeline_stage_aging_rules
  set warning_after_days = (p_warning_hours / 24.0)::numeric(8,2),
      stuck_after_days = (p_stuck_hours / 24.0)::numeric(8,2),
      updated_at = now()
  where organization_id = p_organization_id
    and stage = v_stage;

  insert into public.organization_crm_settings_audit (
    organization_id,
    setting_group,
    setting_key,
    previous_value,
    new_value,
    changed_by
  ) values (
    p_organization_id,
    'pipeline_aging',
    v_stage,
    v_previous,
    jsonb_build_object(
      'warning_hours', p_warning_hours,
      'stuck_hours', p_stuck_hours
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'stage', v_stage,
    'warning_hours', p_warning_hours,
    'stuck_hours', p_stuck_hours
  );
end;
$function$;

revoke all on function public.get_crm_stage_settings_v2(uuid)
  from public, anon;
revoke all on function public.get_crm_settings_audit_v2(uuid, integer)
  from public, anon;
revoke all on function public.update_crm_stage_probability_v2(uuid, text, numeric)
  from public, anon;
revoke all on function public.update_crm_pipeline_aging_rule_v2(uuid, text, numeric, numeric)
  from public, anon;

grant execute on function public.get_crm_stage_settings_v2(uuid)
  to authenticated, service_role;
grant execute on function public.get_crm_settings_audit_v2(uuid, integer)
  to authenticated, service_role;
grant execute on function public.update_crm_stage_probability_v2(uuid, text, numeric)
  to authenticated, service_role;
grant execute on function public.update_crm_pipeline_aging_rule_v2(uuid, text, numeric, numeric)
  to authenticated, service_role;

commit;
