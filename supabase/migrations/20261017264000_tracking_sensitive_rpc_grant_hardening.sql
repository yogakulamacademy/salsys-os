-- Tracking sensitive RPC grant hardening
revoke all on function public.ingest_tracking_event_v1(
  uuid,uuid,text,text,text,timestamptz,text,text,text,text,jsonb,jsonb,jsonb,integer,boolean
) from public,anon,authenticated;
revoke all on function public.process_tracking_raw_event_v1(uuid,uuid) from public,anon,authenticated;

grant execute on function public.ingest_tracking_event_v1(
  uuid,uuid,text,text,text,timestamptz,text,text,text,text,jsonb,jsonb,jsonb,integer,boolean
) to service_role;
grant execute on function public.process_tracking_raw_event_v1(uuid,uuid) to service_role;
