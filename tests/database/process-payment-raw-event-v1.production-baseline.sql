CREATE OR REPLACE FUNCTION public.process_payment_raw_event_v1(p_organization_id uuid, p_raw_event_id uuid)
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
  v_booking_reference text;
  v_payment_reference text;
  v_provider text;
  v_payment_kind public.payment_kind := 'other';
  v_target_status public.payment_status;
  v_amount numeric;
  v_currency text;
  v_payment public.payments%rowtype;
  v_touchpoint_id uuid;
begin
  select * into v_raw from public.raw_events where id=p_raw_event_id and organization_id=p_organization_id;
  if v_raw.id is null then raise exception 'tenant-owned raw event not found'; end if;
  if v_raw.event_family is distinct from 'payment' or v_raw.source_event_type not in ('payment.started','payment.completed','payment.failed') then
    raise exception 'unsupported payment event';
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
  if v_lead_id is null then raise exception 'payment lead resolution required'; end if;

  v_payment_reference := nullif(btrim(coalesce(v_payload->>'payment_reference',v_payload->>'paymentReference',v_payload->>'external_payment_id',v_payload->>'transaction_id',v_raw.source_event_id,'')),'');
  if v_payment_reference is null then raise exception 'payment_reference is required'; end if;
  v_provider := lower(coalesce(nullif(btrim(v_payload->>'provider'),''),nullif(btrim(v_payload->>'payment_method'),''),v_source.source_system));

  begin
    v_amount := nullif(btrim(v_payload->>'amount'),'')::numeric;
  exception when others then raise exception 'invalid payment amount'; end;
  if v_amount is null or v_amount < 0 then raise exception 'payment amount must be >= 0'; end if;
  v_currency := upper(nullif(btrim(v_payload->>'currency'),''));
  if v_currency is null or length(v_currency)>12 then raise exception 'payment currency is required'; end if;

  if lower(coalesce(v_payload->>'payment_kind','')) in ('deposit','balance','full','refund','other') then
    v_payment_kind := lower(v_payload->>'payment_kind')::public.payment_kind;
  end if;
  v_target_status := case v_raw.source_event_type
    when 'payment.completed' then 'paid'::public.payment_status
    when 'payment.failed' then 'failed'::public.payment_status
    else 'pending'::public.payment_status
  end;

  perform pg_advisory_xact_lock(hashtextextended('payment-ref:'||p_organization_id::text||':'||v_provider||':'||v_payment_reference,0));

  select p.* into v_payment from public.payments p
  where p.organization_id=p_organization_id
    and coalesce(p.provider,'')=v_provider
    and p.external_payment_id=v_payment_reference
  limit 1 for update;

  if v_payment.id is null then
    insert into public.payments(
      organization_id,lead_id,enrollment_id,provider,external_payment_id,payment_kind,status,amount,currency,paid_at,metadata
    ) values (
      p_organization_id,v_lead_id,v_enrollment_id,v_provider,v_payment_reference,v_payment_kind,v_target_status,v_amount,v_currency,
      case when v_target_status='paid' then coalesce(v_raw.occurred_at,v_raw.received_at,now()) else null end,
      jsonb_build_object('raw_event_id',v_raw.id,'source_event_id',v_raw.source_event_id,'booking_reference',v_booking_reference,'trusted_server_event',true)
    ) returning * into v_payment;
  else
    if v_payment.lead_id<>v_lead_id then raise exception 'payment reference lead mismatch'; end if;
    update public.payments p set
      enrollment_id=coalesce(v_enrollment_id,p.enrollment_id),
      payment_kind=case when p.payment_kind='other' then v_payment_kind else p.payment_kind end,
      status=case
        when p.status='paid' then p.status
        when v_target_status='paid' then 'paid'::public.payment_status
        when p.status='failed' and v_target_status='pending' then p.status
        else v_target_status
      end,
      amount=v_amount,
      currency=v_currency,
      paid_at=case when v_target_status='paid' then coalesce(p.paid_at,v_raw.occurred_at,v_raw.received_at,now()) else p.paid_at end,
      metadata=coalesce(p.metadata,'{}'::jsonb)||jsonb_build_object('latest_raw_event_id',v_raw.id,'latest_source_event_id',v_raw.source_event_id,'booking_reference',v_booking_reference,'trusted_server_event',true),
      updated_at=now()
    where p.id=v_payment.id and p.organization_id=p_organization_id
    returning * into v_payment;
  end if;

  perform public.upsert_tracking_entity_reference_v1(
    p_organization_id,v_source.id,v_source.source_system,'payment',v_payment_reference,
    'payment',v_payment.id,v_lead_id,
    jsonb_build_object('raw_event_id',v_raw.id,'event_type',v_raw.source_event_type,'booking_reference',v_booking_reference)
  );

  insert into public.touchpoints(
    organization_id,event_id,lead_id,anonymous_visitor_id,occurred_at,source,platform,channel,event_type,metadata
  ) values (
    p_organization_id,v_source.source_system||':'||v_raw.source_event_id,v_lead_id,v_raw.anonymous_visitor_id,
    coalesce(v_raw.occurred_at,v_raw.received_at,now()),v_source.source_system,v_provider,'other'::public.contact_channel,v_raw.source_event_type,
    jsonb_build_object('raw_event_id',v_raw.id,'payment_id',v_payment.id,'payment_reference',v_payment_reference,'booking_reference',v_booking_reference,'amount',v_amount,'currency',v_currency,'trusted_server_event',true)
  ) on conflict (organization_id,event_id) do nothing returning id into v_touchpoint_id;

  return jsonb_build_object('ok',true,'processed',true,'lead_id',v_lead_id,'enrollment_id',v_payment.enrollment_id,'payment_id',v_payment.id,'payment_reference',v_payment_reference,'status',v_payment.status,'touchpoint_id',v_touchpoint_id);
end;
$function$
