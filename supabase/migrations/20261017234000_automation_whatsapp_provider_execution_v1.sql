-- SalsysOS WhatsApp provider execution boundary V1.
--
-- Purpose:
--   Add atomic claim/finalize RPCs around the existing provider-send audit table.
--
-- Safety:
--   * no network/provider call is performed by SQL
--   * only service_role can execute these functions
--   * claim fails closed unless request_mode=live, status=ready, provider send is still enabled,
--     tenant/channel/provider all match, and no message has already been recorded as sent
--   * sent/failed audit finalization is idempotent and row-locked

create or replace function public.claim_whatsapp_provider_send_v1(
  p_organization_id uuid,
  p_audit_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_audit public.automation_provider_send_audits%rowtype;
  v_provider_enabled boolean := false;
begin
  if p_organization_id is null or p_audit_id is null then
    return jsonb_build_object(
      'ok', false,
      'claimed', false,
      'provider_call_allowed', false,
      'customer_message_sent', false,
      'reason', 'organization_id_and_audit_id_required'
    );
  end if;

  select * into v_audit
  from public.automation_provider_send_audits a
  where a.id = p_audit_id
    and a.organization_id = p_organization_id
  for update;

  if v_audit.id is null then
    return jsonb_build_object(
      'ok', false,
      'claimed', false,
      'provider_call_allowed', false,
      'customer_message_sent', false,
      'reason', 'audit_not_found'
    );
  end if;

  if v_audit.channel <> 'whatsapp' or v_audit.provider <> 'meta_cloud_api' then
    return jsonb_build_object(
      'ok', false,
      'claimed', false,
      'provider_call_allowed', false,
      'customer_message_sent', v_audit.customer_message_sent,
      'reason', 'unsupported_channel_or_provider'
    );
  end if;

  if v_audit.request_mode <> 'live' then
    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'status', v_audit.status,
      'provider_call_allowed', false,
      'customer_message_sent', v_audit.customer_message_sent,
      'reason', 'request_not_live'
    );
  end if;

  if v_audit.status = 'sent' or v_audit.customer_message_sent = true or v_audit.provider_message_id is not null then
    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'status', v_audit.status,
      'provider_call_allowed', false,
      'customer_message_sent', v_audit.customer_message_sent,
      'provider_message_id', v_audit.provider_message_id,
      'reason', 'already_sent_or_recorded'
    );
  end if;

  if v_audit.status <> 'ready' then
    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'status', v_audit.status,
      'provider_call_allowed', false,
      'customer_message_sent', v_audit.customer_message_sent,
      'reason', 'audit_not_ready'
    );
  end if;

  select coalesce(s.provider_send_enabled, false)
  into v_provider_enabled
  from public.automation_provider_send_settings s
  where s.organization_id = p_organization_id
    and s.channel = 'whatsapp'
    and s.provider = 'meta_cloud_api'
  limit 1;

  v_provider_enabled := coalesce(v_provider_enabled, false);

  if not v_provider_enabled then
    update public.automation_provider_send_audits
    set
      status = 'blocked',
      block_reasons = case
        when coalesce(block_reasons, '[]'::jsonb) @> '["provider_send_disabled"]'::jsonb
          then coalesce(block_reasons, '[]'::jsonb)
        else coalesce(block_reasons, '[]'::jsonb) || jsonb_build_array('provider_send_disabled')
      end,
      provider_error = 'Provider send was disabled before execution claim.',
      updated_at = v_now
    where id = p_audit_id
      and organization_id = p_organization_id;

    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'status', 'blocked',
      'provider_call_allowed', false,
      'provider_send_enabled', false,
      'customer_message_sent', false,
      'reason', 'provider_send_disabled'
    );
  end if;

  update public.automation_provider_send_audits
  set
    status = 'sending',
    provider_error = null,
    failed_at = null,
    updated_at = v_now
  where id = p_audit_id
    and organization_id = p_organization_id;

  return jsonb_build_object(
    'ok', true,
    'claimed', true,
    'audit_id', v_audit.id,
    'status', 'sending',
    'provider_call_allowed', true,
    'provider_send_enabled', true,
    'customer_message_sent', false,
    'lead_id', v_audit.lead_id,
    'workflow_id', v_audit.workflow_id,
    'enrollment_id', v_audit.enrollment_id,
    'action_run_id', v_audit.action_run_id,
    'whatsapp_account_id', v_audit.whatsapp_account_id,
    'whatsapp_template_id', v_audit.whatsapp_template_id,
    'request_payload', v_audit.request_payload,
    'policy_snapshot', v_audit.policy_snapshot,
    'idempotency_key', v_audit.idempotency_key
  );
