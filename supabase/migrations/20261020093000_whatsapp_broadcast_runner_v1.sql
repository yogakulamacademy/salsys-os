-- Guarded WhatsApp Broadcast Runner V1
-- Adds campaign-aware provider audits and a claim path that preserves the
-- existing WhatsApp policy/provider/pilot safety model. No production gate is
-- enabled by this migration.

alter table public.automation_provider_send_audits
  add column if not exists broadcast_campaign_id uuid references public.whatsapp_broadcast_campaigns(id) on delete set null,
  add column if not exists broadcast_recipient_id uuid references public.whatsapp_broadcast_recipients(id) on delete set null;

create index if not exists automation_provider_send_audits_broadcast_campaign_idx
  on public.automation_provider_send_audits (organization_id, broadcast_campaign_id, prepared_at desc)
  where broadcast_campaign_id is not null;
create index if not exists automation_provider_send_audits_broadcast_recipient_idx
  on public.automation_provider_send_audits (organization_id, broadcast_recipient_id, prepared_at desc)
  where broadcast_recipient_id is not null;

alter table public.whatsapp_broadcast_campaigns
  add column if not exists execution_requested_at timestamptz,
  add column if not exists execution_requested_by uuid,
  add column if not exists last_runner_at timestamptz;

create or replace function public.evaluate_whatsapp_broadcast_send_policy_v1(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_recipient_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_campaign public.whatsapp_broadcast_campaigns%rowtype;
  v_recipient public.whatsapp_broadcast_recipients%rowtype;
  v_template public.automation_whatsapp_templates%rowtype;
  v_base jsonb := '{}'::jsonb;
  v_template_policy jsonb := '{}'::jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_reason text;
  v_contact_ok boolean := false;
  v_send_allowed boolean := false;
begin
  if p_organization_id is null or p_campaign_id is null or p_recipient_id is null then
    return jsonb_build_object(
      'ok',false,'send_allowed',false,'customer_message_sent',false,
      'block_reasons',jsonb_build_array('organization_campaign_and_recipient_required')
    );
  end if;

  select * into v_campaign
  from public.whatsapp_broadcast_campaigns c
  where c.id=p_campaign_id and c.organization_id=p_organization_id;

  select * into v_recipient
  from public.whatsapp_broadcast_recipients r
  where r.id=p_recipient_id
    and r.organization_id=p_organization_id
    and r.campaign_id=p_campaign_id;

  if v_campaign.id is null then
    return jsonb_build_object('ok',false,'send_allowed',false,'customer_message_sent',false,'block_reasons',jsonb_build_array('campaign_not_found'));
  end if;
  if v_recipient.id is null then
    return jsonb_build_object('ok',false,'send_allowed',false,'customer_message_sent',false,'block_reasons',jsonb_build_array('recipient_not_found'));
  end if;

  if v_campaign.status <> 'running' then
    v_reasons := v_reasons || jsonb_build_array('campaign_not_running');
  end if;
  if v_campaign.approved_at is null or v_campaign.approved_by is null then
    v_reasons := v_reasons || jsonb_build_array('campaign_human_approval_required');
  end if;
  if v_campaign.scheduled_at is not null and v_campaign.scheduled_at > v_now then
    v_reasons := v_reasons || jsonb_build_array('campaign_not_due');
  end if;
  if v_recipient.status not in ('eligible','queued') then
    v_reasons := v_reasons || jsonb_build_array('recipient_not_executable');
  end if;

  select * into v_template
  from public.automation_whatsapp_templates t
  where t.id=v_campaign.whatsapp_template_id
    and t.organization_id=p_organization_id
    and t.approval_status='approved'
    and t.active=true
  limit 1;

  if v_template.id is null then
    v_reasons := v_reasons || jsonb_build_array('approved_template_required');
  else
    v_template_policy := public.evaluate_whatsapp_template_v1(
      p_organization_id,
      v_template.template_name,
      v_template.language_code,
      v_template.whatsapp_account_id
    );
    if coalesce((v_template_policy->>'template_eligible')::boolean,false) is not true then
      v_reasons := v_reasons || coalesce(v_template_policy->'block_reasons',jsonb_build_array('template_not_eligible'));
    end if;

    -- Broadcast V1 intentionally sends only templates that do not require
    -- dynamic header/body variables. Variable mapping is a separate explicit
    -- operator feature rather than silently inventing customer-facing values.
    if coalesce((v_template.parameter_schema->>'body_variable_count')::integer,0) > 0
       or coalesce((v_template.parameter_schema->>'header_variable_count')::integer,0) > 0 then
      v_reasons := v_reasons || jsonb_build_array('template_variables_not_configured');
    end if;
  end if;

  select exists(
    select 1
    from public.lead_contacts lc
    where lc.organization_id=p_organization_id
      and lc.lead_id=v_recipient.lead_id
      and lc.contact_type='whatsapp'
      and lc.verified=true
      and lc.is_primary=true
      and nullif(btrim(coalesce(lc.normalized_value,lc.value,'')),'') is not null
  ) into v_contact_ok;

  if not v_contact_ok then
    v_reasons := v_reasons || jsonb_build_array('verified_primary_whatsapp_required');
  end if;

  v_base := public.evaluate_automation_send_policy_v1(
    p_organization_id,
    v_recipient.lead_id,
    'whatsapp',
    null,
    v_now
  );

  for v_reason in
    select value from jsonb_array_elements_text(coalesce(v_base->'block_reasons','[]'::jsonb))
  loop
    -- An explicit approved broadcast campaign satisfies only the two generic
    -- automation authorization blockers. Suppression, policy disablement,
    -- frequency limits and every other blocker remain authoritative.
    if v_reason not in ('autonomous_send_disabled','human_approval_required') then
      v_reasons := v_reasons || jsonb_build_array(v_reason);
    end if;
  end loop;

  v_send_allowed :=
    jsonb_array_length(v_reasons)=0
    and coalesce((v_base->>'suppressed')::boolean,false)=false
    and coalesce((v_base->>'policy_missing')::boolean,true)=false
    and coalesce((v_base->>'policy_enabled')::boolean,false)=true
    and coalesce((v_base->>'frequency_limited')::boolean,true)=false
    and v_contact_ok=true
    and v_template.id is not null;

  return jsonb_build_object(
    'ok',true,
    'send_allowed',v_send_allowed,
    'campaign_id',v_campaign.id,
    'recipient_id',v_recipient.id,
    'lead_id',v_recipient.lead_id,
    'campaign_human_approval_satisfied',(v_campaign.approved_at is not null and v_campaign.approved_by is not null),
    'base_policy',v_base,
    'template_policy',v_template_policy,
    'block_reasons',v_reasons,
    'customer_message_sent',false
  );
end;
$$;

create or replace function public.prepare_whatsapp_broadcast_provider_send_v1(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_recipient_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_campaign public.whatsapp_broadcast_campaigns%rowtype;
  v_recipient public.whatsapp_broadcast_recipients%rowtype;
  v_template public.automation_whatsapp_templates%rowtype;
  v_settings public.automation_provider_send_settings%rowtype;
  v_policy jsonb := '{}'::jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_key text;
  v_existing public.automation_provider_send_audits%rowtype;
  v_audit_id uuid;
begin
  if p_organization_id is null or p_campaign_id is null or p_recipient_id is null then
    return jsonb_build_object('ok',false,'prepared',false,'reason','organization_campaign_and_recipient_required');
  end if;

  select * into v_campaign
  from public.whatsapp_broadcast_campaigns c
  where c.id=p_campaign_id and c.organization_id=p_organization_id
  for update;

  select * into v_recipient
  from public.whatsapp_broadcast_recipients r
  where r.id=p_recipient_id
    and r.organization_id=p_organization_id
    and r.campaign_id=p_campaign_id
  for update;

  if v_campaign.id is null or v_recipient.id is null then
    return jsonb_build_object('ok',false,'prepared',false,'reason','campaign_or_recipient_not_found');
  end if;

  v_key := 'whatsapp-broadcast:' || p_campaign_id::text || ':' || p_recipient_id::text;

  select * into v_existing
  from public.automation_provider_send_audits a
  where a.organization_id=p_organization_id and a.idempotency_key=v_key
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'ok',true,'prepared',false,'idempotent_reuse',true,
      'audit_id',v_existing.id,'status',v_existing.status,
      'customer_message_sent',v_existing.customer_message_sent,
      'provider_call_allowed',(v_existing.status='ready')
    );
  end if;

  v_policy := public.evaluate_whatsapp_broadcast_send_policy_v1(
    p_organization_id,p_campaign_id,p_recipient_id,v_now
  );
  v_reasons := coalesce(v_policy->'block_reasons','[]'::jsonb);

  if coalesce((v_policy->>'send_allowed')::boolean,false) is not true then
    if v_reasons @> '["suppressed"]'::jsonb or v_reasons @> '["active_suppression"]'::jsonb then
      update public.whatsapp_broadcast_recipients
      set status='suppressed',exclusion_reason='suppressed_at_execution',updated_at=v_now
      where id=p_recipient_id and organization_id=p_organization_id;
    elsif v_reasons @> '["verified_primary_whatsapp_required"]'::jsonb
       or v_reasons @> '["approved_template_required"]'::jsonb
       or v_reasons @> '["template_variables_not_configured"]'::jsonb then
      update public.whatsapp_broadcast_recipients
      set status='excluded',exclusion_reason=coalesce(v_reasons->>0,'execution_policy_blocked'),updated_at=v_now
      where id=p_recipient_id and organization_id=p_organization_id;
    end if;

    return jsonb_build_object(
      'ok',true,'prepared',false,'status','blocked','provider_call_allowed',false,
      'policy_snapshot',v_policy,'block_reasons',v_reasons,
      'retryable',not (
        v_reasons @> '["verified_primary_whatsapp_required"]'::jsonb
        or v_reasons @> '["approved_template_required"]'::jsonb
        or v_reasons @> '["template_variables_not_configured"]'::jsonb
        or v_reasons @> '["suppressed"]'::jsonb
        or v_reasons @> '["active_suppression"]'::jsonb
      ),
      'customer_message_sent',false
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
      'ok',true,'prepared',false,'status','blocked','provider_call_allowed',false,
      'block_reasons',jsonb_build_array('provider_send_disabled'),
      'retryable',true,'customer_message_sent',false
    );
  end if;

  select * into v_template
  from public.automation_whatsapp_templates t
  where t.id=v_campaign.whatsapp_template_id
    and t.organization_id=p_organization_id
    and t.approval_status='approved'
    and t.active=true
  limit 1;

  insert into public.automation_provider_send_audits (
    organization_id,workflow_id,enrollment_id,action_run_id,lead_id,
    channel,provider,whatsapp_account_id,whatsapp_template_id,
    request_mode,idempotency_key,status,policy_snapshot,request_payload,
    block_reasons,customer_message_sent,prepared_at,
    broadcast_campaign_id,broadcast_recipient_id
  ) values (
    p_organization_id,null,null,null,v_recipient.lead_id,
    'whatsapp','meta_cloud_api',v_template.whatsapp_account_id,v_template.id,
    'live',v_key,'ready',v_policy,
    jsonb_build_object('message_type','template','template',jsonb_build_object()),
    '[]'::jsonb,false,v_now,p_campaign_id,p_recipient_id
  ) returning id into v_audit_id;

  update public.whatsapp_broadcast_recipients
  set status='queued',provider_send_audit_id=v_audit_id,queued_at=v_now,updated_at=v_now
  where id=p_recipient_id and organization_id=p_organization_id;

  return jsonb_build_object(
    'ok',true,'prepared',true,'audit_id',v_audit_id,'status','ready',
    'provider_call_allowed',true,'policy_snapshot',v_policy,
    'block_reasons','[]'::jsonb,'customer_message_sent',false
  );
end;
$$;

create or replace function public.claim_whatsapp_broadcast_provider_send_v1(
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
  v_reasons jsonb := '[]'::jsonb;
  v_settings public.automation_provider_send_settings%rowtype;
  v_pilot_claimed integer := 0;
begin
  select * into v_audit
  from public.automation_provider_send_audits a
  where a.id=p_audit_id and a.organization_id=p_organization_id
  for update;

  if v_audit.id is null then
    return jsonb_build_object('ok',false,'claimed',false,'provider_call_allowed',false,'reason','audit_not_found','customer_message_sent',false);
  end if;
  if v_audit.broadcast_campaign_id is null or v_audit.broadcast_recipient_id is null then
    return jsonb_build_object('ok',false,'claimed',false,'provider_call_allowed',false,'reason','broadcast_lineage_missing','customer_message_sent',false);
  end if;
  if v_audit.request_mode <> 'live' then
    return jsonb_build_object('ok',true,'claimed',false,'status',v_audit.status,'provider_call_allowed',false,'reason','request_not_live','customer_message_sent',v_audit.customer_message_sent);
  end if;
  if v_audit.status='sent' or v_audit.customer_message_sent=true or v_audit.provider_message_id is not null then
    return jsonb_build_object('ok',true,'claimed',false,'status',v_audit.status,'provider_call_allowed',false,'reason','already_sent_or_recorded','provider_message_id',v_audit.provider_message_id,'customer_message_sent',v_audit.customer_message_sent);
  end if;
  if v_audit.status <> 'ready' then
    return jsonb_build_object('ok',true,'claimed',false,'status',v_audit.status,'provider_call_allowed',false,'reason','audit_not_ready','customer_message_sent',v_audit.customer_message_sent);
  end if;

  v_policy := public.evaluate_whatsapp_broadcast_send_policy_v1(
    p_organization_id,v_audit.broadcast_campaign_id,v_audit.broadcast_recipient_id,v_now
  );

  if coalesce((v_policy->>'send_allowed')::boolean,false) is not true then
    v_reasons := coalesce(v_policy->'block_reasons','[]'::jsonb);
    update public.automation_provider_send_audits
    set status='blocked',policy_snapshot=v_policy,block_reasons=v_reasons,
        provider_error='Broadcast policy changed before execution claim.',updated_at=v_now
    where id=p_audit_id and organization_id=p_organization_id;
    return jsonb_build_object('ok',true,'claimed',false,'status','blocked','provider_call_allowed',false,'policy_send_allowed',false,'block_reasons',v_reasons,'customer_message_sent',false,'reason','broadcast_policy_recheck_blocked');
  end if;

  select * into v_settings
  from public.automation_provider_send_settings s
  where s.organization_id=p_organization_id
    and s.channel='whatsapp'
    and s.provider='meta_cloud_api'
  limit 1
  for update;

  if v_settings.id is null or v_settings.provider_send_enabled is not true then
    update public.automation_provider_send_audits
    set status='blocked',policy_snapshot=v_policy,
        block_reasons=jsonb_build_array('provider_send_disabled'),
        provider_error='Provider send was disabled before broadcast execution claim.',updated_at=v_now
    where id=p_audit_id and organization_id=p_organization_id;
    return jsonb_build_object('ok',true,'claimed',false,'status','blocked','provider_call_allowed',false,'provider_send_enabled',false,'customer_message_sent',false,'reason','provider_send_disabled');
  end if;

  -- Preserve the exact same production pilot controls as the existing
  -- Smart Triggers claim path.
  if v_settings.pilot_mode_enabled is true then
    if v_settings.pilot_lead_id is null then
      update public.automation_provider_send_audits
      set status='blocked',block_reasons=jsonb_build_array('pilot_lead_not_configured'),provider_error='Provider pilot mode has no pilot lead.',updated_at=v_now
      where id=p_audit_id and organization_id=p_organization_id;
      return jsonb_build_object('ok',true,'claimed',false,'status','blocked','provider_call_allowed',false,'reason','pilot_lead_not_configured','customer_message_sent',false);
    end if;

    if v_settings.pilot_lead_id is distinct from v_audit.lead_id
       or not exists(select 1 from public.leads l where l.id=v_settings.pilot_lead_id and l.organization_id=p_organization_id) then
      update public.automation_provider_send_audits
      set status='blocked',block_reasons=jsonb_build_array('pilot_lead_not_allowlisted'),provider_error='Provider pilot mode blocked a non-allowlisted broadcast recipient.',updated_at=v_now
      where id=p_audit_id and organization_id=p_organization_id;
      return jsonb_build_object('ok',true,'claimed',false,'status','blocked','provider_call_allowed',false,'reason','pilot_lead_not_allowlisted','customer_message_sent',false);
    end if;

    if v_settings.pilot_require_verified_primary_whatsapp is true
       and not exists(
         select 1 from public.lead_contacts lc
         where lc.organization_id=p_organization_id
           and lc.lead_id=v_settings.pilot_lead_id
           and lc.contact_type='whatsapp'
           and lc.verified=true
           and lc.is_primary=true
           and nullif(btrim(coalesce(lc.normalized_value,lc.value,'')),'') is not null
       ) then
      update public.automation_provider_send_audits
      set status='blocked',block_reasons=jsonb_build_array('pilot_verified_primary_whatsapp_required'),provider_error='Pilot requires a verified primary WhatsApp contact.',updated_at=v_now
      where id=p_audit_id and organization_id=p_organization_id;
      return jsonb_build_object('ok',true,'claimed',false,'status','blocked','provider_call_allowed',false,'reason','pilot_verified_primary_whatsapp_required','customer_message_sent',false);
    end if;

    if v_settings.pilot_started_at is null then
      update public.automation_provider_send_audits
      set status='blocked',block_reasons=jsonb_build_array('pilot_not_started'),provider_error='Provider pilot has no start timestamp.',updated_at=v_now
      where id=p_audit_id and organization_id=p_organization_id;
      return jsonb_build_object('ok',true,'claimed',false,'status','blocked','provider_call_allowed',false,'reason','pilot_not_started','customer_message_sent',false);
    end if;

    select count(*) into v_pilot_claimed
    from public.automation_provider_send_audits a
    where a.organization_id=p_organization_id
      and a.channel='whatsapp'
      and a.provider='meta_cloud_api'
      and a.prepared_at>=v_settings.pilot_started_at
      and a.status in ('sending','sent')
      and a.id<>v_audit.id;

    if v_pilot_claimed>=v_settings.pilot_max_messages then
      update public.automation_provider_send_audits
      set status='blocked',block_reasons=jsonb_build_array('pilot_send_cap_reached'),provider_error='Provider pilot message cap was reached.',updated_at=v_now
      where id=p_audit_id and organization_id=p_organization_id;
      return jsonb_build_object('ok',true,'claimed',false,'status','blocked','provider_call_allowed',false,'reason','pilot_send_cap_reached','pilot_claimed_count',v_pilot_claimed,'pilot_max_messages',v_settings.pilot_max_messages,'customer_message_sent',false);
    end if;
  end if;

  update public.automation_provider_send_audits
  set status='sending',policy_snapshot=v_policy,block_reasons='[]'::jsonb,provider_error=null,failed_at=null,updated_at=v_now
  where id=p_audit_id and organization_id=p_organization_id;

  return jsonb_build_object(
    'ok',true,'claimed',true,'audit_id',v_audit.id,'status','sending','provider_call_allowed',true,
    'policy_send_allowed',true,'provider_send_enabled',true,'pilot_mode_enabled',coalesce(v_settings.pilot_mode_enabled,false),
    'pilot_require_verified_primary_whatsapp',coalesce(v_settings.pilot_require_verified_primary_whatsapp,true),
    'pilot_max_messages',v_settings.pilot_max_messages,'customer_message_sent',false,'lead_id',v_audit.lead_id,
    'workflow_id',v_audit.workflow_id,'enrollment_id',v_audit.enrollment_id,'action_run_id',v_audit.action_run_id,
    'whatsapp_account_id',v_audit.whatsapp_account_id,'whatsapp_template_id',v_audit.whatsapp_template_id,
    'request_payload',v_audit.request_payload,'policy_snapshot',v_policy,'idempotency_key',v_audit.idempotency_key,
    'broadcast_campaign_id',v_audit.broadcast_campaign_id,'broadcast_recipient_id',v_audit.broadcast_recipient_id
  );
end;
$$;

create or replace function public.claim_whatsapp_provider_send_v2(
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
  v_campaign_id uuid;
begin
  select broadcast_campaign_id into v_campaign_id
  from public.automation_provider_send_audits
  where id=p_audit_id and organization_id=p_organization_id;

  if v_campaign_id is not null then
    return public.claim_whatsapp_broadcast_provider_send_v1(p_organization_id,p_audit_id,p_now);
  end if;

  return public.claim_whatsapp_provider_send_v1(p_organization_id,p_audit_id,p_now);
end;
$$;

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
  v_eligible integer := 0;
begin
  select
    count(*) filter (where status='queued'),
    count(*) filter (where status in ('sent','delivered','read','replied')),
    count(*) filter (where status in ('delivered','read','replied')),
    count(*) filter (where status in ('read','replied')),
    count(*) filter (where status='replied'),
    count(*) filter (where status='failed'),
    count(*) filter (where status in ('eligible','queued')),
    count(*) filter (where status not in ('excluded','suppressed','cancelled'))
  into v_queued,v_sent,v_delivered,v_read,v_replied,v_failed,v_open,v_eligible
  from public.whatsapp_broadcast_recipients r
  where r.organization_id=p_organization_id and r.campaign_id=p_campaign_id;

  update public.whatsapp_broadcast_campaigns c
  set queued_count=v_queued,
      sent_count=v_sent,
      delivered_count=v_delivered,
      read_count=v_read,
      replied_count=v_replied,
      failed_count=v_failed,
      eligible_count=v_eligible,
      completed_at=case when c.status='running' and v_open=0 then coalesce(c.completed_at,v_now) else c.completed_at end,
      status=case when c.status='running' and v_open=0 then 'completed' else c.status end,
      last_runner_at=v_now,
      updated_at=v_now
  where c.id=p_campaign_id and c.organization_id=p_organization_id;
end;
$$;

create or replace function public.sync_whatsapp_broadcast_recipient_from_audit_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_status text;
begin
  if new.broadcast_recipient_id is null or new.broadcast_campaign_id is null then
    return new;
  end if;

  if new.status='failed' then
    v_recipient_status := 'failed';
  elsif new.provider_delivery_status='read' or new.read_at is not null then
    v_recipient_status := 'read';
  elsif new.provider_delivery_status='delivered' or new.delivered_at is not null then
    v_recipient_status := 'delivered';
  elsif new.status='sent' or new.customer_message_sent=true then
    v_recipient_status := 'sent';
  elsif new.status='blocked' then
    v_recipient_status := 'failed';
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
        failed_at=case when v_recipient_status='failed' then coalesce(new.failed_at,new.delivery_failed_at,now()) else failed_at end,
        exclusion_reason=case when v_recipient_status='failed' then coalesce(new.provider_error,'provider_send_blocked_or_failed') else exclusion_reason end,
        updated_at=now()
    where id=new.broadcast_recipient_id
      and organization_id=new.organization_id
      and campaign_id=new.broadcast_campaign_id;

    perform public.refresh_whatsapp_broadcast_campaign_counts_v1(new.organization_id,new.broadcast_campaign_id,now());
  end if;

  return new;
end;
$$;

drop trigger if exists automation_provider_send_audits_broadcast_sync on public.automation_provider_send_audits;
create trigger automation_provider_send_audits_broadcast_sync
after update of status,customer_message_sent,provider_message_id,provider_delivery_status,delivered_at,read_at,delivery_failed_at
on public.automation_provider_send_audits
for each row
when (new.broadcast_recipient_id is not null)
execute function public.sync_whatsapp_broadcast_recipient_from_audit_v1();

create or replace function public.mark_whatsapp_broadcast_reply_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_id uuid;
  v_campaign_id uuid;
begin
  if new.organization_id is null or new.lead_id is null or new.direction::text <> 'inbound' then
    return new;
  end if;

  select r.id,r.campaign_id into v_recipient_id,v_campaign_id
  from public.whatsapp_broadcast_recipients r
  where r.organization_id=new.organization_id
    and r.lead_id=new.lead_id
    and r.status in ('sent','delivered','read')
    and r.sent_at is not null
    and r.sent_at <= coalesce(new.received_at,new.created_at,now())
    and r.sent_at >= coalesce(new.received_at,new.created_at,now()) - interval '7 days'
  order by r.sent_at desc
  limit 1;

  if v_recipient_id is not null then
    update public.whatsapp_broadcast_recipients
    set status='replied',replied_at=coalesce(new.received_at,new.created_at,now()),updated_at=now()
    where id=v_recipient_id and organization_id=new.organization_id;
    perform public.refresh_whatsapp_broadcast_campaign_counts_v1(new.organization_id,v_campaign_id,now());
  end if;

  return new;
end;
$$;

drop trigger if exists messages_whatsapp_broadcast_reply_sync on public.messages;
create trigger messages_whatsapp_broadcast_reply_sync
after insert on public.messages
for each row
execute function public.mark_whatsapp_broadcast_reply_v1();

grant execute on function public.evaluate_whatsapp_broadcast_send_policy_v1(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.prepare_whatsapp_broadcast_provider_send_v1(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.claim_whatsapp_broadcast_provider_send_v1(uuid,uuid,timestamptz) to service_role;
grant execute on function public.claim_whatsapp_provider_send_v2(uuid,uuid,timestamptz) to service_role;
grant execute on function public.refresh_whatsapp_broadcast_campaign_counts_v1(uuid,uuid,timestamptz) to service_role;
