revoke execute on function public.resolve_course_capture_value(uuid,text,text) from authenticated;
revoke execute on function public.resolve_course_tracking_signal(uuid,text,text,text,text) from authenticated;
revoke execute on function public.set_course_batch_active_state_v2(uuid,uuid,boolean) from authenticated;
revoke execute on function public.set_course_batch_enrollment_state_v2(uuid,uuid,boolean,text) from authenticated;
revoke execute on function public.update_course_batch_admin_v2(uuid,uuid,integer,integer,numeric,text,text) from authenticated;

grant execute on function public.resolve_course_capture_value(uuid,text,text) to service_role;
grant execute on function public.resolve_course_tracking_signal(uuid,text,text,text,text) to service_role;
grant execute on function public.set_course_batch_active_state_v2(uuid,uuid,boolean) to service_role;
grant execute on function public.set_course_batch_enrollment_state_v2(uuid,uuid,boolean,text) to service_role;
grant execute on function public.update_course_batch_admin_v2(uuid,uuid,integer,integer,numeric,text,text) to service_role;
