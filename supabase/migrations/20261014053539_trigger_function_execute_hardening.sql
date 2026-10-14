begin;

-- W8 Security/QA: trigger-only SECURITY DEFINER functions should not be
-- directly callable through PostgREST by signed-in users. PostgreSQL triggers
-- invoke these functions internally and do not require EXECUTE on the function
-- to be granted to the invoking application role.

revoke execute on function public.enforce_admissions_auto_task_event_org()
  from authenticated;

revoke execute on function public.enforce_course_tracking_alias_tenant()
  from authenticated;

revoke execute on function public.enforce_integration_api_credential_scope()
  from authenticated;

revoke execute on function public.enforce_integration_connection_parent_org()
  from authenticated;

revoke execute on function public.enforce_task_organization()
  from authenticated;

revoke execute on function public.release_physical_room_with_accommodation()
  from authenticated;

revoke execute on function public.set_course_batch_admin_event_organization()
  from authenticated;

revoke execute on function public.set_integration_child_organization()
  from authenticated;

revoke execute on function public.sync_batch_changes_to_leads()
  from authenticated;

revoke execute on function public.sync_lead_from_preferred_batch()
  from authenticated;

commit;
