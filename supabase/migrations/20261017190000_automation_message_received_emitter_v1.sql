-- SalsysOS canonical inbound-message automation event emitter V1.
-- Additive only. This migration does NOT enable workflow runtime or customer messaging.
-- Any canonical inbound CRM message now emits one tenant-safe message.received event.

create or replace function public.emit_message_received_automation_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_channel public.contact_channel;
begin
  -- This trigger is attached only to inbound inserts, but keep the guard inside
  -- the function as defense in depth if the trigger definition changes later.
  if new.direction <> 'inbound'::public.message_direction then
    return new;
  end if;

  select c.channel
  into v_channel
  from public.conversations c
  where c.id = new.conversation_id
    and c.organization_id = new.organization_id
    and c.lead_id = new.lead_id
  limit 1;

  if v_channel is null then
    raise exception
      'Unable to emit message.received: conversation % is not tenant/lead aligned',
      new.conversation_id;
  end if;

  perform public.emit_automation_event_v1(
    new.organization_id,
    'message.received',
    'salsysos.messaging',
    format('message.received:%s:v1', new.id),
    new.lead_id,
    new.conversation_id,
    new.id,
    coalesce(new.received_at, new.created_at, now()),
    jsonb_strip_nulls(
      jsonb_build_object(
        'schema_version', 1,
        'lifecycle_event', 'message.received',
        'channel', v_channel,
        'direction', new.direction,
        'sender_type', new.sender_type,
        'message_type', new.message_type,
        'message_status', new.status,
        'external_message_id', new.external_message_id,
        'automatic_event', true,
        'customer_message_sent', false
      )
    )
  );

  return new;
end;
$function$;

revoke all on function public.emit_message_received_automation_event_v1() from public;
revoke all on function public.emit_message_received_automation_event_v1() from anon;
revoke all on function public.emit_message_received_automation_event_v1() from authenticated;

-- The canonical messages table is the integration boundary. WhatsApp,
-- Instagram and future inbound adapters already converge here through the CRM
-- ingestion layer, so provider routes do not need duplicate automation writes.
drop trigger if exists messages_emit_automation_message_received_v1 on public.messages;
create trigger messages_emit_automation_message_received_v1
after insert on public.messages
for each row
when (new.direction = 'inbound'::public.message_direction)
execute function public.emit_message_received_automation_event_v1();
