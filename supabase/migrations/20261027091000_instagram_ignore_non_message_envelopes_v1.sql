-- Prevent Instagram read/delivery-style messaging envelopes from entering the
-- customer-message ingestion pipeline. These provider notifications may carry
-- sender/recipient/timestamp fields but no message/postback/referral payload.
--
-- The legacy core remains unchanged for supported customer messages. The public
-- service-role RPC becomes a thin guard that marks unsupported envelopes as
-- processed/ignored so Meta receives a successful webhook response and does not
-- amplify retries into database load.

alter function public.ingest_instagram_dm_event(uuid,text,text,text,timestamptz)
rename to ingest_instagram_dm_event_core_v1;

create or replace function public.ingest_instagram_dm_event(
  p_raw_event_id uuid,
  p_sender_username text default null,
  p_message_type text default 'text',
  p_body text default null,
  p_message_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_event public.raw_events%rowtype;
  v_has_supported_payload boolean := false;
begin
  select *
    into v_event
  from public.raw_events
  where id = p_raw_event_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Instagram raw event not found',
      'raw_event_id', p_raw_event_id
    );
  end if;

  if v_event.source_system <> 'instagram' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Raw event is not an Instagram event',
      'raw_event_id', p_raw_event_id,
      'source_system', v_event.source_system
    );
  end if;

  v_has_supported_payload :=
    coalesce(v_event.payload ? 'message', false)
    or coalesce(v_event.payload ? 'postback', false)
    or coalesce(v_event.payload ? 'referral', false);

  if not v_has_supported_payload then
    perform public.set_raw_event_processing_status(
      v_event.organization_id,
      'instagram',
      v_event.source_event_id,
      'processed',
      'instagram_dm_ingestion_guard_v1',
      'guard-v1',
      null,
      jsonb_build_object(
        'raw_event_id', p_raw_event_id,
        'ignored', true,
        'reason', 'non_message_messaging_envelope'
      )
    );

    return jsonb_build_object(
      'ok', true,
      'processed', false,
      'ignored', true,
      'reason', 'non_message_messaging_envelope',
      'raw_event_id', p_raw_event_id,
      'organization_id', v_event.organization_id
    );
  end if;

  return public.ingest_instagram_dm_event_core_v1(
    p_raw_event_id,
    p_sender_username,
    p_message_type,
    p_body,
    p_message_at
  );
end;
$function$;

revoke all on function public.ingest_instagram_dm_event(uuid,text,text,text,timestamptz)
from public, anon, authenticated;
grant execute on function public.ingest_instagram_dm_event(uuid,text,text,text,timestamptz)
to service_role;

revoke all on function public.ingest_instagram_dm_event_core_v1(uuid,text,text,text,timestamptz)
from public, anon, authenticated;
grant execute on function public.ingest_instagram_dm_event_core_v1(uuid,text,text,text,timestamptz)
to service_role;
