-- Detect the latest Instagram-shared telephone candidate and surface an existing WhatsApp lead safely.
-- Never return the raw telephone value.

create or replace function public.get_instagram_whatsapp_handoff_capability(
  p_lead_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_organization_id uuid;
  v_body text;
  v_match text[];
  v_candidate text;
  v_digits text;
  v_detected boolean := false;
  v_international boolean := false;
  v_ready boolean := false;
  v_existing_whatsapp_lead_id uuid;
  v_existing_whatsapp_accessible boolean := false;
begin
  if p_lead_id is null then
    raise exception 'Lead ID is required';
  end if;

  if public.can_work_lead(p_lead_id) is not true then
    raise exception 'Lead access denied' using errcode = '42501';
  end if;

  select l.organization_id
  into v_organization_id
  from public.leads l
  where l.id = p_lead_id
  limit 1;

  if v_organization_id is null then
    raise exception 'Lead organization could not be resolved';
  end if;

  -- Inspect only recent inbound Instagram messages for the selected lead.
  for v_body in
    select m.body
    from public.messages m
    join public.conversations c
      on c.id = m.conversation_id
     and c.organization_id = m.organization_id
     and c.lead_id = m.lead_id
    where m.organization_id = v_organization_id
      and m.lead_id = p_lead_id
      and m.direction::text = 'inbound'
      and c.channel::text = 'instagram'
      and nullif(btrim(m.body), '') is not null
    order by m.created_at desc
    limit 20
  loop
    v_candidate := null;
    v_international := false;

    v_match := regexp_match(v_body, '[+][0-9][0-9[:space:]().-]{6,}[0-9]');
    if v_match is not null then
      v_candidate := v_match[1];
      v_international := true;
    else
      v_match := regexp_match(v_body, '(^|[^0-9])(00[0-9][0-9[:space:]().-]{6,}[0-9])');
      if v_match is not null then
        v_candidate := v_match[2];
        v_international := true;
      else
        v_match := regexp_match(v_body, '[0-9][0-9[:space:]().-]{6,}[0-9]');
        if v_match is not null then
          v_candidate := v_match[1];
        end if;
      end if;
    end if;

    if nullif(btrim(v_candidate), '') is not null then
      v_digits := regexp_replace(v_candidate, '[^0-9]', '', 'g');
      if btrim(v_candidate) like '00%' then
        v_digits := substring(v_digits from 3);
      end if;

      if length(v_digits) between 8 and 15 then
        v_detected := true;
        exit;
      end if;
    end if;
  end loop;

  -- Fall back to an already-captured Instagram phone contact when no recent
  -- parsable candidate is present.
  if not v_detected then
    select
      exists(
        select 1
        from public.lead_contacts lc
        where lc.organization_id = v_organization_id
          and lc.lead_id = p_lead_id
          and lc.contact_type::text = 'phone'
          and coalesce(lc.metadata ->> 'detected_from_message', 'false') = 'true'
          and lc.metadata ->> 'source_system' = 'instagram_dm'
      ),
      exists(
        select 1
        from public.lead_contacts lc
        where lc.organization_id = v_organization_id
          and lc.lead_id = p_lead_id
          and lc.contact_type::text = 'phone'
          and coalesce(lc.metadata ->> 'detected_from_message', 'false') = 'true'
          and lc.metadata ->> 'source_system' = 'instagram_dm'
          and coalesce(lc.metadata ->> 'international_format', 'false') = 'true'
      )
    into v_detected, v_international;
  end if;

  if v_detected and nullif(v_digits, '') is not null then
    select pl.lead_id
    into v_existing_whatsapp_lead_id
    from public.person_identifiers pi
    join public.person_leads pl
      on pl.organization_id = pi.organization_id
     and pl.person_id = pi.person_id
    join public.leads l
      on l.id = pl.lead_id
     and l.organization_id = pi.organization_id
    where pi.organization_id = v_organization_id
      and pi.identifier_type in ('phone', 'whatsapp')
      and regexp_replace(coalesce(pi.normalized_value, ''), '[^0-9]', '', 'g') = v_digits
      and pl.lead_id <> p_lead_id
      and (
        l.current_contact_channel::text = 'whatsapp'
        or l.lead_creation_channel::text = 'whatsapp'
      )
    order by
      case when l.current_contact_channel::text = 'whatsapp' then 0 else 1 end,
      l.updated_at desc nulls last
    limit 1;
  end if;

  if v_existing_whatsapp_lead_id is not null then
    v_existing_whatsapp_accessible := public.can_access_lead(v_existing_whatsapp_lead_id) is true;
  end if;

  if v_existing_whatsapp_lead_id is null then
    select exists(
      select 1
      from public.lead_contacts lc
      where lc.organization_id = v_organization_id
        and lc.lead_id = p_lead_id
        and lc.contact_type::text = 'phone'
        and coalesce(lc.metadata ->> 'detected_from_message', 'false') = 'true'
        and lc.metadata ->> 'source_system' = 'instagram_dm'
        and coalesce(lc.metadata ->> 'international_format', 'false') = 'true'
    ) into v_ready;
  end if;

  return jsonb_build_object(
    'detected', v_detected,
    'ready', v_ready,
    'needs_country_code', v_detected and not v_international and v_existing_whatsapp_lead_id is null,
    'existing_whatsapp', v_existing_whatsapp_lead_id is not null,
    'existing_whatsapp_lead_id', case
      when v_existing_whatsapp_accessible then v_existing_whatsapp_lead_id
      else null
    end
  );
end;
$function$;

revoke all on function public.get_instagram_whatsapp_handoff_capability(uuid)
  from public, anon;
grant execute on function public.get_instagram_whatsapp_handoff_capability(uuid)
  to authenticated, service_role;
