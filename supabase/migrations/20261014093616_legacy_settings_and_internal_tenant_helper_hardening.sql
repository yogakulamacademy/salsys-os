create or replace function public.get_crm_stage_settings()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  v_organization_id uuid;
begin
  v_organization_id := public.current_tenant_organization_id();

  if v_organization_id is null then
    raise exception 'Tenant context is not bound';
  end if;

  return public.get_crm_stage_settings_v2(v_organization_id);
end;
$$;

create or replace function public.get_crm_settings_audit(p_limit integer default 30)
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
language plpgsql
stable
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  v_organization_id uuid;
begin
  v_organization_id := public.current_tenant_organization_id();

  if v_organization_id is null then
    raise exception 'Tenant context is not bound';
  end if;

  return query
    select *
    from public.get_crm_settings_audit_v2(v_organization_id, p_limit);
end;
$$;

revoke execute on function public.can_manage_crm_settings() from authenticated;
revoke execute on function public.can_read_crm_settings() from authenticated;
revoke execute on function public.tenant_session_enforcement_enabled() from authenticated;

grant execute on function public.can_manage_crm_settings() to service_role;
grant execute on function public.can_read_crm_settings() to service_role;
grant execute on function public.tenant_session_enforcement_enabled() to service_role;

grant execute on function public.get_crm_stage_settings() to authenticated, service_role;
grant execute on function public.get_crm_settings_audit(integer) to authenticated, service_role;
