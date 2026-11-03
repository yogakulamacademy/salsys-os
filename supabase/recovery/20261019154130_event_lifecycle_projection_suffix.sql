
revoke all on function public.upsert_tracking_entity_reference_v1(uuid,uuid,text,text,text,text,uuid,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.resolve_tracking_event_entities_v1(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.process_booking_raw_event_v1(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.process_payment_raw_event_v1(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.process_enrollment_raw_event_v1(uuid,uuid)
  from public, anon, authenticated;

grant execute on function public.upsert_tracking_entity_reference_v1(uuid,uuid,text,text,text,text,uuid,uuid,jsonb)
  to service_role;
grant execute on function public.resolve_tracking_event_entities_v1(uuid,uuid)
  to service_role;
grant execute on function public.process_booking_raw_event_v1(uuid,uuid)
  to service_role;
grant execute on function public.process_payment_raw_event_v1(uuid,uuid)
  to service_role;
grant execute on function public.process_enrollment_raw_event_v1(uuid,uuid)
  to service_role;

commit;
