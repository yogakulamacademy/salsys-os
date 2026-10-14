revoke execute on function public.can_manage_lead_assignments() from authenticated;
revoke execute on function public.can_manage_workspace(uuid,text) from authenticated;
revoke execute on function public.can_write_organization_crm(uuid) from authenticated;
revoke execute on function public.integration_oauth_state_matches_tenant(text,text,uuid) from authenticated;

grant execute on function public.can_manage_lead_assignments() to service_role;
grant execute on function public.can_manage_workspace(uuid,text) to service_role;
grant execute on function public.can_write_organization_crm(uuid) to service_role;
grant execute on function public.integration_oauth_state_matches_tenant(text,text,uuid) to service_role;
