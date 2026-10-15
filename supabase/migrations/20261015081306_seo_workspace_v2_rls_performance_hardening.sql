alter function public.get_seo_workspace_v2(uuid) security definer;

revoke all on function public.get_seo_workspace_v2(uuid) from public, anon;
grant execute on function public.get_seo_workspace_v2(uuid) to authenticated, service_role;

comment on function public.get_seo_workspace_v2(uuid) is
'Tenant-scoped SEO workspace v2. SECURITY DEFINER avoids repeated RLS helper evaluation across large GSC page-query aggregates; authorization is checked explicitly with is_organization_member(p_organization_id) before any tenant data is read.';
