-- Production-ledger recovery for 20261019154130_event_lifecycle_projection_v1.
--
-- The production migration itself is missing from source control. The three
-- financial processor definitions are already preserved byte-for-byte under
-- tests/database and are concatenated by Migration Replay after this prefix.
-- This prefix restores the exact surrounding table/helper/booking contracts
-- needed by those reviewed processor baselines.
--
-- Ephemeral clean-replay recovery only. Never apply directly to production.

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
  on public.tracking_entity_references(
    organization_id,
    external_entity_type,
    external_entity_id
  );

create index if not exists idx_tracking_entity_references_lead
  on public.tracking_entity_references(
    organization_id,
    lead_id,
    updated_at desc
  )
  where lead_id is not null;

create unique index if not exists uq_payments_provider_external_reference
  on public.payments(
    organization_id,
    coalesce(provider,''),
    external_payment_id
  )
  where external_payment_id is not null
    and btrim(external_payment_id) <> '';

alter table public.tracking_entity_references enable row level security;
revoke all on public.tracking_entity_references from public, anon, authenticated;
grant select, insert, update, delete on public.tracking_entity_references to service_role;

create or replace function public.upsert_tracking_entity_reference_v1(
  p_organization_id uuid,
  p_tracking_source_id uuid,
  p_source_system text,
  p_external_entity_type text,
  p_external_entity_id text,
  p_internal_entity_type text,
  p_internal_entity_id uuid,
  p_lead_id uuid default null::uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
    if not exists (
      select 1
      from public.leads l
      where l.id=p_internal_entity_id
        and l.organization_id=p_organization_id
    ) then
      raise exception 'lead tenant mismatch';
    end if;
    v_lead_id := p_internal_entity_id;
  elsif p_internal_entity_type='enrollment' then
    select e.lead_id into v_lead_id
    from public.enrollments e
    where e.id=p_internal_entity_id
      and e.organization_id=p_organization_id;
    if v_lead_id is null then raise exception 'enrollment tenant mismatch'; end if;
  elsif p_internal_entity_type='payment' then
    select p.lead_id into v_lead_id
    from public.payments p
    where p.id=p_internal_entity_id
      and p.organization_id=p_organization_id;
    if v_lead_id is null then raise exception 'payment tenant mismatch'; end if;
  end if;

  insert into public.tracking_entity_references(
    organization_id,
    tracking_source_id,
    source_system,
    external_entity_type,
    external_entity_id,
    internal_entity_type,
    internal_entity_id,
    lead_id,
    metadata,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_tracking_source_id,
    btrim(p_source_system),
    p_external_entity_type,
    btrim(p_external_entity_id),
    p_internal_entity_type,
    p_internal_entity_id,
    v_lead_id,
    coalesce(p_metadata,'{}'::jsonb),
    now(),
    now()
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
$function$;

create or replace function public.resolve_tracking_event_entities_v1(
  p_organization_id uuid,
  p_raw_event_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  v_email_norm text;
  v_phone_norm text;
  v_email_lead uuid;
  v_phone_lead uuid;
begin
  select re.* into v_raw
  from public.raw_events re
  where re.id = p_raw_event_id
    and re.organization_id = p_organization_id;
  if v_raw.id is null then raise exception 'tenant-owned raw event not found'; end if;

  select s.* into v_source
  from public.tracking_sources s
  where s.id = v_raw.tracking_source_id
    and s.organization_id = p_organization_id;
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
    if not exists(
      select 1
      from public.leads l
      where l.id=v_lead_id and l.organization_id=p_organization_id
    ) then
      raise exception 'explicit lead_id tenant mismatch';
    end if;
  end if;

  if nullif(btrim(coalesce(v_payload->>'enrollment_id',v_payload->>'enrollmentId','')),'') is not null then
    begin
      v_enrollment_id := coalesce(v_payload->>'enrollment_id',v_payload->>'enrollmentId')::uuid;
    exception when others then
      raise exception 'invalid explicit enrollment_id';
    end;
    if not exists(
      select 1
      from public.enrollments e
      where e.id=v_enrollment_id and e.organization_id=p_organization_id
    ) then
      raise exception 'explicit enrollment_id tenant mismatch';
    end if;
    if v_lead_id is null then
      select e.lead_id into v_lead_id
      from public.enrollments e
      where e.id=v_enrollment_id and e.organization_id=p_organization_id;
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
    select
      r.lead_id,
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
        select
          r.lead_id,
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

  if v_lead_id is null and v_source.auth_mode='secret' then
    v_email_norm := lower(nullif(btrim(coalesce(v_payload->>'email',v_payload->>'customer_email',v_payload->>'customerEmail','')),''));
    v_phone_norm := nullif(regexp_replace(coalesce(v_payload->>'phone',v_payload->>'phone_number',v_payload->>'phoneNumber',v_payload->>'customer_phone',v_payload->>'customerPhone',''),'[^0-9+]','','g'),'');

    if v_email_norm is not null then
      select min(lc.lead_id::text)::uuid into v_email_lead
      from public.lead_contacts lc
      where lc.organization_id=p_organization_id
        and lc.contact_type='email'
        and lc.normalized_value=v_email_norm
      having count(distinct lc.lead_id)=1;
    end if;

    if v_phone_norm is not null then
      select min(lc.lead_id::text)::uuid into v_phone_lead
      from public.lead_contacts lc
      where lc.organization_id=p_organization_id
        and lc.contact_type in ('phone','whatsapp')
        and lc.normalized_value=v_phone_norm
      having count(distinct lc.lead_id)=1;
    end if;

    if v_email_lead is not null and v_phone_lead is not null and v_email_lead<>v_phone_lead then
      raise exception 'trusted business event contact identity conflict';
    end if;

    v_lead_id := coalesce(v_email_lead,v_phone_lead);
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
$function$;

create or replace function public.process_booking_raw_event_v1(
  p_organization_id uuid,
  p_raw_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  select * into v_raw
  from public.raw_events
  where id=p_raw_event_id and organization_id=p_organization_id;
  if v_raw.id is null then raise exception 'tenant-owned raw event not found'; end if;
  if v_raw.event_family is distinct from 'booking'
     or v_raw.source_event_type not in ('booking.started','booking.completed') then
    raise exception 'unsupported booking event';
  end if;
  if coalesce((v_raw.metadata->>'accepted_for_processing')::boolean,true) is not true then
    return jsonb_build_object('ok',false,'processed',false,'reason','raw_event_not_accepted');
  end if;

  select * into v_source
  from public.tracking_sources
  where id=v_raw.tracking_source_id
    and organization_id=p_organization_id
    and status='active';
  if v_source.id is null then raise exception 'active tracking source not found'; end if;

  v_payload := case when jsonb_typeof(v_raw.payload)='object' then v_raw.payload else '{}'::jsonb end;
  v_entities := public.resolve_tracking_event_entities_v1(p_organization_id,p_raw_event_id);
  v_lead_id := nullif(v_entities->>'lead_id','')::uuid;
  v_booking_reference := nullif(v_entities->>'booking_reference','');
  if v_booking_reference is null then raise exception 'booking_reference is required'; end if;
  if v_lead_id is null then raise exception 'booking lead resolution required'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'booking-ref:'||p_organization_id::text||':'||v_source.source_system||':'||v_booking_reference,
      0
    )
  );

  perform public.upsert_tracking_entity_reference_v1(
    p_organization_id,
    v_source.id,
    v_source.source_system,
    'booking',
    v_booking_reference,
    'lead',
    v_lead_id,
    v_lead_id,
    jsonb_build_object(
      'raw_event_id',v_raw.id,
      'event_type',v_raw.source_event_type,
      'site',v_raw.site
    )
  );

  if v_raw.session_key is not null then
    select ws.id into v_session_id
    from public.web_sessions ws
    where ws.organization_id=p_organization_id
      and ws.session_key=v_raw.session_key
      and (v_raw.anonymous_visitor_id is null or ws.anonymous_visitor_id=v_raw.anonymous_visitor_id)
    limit 1;
  end if;

  insert into public.touchpoints(
    organization_id,
    event_id,
    lead_id,
    web_session_id,
    anonymous_visitor_id,
    occurred_at,
    source,
    platform,
    channel,
    event_type,
    landing_page,
    referrer,
    metadata
  ) values (
    p_organization_id,
    v_source.source_system||':'||v_raw.source_event_id,
    v_lead_id,
    v_session_id,
    v_raw.anonymous_visitor_id,
    coalesce(v_raw.occurred_at,v_raw.received_at,now()),
    v_source.source_system,
    v_source.source_system,
    case when v_source.source_type='website'
      then 'website'::public.contact_channel
      else 'other'::public.contact_channel
    end,
    v_raw.source_event_type,
    nullif(v_payload->>'page_url',''),
    nullif(v_payload->>'referrer',''),
    jsonb_build_object(
      'raw_event_id',v_raw.id,
      'booking_reference',v_booking_reference,
      'trusted_server_event',true
    )
  )
  on conflict (organization_id,event_id) do nothing
  returning id into v_touchpoint_id;

  return jsonb_build_object(
    'ok',true,
    'processed',true,
    'lead_id',v_lead_id,
    'booking_reference',v_booking_reference,
    'touchpoint_id',v_touchpoint_id
  );
end;
$function$;
