create or replace function public.attach_whatsapp_outbound_message_id(
  p_lead_id uuid,
  p_conversation_id uuid,
  p_body text,
  p_external_message_id text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
    v_message_id uuid;
    v_organization_id uuid;
begin

    if not public.can_write_crm() then
        raise exception 'Not authorized';
    end if;

    if p_external_message_id is null
       or btrim(p_external_message_id) = '' then
        raise exception
            'External WhatsApp message ID is required';
    end if;

    select l.organization_id
    into v_organization_id
    from public.leads l
    where l.id = p_lead_id;

    if v_organization_id is null then
        raise exception
            'Lead or lead organization not found';
    end if;

    -- Transitional hard tenant boundary: a legacy identity may still have
    -- memberships in multiple organizations while strict mode is off. The
    -- lead's organization must therefore be the tenant bound to this session,
    -- not merely one of the caller's memberships.
    if not public.can_mutate_organization(v_organization_id) then
        raise exception 'Not authorized for organization';
    end if;

    if not exists (
        select 1
        from public.conversations c
        where c.id = p_conversation_id
          and c.lead_id = p_lead_id
          and c.organization_id = v_organization_id
    ) then
        raise exception
            'Conversation does not belong to lead organization';
    end if;

    select m.id
    into v_message_id
    from public.messages m
    where m.organization_id = v_organization_id
      and m.external_message_id = p_external_message_id
    limit 1;

    if v_message_id is not null then
        return v_message_id;
    end if;

    select m.id
    into v_message_id
    from public.messages m
    where m.organization_id = v_organization_id
      and m.lead_id = p_lead_id
      and m.conversation_id = p_conversation_id
      and m.direction = 'outbound'
      and m.external_message_id is null
      and coalesce(m.body, '') = coalesce(p_body, '')
      and m.created_at >= now() - interval '5 minutes'
    order by m.created_at desc
    limit 1
    for update;

    if v_message_id is null then
        raise exception
            'Unable to find recently logged outbound CRM message';
    end if;

    update public.messages
    set
        external_message_id = p_external_message_id,
        status = 'sent',
        sent_at = coalesce(sent_at, now()),
        metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object(
                'whatsapp_message_id',
                p_external_message_id
            )
    where id = v_message_id
      and organization_id = v_organization_id;

    return v_message_id;
end;
$$;
