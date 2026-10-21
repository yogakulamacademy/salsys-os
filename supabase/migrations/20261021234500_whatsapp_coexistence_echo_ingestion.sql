begin;

-- =============================================================================
-- WHATSAPP COEXISTENCE — BUSINESS APP MESSAGE ECHO INGESTION
--
-- Meta emits smb_message_echoes for messages sent from the WhatsApp Business
-- mobile app while the number is connected to Cloud API through Coexistence.
-- These are outbound human messages, not customer replies.
--
-- Safety rules:
-- - tenant comes only from the stored, tenant-bound webhook event;
-- - an echo may attach only to an existing CRM lead/contact;
-- - an outbound echo never creates a new lead;
-- - an outbound echo never updates last_inbound_at;
-- - provider message id is tenant-idempotent;
-- - CRM history remains authoritative once written.
-- =============================================================================

create or replace function public.ingest_whatsapp_business_app_echo(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.whatsapp_webhook_events%rowtype;
  v_echo jsonb;
  v_message_type text;
  v_body text;
  v_customer_wa_id text;
  v_external_message_id text;
  v_phone_number_id text;
  v_message_at timestamptz;
  v_lead_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_claimed_message_id text;
begin
  select *
  into v_event
  from public.whatsapp_webhook_events
  where id = p_event_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Webhook event not found',
      'event_id', p_event_id
    );
  end if;

  if v_event.organization_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Webhook event organization is missing',
      'event_id', p_event_id
    );
  end if;

  if v_event.processing_status in ('processed', 'ignored') then
    return jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'processing_status', v_event.processing_status,
      'event_id', p_event_id
    );
  end if;

  if coalesce(v_event.event_type, '') not like 'echo:%' then
    update public.whatsapp_webhook_events
    set
      processing_status = 'ignored',
      processed_at = now(),
      processing_error = 'Not a WhatsApp Business app echo event'
    where id = p_event_id
      and organization_id = v_event.organization_id;

    return jsonb_build_object(
      'ok', true,
      'ignored', true,
      'event_type', v_event.event_type,
      'event_id', p_event_id
    );
  end if;

  begin
    v_echo := coalesce(
      v_event.payload -> 'message_echo',
      '{}'::jsonb
    );

    -- For smb_message_echoes, `to` is the customer. `from` is the business.
    v_customer_wa_id := regexp_replace(
      coalesce(
        v_event.contact_wa_id,
        v_echo ->> 'to',
        ''
      ),
      '[^0-9]',
      '',
      'g'
    );

    v_external_message_id := coalesce(
      v_event.external_message_id,
      v_echo ->> 'id'
    );

    v_phone_number_id := coalesce(
      v_event.phone_number_id,
      v_event.payload -> 'metadata' ->> 'phone_number_id'
    );

    v_message_type := coalesce(
      nullif(v_echo ->> 'type', ''),
      'unknown'
    );

    if v_customer_wa_id = '' then
      raise exception 'WhatsApp Business app echo recipient is missing';
    end if;

    if nullif(btrim(v_external_message_id), '') is null then
      raise exception 'WhatsApp Business app echo message id is missing';
    end if;

    if nullif(btrim(v_phone_number_id), '') is null then
      raise exception 'WhatsApp Business app echo phone number id is missing';
    end if;

    v_body :=
      case v_message_type
        when 'text' then
          coalesce(v_echo -> 'text' ->> 'body', '[Text message]')
        when 'button' then
          coalesce(
            v_echo -> 'button' ->> 'text',
            v_echo -> 'button' ->> 'payload',
            '[Button message]'
          )
        when 'interactive' then
          coalesce(
            v_echo -> 'interactive' -> 'button_reply' ->> 'title',
            v_echo -> 'interactive' -> 'button_reply' ->> 'id',
            v_echo -> 'interactive' -> 'list_reply' ->> 'title',
            v_echo -> 'interactive' -> 'list_reply' ->> 'id',
            '[Interactive message]'
          )
        when 'image' then
          coalesce(nullif(v_echo -> 'image' ->> 'caption', ''), '[Image]')
        when 'video' then
          coalesce(nullif(v_echo -> 'video' ->> 'caption', ''), '[Video]')
        when 'document' then
          coalesce(
            nullif(v_echo -> 'document' ->> 'caption', ''),
            nullif(v_echo -> 'document' ->> 'filename', ''),
            '[Document]'
          )
        when 'audio' then '[Audio message]'
        when 'sticker' then '[Sticker]'
        when 'location' then
          concat(
            '[Location: ',
            coalesce(v_echo -> 'location' ->> 'latitude', '?'),
            ', ',
            coalesce(v_echo -> 'location' ->> 'longitude', '?'),
            ']'
          )
        when 'reaction' then
          concat(
            '[Reaction: ',
            coalesce(v_echo -> 'reaction' ->> 'emoji', ''),
            ']'
          )
        else concat('[WhatsApp ', v_message_type, ' message]')
      end;

    v_message_at :=
      case
        when coalesce(v_echo ->> 'timestamp', '') ~ '^[0-9]+$'
          then to_timestamp((v_echo ->> 'timestamp')::double precision)
        else coalesce(v_event.received_at, now())
      end;

    perform pg_advisory_xact_lock(
      hashtextextended(
        v_event.organization_id::text || ':' || v_customer_wa_id,
        0
      )
    );

    -- Outbound Business-app activity may only attach to an existing lead.
    select lc.lead_id
    into v_lead_id
    from public.lead_contacts lc
    where lc.organization_id = v_event.organization_id
      and regexp_replace(
        coalesce(lc.normalized_value, ''),
        '[^0-9]',
        '',
        'g'
      ) = v_customer_wa_id
      and lc.contact_type in (
        'whatsapp'::public.contact_type,
        'phone'::public.contact_type
      )
    order by
      case
        when lc.contact_type = 'whatsapp'::public.contact_type then 0
        else 1
      end,
      lc.created_at asc
    limit 1;

    if v_lead_id is null then
      update public.whatsapp_webhook_events
      set
        processing_status = 'ignored',
        processed_at = now(),
        processing_error =
          'Business app echo recipient is not an existing CRM lead'
      where id = p_event_id
        and organization_id = v_event.organization_id;

      return jsonb_build_object(
        'ok', true,
        'ignored', true,
        'reason', 'recipient_not_in_crm',
        'external_message_id', v_external_message_id,
        'event_id', p_event_id
      );
    end if;

    select c.id
    into v_conversation_id
    from public.conversations c
    where c.organization_id = v_event.organization_id
      and c.channel = 'whatsapp'::public.contact_channel
      and c.external_conversation_id = v_customer_wa_id
      and c.external_account_id is not distinct from v_phone_number_id
    order by c.started_at asc
    limit 1;

    if v_conversation_id is null then
      insert into public.conversations (
        organization_id,
        lead_id,
        channel,
        external_conversation_id,
        external_account_id,
        status,
        started_at,
        last_message_at,
        metadata
      )
      values (
        v_event.organization_id,
        v_lead_id,
        'whatsapp'::public.contact_channel,
        v_customer_wa_id,
        v_phone_number_id,
        'open',
        v_message_at,
        v_message_at,
        jsonb_build_object(
          'source', 'whatsapp_coexistence',
          'business_app_echo', true
        )
      )
      returning id into v_conversation_id;
    end if;

    insert into public.whatsapp_crm_message_links (
      organization_id,
      external_message_id,
      webhook_event_id,
      lead_id,
      conversation_id
    )
    values (
      v_event.organization_id,
      v_external_message_id,
      p_event_id,
      v_lead_id,
      v_conversation_id
    )
    on conflict (organization_id, external_message_id)
    do nothing
    returning external_message_id into v_claimed_message_id;

    if v_claimed_message_id is null then
      update public.whatsapp_webhook_events
      set
        processing_status = 'processed',
        processed_at = now(),
        processing_error = null
      where id = p_event_id
        and organization_id = v_event.organization_id;

      return jsonb_build_object(
        'ok', true,
        'duplicate_message', true,
        'external_message_id', v_external_message_id,
        'lead_id', v_lead_id,
        'conversation_id', v_conversation_id,
        'event_id', p_event_id
      );
    end if;

    insert into public.messages (
      organization_id,
      conversation_id,
      lead_id,
      external_message_id,
      direction,
      sender_type,
      sender_id,
      message_type,
      body,
      status,
      ai_generated,
      human_approved,
      sent_at,
      received_at,
      metadata
    )
    values (
      v_event.organization_id,
      v_conversation_id,
      v_lead_id,
      v_external_message_id,
      'outbound'::public.message_direction,
      'human'::public.actor_type,
      null,
      v_message_type,
      v_body,
      'sent'::public.message_status,
      false,
      true,
      v_message_at,
      null,
      jsonb_build_object(
        'source', 'whatsapp_business_app',
        'coexistence_echo', true,
        'webhook_event_id', p_event_id,
        'phone_number_id', v_phone_number_id
      )
    )
    returning id into v_message_id;

    update public.conversations
    set
      last_message_at = greatest(
        coalesce(last_message_at, v_message_at),
        v_message_at
      ),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'last_outbound_source', 'whatsapp_business_app'
        )
    where id = v_conversation_id
      and organization_id = v_event.organization_id;

    update public.leads
    set
      current_contact_channel = 'whatsapp'::public.contact_channel,
      first_contacted_at = coalesce(first_contacted_at, v_message_at),
      last_contacted_at = greatest(
        coalesce(last_contacted_at, v_message_at),
        v_message_at
      ),
      last_outbound_at = greatest(
        coalesce(last_outbound_at, v_message_at),
        v_message_at
      )
    where id = v_lead_id
      and organization_id = v_event.organization_id;

    insert into public.activities (
      lead_id,
      activity_type,
      channel,
      actor_type,
      actor_id,
      title,
      details,
      metadata,
      occurred_at
    )
    values (
      v_lead_id,
      'outbound_interaction',
      'whatsapp'::public.contact_channel,
      'human'::public.actor_type,
      null,
      'Outbound WhatsApp Business app message',
      left(v_body, 500),
      jsonb_build_object(
        'conversation_id', v_conversation_id,
        'message_id', v_message_id,
        'external_message_id', v_external_message_id,
        'source', 'whatsapp_business_app',
        'coexistence_echo', true
      ),
      v_message_at
    );

    update public.whatsapp_webhook_events
    set
      processing_status = 'processed',
      processed_at = now(),
      processing_error = null
    where id = p_event_id
      and organization_id = v_event.organization_id;

    return jsonb_build_object(
      'ok', true,
      'processed', true,
      'event_id', p_event_id,
      'organization_id', v_event.organization_id,
      'external_message_id', v_external_message_id,
      'lead_id', v_lead_id,
      'conversation_id', v_conversation_id,
      'message_id', v_message_id,
      'message_type', v_message_type,
      'direction', 'outbound'
    );

  exception
    when others then
      update public.whatsapp_webhook_events
      set
        processing_status = 'failed',
        processed_at = now(),
        processing_error = sqlerrm
      where id = p_event_id
        and organization_id = v_event.organization_id;

      return jsonb_build_object(
        'ok', false,
        'event_id', p_event_id,
        'organization_id', v_event.organization_id,
        'error', sqlerrm
      );
  end;
end;
$$;

revoke all on function public.ingest_whatsapp_business_app_echo(uuid)
  from public, anon, authenticated;
grant execute on function public.ingest_whatsapp_business_app_echo(uuid)
  to service_role;

commit;
