revoke execute on function public.has_workspace_access(uuid,text) from authenticated;
grant execute on function public.has_workspace_access(uuid,text) to service_role;
