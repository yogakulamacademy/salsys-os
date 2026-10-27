-- Funnel V2 secure aggregate read model.
--
-- The existing Funnel views are security_invoker=true, so authenticated callers
-- pay row-level policy costs and cannot see anonymous/pre-lead touchpoints.
-- This wrapper keeps raw tables protected while allowing the already-aggregated
-- workspace function to execute behind an explicit tenant-membership check.

create or replace function public.get_funnel_workspace_v2(p_organization_id uuid)
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

  -- Mandatory authorization boundary before any aggregate is evaluated.
  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  -- get_funnel_workspace() already scopes every returned section by
  -- p_organization_id. Executing it from this authorized definer context lets
  -- its security-invoker views aggregate anonymous evidence without exposing
  -- any raw visitor/session/touchpoint rows to the caller.
  return public.get_funnel_workspace(p_organization_id);
end;
$function$;

revoke all on function public.get_funnel_workspace_v2(uuid) from public;
revoke all on function public.get_funnel_workspace_v2(uuid) from anon;
grant execute on function public.get_funnel_workspace_v2(uuid) to authenticated;
grant execute on function public.get_funnel_workspace_v2(uuid) to service_role;

comment on function public.get_funnel_workspace_v2(uuid) is
  'Tenant-authorized aggregate Funnel read model. Raw tracking remains RLS-protected; only organization-scoped aggregate JSON is returned.';
