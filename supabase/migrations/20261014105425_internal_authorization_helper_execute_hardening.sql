revoke execute on function public.can_manage_sales_workspace(uuid) from authenticated;
revoke execute on function public.workspace_role(uuid,text) from authenticated;
revoke execute on function public.session_is_bound_to_organization(uuid) from authenticated;

grant execute on function public.can_manage_sales_workspace(uuid) to service_role;
grant execute on function public.workspace_role(uuid,text) to service_role;
grant execute on function public.session_is_bound_to_organization(uuid) to service_role;
