CREATE OR REPLACE FUNCTION public.process_enrollment_raw_event_v1(p_organization_id uuid, p_raw_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_raw public.raw_events%rowtype;
  v_source public.tracking_sources%rowtype;
  v_entities jsonb;
  v_payload jsonb;
  v_lead_id uuid;
  v_enrollment_id uuid;
  v_enrollment_reference text;
  v_booking_reference text;
  v_course_id uuid;
  v_batch_id uuid;
  v_course_code text;
  v_course_name text;
  v_batch_code text;
  v_batch_text text;
  v_batch_date date;
  v_total_value numeric;
  v_currency text;
  v_touchpoint_id uuid;
begin
  select * into v_raw from public.raw_events where id=p_raw_event_id and organization_id=p_organization_id;
  if v_raw.id is null then raise exception 'tenant-owned raw event not found'; end if;
  if v_raw.event_family is distinct from 'enrollment' or v_raw.source_event_type<>'enrollment.completed' then
    raise exception 'unsupported enrollment event';
  end if;
  if coalesce((v_raw.metadata->>'accepted_for_processing')::boolean,true) is not true then
    return jsonb_build_object('ok',false,'processed',false,'reason','raw_event_not_accepted');
  end if;

  select * into v_source from public.tracking_sources where id=v_raw.tracking_source_id and organization_id=p_organization_id and status='active';
  if v_source.id is null then raise exception 'active tracking source not found'; end if;

  v_payload := case when jsonb_typeof(v_raw.payload)='object' then v_raw.payload else '{}'::jsonb end;
  v_entities := public.resolve_tracking_event_entities_v1(p_organization_id,p_raw_event_id);
  v_lead_id := nullif(v_entities->>'lead_id','')::uuid;
  v_enrollment_id := nullif(v_entities->>'enrollment_id','')::uuid;
  v_booking_reference := nullif(v_entities->>'booking_reference','');
  v_enrollment_reference := nullif(v_entities->>'enrollment_reference','');
  if v_lead_id is null then raise exception 'enrollment lead resolution required'; end if;
  if v_enrollment_reference is null then raise exception 'enrollment_reference is required'; end if;

  if nullif(btrim(coalesce(v_payload->>'course_id',v_payload->>'courseId','')),'') is not null then
    begin v_course_id := coalesce(v_payload->>'course_id',v_payload->>'courseId')::uuid;
    exception when others then raise exception 'invalid course_id'; end;
    if not exists(select 1 from public.courses c where c.id=v_course_id and c.organization_id=p_organization_id) then raise exception 'course tenant mismatch'; end if;
  else
    v_course_code := nullif(btrim(coalesce(v_payload->>'course_code',v_payload->>'courseCode','')),'');
    v_course_name := nullif(btrim(coalesce(v_payload->>'course','')),'');
    if v_course_code is not null then
      select c.id into v_course_id from public.courses c where c.organization_id=p_organization_id and c.code=v_course_code and c.active=true limit 1;
    elsif v_course_name is not null then
      select c.id into v_course_id from public.courses c where c.organization_id=p_organization_id and lower(c.name)=lower(v_course_name) and c.active=true order by c.created_at limit 1;
    end if;
  end if;

  if nullif(btrim(coalesce(v_payload->>'batch_id',v_payload->>'batchId','')),'') is not null then
    begin v_batch_id := coalesce(v_payload->>'batch_id',v_payload->>'batchId')::uuid;
    exception when others then raise exception 'invalid batch_id'; end;
    if not exists(select 1 from public.course_batches b where b.id=v_batch_id and b.organization_id=p_organization_id) then raise exception 'batch tenant mismatch'; end if;
  else
    v_batch_code := nullif(btrim(coalesce(v_payload->>'batch_code',v_payload->>'batchCode','')),'');
    v_batch_text := nullif(btrim(coalesce(v_payload->>'batch','')),'');
    if v_batch_code is not null then
      select b.id into v_batch_id from public.course_batches b
      where b.organization_id=p_organization_id and b.batch_code=v_batch_code and (v_course_id is null or b.course_id=v_course_id) and b.active=true limit 1;
    elsif v_batch_text is not null then
      begin v_batch_date := v_batch_text::date; exception when others then v_batch_date := null; end;
      if v_batch_date is not null then
        select b.id into v_batch_id from public.course_batches b
        where b.organization_id=p_organization_id and b.start_date=v_batch_date and (v_course_id is null or b.course_id=v_course_id) and b.active=true
        order by b.created_at limit 1;
      end if;
    end if;
  end if;

  if v_batch_id is not null then
    if v_course_id is null then select b.course_id into v_course_id from public.course_batches b where b.id=v_batch_id and b.organization_id=p_organization_id; end if;
    if exists(select 1 from public.course_batches b where b.id=v_batch_id and b.organization_id=p_organization_id and v_course_id is not null and b.course_id<>v_course_id) then
      raise exception 'course and batch mismatch';
    end if;
  end if;

  if nullif(btrim(v_payload->>'total_value'),'') is not null then
    begin v_total_value := (v_payload->>'total_value')::numeric; exception when others then raise exception 'invalid total_value'; end;
    if v_total_value<0 then raise exception 'total_value must be >= 0'; end if;
  end if;
  v_currency := upper(nullif(btrim(v_payload->>'currency'),''));

  perform pg_advisory_xact_lock(hashtextextended('enrollment-ref:'||p_organization_id::text||':'||v_source.source_system||':'||v_enrollment_reference,0));

  if v_enrollment_id is null then
    insert into public.enrollments(
      organization_id,lead_id,course_id,batch_id,status,total_value,currency,enrolled_at,metadata
    ) values (
      p_organization_id,v_lead_id,v_course_id,v_batch_id,'confirmed'::public.enrollment_status,v_total_value,v_currency,
      coalesce(v_raw.occurred_at,v_raw.received_at,now()),
      jsonb_build_object('raw_event_id',v_raw.id,'source_event_id',v_raw.source_event_id,'enrollment_reference',v_enrollment_reference,'booking_reference',v_booking_reference,'trusted_server_event',true)
    ) returning id into v_enrollment_id;
  else
    update public.enrollments e set
      course_id=coalesce(v_course_id,e.course_id),
      batch_id=coalesce(v_batch_id,e.batch_id),
      status='confirmed'::public.enrollment_status,
      total_value=coalesce(v_total_value,e.total_value),
      currency=coalesce(v_currency,e.currency),
      enrolled_at=coalesce(e.enrolled_at,v_raw.occurred_at,v_raw.received_at,now()),
      metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object('latest_raw_event_id',v_raw.id,'source_event_id',v_raw.source_event_id,'enrollment_reference',v_enrollment_reference,'booking_reference',v_booking_reference,'trusted_server_event',true),
      updated_at=now()
    where e.id=v_enrollment_id and e.organization_id=p_organization_id and e.lead_id=v_lead_id;
    if not found then raise exception 'enrollment reference lead mismatch'; end if;
  end if;

  perform public.upsert_tracking_entity_reference_v1(
    p_organization_id,v_source.id,v_source.source_system,'enrollment',v_enrollment_reference,
    'enrollment',v_enrollment_id,v_lead_id,jsonb_build_object('raw_event_id',v_raw.id,'booking_reference',v_booking_reference)
  );

  if v_booking_reference is not null then
    perform public.upsert_tracking_entity_reference_v1(
      p_organization_id,v_source.id,v_source.source_system,'booking',v_booking_reference,
      'enrollment',v_enrollment_id,v_lead_id,jsonb_build_object('raw_event_id',v_raw.id,'promoted_to_enrollment',true)
    );

    update public.payments p set enrollment_id=v_enrollment_id,updated_at=now()
    where p.organization_id=p_organization_id and p.lead_id=v_lead_id and p.enrollment_id is null
      and p.metadata->>'booking_reference'=v_booking_reference;
  end if;

  insert into public.touchpoints(
    organization_id,event_id,lead_id,anonymous_visitor_id,occurred_at,source,platform,channel,event_type,metadata
  ) values (
    p_organization_id,v_source.source_system||':'||v_raw.source_event_id,v_lead_id,v_raw.anonymous_visitor_id,
    coalesce(v_raw.occurred_at,v_raw.received_at,now()),v_source.source_system,v_source.source_system,'other'::public.contact_channel,v_raw.source_event_type,
    jsonb_build_object('raw_event_id',v_raw.id,'enrollment_id',v_enrollment_id,'enrollment_reference',v_enrollment_reference,'booking_reference',v_booking_reference,'trusted_server_event',true)
  ) on conflict (organization_id,event_id) do nothing returning id into v_touchpoint_id;

  return jsonb_build_object('ok',true,'processed',true,'lead_id',v_lead_id,'enrollment_id',v_enrollment_id,'enrollment_reference',v_enrollment_reference,'booking_reference',v_booking_reference,'course_id',v_course_id,'batch_id',v_batch_id,'touchpoint_id',v_touchpoint_id);
end;
$function$
