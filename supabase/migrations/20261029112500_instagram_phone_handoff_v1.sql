-- Safely attach an international phone number detected in an inbound Instagram DM.
-- Service-role only: callers must already have an authoritative CRM lead id.

create or replace function public.attach_lead_phone_identity_from_message(
  p_lead_id uuid,
  p_value text,
  p_normalized_value text,
  p_source_message_id text default null,
  p_international_format boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_organization_id uuid;
  v_person_id uuid;
  v_contact_id uuid;
  v_existing_phone_id uuid;
  v_conflicting_lead_id uuid;
  v_conflicting_person_id uuid;
  v_digits text;
  v_resolution jsonb;
  v_has_primary_telephone boolean := false;
begin
  if p_lead_id is null then
    raise exception 'Lead ID is required';
  end if;

  select l.organization_id
  into v_organization_id
  from public.leads l
  where l.id = p_lead_id
  for update;

  if not found or v_organization_id is null then
    raise exception 'Lead or lead organization could not be resolved';
  end if;

  v_digits := regexp_replace(coalesce(p_normalized_value, ''), '[^0-9]', '', 'g');
  if length(v_digits) < 8 or length(v_digits) > 15 then
    raise exception 'Telephone identity must contain 8 to 15 digits';
  end if;

  select pl.person_id
  into v_person_id
  from public.person_leads pl
  where pl.organization_id = v_organization_id
    and pl.lead_id = p_lead_id
  limit 1;

  if v_person_id is null then
    perform public.resolve_person_for_lead(p_lead_id, 'instagram_dm');

    select pl.person_id
    into v_person_id
    from public.person_leads pl
    where pl.organization_id = v_organization_id
      and pl.lead_id = p_lead_id
    limit 1;
  end if;

  if v_person_id is null then
    raise exception 'Canonical Person could not be resolved';
  end if;

  select lc.lead_id
  into v_conflicting_lead_id
  from public.lead_contacts lc
  where lc.organization_id = v_organization_id
    and lc.lead_id <> p_lead_id
    and lc.contact_type::text in ('phone', 'whatsapp')
    and regexp_replace(coalesce(lc.normalized_value, ''), '[^0-9]', '', 'g') = v_digits
  limit 1;

  if v_conflicting_lead_id is not null then
    raise exception 'This telephone identity already belongs to another CRM lead';
  end if;

  select pi.person_id
  into v_conflicting_person_id
  from public.person_identifiers pi
  where pi.organization_id = v_organization_id
    and pi.person_id <> v_person_id
    and pi.identifier_type in ('phone', 'whatsapp')
    and regexp_replace(coalesce(pi.normalized_value, ''), '[^0-9]', '', 'g') = v_digits
  limit 1;

  if v_conflicting_person_id is not null then
    raise exception 'This telephone identity belongs to another canonical Person';
  end if;

  select lc.id
  into v_existing_phone_id
  from public.lead_contacts lc
  where lc.organization_id = v_organization_id
    and lc.lead_id = p_lead_id
    and lc.contact_type::text = 'phone'
    and regexp_replace(coalesce(lc.normalized_value, ''), '[^0-9]', '', 'g') = v_digits
  limit 1
  for update;

  if v_existing_phone_id is not null then
    update public.lead_contacts
    set value = coalesce(nullif(btrim(p_value), ''), value),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'source_system', 'instagram_dm',
          'source_message_id', nullif(btrim(p_source_message_id), ''),
          'detected_from_message', true,
          'international_format', coalesce(p_international_format, false),
          'last_detected_at', now()
        )
    where id = v_existing_phone_id
      and organization_id = v_organization_id
      and lead_id = p_lead_id
    returning id into v_contact_id;
  else
    select exists(
      select 1
      from public.lead_contacts lc
      where lc.organization_id = v_organization_id
        and lc.lead_id = p_lead_id
        and lc.contact_type::text in ('phone', 'whatsapp')
        and lc.is_primary = true
    ) into v_has_primary_telephone;

    insert into public.lead_contacts (
      organization_id,
      lead_id,
      contact_type,
      value,
      normalized_value,
      is_primary,
      verified,
      metadata
    ) values (
      v_organization_id,
      p_lead_id,
      'phone',
      coalesce(nullif(btrim(p_value), ''), v_digits),
      v_digits,
      not v_has_primary_telephone,
      false,
      jsonb_build_object(
        'source_system', 'instagram_dm',
        'source_message_id', nullif(btrim(p_source_message_id), ''),
        'detected_from_message', true,
        'international_format', coalesce(p_international_format, false),
        'detected_at', now()
      )
    )
    returning id into v_contact_id;
  end if;

  select public.resolve_person_for_lead(p_lead_id, 'instagram_dm')
  into v_resolution;

  return jsonb_build_object(
    'ok', true,
    'organization_id', v_organization_id,
    'lead_id', p_lead_id,
    'person_id', v_person_id,
    'lead_contact_id', v_contact_id,
    'normalized_phone', v_digits,
    'international_format', coalesce(p_international_format, false),
    'person_resolution', v_resolution
  );
end;
$function$;

revoke all on function public.attach_lead_phone_identity_from_message(uuid, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.attach_lead_phone_identity_from_message(uuid, text, text, text, boolean)
  to service_role;
