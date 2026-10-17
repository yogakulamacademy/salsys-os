-- SalsysOS WhatsApp canonical outbound + delivery reconciliation V1.
--
-- Purpose:
--   Atomically link a successful Meta provider send to the canonical CRM
--   conversation/message model, then keep both the canonical message and
--   provider-send audit synchronized as Meta delivery/read/failure webhooks arrive.
--
-- Safety:
--   * service_role only
--   * tenant + audit + lead alignment is revalidated
--   * provider success can only be recorded from an audit currently in sending
--   * provider message IDs are tenant/provider unique
--   * idempotent retries return the already-linked canonical message
--   * delivery states never regress read/delivered messages
--   * this migration does not enable provider sending

alter table public.automation_provider_send_audits
  add column if not exists crm_message_id uuid references public.messages(id) on delete set null,
  add column if not exists provider_delivery_status text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists delivery_failed_at timestamptz,
  add column if not exists delivery_error jsonb not null default '{}'::jsonb;

create unique index if not exists automation_provider_send_audits_provider_message_uidx
  on public.automation_provider_send_audits (organization_id, provider, provider_message_id)
  where provider_message_id is not null;

create index if not exists automation_provider_send_audits_crm_message_idx
  on public.automation_provider_send_audits (organization_id, crm_message_id)
  where crm_message_id is not null;

