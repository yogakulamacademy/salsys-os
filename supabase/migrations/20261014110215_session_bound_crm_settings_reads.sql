create or replace function public.get_crm_settings_audit_v2(
  p_organization_id uuid,
  p_limit integer default 30
)
returns table(
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
set search_path to 'public', 'auth', 'pg_temp'
as $function$
  select
    a.id,
    a.setting_group,
    a.setting_key,
    a.previous_value,
    a.new_value,
    a.changed_by,
    p.full_name,
    a.changed_at
  from public.organization_crm_settings_audit a
  left join public.profiles p on p.id = a.changed_by
  where a.organization_id = p_organization_id
    and (
      auth.role() = 'service_role'
      or (
        public.session_is_bound_to_organization(p_organization_id)
        and public.is_organization_member(p_organization_id)
      )
    )
  order by a.changed_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$function$;

create or replace function public.get_crm_stage_settings_v2(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  probability_rows jsonb := '[]'::jsonb;
  aging_rows jsonb := '[]'::jsonb;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if auth.role() <> 'service_role' and (
    not public.session_is_bound_to_organization(p_organization_id)
    or not public.is_organization_member(p_organization_id)
  ) then
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
          when 'qualified' then 40 when 'high_intent' then 50 when 'payment_pending' then 60
          when 'enrolled' then 70 when 'nurture' then 80 when 'not_now' then 90
          when 'lost' then 100 when 'unqualified' then 110 when 'duplicate' then 120 else 999
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
          when 'qualified' then 40 when 'high_intent' then 50 when 'payment_pending' then 60
          when 'enrolled' then 70 when 'nurture' then 80 when 'not_now' then 90
          when 'lost' then 100 when 'unqualified' then 110 when 'duplicate' then 120 else 999
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

revoke all on function public.get_crm_settings_audit_v2(uuid,integer) from public, anon;
revoke all on function public.get_crm_stage_settings_v2(uuid) from public, anon;
grant execute on function public.get_crm_settings_audit_v2(uuid,integer) to authenticated, service_role;
grant execute on function public.get_crm_stage_settings_v2(uuid) to authenticated, service_role;
