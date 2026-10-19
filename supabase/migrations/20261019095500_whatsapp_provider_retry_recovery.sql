-- Smart Triggers: explicit, idempotent recovery for failed WhatsApp provider sends.
-- A retry always creates a new provider-send audit, preserving the failed audit as immutable history.
-- `record` variables keep function creation compatible with environments where the
-- Smart Triggers foundation is provisioned separately from the numbered baseline migrations.

create or replace function public.prepare_failed_whatsapp_provider_retry_v1(
  p_organization_id uuid,
  p_failed_audit_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_failed record;
  v_approval record;
  v_policy jsonb := '{}'::jsonb;
  v_provider_enabled boolean := false;
  v_attempt_count integer := 0;
  v_attempt_number integer := 0;
  v_retry_key text;
  v_retry_id uuid;
  v_existing record;
  v_reasons jsonb := '[]'::jsonb;
begin
  if p_organization_id is null or p_failed_audit_id is null then
    return jsonb_build_object('ok',false,'retry_prepared',false,'provider_call_allowed',false,'customer_message_sent',false,'reason','organization_id_and_failed_audit_id_required');
  end if;

  select * into v_failed
  from public.automation_provider_send_audits a
  where a.id=p_failed_audit_id and a.organization_id=p_organization_id
  for update;

  if v_failed.id is null then
    return jsonb_build_object('ok',false,'retry_prepared',false,'provider_call_allowed',false,'customer_message_sent',false,'reason','audit_not_found');
  end if;

  if v_failed.channel <> 'whatsapp' or v_failed.provider <> 'meta_cloud_api' or v_failed.request_mode <> 'live' then
    return jsonb_build_object('ok',false,'retry_prepared',false,'provider_call_allowed',false,'customer_message_sent',v_failed.customer_message_sent,'reason','unsupported_retry_audit');
  end if;

  if v_failed.status <> 'failed' then
    return jsonb_build_object('ok',true,'retry_prepared',false,'provider_call_allowed',false,'customer_message_sent',v_failed.customer_message_sent,'status',v_failed.status,'reason','audit_not_failed');
  end if;

  if v_failed.customer_message_sent=true or v_failed.provider_message_id is not null or v_failed.crm_message_id is not null then
    return jsonb_build_object('ok',true,'retry_prepared',false,'provider_call_allowed',false,'customer_message_sent',v_failed.customer_message_sent,'status',v_failed.status,'reason','provider_acceptance_already_recorded');
  end if;

  if v_failed.approval_request_id is null then
    return jsonb_build_object('ok',true,'retry_prepared',false,'provider_call_allowed',false,'customer_message_sent',false,'reason','approval_request_required_for_retry');
  end if;

  select * into v_approval
  from public.automation_approval_requests ar
  where ar.id=v_failed.approval_request_id
    and ar.organization_id=p_organization_id
    and ar.workflow_id=v_failed.workflow_id
    and ar.enrollment_id=v_failed.enrollment_id
    and ar.lead_id=v_failed.lead_id;

  if v_approval.id is null or v_approval.status <> 'approved' then
    return jsonb_build_object('ok',true,'retry_prepared',false,'provider_call_allowed',false,'customer_message_sent',false,'reason','approval_not_approved');
  end if;

  if not exists (
    select 1 from public.automation_enrollments e
    where e.id=v_failed.enrollment_id
      and e.organization_id=p_organization_id
      and e.workflow_id=v_failed.workflow_id
      and e.lead_id=v_failed.lead_id
      and e.current_node_id=v_approval.node_id
      and e.flow_version=v_approval.flow_version
      and e.status='paused'
  ) then
    return jsonb_build_object('ok',true,'retry_prepared',false,'provider_call_allowed',false,'customer_message_sent',false,'reason','approval_enrollment_state_mismatch');
  end if;

  -- Exactly one successor is allowed for each failed audit. This makes double-clicks
  -- and concurrent retry requests reuse the same prepared retry instead of creating
  -- another provider attempt.
  v_retry_key := 'failed-audit:' || v_failed.id::text || ':whatsapp-retry:v1';

  select * into v_existing
  from public.automation_provider_send_audits a
  where a.organization_id=p_organization_id and a.idempotency_key=v_retry_key
  limit 1;

  if v_existing.id is not null then
    select count(*)::integer into v_attempt_count
    from public.automation_provider_send_audits a
    where a.organization_id=p_organization_id
      and a.approval_request_id=v_approval.id
      and a.channel='whatsapp'
      and a.provider='meta_cloud_api'
      and a.request_mode='live';

    return jsonb_build_object('ok',true,'retry_prepared',true,'audit_id',v_existing.id,'status',v_existing.status,'idempotent_reuse',true,'provider_call_allowed',v_existing.status='ready' and v_existing.customer_message_sent=false,'customer_message_sent',v_existing.customer_message_sent,'attempt_number',v_attempt_count,'max_attempts',3,'block_reasons',v_existing.block_reasons);
  end if;

  select count(*)::integer into v_attempt_count
  from public.automation_provider_send_audits a
  where a.organization_id=p_organization_id
    and a.approval_request_id=v_approval.id
    and a.channel='whatsapp'
    and a.provider='meta_cloud_api'
    and a.request_mode='live';

  -- Initial provider attempt + at most two explicit operator retries.
  if v_attempt_count >= 3 then
    return jsonb_build_object('ok',true,'retry_prepared',false,'provider_call_allowed',false,'customer_message_sent',false,'reason','provider_retry_limit_reached','attempt_count',v_attempt_count,'max_attempts',3);
  end if;

  v_attempt_number := v_attempt_count + 1;

  v_policy := public.resolve_whatsapp_channel_policy_v3(
    p_organization_id,v_failed.lead_id,v_failed.workflow_id,
    v_approval.template_name,v_approval.template_language,v_approval.whatsapp_account_id,
    v_approval.id,v_now
  );

  if coalesce((v_policy->>'send_allowed')::boolean,false) is not true then
    v_reasons := coalesce(v_policy->'block_reasons','[]'::jsonb);
    return jsonb_build_object('ok',true,'retry_prepared',false,'provider_call_allowed',false,'customer_message_sent',false,'reason','policy_recheck_blocked','attempt_count',v_attempt_count,'max_attempts',3,'block_reasons',v_reasons,'policy_snapshot',v_policy);
  end if;

  select coalesce(s.provider_send_enabled,false)
  into v_provider_enabled
  from public.automation_provider_send_settings s
  where s.organization_id=p_organization_id
    and s.channel='whatsapp'
    and s.provider='meta_cloud_api'
  limit 1;
  v_provider_enabled := coalesce(v_provider_enabled,false);

  if not v_provider_enabled then
    return jsonb_build_object('ok',true,'retry_prepared',false,'provider_call_allowed',false,'customer_message_sent',false,'reason','provider_send_disabled','attempt_count',v_attempt_count,'max_attempts',3,'block_reasons',jsonb_build_array('provider_send_disabled'));
  end if;

  insert into public.automation_provider_send_audits (
    organization_id,workflow_id,enrollment_id,action_run_id,lead_id,channel,provider,
    whatsapp_account_id,whatsapp_template_id,approval_request_id,
    request_mode,idempotency_key,status,policy_snapshot,request_payload,block_reasons,
    provider_response,customer_message_sent,prepared_at
  ) values (
    p_organization_id,v_failed.workflow_id,v_failed.enrollment_id,v_failed.action_run_id,v_failed.lead_id,'whatsapp','meta_cloud_api',
    v_failed.whatsapp_account_id,v_failed.whatsapp_template_id,v_approval.id,
    'live',v_retry_key,'ready',
    v_policy || jsonb_build_object('retry_of_audit_id',v_failed.id,'retry_attempt_number',v_attempt_number,'retry_prepared_at',v_now),
    v_failed.request_payload,'[]'::jsonb,
    jsonb_build_object('retry_of_audit_id',v_failed.id,'prior_provider_error',v_failed.provider_error,'prior_failed_at',v_failed.failed_at),
    false,v_now
  )
  on conflict (organization_id,idempotency_key) do nothing
  returning id into v_retry_id;

  if v_retry_id is null then
    select * into v_existing
    from public.automation_provider_send_audits a
    where a.organization_id=p_organization_id and a.idempotency_key=v_retry_key
    limit 1;

    return jsonb_build_object('ok',true,'retry_prepared',true,'audit_id',v_existing.id,'status',v_existing.status,'idempotent_reuse',true,'provider_call_allowed',v_existing.status='ready' and v_existing.customer_message_sent=false,'customer_message_sent',v_existing.customer_message_sent,'attempt_number',v_attempt_number,'max_attempts',3,'block_reasons',v_existing.block_reasons);
  end if;

  update public.automation_approval_requests
  set provider_send_audit_id=v_retry_id,
      updated_at=v_now,
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('provider_send_audit_id',v_retry_id,'provider_retry_of_audit_id',v_failed.id,'provider_retry_attempt_number',v_attempt_number,'provider_prepare_status','ready','customer_message_sent',false)
  where id=v_approval.id and organization_id=p_organization_id;

  return jsonb_build_object('ok',true,'retry_prepared',true,'audit_id',v_retry_id,'status','ready','idempotent_reuse',false,'provider_call_allowed',true,'customer_message_sent',false,'retry_of_audit_id',v_failed.id,'attempt_number',v_attempt_number,'max_attempts',3);
end;
$function$;

revoke all on function public.prepare_failed_whatsapp_provider_retry_v1(uuid,uuid,timestamptz) from public;
grant execute on function public.prepare_failed_whatsapp_provider_retry_v1(uuid,uuid,timestamptz) to service_role;