create or replace function public.record_whatsapp_provider_send_success_v1(
  p_organization_id uuid,
  p_audit_id uuid,
  p_provider_message_id text,
  p_provider_response jsonb default '{}'::jsonb,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_provider_message_id text := nullif(btrim(coalesce(p_provider_message_id, '')), '');
  v_audit public.automation_provider_send_audits%rowtype;
  v_conversation public.conversations%rowtype;
  v_message public.messages%rowtype;
  v_template_name text;
  v_message_type text;
  v_body text;
  v_human_approved boolean := false;
  v_ai_generated boolean := false;
begin
  if p_organization_id is null or p_audit_id is null or v_provider_message_id is null then
    return jsonb_build_object(
      'ok', false,
      'recorded', false,
      'customer_message_sent', false,
      'reason', 'organization_id, audit_id and provider_message_id are required'
    );
  end if;

  if jsonb_typeof(coalesce(p_provider_response, '{}'::jsonb)) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'recorded', false,
      'customer_message_sent', false,
      'reason', 'provider_response_must_be_object'
    );
  end if;

  select *
  into v_audit
  from public.automation_provider_send_audits a
  where a.id = p_audit_id
    and a.organization_id = p_organization_id
    and a.channel = 'whatsapp'
    and a.provider = 'meta_cloud_api'
    and a.request_mode = 'live'
  for update;

  if v_audit.id is null then
    return jsonb_build_object(
      'ok', false,
      'recorded', false,
      'customer_message_sent', false,
      'reason', 'provider_send_audit_not_found'
    );
  end if;

  if v_audit.status = 'sent'
     and v_audit.customer_message_sent = true
     and v_audit.crm_message_id is not null then
    if v_audit.provider_message_id is distinct from v_provider_message_id then
      return jsonb_build_object(
        'ok', false,
        'recorded', false,
        'customer_message_sent', true,
        'reason', 'provider_message_id_mismatch'
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'recorded', true,
      'idempotent_reuse', true,
      'audit_id', v_audit.id,
      'message_id', v_audit.crm_message_id,
      'provider_message_id', v_audit.provider_message_id,
      'status', 'sent',
      'customer_message_sent', true
    );
  end if;

  if v_audit.status <> 'sending' or v_audit.customer_message_sent = true then
    return jsonb_build_object(
      'ok', false,
      'recorded', false,
      'customer_message_sent', v_audit.customer_message_sent,
      'reason', 'provider_send_audit_not_claimed_for_sending',
      'status', v_audit.status
    );
  end if;

  if not exists (
    select 1
    from public.leads l
    where l.id = v_audit.lead_id
      and l.organization_id = p_organization_id
  ) then
    raise exception 'Provider-send audit lead tenant mismatch';
  end if;

  if v_audit.whatsapp_account_id is not null
     and not exists (
       select 1
       from public.whatsapp_accounts wa
       where wa.id = v_audit.whatsapp_account_id
         and wa.organization_id = p_organization_id
         and wa.active = true
     ) then
    raise exception 'Provider-send audit WhatsApp account tenant mismatch or inactive';
  end if;

  -- A Meta retry or process retry may arrive after the canonical message was
  -- already created but before the audit update committed. Reuse by provider ID.
  select m.*
  into v_message
  from public.messages m
  where m.organization_id = p_organization_id
    and m.external_message_id = v_provider_message_id
    and m.direction = 'outbound'::public.message_direction
  limit 1;

  if v_message.id is null then
    -- Reuse the most recent open WhatsApp conversation for this lead. If none
    -- exists, create one inside the same tenant.
    select c.*
    into v_conversation
    from public.conversations c
    where c.organization_id = p_organization_id
      and c.lead_id = v_audit.lead_id
      and c.channel = 'whatsapp'::public.contact_channel
      and c.status = 'open'
    order by coalesce(c.last_message_at, c.started_at, c.created_at) desc
    limit 1
    for update;

    if v_conversation.id is null then
      insert into public.conversations (
        organization_id,
        lead_id,
        channel,
        status,
        started_at,
        last_message_at,
        metadata
      ) values (
        p_organization_id,
        v_audit.lead_id,
        'whatsapp'::public.contact_channel,
        'open',
        v_now,
        v_now,
        jsonb_build_object(
          'created_by', 'automation_whatsapp_provider_send_v1',
          'provider_send_audit_id', v_audit.id
        )
      )
      returning * into v_conversation;
    end if;

    if v_audit.whatsapp_template_id is not null then
      select t.template_name
      into v_template_name
      from public.automation_whatsapp_templates t
      where t.id = v_audit.whatsapp_template_id
        and t.organization_id = p_organization_id
        and (v_audit.whatsapp_account_id is null or t.whatsapp_account_id = v_audit.whatsapp_account_id)
      limit 1;
    end if;

    v_message_type := lower(coalesce(nullif(btrim(v_audit.request_payload ->> 'message_type'), ''), case when v_template_name is not null then 'template' else 'text' end));

    v_body := nullif(btrim(coalesce(v_audit.request_payload ->> 'body', v_audit.request_payload ->> 'text', '')), '');
    if v_body is null and v_template_name is not null then
      v_body := '[WhatsApp template: ' || v_template_name || ']';
    end if;
    if v_body is null then
      v_body := '[WhatsApp outbound message]';
    end if;

    v_human_approved := coalesce((v_audit.request_payload ->> 'human_approved')::boolean, false);
    v_ai_generated := coalesce((v_audit.request_payload ->> 'ai_generated')::boolean, false);

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
      template_key,
      status,
      ai_generated,
      human_approved,
      sent_at,
      metadata
    ) values (
      p_organization_id,
      v_conversation.id,
      v_audit.lead_id,
      v_provider_message_id,
      'outbound'::public.message_direction,
      'automation'::public.actor_type,
      'automation_provider_send:' || v_audit.id::text,
      v_message_type,
      v_body,
      v_template_name,
      'sent'::public.message_status,
      v_ai_generated,
      v_human_approved,
      v_now,
      jsonb_build_object(
        'channel', 'whatsapp',
        'provider', 'meta_cloud_api',
        'provider_message_id', v_provider_message_id,
        'provider_send_audit_id', v_audit.id,
        'whatsapp_account_id', v_audit.whatsapp_account_id,
        'whatsapp_template_id', v_audit.whatsapp_template_id,
        'workflow_id', v_audit.workflow_id,
        'enrollment_id', v_audit.enrollment_id,
        'action_run_id', v_audit.action_run_id,
        'idempotency_key', v_audit.idempotency_key
      )
    )
    returning * into v_message;

    update public.conversations c
    set last_message_at = greatest(coalesce(c.last_message_at, v_now), v_now),
        updated_at = v_now
    where c.id = v_message.conversation_id
      and c.organization_id = p_organization_id;

    update public.leads l
    set current_contact_channel = 'whatsapp'::public.contact_channel,
        first_contacted_at = coalesce(l.first_contacted_at, v_now),
        last_contacted_at = v_now,
        last_outbound_at = v_now,
        updated_at = v_now
    where l.id = v_audit.lead_id
      and l.organization_id = p_organization_id;
  end if;

  update public.automation_provider_send_audits a
  set status = 'sent',
      provider_message_id = v_provider_message_id,
      provider_response = coalesce(p_provider_response, '{}'::jsonb),
      provider_error = null,
      customer_message_sent = true,
      sent_at = coalesce(a.sent_at, v_now),
      crm_message_id = v_message.id,
      provider_delivery_status = case
        when a.provider_delivery_status in ('delivered','read') then a.provider_delivery_status
        else 'sent'
      end,
      updated_at = v_now
  where a.id = v_audit.id
    and a.organization_id = p_organization_id;

  return jsonb_build_object(
    'ok', true,
    'recorded', true,
    'idempotent_reuse', false,
    'audit_id', v_audit.id,
    'message_id', v_message.id,
    'conversation_id', v_message.conversation_id,
    'provider_message_id', v_provider_message_id,
    'status', 'sent',
    'customer_message_sent', true
  );
end;
$function$;

revoke all on function public.record_whatsapp_provider_send_success_v1(uuid,uuid,text,jsonb,timestamptz) from public;
revoke all on function public.record_whatsapp_provider_send_success_v1(uuid,uuid,text,jsonb,timestamptz) from anon;
revoke all on function public.record_whatsapp_provider_send_success_v1(uuid,uuid,text,jsonb,timestamptz) from authenticated;
grant execute on function public.record_whatsapp_provider_send_success_v1(uuid,uuid,text,jsonb,timestamptz) to service_role;

