begin;

-- =============================================================================
-- WHATSAPP COEXISTENCE — smb_message_echoes BRIDGE
--
-- The existing webhook adapter preserves unknown Meta webhook fields as one raw
-- whatsapp_webhook_events row. For Coexistence, expand the
-- `smb_message_echoes` field into tenant-bound child events and immediately
-- process each child through ingest_whatsapp_business_app_echo().
--
-- This keeps the existing webhook route backward compatible and preserves the
-- parent Meta payload as raw evidence while making Business-app-sent messages
-- visible in the CRM as outbound human messages.
-- =============================================================================

create or replace function public.expand_whatsapp_smb_message_echoes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_echo jsonb;
  v_echo_id text;
  v_echo_type text;
  v_customer_wa_id text;
  v_child_id uuid;
  v_child_event_key text;
  v_result jsonb;
begin
  if new.event_type <> 'smb_message_echoes' then
    return new;
  end if;

  if new.organization_id is null then
    return new;
  end if;

  for v_echo in
    select value
    from jsonb_array_elements(
      coalesce(
        new.payload -> 'value' -> 'message_echoes',
        '[]'::jsonb
      )
    )
  loop
    v_echo_id := nullif(btrim(v_echo ->> 'id'), '');
    v_echo_type := coalesce(nullif(btrim(v_echo ->> 'type'), ''), 'unknown');
    v_customer_wa_id := regexp_replace(
      coalesce(v_echo ->> 'to', ''),
      '[^0-9]',
      '',
      'g'
    );

    if v_echo_id is null or v_customer_wa_id = '' then
      continue;
    end if;

    v_child_event_key := 'echo:' || v_echo_id;
    v_child_id := null;

    insert into public.whatsapp_webhook_events (
      organization_id,
      event_key,
      object_type,
      entry_id,
      field_name,
      phone_number_id,
      display_phone_number,
      event_type,
      external_message_id,
      contact_wa_id,
      signature_valid,
      payload,
      received_at,
      processing_status
    )
    values (
      new.organization_id,
      v_child_event_key,
      new.object_type,
      new.entry_id,
      'smb_message_echoes',
      new.phone_number_id,
      new.display_phone_number,
      'echo:' || v_echo_type,
      v_echo_id,
      v_customer_wa_id,
      new.signature_valid,
      jsonb_build_object(
        'object', new.object_type,
        'entry_id', new.entry_id,
        'field', 'smb_message_echoes',
        'metadata', coalesce(
          new.payload -> 'value' -> 'metadata',
          '{}'::jsonb
        ),
        'message_echo', v_echo,
        'parent_webhook_event_id', new.id
      ),
      new.received_at,
      'received'
    )
    on conflict (organization_id, event_key)
    do nothing
    returning id into v_child_id;

    if v_child_id is null then
      select e.id
      into v_child_id
      from public.whatsapp_webhook_events e
      where e.organization_id = new.organization_id
        and e.event_key = v_child_event_key
      limit 1;
    end if;

    if v_child_id is not null then
      v_result := public.ingest_whatsapp_business_app_echo(v_child_id);
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.expand_whatsapp_smb_message_echoes()
  from public, anon, authenticated;

drop trigger if exists whatsapp_smb_message_echoes_bridge
  on public.whatsapp_webhook_events;

create trigger whatsapp_smb_message_echoes_bridge
after insert on public.whatsapp_webhook_events
for each row
when (new.event_type = 'smb_message_echoes')
execute function public.expand_whatsapp_smb_message_echoes();

commit;
