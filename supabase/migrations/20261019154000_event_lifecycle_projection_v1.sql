begin;

create table if not exists public.tracking_entity_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tracking_source_id uuid references public.tracking_sources(id) on delete set null,
  source_system text not null,
  external_entity_type text not null,
  external_entity_id text not null,
  internal_entity_type text not null,
  internal_entity_id uuid not null,
  lead_id uuid references public.leads(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (external_entity_type in ('lead','booking','enrollment','payment')),
  check (internal_entity_type in ('lead','enrollment','payment')),
  unique (organization_id, source_system, external_entity_type, external_entity_id)
);

create index if not exists idx_tracking_entity_references_lookup
  on public.tracking_entity_references(organization_id,external_entity_type,external_entity_id);
create index if not exists idx_tracking_entity_references_lead
  on public.tracking_entity_references(organization_id,lead_id,updated_at desc)
  where lead_id is not null;

create unique index if not exists uq_payments_provider_external_reference
  on public.payments(organization_id,coalesce(provider,''),external_payment_id)
  where external_payment_id is not null and btrim(external_payment_id)<>'';

alter table public.tracking_entity_references enable row level security;
revoke all on public.tracking_entity_references from public, anon, authenticated;
grant select,insert,update,delete on public.tracking_entity_references to service_role;

