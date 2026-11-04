-- Instagram Graph Conversations API history reconciliation.
-- Historical imports must not change stages, staff productivity or trigger automations.
-- Service-only; only existing tenant-bound CRM conversations may receive history.

create table if not exists public.instagram_history_sync_cursor_v1 (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instagram_account_id text not null,
  next_cursor text,
  completed_cycles integer not null default 0,
  conversations_scanned bigint not null default 0,
  messages_imported bigint not null default 0,
  messages_already_present bigint not null default 0,
  last_scanned_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, instagram_account_id)
);

alter table public.instagram_history_sync_cursor_v1 enable row level security;
revoke all on public.instagram_history_sync_cursor_v1 from public, anon, authenticated;
grant select, insert, update on public.instagram_history_sync_cursor_v1 to service_role;

create or replace function public.ingest_instagram_history_message_v1(p_raw_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  v_raw public.raw_events%rowtype;
  v_history jsonb;
  v_account text;
  v_customer text;
  v_mid text;
  v_from text;
  v_expected_from text;
  v_direction public.message_direction;
  v_type text;
  v_body text;
  v_at timestamptz;
  v_conversation_id uuid;
  v_lead_id uuid;
  v_inserted uuid;
  v_existing public.messages%rowtype;
  v_attachments jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required for Instagram history projection' using errcode = '42501';
  end if;

  select * into v_raw from public.raw_events where id = p_raw_event_id for update;
  if not found or v_raw.source_system <> 'instagram'
      or v_raw.source_event_type not in ('history:inbound', 'history:outbound') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_history_evidence');
  end if;

  v_history := v_raw.payload -> 'history_message';
  v_account := nullif(btrim(v_raw.source_account_id), '');
  v_customer := nullif(btrim(v_raw.source_subject_id), '');
  v_mid := nullif(btrim(v_raw.external_message_id), '');
  v_from := nullif(btrim(v_history #>> '{from,id}'), '');
  v_expected_from := case when v_raw.source_event_type = 'history:outbound'
    then v_account else v_customer end;

  if jsonb_typeof(v_history) <> 'object'
      or v_account is null or v_customer is null or v_account = v_customer
      or v_mid is null or v_from is null
      or v_from is distinct from v_expected_from
      or nullif(btrim(v_history ->> 'id'), '') is distinct from v_mid
      or coalesce(v_raw.context ->> 'provider_api', '') <> 'instagram_conversations' then
    return jsonb_build_object('ok', false, 'reason', 'history_identity_mismatch');
  end if;

  if not exists (
    select 1 from public.integration_connections ic
    where ic.organization_id = v_raw.organization_id
      and ic.provider = 'instagram' and ic.status = 'connected'
      and ic.external_account_id = v_account
  ) then
    return jsonb_build_object('ok', false, 'reason', 'account_not_connected');
  end if;

  select c.id, c.lead_id into v_conversation_id, v_lead_id
  from public.conversations c
  where c.organization_id = v_raw.organization_id
    and c.channel = 'instagram'::public.contact_channel
    and c.external_account_id = v_account
    and c.external_conversation_id = v_account || ':' || v_customer
  order by c.started_at, c.id
  limit 1;

  if v_conversation_id is null or v_lead_id is null then
    perform public.set_raw_event_processing_status(
      v_raw.organization_id, 'instagram', v_raw.source_event_id,
      'failed', 'instagram_history_reconciliation_v1', 'v1',
      'Existing Instagram CRM conversation not found',
      jsonb_build_object('raw_event_id', p_raw_event_id, 'reason', 'conversation_not_found')
    );
    return jsonb_build_object('ok', true, 'deferred', true, 'reason', 'conversation_not_found');
  end if;

  v_direction := case when v_raw.source_event_type = 'history:outbound'
    then 'outbound'::public.message_direction
    else 'inbound'::public.message_direction end;
  v_type := case
    when nullif(btrim(v_history ->> 'message'), '') is not null then 'text'
    when v_history ? 'attachments' then 'attachment'
    else 'unknown' end;
  v_body := nullif(btrim(coalesce(v_history ->> 'message', '')), '');
  if v_body is null then
    v_body := case when v_type = 'attachment'
      then '[Instagram historical attachment]'
      else '[Instagram historical message]' end;
  end if;
  v_at := coalesce(v_raw.occurred_at, v_raw.received_at, now());
  v_attachments := coalesce(v_history -> 'attachments', '[]'::jsonb);

  -- Existing provider IDs from live webhook / manual send are authoritative.
  insert into public.messages (
    organization_id, conversation_id, lead_id, external_message_id,
    direction, sender_type, sender_id, message_type, body,
    status, human_approved, sent_at, received_at, created_at, metadata
  ) values (
    v_raw.organization_id, v_conversation_id, v_lead_id, v_mid,
    v_direction,
    case when v_direction = 'outbound'::public.message_direction
      then 'human'::public.actor_type else 'lead'::public.actor_type end,
    v_from, v_type, v_body,
    case when v_direction = 'outbound'::public.message_direction
      then 'sent'::public.message_status else 'received'::public.message_status end,
    false,
    case when v_direction = 'outbound'::public.message_direction then v_at else null end,
    case when v_direction = 'inbound'::public.message_direction then v_at else null end,
    v_at,
    jsonb_build_object('provider','instagram','source','instagram_graph_history',
      'raw_event_id', p_raw_event_id, 'attachments', v_attachments,
      'historical_import', true)
  )
  on conflict (organization_id, external_message_id)
    where external_message_id is not null do nothing
  returning id into v_inserted;

  if v_inserted is null then
    select * into v_existing from public.messages m
    where m.organization_id = v_raw.organization_id
      and m.external_message_id = v_mid limit 1;
    if not found or v_existing.lead_id is distinct from v_lead_id
        or v_existing.conversation_id is distinct from v_conversation_id
        or v_existing.direction is distinct from v_direction then
      raise exception 'Instagram history provider id conflicts with existing CRM record';
    end if;
  else
    update public.conversations c
    set last_message_at = greatest(coalesce(c.last_message_at, v_at), v_at)
    where c.id = v_conversation_id and c.organization_id = v_raw.organization_id;
  end if;

  perform public.set_raw_event_processing_status(
    v_raw.organization_id, 'instagram', v_raw.source_event_id,
    'processed', 'instagram_history_reconciliation_v1', 'v1', null,
    jsonb_build_object('raw_event_id', p_raw_event_id,
      'crm_message_id', coalesce(v_inserted, v_existing.id),
      'historical_import', v_inserted is not null,
      'duplicate_message', v_inserted is null)
  );
  return jsonb_build_object('ok', true,
    'imported', v_inserted is not null,
    'duplicate_message', v_inserted is null,
    'crm_message_id', coalesce(v_inserted, v_existing.id));
end;
$fn$;

revoke all on function public.ingest_instagram_history_message_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.ingest_instagram_history_message_v1(uuid)
  to service_role;