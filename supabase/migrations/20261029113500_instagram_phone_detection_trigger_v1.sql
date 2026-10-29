-- Detect phone numbers shared in inbound Instagram DMs after the message is safely stored.
-- Detection is conservative and attachment failures never block message ingestion.

create or replace function public.capture_instagram_phone_from_message_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_channel text;
  v_candidate text;
  v_digits text;
  v_remainder text;
  v_international boolean := false;
  v_has_phone_intent boolean := false;
begin
  if new.direction::text <> 'inbound'
     or nullif(btrim(new.body), '') is null
  then
    return new;
  end if;

  select c.channel::text
  into v_channel
  from public.conversations c
  where c.id = new.conversation_id
    and c.organization_id = new.organization_id
    and c.lead_id = new.lead_id
  limit 1;

  if coalesce(v_channel, '') <> 'instagram' then
    return new;
  end if;

  v_candidate := substring(
    new.body
    from '(\+|00)?[0-9][0-9[:space:]().-]{6,}[0-9]'
  );

  if nullif(btrim(v_candidate), '') is null then
    return new;
  end if;

  v_international := btrim(v_candidate) ~ '^(\+|00)';
  v_digits := regexp_replace(v_candidate, '[^0-9]', '', 'g');
  if btrim(v_candidate) like '00%' then
    v_digits := substring(v_digits from 3);
  end if;

  if length(v_digits) < 8 or length(v_digits) > 15 then
    return new;
  end if;

  v_has_phone_intent := new.body ~* '\m(whatsapp|phone|mobile|contact|call|number|cell)\M';
  v_remainder := regexp_replace(new.body, regexp_replace(v_candidate, '([\[\]().+*?^$|{}\\-])', '\\\1', 'g'), '', 'g');
  v_remainder := regexp_replace(v_remainder, '[^[:alnum:]]', '', 'g');

  if not v_international
     and not v_has_phone_intent
     and length(v_remainder) > 12
  then
    return new;
  end if;

  begin
    perform public.attach_lead_phone_identity_from_message(
      new.lead_id,
      btrim(v_candidate),
      v_digits,
      coalesce(new.external_message_id, new.id::text),
      v_international
    );
  exception
    when others then
      -- Identity conflicts or malformed contact data must never reject the DM itself.
      raise warning 'Instagram phone handoff capture skipped for message % (SQLSTATE %)', new.id, sqlstate;
  end;

  return new;
end;
$function$;

revoke all on function public.capture_instagram_phone_from_message_v1()
  from public, anon, authenticated;

drop trigger if exists messages_capture_instagram_phone_v1 on public.messages;
create trigger messages_capture_instagram_phone_v1
after insert on public.messages
for each row
execute function public.capture_instagram_phone_from_message_v1();
