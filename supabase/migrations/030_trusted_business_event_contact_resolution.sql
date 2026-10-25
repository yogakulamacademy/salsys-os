-- ============================================================
-- MIGRATION 030
-- TRUSTED BUSINESS EVENT CONTACT RESOLUTION
--
-- Allows secret-authenticated server events (booking/payment/
-- enrollment) to resolve an existing CRM lead from an exact,
-- tenant-scoped email and/or phone match when stronger identity
-- references are unavailable.
--
-- Browser/origin-authenticated sources do NOT use this fallback.
-- Conflicting email/phone matches fail closed.
-- ============================================================

begin;

create or replace function public.resolve_tracking_event_entities_v1(
  p_organization_id uuid,
  p_raw_event_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
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
  select re.*
  into v_raw
  from public.raw_events re
  where re.id = p_raw_event_id
    and re.organization_id = p_organization_id;

  if v_raw.id is null then
    raise exception 'tenant-owned raw event not found';
  end if;

  select s.*
  into v_source
  from public.tracking_sources s
  where s.id = v_raw.tracking_source_id
    and s.organization_id = p_organization_id;

  if v_source.id is null then
    raise exception 'tracking source not found';
  end if;

  v_payload := case
    when jsonb_typeof(v_raw.payload) = 'object' then v_raw.payload
    else '{}'::jsonb
  end;

  v_booking_reference := nullif(
    btrim(coalesce(v_payload->>'booking_reference', v_payload->>'bookingReference', '')),
    ''
  );

  v_enrollment_reference := nullif(
    btrim(coalesce(v_payload->>'enrollment_reference', v_payload->>'enrollmentReference', '')),
    ''
  );

  v_lead_event_id := nullif(
    btrim(coalesce(v_payload->>'lead_event_id', v_payload->>'leadEventId', '')),
    ''
  );

  v_booking_source := coalesce(
    nullif(btrim(v_payload->>'booking_source_system'), ''),
    v_source.source_system
  );

  v_enrollment_source := coalesce(
    nullif(btrim(v_payload->>'enrollment_source_system'), ''),
    v_source.source_system
  );

  v_lead_source := coalesce(
    nullif(btrim(v_payload->>'lead_source_system'), ''),
    v_source.source_system
  );

  -- 1. Explicit internal lead identity.
  if nullif(btrim(coalesce(v_payload->>'lead_id', v_payload->>'leadId', '')), '') is not null then
    begin
      v_lead_id := coalesce(v_payload->>'lead_id', v_payload->>'leadId')::uuid;
    exception when others then
      raise exception 'invalid explicit lead_id';
    end;

    if not exists (
      select 1
      from public.leads l
      where l.id = v_lead_id
        and l.organization_id = p_organization_id
    ) then
      raise exception 'explicit lead_id tenant mismatch';
    end if;
  end if;

  -- 2. Explicit internal enrollment identity.
  if nullif(btrim(coalesce(v_payload->>'enrollment_id', v_payload->>'enrollmentId', '')), '') is not null then
    begin
      v_enrollment_id := coalesce(v_payload->>'enrollment_id', v_payload->>'enrollmentId')::uuid;
    exception when others then
      raise exception 'invalid explicit enrollment_id';
    end;

    if not exists (
      select 1
      from public.enrollments e
      where e.id = v_enrollment_id
        and e.organization_id = p_organization_id
    ) then
      raise exception 'explicit enrollment_id tenant mismatch';
    end if;

    if v_lead_id is null then
      select e.lead_id
      into v_lead_id
      from public.enrollments e
      where e.id = v_enrollment_id
        and e.organization_id = p_organization_id;
    end if;
  end if;

  -- 3. Existing enrollment reference.
  if v_enrollment_id is null and v_enrollment_reference is not null then
    select r.internal_entity_id, r.lead_id
    into v_enrollment_id, v_lead_id
    from public.tracking_entity_references r
    where r.organization_id = p_organization_id
      and r.source_system = v_enrollment_source
      and r.external_entity_type = 'enrollment'
      and r.external_entity_id = v_enrollment_reference
      and r.internal_entity_type = 'enrollment'
    limit 1;
  end if;

  -- 4. Existing booking reference.
  if v_booking_reference is not null and v_lead_id is null then
    select
      r.lead_id,
      case when r.internal_entity_type = 'enrollment' then r.internal_entity_id else null end
    into v_lead_id, v_enrollment_id
    from public.tracking_entity_references r
    where r.organization_id = p_organization_id
      and r.source_system = v_booking_source
      and r.external_entity_type = 'booking'
      and r.external_entity_id = v_booking_reference
    limit 1;

    if v_lead_id is null then
      select count(*)
      into v_ref_count
      from public.tracking_entity_references r
      where r.organization_id = p_organization_id
        and r.external_entity_type = 'booking'
        and r.external_entity_id = v_booking_reference;

      if v_ref_count = 1 then
        select
          r.lead_id,
          case when r.internal_entity_type = 'enrollment' then r.internal_entity_id else null end
        into v_lead_id, v_enrollment_id
        from public.tracking_entity_references r
        where r.organization_id = p_organization_id
          and r.external_entity_type = 'booking'
          and r.external_entity_id = v_booking_reference
        limit 1;
      end if;
    end if;
  end if;

  -- 5. Explicit prior lead event reference.
  if v_lead_id is null and v_lead_event_id is not null then
    select lie.lead_id
    into v_lead_id
    from public.lead_ingest_events lie
    where lie.organization_id = p_organization_id
      and lie.source_system = v_lead_source
      and lie.external_event_id = v_lead_event_id
      and lie.status = 'processed'
    limit 1;
  end if;

  -- 6. Exact tracked session identity.
  if v_lead_id is null and v_raw.session_key is not null then
    select ws.lead_id
    into v_lead_id
    from public.web_sessions ws
    where ws.organization_id = p_organization_id
      and ws.session_key = v_raw.session_key
      and ws.lead_id is not null
      and (
        v_raw.anonymous_visitor_id is null
        or ws.anonymous_visitor_id = v_raw.anonymous_visitor_id
      )
    limit 1;
  end if;

  -- 7. Exact visitor + session identity handoff.
  if v_lead_id is null
     and v_raw.anonymous_visitor_id is not null
     and v_raw.session_key is not null then
    select vil.lead_id
    into v_lead_id
    from public.visitor_identity_links vil
    where vil.organization_id = p_organization_id
      and vil.anonymous_visitor_id = v_raw.anonymous_visitor_id
      and vil.last_session_key = v_raw.session_key
    limit 1;
  end if;

  -- 8. Trusted-server exact contact fallback.
  --
  -- This fallback is intentionally restricted to secret-authenticated
  -- server sources. It is never available to public browser sources.
  -- It uses only existing tenant-owned CRM contact identities and does
  -- not create a lead or guess on ambiguous data.
  if v_lead_id is null and v_source.auth_mode = 'secret' then
    v_email_norm := lower(
      nullif(
        btrim(
          coalesce(
            v_payload->>'email',
            v_payload->>'customer_email',
            v_payload->>'customerEmail',
            ''
          )
        ),
        ''
      )
    );

    v_phone_norm := nullif(
      regexp_replace(
        coalesce(
          v_payload->>'phone',
          v_payload->>'phone_number',
          v_payload->>'phoneNumber',
          v_payload->>'customer_phone',
          v_payload->>'customerPhone',
          ''
        ),
        '[^0-9+]',
        '',
        'g'
      ),
      ''
    );

    if v_email_norm is not null then
      select min(lc.lead_id::text)::uuid
      into v_email_lead
      from public.lead_contacts lc
      where lc.organization_id = p_organization_id
        and lc.contact_type = 'email'
        and lc.normalized_value = v_email_norm
      having count(distinct lc.lead_id) = 1;
    end if;

    if v_phone_norm is not null then
      select min(lc.lead_id::text)::uuid
      into v_phone_lead
      from public.lead_contacts lc
      where lc.organization_id = p_organization_id
        and lc.contact_type in ('phone', 'whatsapp')
        and lc.normalized_value = v_phone_norm
      having count(distinct lc.lead_id) = 1;
    end if;

    if v_email_lead is not null
       and v_phone_lead is not null
       and v_email_lead <> v_phone_lead then
      raise exception 'trusted business event contact identity conflict';
    end if;

    v_lead_id := coalesce(v_email_lead, v_phone_lead);
  end if;

  return jsonb_build_object(
    'lead_id', v_lead_id,
    'enrollment_id', v_enrollment_id,
    'booking_reference', v_booking_reference,
    'enrollment_reference', v_enrollment_reference,
    'source_system', v_source.source_system,
    'tracking_source_id', v_source.id,
    'session_key', v_raw.session_key,
    'anonymous_visitor_id', v_raw.anonymous_visitor_id
  );
end;
$function$;

commit;
