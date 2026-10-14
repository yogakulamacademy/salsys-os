begin;

-- W8 Security/QA: these legacy course-batch mutation RPCs are superseded by
-- tenant-scoped v2 functions. They have no RLS-policy references and no
-- database callers, so signed-in users should not be able to invoke the older
-- non-tenant-explicit surfaces directly through PostgREST.

revoke execute on function public.set_course_batch_active_state(uuid, boolean)
  from authenticated;

revoke execute on function public.set_course_batch_enrollment_state(uuid, boolean, text)
  from authenticated;

revoke execute on function public.update_course_batch_admin(uuid, integer, integer, integer, integer, text, numeric, text, text)
  from authenticated;

commit;
