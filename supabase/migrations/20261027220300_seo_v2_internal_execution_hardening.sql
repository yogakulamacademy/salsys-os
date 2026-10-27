-- The stable public RPC names are the authenticated API boundary.
-- V2 implementations are internal/service-only so authenticated callers cannot
-- bypass the stable wrapper or expand the exposed SECURITY DEFINER surface.

revoke execute on function public.get_seo_content_intelligence_v2(uuid)
  from authenticated;
revoke execute on function public.get_seo_revenue_intelligence_v2(uuid)
  from authenticated;

grant execute on function public.get_seo_content_intelligence_v2(uuid)
  to service_role;
grant execute on function public.get_seo_revenue_intelligence_v2(uuid)
  to service_role;
