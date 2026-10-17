create or replace function public.claim_whatsapp_provider_send_v1(
  p_organization_id uuid,
  p_audit_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_audit public.automation_provider_send_audits%rowtype;
  v_provider_enabled boolean := false;
  v_policy jsonb := '{}'::jsonb;
  v_policy_allowed boolean := false;
  v_block_reasons jsonb := '[]'::jsonb;
  v_approval public.automation_approval_requests%rowtype;
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
    return jsonb_build_object('ok', false,'claimed', false,'provider_call_allowed', false,'customer_message_sent', false,'reason', 'audit_not_found');
  end if;

  if v_audit.channel <> 'whatsapp' or v_audit.provider <> 'meta_cloud_api' then
    return jsonb_build_object('ok', false,'claimed', false,'provider_call_allowed', false,'customer_message_sent', v_audit.customer_message_sent,'reason', 'unsupported_channel_or_provider');
  end if;

  if v_audit.request_mode <> 'live' then
    return jsonb_build_object('ok', true,'claimed', false,'status', v_audit.status,'provider_call_allowed', false,'customer_message_sent', v_audit.customer_message_sent,'reason', 'request_not_live');
  end if;

  if v_audit.status = 'sent' or v_audit.customer_message_sent = true or v_audit.provider_message_id is not null then
    return jsonb_build_object('ok', true,'claimed', false,'status', v_audit.status,'provider_call_allowed', false,'customer_message_sent', v_audit.customer_message_sent,'provider_message_id', v_audit.provider_message_id,'reason', 'already_sent_or_recorded');
  end if;

  if v_audit.status <> 'ready' then
    return jsonb_build_object('ok', true,'claimed', false,'status', v_audit.status,'provider_call_allowed', false,'customer_message_sent', v_audit.customer_message_sent,'reason', 'audit_not_ready');
  end if;

  if v_audit.approval_request_id is not null then
    select * into v_approval
    from public.automation_approval_requests ar
    where ar.id = v_audit.approval_request_id
      and ar.organization_id = p_organization_id
      and ar.workflow_id = v_audit.workflow_id
      and ar.enrollment_id = v_audit.enrollment_id
      and ar.lead_id = v_audit.lead_id;

    if v_approval.id is null or v_approval.status <> 'approved' then
      update public.automation_provider_send_audits
      set status='blocked',
          block_reasons = case
            when coalesce(block_reasons,'[]'::jsonb) @> '["approval_not_approved"]'::jsonb then coalesce(block_reasons,'[]'::jsonb)
            else coalesce(block_reasons,'[]'::jsonb) || jsonb_build_array('approval_not_approved')
          end,
          provider_error='Human approval was no longer valid before execution claim.',
          updated_at=v_now
      where id=p_audit_id and organization_id=p_organization_id;

      return jsonb_build_object('ok', true,'claimed', false,'status','blocked','provider_call_allowed', false,'customer_message_sent', false,'reason','approval_not_approved');
    end if;

    v_policy := public.resolve_whatsapp_channel_policy_v3(
      p_organization_id,
      v_audit.lead_id,
      v_audit.workflow_id,
      v_approval.template_name,
      v_approval.template_language,
      v_approval.whatsapp_account_id,
      v_approval.id,
      v_now
    );
  else
    v_policy := public.resolve_whatsapp_channel_policy_v2(
      p_organization_id,
      v_audit.lead_id,
      v_audit.workflow_id,
      null,
      null,
      v_audit.whatsapp_account_id,
      v_now
    );
  end if;

  v_policy_allowed := coalesce((v_policy ->> 'send_allowed')::boolean, false);
  if not v_policy_allowed then
    v_block_reasons := coalesce(v_policy -> 'block_reasons', '[]'::jsonb);

    update public.automation_provider_send_audits
    set status='blocked',
        policy_snapshot=v_policy,
        block_reasons=v_block_reasons,
        provider_error='Messaging policy changed before execution claim.',
        updated_at=v_now
    where id=p_audit_id and organization_id=p_organization_id;

    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'status', 'blocked',
      'provider_call_allowed', false,
      'policy_send_allowed', false,
      'block_reasons', v_block_reasons,
      'customer_message_sent', false,
      'reason', 'policy_recheck_blocked'
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
    set status='blocked',
        policy_snapshot=v_policy,
        block_reasons = case
          when coalesce(block_reasons,'[]'::jsonb) @> '["provider_send_disabled"]'::jsonb then coalesce(block_reasons,'[]'::jsonb)
          else coalesce(block_reasons,'[]'::jsonb) || jsonb_build_array('provider_send_disabled')
        end,
        provider_error='Provider send was disabled before execution claim.',
        updated_at=v_now
    where id=p_audit_id and organization_id=p_organization_id;

    return jsonb_build_object('ok', true,'claimed', false,'status','blocked','provider_call_allowed', false,'provider_send_enabled', false,'customer_message_sent', false,'reason','provider_send_disabled');
  end if;

  update public.automation_provider_send_audits
  set status='sending',
      policy_snapshot=v_policy,
      block_reasons='[]'::jsonb,
      provider_error=null,
      failed_at=null,
      updated_at=v_now
  where id=p_audit_id and organization_id=p_organization_id;

  return jsonb_build_object(
    'ok', true,
    'claimed', true,
    'audit_id', v_audit.id,
    'status','sending',
    'provider_call_allowed', true,
    'policy_send_allowed', true,
    'provider_send_enabled', true,
    'customer_message_sent', false,
    'lead_id', v_audit.lead_id,
    'workflow_id', v_audit.workflow_id,
    'enrollment_id', v_audit.enrollment_id,
    'action_run_id', v_audit.action_run_id,
    'whatsapp_account_id', v_audit.whatsapp_account_id,
    'whatsapp_template_id', v_audit.whatsapp_template_id,
    'request_payload', v_audit.request_payload,
    'policy_snapshot', v_policy,
    'idempotency_key', v_audit.idempotency_key
  );
end;
$function$;

revoke all on function public.claim_whatsapp_provider_send_v1(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_provider_send_v1(uuid,uuid,timestamptz) to service_role;