-- Preserve the existing RPC signature used by the webhook, while extending it
-- to synchronize provider-send delivery state and audit lineage.
create or replace function public.apply_whatsapp_message_status(
  p_organization_id uuid,
  p_external_message_id text,
  p_status text,
  p_status_at timestamptz default null,
  p_event_metadata jsonb default '{}'::jsonb
)
returns table(
  message_id uuid,
  organization_id uuid,
  external_message_id text,
  status public.message_status
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_external_message_id text := nullif(btrim(coalesce(p_external_message_id, '')), '');
  v_status text := lower(nullif(btrim(coalesce(p_status, '')), ''));
  v_status_at timestamptz := coalesce(p_status_at, now());
  v_event_metadata jsonb := coalesce(p_event_metadata, '{}'::jsonb);
  v_message_id uuid;
begin
  if p_organization_id is null then raise exception 'organization_id is required'; end if;
  if v_external_message_id is null then raise exception 'external_message_id is required'; end if;
  if v_status is null then raise exception 'status is required'; end if;
  if v_status not in ('sent','delivered','read','failed') then
    raise exception 'unsupported WhatsApp message status: %', v_status;
  end if;
  if jsonb_typeof(v_event_metadata) <> 'object' then
    raise exception 'event metadata must be a JSON object';
  end if;

  return query
  update public.messages m
  set status = case
        when v_status = 'read' then 'read'::public.message_status
        when v_status = 'delivered' and m.status <> 'read'::public.message_status then 'delivered'::public.message_status
        when v_status = 'failed' and m.status not in ('delivered'::public.message_status,'read'::public.message_status) then 'failed'::public.message_status
        when v_status = 'sent' and m.status = 'queued'::public.message_status then 'sent'::public.message_status
        else m.status
      end,
      sent_at = case when v_status = 'sent' then coalesce(m.sent_at, v_status_at) else m.sent_at end,
      delivered_at = case when v_status = 'delivered' then coalesce(m.delivered_at, v_status_at) else m.delivered_at end,
      read_at = case when v_status = 'read' then coalesce(m.read_at, v_status_at) else m.read_at end,
      metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
        'whatsapp_delivery_status',
        jsonb_build_object('status', v_status, 'status_at', v_status_at, 'event', v_event_metadata)
      )
  where m.organization_id = p_organization_id
    and m.external_message_id = v_external_message_id
    and m.direction = 'outbound'::public.message_direction
  returning m.id, m.organization_id, m.external_message_id, m.status;

  select m.id into v_message_id
  from public.messages m
  where m.organization_id = p_organization_id
    and m.external_message_id = v_external_message_id
    and m.direction = 'outbound'::public.message_direction
  limit 1;

  if v_message_id is not null then
    update public.automation_provider_send_audits a
    set crm_message_id = coalesce(a.crm_message_id, v_message_id),
        provider_delivery_status = case
          when v_status = 'read' then 'read'
          when v_status = 'delivered' and coalesce(a.provider_delivery_status, '') <> 'read' then 'delivered'
          when v_status = 'failed' and coalesce(a.provider_delivery_status, '') not in ('delivered','read') then 'failed'
          when v_status = 'sent' and a.provider_delivery_status is null then 'sent'
          else a.provider_delivery_status
        end,
        delivered_at = case when v_status = 'delivered' then coalesce(a.delivered_at, v_status_at) else a.delivered_at end,
        read_at = case when v_status = 'read' then coalesce(a.read_at, v_status_at) else a.read_at end,
        delivery_failed_at = case when v_status = 'failed' then coalesce(a.delivery_failed_at, v_status_at) else a.delivery_failed_at end,
        delivery_error = case when v_status = 'failed' then v_event_metadata else a.delivery_error end,
        provider_response = coalesce(a.provider_response, '{}'::jsonb) || jsonb_build_object(
          'delivery_status', jsonb_build_object('status', v_status, 'status_at', v_status_at, 'event', v_event_metadata)
        ),
        updated_at = now()
    where a.organization_id = p_organization_id
      and a.provider = 'meta_cloud_api'
      and a.channel = 'whatsapp'
      and a.provider_message_id = v_external_message_id;
  end if;
end;
$function$;

revoke all on function public.apply_whatsapp_message_status(uuid,text,text,timestamptz,jsonb) from public;
revoke all on function public.apply_whatsapp_message_status(uuid,text,text,timestamptz,jsonb) from anon;
revoke all on function public.apply_whatsapp_message_status(uuid,text,text,timestamptz,jsonb) from authenticated;
grant execute on function public.apply_whatsapp_message_status(uuid,text,text,timestamptz,jsonb) to service_role;
