-- These cross-tenant diagnostic views are read only by authorized, tenant-scoped
-- service clients. They must not be accessible directly through browser/API roles.
revoke all on public.v_system_recent_failures, public.v_commerce_event_readiness_v1 from public, anon, authenticated;
grant select on public.v_system_recent_failures, public.v_commerce_event_readiness_v1 to service_role;
