begin;

-- PH-1 security hardening: the Funnel V2 compatibility wrapper is an
-- authenticated workspace RPC. It already performs organization membership
-- authorization and delegates to the hardened V3 implementation, but the
-- function retained PostgreSQL's default PUBLIC EXECUTE privilege.
--
-- Remove the unnecessary anonymous/public callable surface while preserving
-- the intended authenticated and service-role callers.
revoke execute on function public.get_funnel_intelligence_workspace_v2(uuid, integer) from public;
revoke execute on function public.get_funnel_intelligence_workspace_v2(uuid, integer) from anon;

grant execute on function public.get_funnel_intelligence_workspace_v2(uuid, integer) to authenticated;
grant execute on function public.get_funnel_intelligence_workspace_v2(uuid, integer) to service_role;

commit;
