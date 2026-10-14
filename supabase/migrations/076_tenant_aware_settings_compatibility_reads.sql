begin;

-- W5D compatibility bridge: existing Settings UI can keep calling the legacy
-- read RPC names. Bound tenant sessions are transparently routed to the new
-- organization-scoped settings store; unbound legacy production sessions keep
-- the previous global-default read behavior until application cutover.

create or replace function public.get_crm_stage_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_organization_id uuid;
  probability_rows jsonb := '[]'::jsonb;
  aging_rows jsonb := '[]'::jsonb;
begin
  v_organization_id := public.current_tenant_organization_id();

  if v_organization_id is not null then
    return public.get_crm_stage_settings_v2(v_organization_id);
  end if;

  if not public.can_read_crm_settings() then
    raise exception 'Not authorized to read CRM settings';
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
  from public.lead_stage_probabilities p;

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
  from public.pipeline_stage_aging_rules r;

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
      'can_manage', public.can_manage_crm_settings()
    )
  );
end;
$function$;

create or replace function public.get_crm_settings_audit(
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
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_organization_id uuid;
begin
  v_organization_id := public.current_tenant_organization_id();

  if v_organization_id is not null then
    return query
    select *
    from public.get_crm_settings_audit_v2(
      v_organization_id,
      p_limit
    );
    return;
  end if;

  return query
  select
    a.id,
    a.setting_group,
    a.setting_key,
    a.previous_value,
    a.new_value,
    a.changed_by,
    p.full_name as changed_by_name,
    a.changed_at
  from public.crm_settings_audit a
  left join public.profiles p
    on p.id = a.changed_by
  where public.can_read_crm_settings()
  order by a.changed_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$function$;

revoke all on function public.get_crm_stage_settings()
  from public, anon;
revoke all on function public.get_crm_settings_audit(integer)
  from public, anon;

grant execute on function public.get_crm_stage_settings()
  to authenticated, service_role;
grant execute on function public.get_crm_settings_audit(integer)
  to authenticated, service_role;

commit;
