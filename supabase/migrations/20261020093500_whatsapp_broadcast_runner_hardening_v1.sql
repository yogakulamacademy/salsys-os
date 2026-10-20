-- WhatsApp Broadcast Runner V1 hardening.
-- Keeps original audience eligibility immutable, permits safe re-check/re-arm of
-- provider audits that were blocked before a provider call, and attributes
-- replies only from WhatsApp conversations.

create or replace function public.rearm_whatsapp_broadcast_provider_send_v1(
  p_organization_id uuid,
  p_audit_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_audit public.automation_provider_send_audits%rowtype;
  v_policy jsonb := '{}'::jsonb;
  v_settings public.automation_provider_send_settings%rowtype;
begin
  select * into v_audit
  from public.automation_provider_send_audits a
  where a.id=p_audit_id and a.organization_id=p_organization_id
  for update;

  if v_audit.id is null then
    return jsonb_build_object('ok',false,'rearmed',false,'reason','audit_not_found');
  end if;
  if v_audit.broadcast_campaign_id is null or v_audit.broadcast_recipient_id is null then
    return jsonb_build_object('ok',false,'rearmed',false,'reason','broadcast_lineage_missing');
  end if;
  if v_audit.customer_message_sent=true or v_audit.provider_message_id is not null or v_audit.status='sent' then
    return jsonb_build_object('ok',true,'rearmed',false,'status',v_audit.status,'reason','already_sent_or_recorded');
  end if;
  if v_audit.status <> 'blocked' then
    return jsonb_build_object('ok',true,'rearmed',false,'status',v_audit.status,'reason','audit_not_blocked');
  end if;

  v_policy := public.evaluate_whatsapp_broadcast_send_policy_v1(
    p_organization_id,
    v_audit.broadcast_campaign_id,
    v_audit.broadcast_recipient_id,
    v_now
  );

  if coalesce((v_policy->>'send_allowed')::boolean,false) is not true then
    update public.automation_provider_send_audits
    set policy_snapshot=v_policy,
        block_reasons=coalesce(v_policy->'block_reasons','[]'::jsonb),
        updated_at=v_now
    where id=p_audit_id and organization_id=p_organization_id;

    return jsonb_build_object(
      'ok',true,'rearmed',false,'status','blocked','reason','broadcast_policy_still_blocked',
      'block_reasons',coalesce(v_policy->'block_reasons','[]'::jsonb)
    );
  end if;

  select * into v_settings
  from public.automation_provider_send_settings s
  where s.organization_id=p_organization_id
    and s.channel='whatsapp'
    and s.provider='meta_cloud_api'
  limit 1;

  if v_settings.id is null or v_settings.provider_send_enabled is not true then
    return jsonb_build_object(
      'ok',true,'rearmed',false,'status','blocked','reason','provider_send_disabled',
      'block_reasons',jsonb_build_array('provider_send_disabled')
    );
  end if;

  update public.automation_provider_send_audits
  set status='ready',
      policy_snapshot=v_policy,
      block_reasons='[]'::jsonb,
      provider_error=null,
      failed_at=null,
      updated_at=v_now
  where id=p_audit_id and organization_id=p_organization_id;

  update public.whatsapp_broadcast_recipients
  set status='queued',
      provider_send_audit_id=p_audit_id,
      queued_at=coalesce(queued_at,v_now),
      failed_at=null,
      exclusion_reason=null,
      updated_at=v_now
  where id=v_audit.broadcast_recipient_id
    and organization_id=p_organization_id
    and campaign_id=v_audit.broadcast_campaign_id
    and status in ('eligible','queued','failed');

  return jsonb_build_object(
    'ok',true,'rearmed',true,'status','ready','audit_id',p_audit_id,
    'provider_call_allowed',true,'customer_message_sent',false
  );
end;
$$;

-- Keep eligible_count as the approved audience snapshot count. Runtime status
-- counters move independently so historical audience review does not change.
create or replace function public.refresh_whatsapp_broadcast_campaign_counts_v1(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_now,now());
  v_queued integer := 0;
  v_sent integer := 0;
  v_delivered integer := 0;
  v_read integer := 0;
  v_replied integer := 0;
  v_failed integer := 0;
  v_open integer := 0;
begin
  select
    count(*) filter (where status='queued'),
    count(*) filter (where status in ('sent','delivered','read','replied')),
    count(*) filter (where status in ('delivered','read','replied')),
    count(*) filter (where status in ('read','replied')),
    count(*) filter (where status='replied'),
    count(*) filter (where status='failed'),
    count(*) filter (where status in ('eligible','queued'))
  into v_queued,v_sent,v_delivered,v_read,v_replied,v_failed,v_open
  from public.whatsapp_broadcast_recipients r
  where r.organization_id=p_organization_id and r.campaign_id=p_campaign_id;

  update public.whatsapp_broadcast_campaigns c
  set queued_count=v_queued,
      sent_count=v_sent,
      delivered_count=v_delivered,
      read_count=v_read,
      replied_count=v_replied,
      failed_count=v_failed,
      completed_at=case when c.status='running' and v_open=0 then coalesce(c.completed_at,v_now) else c.completed_at end,
      status=case when c.status='running' and v_open=0 then 'completed' else c.status end,
      last_runner_at=v_now,
      updated_at=v_now
  where c.id=p_campaign_id and c.organization_id=p_organization_id;
end;
$$;

-- A blocked claim means no provider call occurred. Terminal recipient conditions
-- become excluded/suppressed; transient safety gates remain retryable.
create or replace function public.sync_whatsapp_broadcast_recipient_from_audit_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_status text;
  v_reason text;
begin
  if new.broadcast_recipient_id is null or new.broadcast_campaign_id is null then
    return new;
  end if;

  if new.status='failed' then
    v_recipient_status := 'failed';
    v_reason := coalesce(new.provider_error,'provider_send_failed');
  elsif new.provider_delivery_status='read' or new.read_at is not null then
    v_recipient_status := 'read';
  elsif new.provider_delivery_status='delivered' or new.delivered_at is not null then
    v_recipient_status := 'delivered';
  elsif new.status='sent' or new.customer_message_sent=true then
    v_recipient_status := 'sent';
  elsif new.status='blocked' and coalesce(new.block_reasons,'[]'::jsonb) @> '["suppressed"]'::jsonb then
    v_recipient_status := 'suppressed';
    v_reason := 'suppressed_at_execution';
  elsif new.status='blocked' and (
    coalesce(new.block_reasons,'[]'::jsonb) @> '["verified_primary_whatsapp_required"]'::jsonb
    or coalesce(new.block_reasons,'[]'::jsonb) @> '["approved_template_required"]'::jsonb
    or coalesce(new.block_reasons,'[]'::jsonb) @> '["template_variables_not_configured"]'::jsonb
  ) then
    v_recipient_status := 'excluded';
    v_reason := coalesce(new.block_reasons->>0,'execution_policy_blocked');
  elsif new.status='blocked' then
    v_recipient_status := 'eligible';
    v_reason := coalesce(new.block_reasons->>0,new.provider_error,'temporarily_blocked');
  else
    v_recipient_status := null;
  end if;

  if v_recipient_status is not null then
    update public.whatsapp_broadcast_recipients
    set status=v_recipient_status,
        provider_send_audit_id=new.id,
        provider_message_id=coalesce(new.provider_message_id,provider_message_id),
        sent_at=coalesce(new.sent_at,sent_at),
        delivered_at=coalesce(new.delivered_at,delivered_at),
        read_at=coalesce(new.read_at,read_at),
        failed_at=case when v_recipient_status='failed' then coalesce(new.failed_at,new.delivery_failed_at,now()) else null end,
        exclusion_reason=v_reason,
        updated_at=now()
    where id=new.broadcast_recipient_id
      and organization_id=new.organization_id
      and campaign_id=new.broadcast_campaign_id;

    perform public.refresh_whatsapp_broadcast_campaign_counts_v1(new.organization_id,new.broadcast_campaign_id,now());
  end if;

  return new;
end;
$$;

-- Only an inbound message on a WhatsApp conversation can count as a broadcast
-- reply. Attribution is to the most recent sent broadcast to that lead within
-- seven days; it is operational attribution, not causal proof.
create or replace function public.mark_whatsapp_broadcast_reply_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_id uuid;
  v_campaign_id uuid;
  v_message_at timestamptz := coalesce(new.received_at,new.created_at,now());
begin
  if new.organization_id is null or new.lead_id is null or new.direction::text <> 'inbound' then
    return new;
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id=new.conversation_id
      and c.organization_id=new.organization_id
      and c.lead_id=new.lead_id
      and c.channel::text='whatsapp'
  ) then
    return new;
  end if;

  select r.id,r.campaign_id into v_recipient_id,v_campaign_id
  from public.whatsapp_broadcast_recipients r
  where r.organization_id=new.organization_id
    and r.lead_id=new.lead_id
    and r.status in ('sent','delivered','read')
    and r.sent_at is not null
    and r.sent_at <= v_message_at
    and r.sent_at >= v_message_at - interval '7 days'
  order by r.sent_at desc
  limit 1;

  if v_recipient_id is not null then
    update public.whatsapp_broadcast_recipients
    set status='replied',replied_at=v_message_at,updated_at=now()
    where id=v_recipient_id and organization_id=new.organization_id;
    perform public.refresh_whatsapp_broadcast_campaign_counts_v1(new.organization_id,v_campaign_id,now());
  end if;

  return new;
end;
$$;

grant execute on function public.rearm_whatsapp_broadcast_provider_send_v1(uuid,uuid,timestamptz) to service_role;
