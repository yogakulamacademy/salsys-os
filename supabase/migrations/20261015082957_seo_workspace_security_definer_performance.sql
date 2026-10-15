alter function public.get_seo_workspace(uuid) security definer;
revoke all on function public.get_seo_workspace(uuid) from public, anon;
grant execute on function public.get_seo_workspace(uuid) to authenticated, service_role;