create or replace function public.upsert_tracking_entity_reference_v1(
  p_organization_id uuid,
  p_tracking_source_id uuid,
  p_source_system text,
  p_external_entity_type text,
  p_external_entity_id text,
  p_internal_entity_type text,
  p_internal_entity_id uuid,
  p_lead_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_lead_id uuid := p_lead_id;
begin
  if p_organization_id is null or p_internal_entity_id is null then
    raise exception 'organization_id and internal_entity_id are required';
  end if;
  if nullif(btrim(coalesce(p_source_system,'')),'') is null
     or nullif(btrim(coalesce(p_external_entity_id,'')),'') is null then
    raise exception 'source_system and external_entity_id are required';
  end if;
  if p_external_entity_type not in ('lead','booking','enrollment','payment') then
    raise exception 'unsupported external entity type';
  end if;
  if p_internal_entity_type not in ('lead','enrollment','payment') then
    raise exception 'unsupported internal entity type';
  end if;

  if p_tracking_source_id is not null and not exists (
    select 1 from public.tracking_sources s
    where s.id=p_tracking_source_id and s.organization_id=p_organization_id
  ) then
    raise exception 'tracking source tenant mismatch';
  end if;

  if p_internal_entity_type='lead' then
    if not exists (select 1 from public.leads l where l.id=p_internal_entity_id and l.organization_id=p_organization_id) then
      raise exception 'lead tenant mismatch';
    end if;
    v_lead_id := p_internal_entity_id;
  elsif p_internal_entity_type='enrollment' then
    select e.lead_id into v_lead_id
    from public.enrollments e
    where e.id=p_internal_entity_id and e.organization_id=p_organization_id;
    if v_lead_id is null then raise exception 'enrollment tenant mismatch'; end if;
  elsif p_internal_entity_type='payment' then
    select p.lead_id into v_lead_id
    from public.payments p
    where p.id=p_internal_entity_id and p.organization_id=p_organization_id;
    if v_lead_id is null then raise exception 'payment tenant mismatch'; end if;
  end if;

  insert into public.tracking_entity_references(
    organization_id,tracking_source_id,source_system,external_entity_type,external_entity_id,
    internal_entity_type,internal_entity_id,lead_id,metadata,created_at,updated_at
  ) values (
    p_organization_id,p_tracking_source_id,btrim(p_source_system),p_external_entity_type,btrim(p_external_entity_id),
    p_internal_entity_type,p_internal_entity_id,v_lead_id,coalesce(p_metadata,'{}'::jsonb),now(),now()
  )
  on conflict (organization_id,source_system,external_entity_type,external_entity_id)
  do update set
    tracking_source_id=coalesce(excluded.tracking_source_id,public.tracking_entity_references.tracking_source_id),
    internal_entity_type=excluded.internal_entity_type,
    internal_entity_id=excluded.internal_entity_id,
    lead_id=excluded.lead_id,
    metadata=coalesce(public.tracking_entity_references.metadata,'{}'::jsonb) || excluded.metadata,
    updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.resolve_tracking_event_entities_v1(
  p_organization_id uuid,
  p_raw_event_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_raw public.raw_events%rowtype;
  v_source public.tracking_sources%rowtype;
  v_payload jsonb;
  v_lead_id uuid;
  v_enrollment_id uuid;
  v_booking_reference text;
  v_enrollment_reference text;
  v_lead_event_id text;
  v_booking_source text;
  v_enrollment_source text;
  v_lead_source text;
  v_ref_count integer;
begin
  select re.* into v_raw
  from public.raw_events re
  where re.id=p_raw_event_id and re.organization_id=p_organization_id;
  if v_raw.id is null then raise exception 'tenant-owned raw event not found'; end if;

  select s.* into v_source
  from public.tracking_sources s
  where s.id=v_raw.tracking_source_id and s.organization_id=p_organization_id;
  if v_source.id is null then raise exception 'tracking source not found'; end if;

  v_payload := case when jsonb_typeof(v_raw.payload)='object' then v_raw.payload else '{}'::jsonb end;
  v_booking_reference := nullif(btrim(coalesce(v_payload->>'booking_reference',v_payload->>'bookingReference','')),'');
  v_enrollment_reference := nullif(btrim(coalesce(v_payload->>'enrollment_reference',v_payload->>'enrollmentReference','')),'');
  v_lead_event_id := nullif(btrim(coalesce(v_payload->>'lead_event_id',v_payload->>'leadEventId','')),'');
  v_booking_source := coalesce(nullif(btrim(v_payload->>'booking_source_system'),''),v_source.source_system);
  v_enrollment_source := coalesce(nullif(btrim(v_payload->>'enrollment_source_system'),''),v_source.source_system);
  v_lead_source := coalesce(nullif(btrim(v_payload->>'lead_source_system'),''),v_source.source_system);

  if nullif(btrim(coalesce(v_payload->>'lead_id',v_payload->>'leadId','')),'') is not null then
    begin
      v_lead_id := coalesce(v_payload->>'lead_id',v_payload->>'leadId')::uuid;
    exception when others then
      raise exception 'invalid explicit lead_id';
    end;
    if not exists (select 1 from public.leads l where l.id=v_lead_id and l.organization_id=p_organization_id) then
      raise exception 'explicit lead_id tenant mismatch';
    end if;
  end if;

  if nullif(btrim(coalesce(v_payload->>'enrollment_id',v_payload->>'enrollmentId','')),'') is not null then
    begin
      v_enrollment_id := coalesce(v_payload->>'enrollment_id',v_payload->>'enrollmentId')::uuid;
    exception when others then
      raise exception 'invalid explicit enrollment_id';
    end;
    if not exists (select 1 from public.enrollments e where e.id=v_enrollment_id and e.organization_id=p_organization_id) then
      raise exception 'explicit enrollment_id tenant mismatch';
    end if;
    if v_lead_id is null then
      select e.lead_id into v_lead_id from public.enrollments e where e.id=v_enrollment_id and e.organization_id=p_organization_id;
    end if;
  end if;

  if v_enrollment_id is null and v_enrollment_reference is not null then
    select r.internal_entity_id,r.lead_id into v_enrollment_id,v_lead_id
    from public.tracking_entity_references r
    where r.organization_id=p_organization_id
      and r.source_system=v_enrollment_source
      and r.external_entity_type='enrollment'
      and r.external_entity_id=v_enrollment_reference
      and r.internal_entity_type='enrollment'
    limit 1;
  end if;

  if v_booking_reference is not null and v_lead_id is null then
    select r.lead_id,
           case when r.internal_entity_type='enrollment' then r.internal_entity_id else null end
      into v_lead_id,v_enrollment_id
    from public.tracking_entity_references r
    where r.organization_id=p_organization_id
      and r.source_system=v_booking_source
      and r.external_entity_type='booking'
      and r.external_entity_id=v_booking_reference
    limit 1;

    if v_lead_id is null then
      select count(*) into v_ref_count
      from public.tracking_entity_references r
      where r.organization_id=p_organization_id
        and r.external_entity_type='booking'
        and r.external_entity_id=v_booking_reference;
      if v_ref_count=1 then
        select r.lead_id,
               case when r.internal_entity_type='enrollment' then r.internal_entity_id else null end
          into v_lead_id,v_enrollment_id
        from public.tracking_entity_references r
        where r.organization_id=p_organization_id
          and r.external_entity_type='booking'
          and r.external_entity_id=v_booking_reference
        limit 1;
      end if;
    end if;
  end if;

  if v_lead_id is null and v_lead_event_id is not null then
    select lie.lead_id into v_lead_id
    from public.lead_ingest_events lie
    where lie.organization_id=p_organization_id
      and lie.source_system=v_lead_source
      and lie.external_event_id=v_lead_event_id
      and lie.status='processed'
    limit 1;
  end if;

  if v_lead_id is null and v_raw.session_key is not null then
    select ws.lead_id into v_lead_id
    from public.web_sessions ws
    where ws.organization_id=p_organization_id
      and ws.session_key=v_raw.session_key
      and ws.lead_id is not null
      and (v_raw.anonymous_visitor_id is null or ws.anonymous_visitor_id=v_raw.anonymous_visitor_id)
    limit 1;
  end if;

  if v_lead_id is null and v_raw.anonymous_visitor_id is not null and v_raw.session_key is not null then
    select vil.lead_id into v_lead_id
    from public.visitor_identity_links vil
    where vil.organization_id=p_organization_id
      and vil.anonymous_visitor_id=v_raw.anonymous_visitor_id
      and vil.last_session_key=v_raw.session_key
    limit 1;
  end if;

  return jsonb_build_object(
    'lead_id',v_lead_id,
    'enrollment_id',v_enrollment_id,
    'booking_reference',v_booking_reference,
    'enrollment_reference',v_enrollment_reference,
    'source_system',v_source.source_system,
    'tracking_source_id',v_source.id,
    'session_key',v_raw.session_key,
    'anonymous_visitor_id',v_raw.anonymous_visitor_id
  );
end;
$$;

create or replace function public.process_booking_raw_event_v1(
  p_organization_id uuid,
  p_raw_event_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raw public.raw_events%rowtype;
  v_source public.tracking_sources%rowtype;
  v_entities jsonb;
  v_payload jsonb;
  v_lead_id uuid;
  v_booking_reference text;
  v_session_id uuid;
  v_touchpoint_id uuid;
begin
  select * into v_raw from public.raw_events where id=p_raw_event_id and organization_id=p_organization_id;
  if v_raw.id is null then raise exception 'tenant-owned raw event not found'; end if;
  if v_raw.event_family is distinct from 'booking' or v_raw.source_event_type not in ('booking.started','booking.completed') then
    raise exception 'unsupported booking event';
  end if;
  if coalesce((v_raw.metadata->>'accepted_for_processing')::boolean,true) is not true then
    return jsonb_build_object('ok',false,'processed',false,'reason','raw_event_not_accepted');
  end if;

  select * into v_source from public.tracking_sources where id=v_raw.tracking_source_id and organization_id=p_organization_id and status='active';
  if v_source.id is null then raise exception 'active tracking source not found'; end if;

  v_payload := case when jsonb_typeof(v_raw.payload)='object' then v_raw.payload else '{}'::jsonb end;
  v_entities := public.resolve_tracking_event_entities_v1(p_organization_id,p_raw_event_id);
  v_lead_id := nullif(v_entities->>'lead_id','')::uuid;
  v_booking_reference := nullif(v_entities->>'booking_reference','');
  if v_booking_reference is null then raise exception 'booking_reference is required'; end if;
  if v_lead_id is null then raise exception 'booking lead resolution required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('booking-ref:'||p_organization_id::text||':'||v_source.source_system||':'||v_booking_reference,0));

  perform public.upsert_tracking_entity_reference_v1(
    p_organization_id,v_source.id,v_source.source_system,'booking',v_booking_reference,
    'lead',v_lead_id,v_lead_id,
    jsonb_build_object('raw_event_id',v_raw.id,'event_type',v_raw.source_event_type,'site',v_raw.site)
  );

  if v_raw.session_key is not null then
    select ws.id into v_session_id from public.web_sessions ws
    where ws.organization_id=p_organization_id and ws.session_key=v_raw.session_key
      and (v_raw.anonymous_visitor_id is null or ws.anonymous_visitor_id=v_raw.anonymous_visitor_id)
    limit 1;
  end if;

  insert into public.touchpoints(
    organization_id,event_id,lead_id,web_session_id,anonymous_visitor_id,occurred_at,
    source,platform,channel,event_type,landing_page,referrer,metadata
  ) values (
    p_organization_id,v_source.source_system||':'||v_raw.source_event_id,v_lead_id,v_session_id,v_raw.anonymous_visitor_id,
    coalesce(v_raw.occurred_at,v_raw.received_at,now()),v_source.source_system,v_source.source_system,
    case when v_source.source_type='website' then 'website'::public.contact_channel else 'other'::public.contact_channel end,
    v_raw.source_event_type,nullif(v_payload->>'page_url',''),nullif(v_payload->>'referrer',''),
    jsonb_build_object('raw_event_id',v_raw.id,'booking_reference',v_booking_reference,'trusted_server_event',true)
  ) on conflict (organization_id,event_id) do nothing returning id into v_touchpoint_id;

  return jsonb_build_object('ok',true,'processed',true,'lead_id',v_lead_id,'booking_reference',v_booking_reference,'touchpoint_id',v_touchpoint_id);
end;
$$;

create or replace function public.process_payment_raw_event_v1(
  p_organization_id uuid,
  p_raw_event_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

create or replace function public.process_enrollment_raw_event_v1(
  p_organization_id uuid,
  p_raw_event_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

create or replace function public.process_tracking_raw_event_v1(
  p_organization_id uuid,
  p_raw_event_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.upsert_tracking_entity_reference_v1(uuid,uuid,text,text,text,text,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.resolve_tracking_event_entities_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.process_booking_raw_event_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.process_payment_raw_event_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.process_enrollment_raw_event_v1(uuid,uuid) from public,anon,authenticated;

grant execute on function public.upsert_tracking_entity_reference_v1(uuid,uuid,text,text,text,text,uuid,uuid,jsonb) to service_role;
grant execute on function public.resolve_tracking_event_entities_v1(uuid,uuid) to service_role;
grant execute on function public.process_booking_raw_event_v1(uuid,uuid) to service_role;
grant execute on function public.process_payment_raw_event_v1(uuid,uuid) to service_role;
grant execute on function public.process_enrollment_raw_event_v1(uuid,uuid) to service_role;

commit;
