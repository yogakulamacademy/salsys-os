begin;

-- PH-1 security hardening: remove PostgreSQL's default PUBLIC EXECUTE from
-- internal helper functions that are only used by authenticated/service-role
-- database paths and hardened internal functions/triggers.
--
-- These helpers are SECURITY INVOKER / pure utility functions and do not need
-- to be directly callable by anonymous clients. Preserve the intended
-- authenticated and service-role callers explicitly.

revoke execute on function public.canonical_tracking_hostname_v1(text) from public;
revoke execute on function public.canonical_tracking_hostname_v1(text) from anon;
grant execute on function public.canonical_tracking_hostname_v1(text) to authenticated;
grant execute on function public.canonical_tracking_hostname_v1(text) to service_role;

revoke execute on function public.generate_salsys_public_site_id_v1() from public;
revoke execute on function public.generate_salsys_public_site_id_v1() from anon;
grant execute on function public.generate_salsys_public_site_id_v1() to authenticated;
grant execute on function public.generate_salsys_public_site_id_v1() to service_role;

revoke execute on function public.normalize_tracking_hostname_v1(text) from public;
revoke execute on function public.normalize_tracking_hostname_v1(text) from anon;
grant execute on function public.normalize_tracking_hostname_v1(text) to authenticated;
grant execute on function public.normalize_tracking_hostname_v1(text) to service_role;

revoke execute on function public.privacy_purpose_for_event_v1(text) from public;
revoke execute on function public.privacy_purpose_for_event_v1(text) from anon;
grant execute on function public.privacy_purpose_for_event_v1(text) to authenticated;
grant execute on function public.privacy_purpose_for_event_v1(text) to service_role;

revoke execute on function public.privacy_subject_key_v1(uuid, uuid, text) from public;
revoke execute on function public.privacy_subject_key_v1(uuid, uuid, text) from anon;
grant execute on function public.privacy_subject_key_v1(uuid, uuid, text) to authenticated;
grant execute on function public.privacy_subject_key_v1(uuid, uuid, text) to service_role;

commit;
