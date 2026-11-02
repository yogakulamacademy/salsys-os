CREATE OR REPLACE FUNCTION public.process_tracking_raw_event_v1(p_organization_id uuid, p_raw_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_raw public.raw_events%rowtype;
  v_processing public.raw_event_processing%rowtype;
  v_result jsonb;
  v_attempt integer;
  v_error text;
begin
  select re.* into v_raw from public.raw_events re where re.id=p_raw_event_id and re.organization_id=p_organization_id;
  if v_raw.id is null then return jsonb_build_object('ok',false,'reason','raw_event_not_found'); end if;

  select rp.* into v_processing from public.raw_event_processing rp where rp.raw_event_id=p_raw_event_id and rp.organization_id=p_organization_id for update;
  if v_processing.status='processed' then return jsonb_build_object('ok',true,'processed',true,'idempotent_reuse',true,'raw_event_id',p_raw_event_id); end if;
  if v_processing.status='ignored' then return jsonb_build_object('ok',true,'processed',false,'ignored',true,'raw_event_id',p_raw_event_id,'reason',v_processing.processing_error); end if;

  begin
    if v_raw.event_family='lead' and v_raw.source_event_type in ('lead.submitted','lead.form_submitted','lead.captured') then
      v_result := public.ingest_external_lead_from_raw_event_v1(p_organization_id,p_raw_event_id);
      if coalesce((v_result->>'ok')::boolean,false) is not true then raise exception '%',coalesce(v_result->>'reason','lead_processor_failed'); end if;
    elsif v_raw.event_family='web' and v_raw.source_system='website' then
      v_result := public.process_website_raw_event(p_organization_id,p_raw_event_id);
    elsif v_raw.event_family='booking' then
      v_result := public.process_booking_raw_event_v1(p_organization_id,p_raw_event_id);
    elsif v_raw.event_family='payment' then
      v_result := public.process_payment_raw_event_v1(p_organization_id,p_raw_event_id);
    elsif v_raw.event_family='enrollment' then
      v_result := public.process_enrollment_raw_event_v1(p_organization_id,p_raw_event_id);
    else
      update public.raw_event_processing
      set status='ignored',processor_name='tracking_dispatcher_v1',processor_version='v2',processing_error='no_automatic_processor_for_event',
          processing_metadata=coalesce(processing_metadata,'{}'::jsonb)||jsonb_build_object('event_family',v_raw.event_family,'event_type',v_raw.source_event_type),processed_at=coalesce(processed_at,now()),updated_at=now()
      where raw_event_id=p_raw_event_id and organization_id=p_organization_id;
      return jsonb_build_object('ok',true,'processed',false,'ignored',true,'reason','no_automatic_processor_for_event','raw_event_id',p_raw_event_id);
    end if;

    update public.raw_event_processing
    set status='processed',attempt_count=attempt_count+1,last_attempt_at=now(),processed_at=now(),next_retry_at=null,
        processor_name='tracking_dispatcher_v1',processor_version='v2',processing_error=null,
        processing_metadata=coalesce(processing_metadata,'{}'::jsonb)||jsonb_build_object('result',coalesce(v_result,'{}'::jsonb)),updated_at=now()
    where raw_event_id=p_raw_event_id and organization_id=p_organization_id;

    return jsonb_build_object('ok',true,'processed',true,'raw_event_id',p_raw_event_id,'result',v_result);
  exception when others then
    v_error := left(sqlerrm,1000);
    select attempt_count+1 into v_attempt from public.raw_event_processing where raw_event_id=p_raw_event_id and organization_id=p_organization_id;

    update public.raw_event_processing
    set status=case when coalesce(v_attempt,1)>=3 then 'dead_letter' else 'failed' end,
        attempt_count=coalesce(v_attempt,1),last_attempt_at=now(),
        next_retry_at=case when coalesce(v_attempt,1)>=3 then null else now() + make_interval(secs => least(900,30 * power(2,greatest(coalesce(v_attempt,1)-1,0)))::double precision) end,
        processor_name='tracking_dispatcher_v1',processor_version='v2',processing_error=v_error,
        processing_metadata=coalesce(processing_metadata,'{}'::jsonb)||jsonb_build_object('event_family',v_raw.event_family,'event_type',v_raw.source_event_type),updated_at=now()
    where raw_event_id=p_raw_event_id and organization_id=p_organization_id;

    return jsonb_build_object('ok',false,'processed',false,'raw_event_id',p_raw_event_id,'reason','processing_failed','error',v_error,'attempt_count',coalesce(v_attempt,1),'dead_letter',coalesce(v_attempt,1)>=3);
  end;
end;
$function$
