begin;

-- W8 Security/QA: course catalog finalization is a server-only operation.
-- The function itself requires auth.role() = 'service_role', and the application
-- invokes it only from the protected catalog-sync route through the admin client.
-- Remove the unnecessary authenticated PostgREST execution grant.

revoke execute on function public.finalize_course_catalog_sync(uuid, text, uuid)
  from authenticated;

commit;
