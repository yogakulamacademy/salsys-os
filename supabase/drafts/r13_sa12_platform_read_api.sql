-- DESIGN REHEARSAL ONLY. Read-only Data API contract; all execution grants
-- remain revoked. CI temporarily grants the narrow functions in a rollback.
-- Keep this bridge schema outside the Data API exposed schemas.
create schema saas_platform_read_api;
revoke all on schema saas_platform_read_api from public,anon,authenticated,service_role;

-- Cross-tenant projection requires privileged reads, not service-key
-- impersonation. The signed caller's session and separate capability are
-- checked by the private reader; the actor is never a caller argument.
create function saas_platform_read_api.lifecycle(p_platform uuid,p_target uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  if auth.uid() is null then raise exception 'Platform read not authorized' using errcode='42501'; end if;
  return saas_lifecycle.read_preview(p_platform,p_target);
exception when invalid_text_representation then
  raise exception 'Platform read not authorized' using errcode='42501';
end;
$fn$;
revoke all on function saas_platform_read_api.lifecycle(uuid,uuid) from public,anon,authenticated,service_role;

create function saas_platform_read_api.quota(p_platform uuid,p_target uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  if auth.uid() is null then raise exception 'Platform read not authorized' using errcode='42501'; end if;
  return saas_governance.read_platform_effective_quota_preview(p_platform,p_target);
exception when invalid_text_representation then
  raise exception 'Platform read not authorized' using errcode='42501';
end;
$fn$;
revoke all on function saas_platform_read_api.quota(uuid,uuid) from public,anon,authenticated,service_role;

-- Public entry points are invoker functions, not broad privileged RPCs.
-- No production grant is proposed here; the private bridge functions must
-- receive the same narrow authenticated grant if these are ever promoted.
create function public.platform_lifecycle_read_v1(p_platform uuid,p_target uuid)
returns jsonb language sql security invoker set search_path=pg_catalog as $fn$
  select saas_platform_read_api.lifecycle(p_platform,p_target)
$fn$;
revoke all on function public.platform_lifecycle_read_v1(uuid,uuid) from public,anon,authenticated,service_role;
create function public.platform_effective_quota_read_v1(p_platform uuid,p_target uuid)
returns jsonb language sql security invoker set search_path=pg_catalog as $fn$
  select saas_platform_read_api.quota(p_platform,p_target)
$fn$;
revoke all on function public.platform_effective_quota_read_v1(uuid,uuid) from public,anon,authenticated,service_role;
