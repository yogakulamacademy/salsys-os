-- DESIGN REHEARSAL ONLY. Existing RPCs remain unchanged and accessible as before.
-- These private adapters demonstrate revision checks in the same transaction
-- as existing policy/claim operations. No service/API grants.
create function saas_lifecycle.claim_instagram_work_preview(p_org uuid,p_run uuid,p_now timestamptz)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $fn$
begin
  if not saas_lifecycle.work_revision_allowed(p_org,'instagram',p_run) then
    return jsonb_build_object('ok',true,'claimed',false,'reason','lifecycle_work_revision_blocked');
  end if;
  return public.claim_instagram_automation_run_v1(p_org,p_run,p_now);
end;
$fn$;
revoke all on function saas_lifecycle.claim_instagram_work_preview(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;

create function saas_lifecycle.prepare_whatsapp_broadcast_preview(p_org uuid,p_campaign uuid,p_recipient uuid,p_now timestamptz)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $fn$
begin
  if not saas_lifecycle.work_revision_allowed(p_org,'whatsapp',p_campaign) then
    return jsonb_build_object('ok',true,'prepared',false,'status','blocked','provider_call_allowed',false,
      'reason','lifecycle_work_revision_blocked','retryable',false,'customer_message_sent',false);
  end if;
  return public.prepare_whatsapp_broadcast_provider_send_v1(p_org,p_campaign,p_recipient,p_now);
end;
$fn$;
revoke all on function saas_lifecycle.prepare_whatsapp_broadcast_preview(uuid,uuid,uuid,timestamptz) from public,anon,authenticated,service_role;

create function saas_lifecycle.claim_whatsapp_broadcast_preview(p_org uuid,p_audit uuid,p_now timestamptz)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $fn$
declare v_campaign uuid; v_recipient uuid;
begin
  -- Lock organization first, then the exact existing audit row. Never accept
  -- campaign lineage supplied by the caller in lieu of the persisted audit.
  if saas_lifecycle.active_work_revision(p_org) is not null then
    select broadcast_campaign_id,broadcast_recipient_id into v_campaign,v_recipient
      from public.automation_provider_send_audits where organization_id=p_org and id=p_audit for update;
    if found and v_campaign is not null and v_recipient is not null
       and saas_lifecycle.work_revision_allowed(p_org,'whatsapp',v_campaign) then
      return public.claim_whatsapp_broadcast_provider_send_v1(p_org,p_audit,p_now);
    end if;
  end if;
  return jsonb_build_object('ok',true,'claimed',false,'provider_call_allowed',false,
    'reason','lifecycle_work_revision_blocked','customer_message_sent',false);
end;
$fn$;
revoke all on function saas_lifecycle.claim_whatsapp_broadcast_preview(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
