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
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  return public.get_revenue_workspace(p_current_month, p_organization_id);
end;
$function$;

revoke all on function public.get_revenue_workspace_v2(text, uuid) from public;
revoke all on function public.get_revenue_workspace_v2(text, uuid) from anon;
grant execute on function public.get_revenue_workspace_v2(text, uuid) to authenticated;
grant execute on function public.get_revenue_workspace_v2(text, uuid) to service_role;

comment on function public.get_revenue_workspace_v2(text, uuid) is
  'Tenant-authorized Revenue workspace read model. Preserves the existing aggregate contract while avoiding repeated row-level authorization inside security-invoker revenue views.';
