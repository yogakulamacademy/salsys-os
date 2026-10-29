begin;

-- Normalize Instagram non-text inbound messages from the immutable raw Meta
-- payload before projecting them into CRM messages. Keep the webhook adapter
-- simple and preserve raw_events as the source of truth.

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
  v_result jsonb;
  v_effective_body text;
  v_message_type text;
  v_attachment_url text;
  v_attachment_title text;
  v_generic_elements jsonb;
  v_previous_text text;
  v_previous_digits text;
begin
  select * into v_event
  from public.raw_events
  where id = p_raw_event_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Instagram raw event not found', 'raw_event_id', p_raw_event_id);
  end if;

  if v_event.source_system <> 'instagram' then
    return jsonb_build_object('ok', false, 'error', 'Raw event is not an Instagram event', 'raw_event_id', p_raw_event_id, 'source_system', v_event.source_system);
  end if;

  v_has_supported_payload :=
    coalesce(v_event.payload ? 'message', false)
    or coalesce(v_event.payload ? 'postback', false)
    or coalesce(v_event.payload ? 'referral', false);

  if not v_has_supported_payload then
    perform public.set_raw_event_processing_status(
      v_event.organization_id, 'instagram', v_event.source_event_id,
      'processed', 'instagram_dm_ingestion_guard_v1', 'guard-v1', null,
      jsonb_build_object('raw_event_id', p_raw_event_id, 'ignored', true, 'reason', 'non_message_messaging_envelope')
    );

    return jsonb_build_object(
      'ok', true, 'processed', false, 'ignored', true,
      'reason', 'non_message_messaging_envelope',
      'raw_event_id', p_raw_event_id,
      'organization_id', v_event.organization_id
    );
  end if;

  v_message_type := lower(coalesce(nullif(btrim(p_message_type), ''), 'unknown'));
  v_effective_body := nullif(btrim(coalesce(p_body, '')), '');
  v_attachment_url := nullif(btrim(coalesce(v_event.payload #>> '{message,attachments,0,payload,url}', '')), '');
  v_attachment_title := nullif(btrim(coalesce(v_event.payload #>> '{message,attachments,0,payload,title}', '')), '');
  v_generic_elements := v_event.payload #> '{message,attachments,0,payload,generic,elements}';

  if v_message_type = 'story_reply' and v_effective_body is not null then
    v_effective_body := v_effective_body || E'\n\n↳ Replied to your Instagram story';
  end if;

  if v_effective_body is null then
    case v_message_type
      when 'ig_reel' then
        v_effective_body := 'Shared an Instagram reel' ||
          case when v_attachment_url is not null then E'\n' || v_attachment_url else '' end;

      when 'ig_post' then
        v_effective_body := 'Shared an Instagram post' ||
          case when v_attachment_title is not null then E'\n' || left(v_attachment_title, 900) else '' end;

      when 'image' then
        v_effective_body := 'Shared an Instagram image' ||
          case when v_attachment_url is not null then E'\n' || v_attachment_url else '' end;

      when 'audio' then
        v_effective_body := 'Shared an Instagram voice message' ||
          case when v_attachment_url is not null then E'\n' || v_attachment_url else '' end;

      when 'video' then
        v_effective_body := 'Shared an Instagram video' ||
          case when v_attachment_url is not null then E'\n' || v_attachment_url else '' end;

      when 'file' then
        v_effective_body := 'Shared an Instagram file' ||
          case when v_attachment_url is not null then E'\n' || v_attachment_url else '' end;

      when 'story_mention' then
        v_effective_body := 'Mentioned you in an Instagram story' ||
          case when v_attachment_url is not null then E'\n' || v_attachment_url else '' end;

      when 'template' then
        -- Production evidence shows Meta emits an empty generic template a few
        -- hundred milliseconds after a user sends contact details. When that
        -- exact pattern is present, keep the raw event for audit but do not
        -- project a duplicate customer-visible CRM message.
        if jsonb_typeof(v_generic_elements) = 'array'
           and jsonb_array_length(v_generic_elements) = 0 then
          select nullif(btrim(coalesce(previous.payload #>> '{message,text}', '')), '')
            into v_previous_text
          from public.raw_events previous
          where previous.organization_id = v_event.organization_id
            and previous.source_system = 'instagram'
            and previous.source_subject_id = v_event.source_subject_id
            and previous.id <> v_event.id
            and previous.occurred_at is not null
            and v_event.occurred_at is not null
            and previous.occurred_at between v_event.occurred_at - interval '2 seconds' and v_event.occurred_at
            and previous.payload #>> '{message,text}' is not null
          order by previous.occurred_at desc
          limit 1;

          v_previous_digits := regexp_replace(coalesce(v_previous_text, ''), '[^0-9]', '', 'g');

          if char_length(v_previous_digits) between 7 and 15 then
            perform public.set_raw_event_processing_status(
              v_event.organization_id, 'instagram', v_event.source_event_id,
              'processed', 'instagram_rich_inbound_v1', 'rich-inbound-v1', null,
              jsonb_build_object(
                'raw_event_id', p_raw_event_id,
                'ignored', true,
                'reason', 'instagram_native_contact_share_duplicate'
              )
            );

            return jsonb_build_object(
              'ok', true,
              'processed', false,
              'ignored', true,
              'reason', 'instagram_native_contact_share_duplicate',
              'raw_event_id', p_raw_event_id,
              'organization_id', v_event.organization_id
            );
          end if;
        end if;

        if jsonb_typeof(v_generic_elements) = 'array'
           and jsonb_array_length(v_generic_elements) > 0 then
          v_attachment_title := nullif(btrim(coalesce(v_generic_elements #>> '{0,title}', '')), '');
          v_attachment_url := nullif(btrim(coalesce(v_generic_elements #>> '{0,default_action,url}', '')), '');
          v_effective_body := 'Shared an Instagram item' ||
            case when v_attachment_title is not null then E'\n' || left(v_attachment_title, 900) else '' end ||
            case when v_attachment_url is not null then E'\n' || v_attachment_url else '' end;
        else
          v_effective_body := 'Shared an Instagram item';
        end if;

      when 'unsupported' then
        v_effective_body := 'Instagram sent a message type that is not available through the API.';

      else
        v_effective_body := null;
    end case;
  end if;

  v_result := public.ingest_instagram_dm_event_core_v1(
    p_raw_event_id, p_sender_username, p_message_type, v_effective_body, p_message_at
  );

  if coalesce((v_result ->> 'ok')::boolean, false) then
    return v_result;
  end if;

  -- Raw evidence is already durable and the core persists its failure state.
  -- Avoid asking Meta to redeliver the whole envelope; recovery remains internal.
  return jsonb_build_object(
    'ok', true,
    'processed', false,
    'deferred', true,
    'reason', 'crm_processing_deferred',
    'raw_event_id', p_raw_event_id,
    'organization_id', v_event.organization_id
  );
end;
$function$;

revoke all on function public.ingest_instagram_dm_event(uuid,text,text,text,timestamptz)
from public, anon, authenticated;
grant execute on function public.ingest_instagram_dm_event(uuid,text,text,text,timestamptz)
to service_role;

-- Backfill only generic Instagram placeholders that can be deterministically
-- improved from their immutable raw payload. Do not alter real customer text.
update public.messages m
set body = case
  when r.source_event_type = 'message:ig_reel' then
    'Shared an Instagram reel' ||
      case when nullif(btrim(coalesce(r.payload #>> '{message,attachments,0,payload,url}', '')), '') is not null
        then E'\n' || (r.payload #>> '{message,attachments,0,payload,url}') else '' end

  when r.source_event_type = 'message:ig_post' then
    'Shared an Instagram post' ||
      case when nullif(btrim(coalesce(r.payload #>> '{message,attachments,0,payload,title}', '')), '') is not null
        then E'\n' || left(r.payload #>> '{message,attachments,0,payload,title}', 900) else '' end

  when r.source_event_type = 'message:image' then
    'Shared an Instagram image' ||
      case when nullif(btrim(coalesce(r.payload #>> '{message,attachments,0,payload,url}', '')), '') is not null
        then E'\n' || (r.payload #>> '{message,attachments,0,payload,url}') else '' end

  when r.source_event_type = 'message:audio' then
    'Shared an Instagram voice message' ||
      case when nullif(btrim(coalesce(r.payload #>> '{message,attachments,0,payload,url}', '')), '') is not null
        then E'\n' || (r.payload #>> '{message,attachments,0,payload,url}') else '' end

  when r.source_event_type = 'message:video' then
    'Shared an Instagram video' ||
      case when nullif(btrim(coalesce(r.payload #>> '{message,attachments,0,payload,url}', '')), '') is not null
        then E'\n' || (r.payload #>> '{message,attachments,0,payload,url}') else '' end

  when r.source_event_type = 'message:file' then
    'Shared an Instagram file' ||
      case when nullif(btrim(coalesce(r.payload #>> '{message,attachments,0,payload,url}', '')), '') is not null
        then E'\n' || (r.payload #>> '{message,attachments,0,payload,url}') else '' end

  when r.source_event_type = 'message:story_mention' then
    'Mentioned you in an Instagram story' ||
      case when nullif(btrim(coalesce(r.payload #>> '{message,attachments,0,payload,url}', '')), '') is not null
        then E'\n' || (r.payload #>> '{message,attachments,0,payload,url}') else '' end

  when r.source_event_type = 'message:unsupported' then
    'Instagram sent a message type that is not available through the API.'

  when r.source_event_type = 'message:template' then
    'Contact details shared on Instagram'

  else m.body
end
from public.instagram_crm_message_links l
join public.raw_events r
  on r.organization_id = l.organization_id
 and r.id = l.raw_event_id
join public.conversations c
  on c.organization_id = l.organization_id
 and c.id = l.conversation_id
where m.organization_id = l.organization_id
  and m.external_message_id = l.external_message_id
  and c.channel = 'instagram'
  and m.body like '[Instagram % message]'
  and r.source_event_type in (
    'message:ig_reel',
    'message:ig_post',
    'message:image',
    'message:audio',
    'message:video',
    'message:file',
    'message:story_mention',
    'message:unsupported',
    'message:template'
  );

commit;