end;
$function$;

revoke all on function public.claim_whatsapp_provider_send_v1(uuid,uuid,timestamptz) from public;
revoke all on function public.claim_whatsapp_provider_send_v1(uuid,uuid,timestamptz) from anon;
revoke all on function public.claim_whatsapp_provider_send_v1(uuid,uuid,timestamptz) from authenticated;
grant execute on function public.claim_whatsapp_provider_send_v1(uuid,uuid,timestamptz) to service_role;

create or replace function public.finalize_whatsapp_provider_send_v1(
  p_organization_id uuid,
  p_audit_id uuid,
  p_success boolean,
  p_provider_message_id text default null,
  p_provider_response jsonb default '{}'::jsonb,
  p_provider_error text default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_audit public.automation_provider_send_audits%rowtype;
  v_provider_message_id text := nullif(btrim(coalesce(p_provider_message_id, '')), '');
  v_provider_error text := nullif(btrim(coalesce(p_provider_error, '')), '');
begin
  if p_organization_id is null or p_audit_id is null or p_success is null then
    return jsonb_build_object(
      'ok', false,
      'finalized', false,
      'reason', 'organization_id_audit_id_and_success_required'
    );
  end if;

  select * into v_audit
  from public.automation_provider_send_audits a
  where a.id = p_audit_id
    and a.organization_id = p_organization_id
  for update;

  if v_audit.id is null then
    return jsonb_build_object('ok', false, 'finalized', false, 'reason', 'audit_not_found');
  end if;

  if v_audit.channel <> 'whatsapp' or v_audit.provider <> 'meta_cloud_api' then
    return jsonb_build_object('ok', false, 'finalized', false, 'reason', 'unsupported_channel_or_provider');
  end if;

  if v_audit.status = 'sent' then
    return jsonb_build_object(
      'ok', true,
      'finalized', false,
      'idempotent_reuse', true,
      'status', 'sent',
      'provider_message_id', v_audit.provider_message_id,
      'customer_message_sent', v_audit.customer_message_sent
    );
  end if;

  if v_audit.status = 'failed' and p_success = false then
    return jsonb_build_object(
      'ok', true,
      'finalized', false,
      'idempotent_reuse', true,
      'status', 'failed',
      'customer_message_sent', false
    );
  end if;

  if v_audit.status <> 'sending' then
    return jsonb_build_object(
      'ok', false,
      'finalized', false,
      'status', v_audit.status,
      'reason', 'audit_not_in_sending_state'
    );
  end if;

  if p_success then
    if v_provider_message_id is null then
      return jsonb_build_object(
        'ok', false,
        'finalized', false,
        'status', v_audit.status,
        'reason', 'provider_message_id_required_for_success'
      );
    end if;

    update public.automation_provider_send_audits
    set
      status = 'sent',
      provider_message_id = v_provider_message_id,
      provider_response = coalesce(p_provider_response, '{}'::jsonb),
      provider_error = null,
      customer_message_sent = true,
      sent_at = v_now,
      failed_at = null,
      updated_at = v_now
    where id = p_audit_id
      and organization_id = p_organization_id;

    return jsonb_build_object(
      'ok', true,
      'finalized', true,
      'status', 'sent',
      'provider_message_id', v_provider_message_id,
      'customer_message_sent', true
    );
  end if;

  update public.automation_provider_send_audits
  set
    status = 'failed',
    provider_response = coalesce(p_provider_response, '{}'::jsonb),
    provider_error = coalesce(v_provider_error, 'Provider send failed.'),
    customer_message_sent = false,
    failed_at = v_now,
    sent_at = null,
    updated_at = v_now
  where id = p_audit_id
    and organization_id = p_organization_id;

  return jsonb_build_object(
    'ok', true,
    'finalized', true,
    'status', 'failed',
    'customer_message_sent', false
  );
end;
$function$;

revoke all on function public.finalize_whatsapp_provider_send_v1(uuid,uuid,boolean,text,jsonb,text,timestamptz) from public;
revoke all on function public.finalize_whatsapp_provider_send_v1(uuid,uuid,boolean,text,jsonb,text,timestamptz) from anon;
revoke all on function public.finalize_whatsapp_provider_send_v1(uuid,uuid,boolean,text,jsonb,text,timestamptz) from authenticated;
grant execute on function public.finalize_whatsapp_provider_send_v1(uuid,uuid,boolean,text,jsonb,text,timestamptz) to service_role;
