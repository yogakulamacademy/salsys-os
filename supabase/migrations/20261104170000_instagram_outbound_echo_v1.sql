-- Instagram business-account outbound echo -> existing CRM conversation.
-- Keep webhook payload nested under outbound_echo: the preexisting Instagram DM
-- retry worker processes only root-level message/postback/referral, so an
-- unresolved outbound echo can never be replayed as an inbound customer lead.
-- Only the signed webhook's service-role caller may invoke this function.

create or replace function public.ingest_instagram_outbound_echo_v1(
  p_raw_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  v_raw public.raw_events%rowtype;
  v_echo jsonb;
  v_account text;
  v_customer text;
  v_mid text;
  v_type text;
  v_body text;
  v_occurred timestamptz;
  v_conversation_id uuid;
  v_lead_id uuid;
  v_existing public.messages%rowtype;
  v_message public.messages%rowtype;
  v_attachment jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required to ingest an Instagram echo'
      using errcode = '42501';
  end if;

  select * into v_raw
  from public.raw_events
  where id = p_raw_event_id
  for update;

  if not found or v_raw.source_system <> 'instagram'
    or v_raw.source_event_type not like 'outbound_echo:%' then
    return jsonb_build_object('ok', false, 'error', 'Invalid Instagram echo evidence');
  end if;

  v_echo := v_raw.payload -> 'outbound_echo';
  v_account := nullif(btrim(v_raw.source_account_id), '');
  v_customer := nullif(btrim(v_raw.source_subject_id), '');
  v_mid := nullif(btrim(v_raw.external_message_id), '');

  if jsonb_typeof(v_echo) <> 'object'
    or v_account is null or v_customer is null or v_mid is null
    or v_echo #>> '{sender,id}' is distinct from v_account
    or v_echo #>> '{recipient,id}' is distinct from v_customer
    or v_echo #>> '{message,mid}' is distinct from v_mid
    or v_echo #>> '{message,is_echo}' is distinct from 'true' then
    return jsonb_build_object('ok', false, 'error', 'Echo identity evidence mismatch');
  end if;

  if not exists (
    select 1 from public.integration_connections ic
    where ic.organization_id = v_raw.organization_id
      and ic.provider = 'instagram'
      and ic.status = 'connected'
      and ic.external_account_id = v_account
  ) then
    return jsonb_build_object('ok', false, 'error', 'Instagram account is not connected');
  end if;

  select c.id, c.lead_id
    into v_conversation_id, v_lead_id
  from public.conversations c
  where c.organization_id = v_raw.organization_id
    and c.channel = 'instagram'::public.contact_channel
    and c.external_account_id = v_account
    and c.external_conversation_id = v_account || ':' || v_customer
  order by c.started_at asc, c.id asc
  limit 1;

  if v_conversation_id is null or v_lead_id is null then
    perform public.set_raw_event_processing_status(
      v_raw.organization_id, 'instagram', v_raw.source_event_id,
      'failed', 'instagram_outbound_echo_v1', 'v1', 'Existing conversation not found',
      jsonb_build_object('raw_event_id', p_raw_event_id,
        'deferred', true, 'reason', 'conversation_not_found')
    );
    return jsonb_build_object('ok', true, 'processed', false,
      'deferred', true, 'reason', 'conversation_not_found');
  end if;

  -- A manual/API send might already have stored the same provider mid.
  select * into v_existing
  from public.messages m
  where m.organization_id = v_raw.organization_id
    and m.external_message_id = v_mid
  limit 1;

  if found then
    if v_existing.lead_id is distinct from v_lead_id
      or v_existing.conversation_id is distinct from v_conversation_id
      or v_existing.direction::text <> 'outbound' then
      raise exception 'Instagram echo provider mid conflicts with another CRM conversation';
    end if;

    perform public.set_raw_event_processing_status(
      v_raw.organization_id, 'instagram', v_raw.source_event_id,
      'processed', 'instagram_outbound_echo_v1', 'v1', null,
      jsonb_build_object('raw_event_id', p_raw_event_id,
        'duplicate_message', true, 'crm_message_id', v_existing.id)
    );
    return jsonb_build_object('ok', true, 'processed', false,
      'duplicate_message', true, 'crm_message_id', v_existing.id);
  end if;

  v_type := lower(coalesce(nullif(btrim(v_raw.source_event_type), ''), 'outbound_echo:unknown'));
  v_type := nullif(split_part(v_type, ':', 2), '');
  v_type := coalesce(v_type, 'unknown');
  v_attachment := v_echo #> '{message,attachments}';
  v_body := nullif(btrim(coalesce(v_echo #>> '{message,text}', '')), '');
  if v_body is null then
    v_body := case v_type
      when 'image' then '[Instagram image sent]'
      when 'video' then '[Instagram video sent]'
      when 'audio' then '[Instagram voice message sent]'
      when 'file' then '[Instagram file sent]'
      else '[Instagram outbound message]'
    end;
  end if;
  v_occurred := coalesce(v_raw.occurred_at, v_raw.received_at, now());

  select * into v_message
  from public.log_lead_interaction(
    p_lead_id => v_lead_id,
    p_channel => 'instagram'::public.contact_channel,
    p_direction => 'outbound'::public.message_direction,
    p_body => v_body,
    p_conversation_id => v_conversation_id
  );

  update public.messages
  set external_message_id = v_mid,
      message_type = v_type,
      status = 'sent',
      sent_at = v_occurred,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'provider', 'instagram',
        'source', 'signed_outbound_echo',
        'raw_event_id', p_raw_event_id,
        'attachments', coalesce(v_attachment, '[]'::jsonb)
      )
  where id = v_message.id
    and organization_id = v_raw.organization_id
    and lead_id = v_lead_id
    and conversation_id = v_conversation_id
  returning * into v_message;

  if not found then
    raise exception 'Instagram echo CRM message update failed';
  end if;

  update public.conversations
  set last_message_at = greatest(coalesce(last_message_at, v_occurred), v_occurred)
  where id = v_conversation_id and organization_id = v_raw.organization_id;

  perform public.set_raw_event_processing_status(
    v_raw.organization_id, 'instagram', v_raw.source_event_id,
    'processed', 'instagram_outbound_echo_v1', 'v1', null,
    jsonb_build_object('raw_event_id', p_raw_event_id,
      'crm_message_id', v_message.id, 'lead_id', v_lead_id,
      'conversation_id', v_conversation_id)
  );

  return jsonb_build_object('ok', true, 'processed', true,
    'crm_message_id', v_message.id, 'lead_id', v_lead_id,
    'conversation_id', v_conversation_id);
end;
$fn$;

revoke all on function public.ingest_instagram_outbound_echo_v1(uuid)
from public, anon, authenticated;
grant execute on function public.ingest_instagram_outbound_echo_v1(uuid)
to service_role;
