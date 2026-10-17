begin;

create table if not exists public.automation_approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  enrollment_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  flow_version integer not null check (flow_version >= 1),
  node_id uuid not null,
  approval_type text not null default 'whatsapp_send' check (approval_type in ('whatsapp_send')),
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','expired')),
  whatsapp_account_id uuid null,
  template_name text null,
  template_language text null,
  request_payload jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  decided_at timestamptz null,
  decided_by uuid null,
  decision_reason text null,
  provider_send_audit_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_approval_requests_workflow_fk foreign key (workflow_id, organization_id)
    references public.automation_workflows(id, organization_id) on delete cascade,
  constraint automation_approval_requests_enrollment_fk foreign key (enrollment_id, organization_id)
    references public.automation_enrollments(id, organization_id) on delete cascade,
  constraint automation_approval_requests_node_fk foreign key (node_id, organization_id)
    references public.automation_flow_nodes(id, organization_id) on delete cascade
);

create index if not exists automation_approval_requests_pending_idx
  on public.automation_approval_requests (organization_id, status, requested_at desc);

create index if not exists automation_approval_requests_enrollment_idx
  on public.automation_approval_requests (organization_id, enrollment_id, created_at desc);

create unique index if not exists automation_approval_requests_active_node_idx
  on public.automation_approval_requests (organization_id, enrollment_id, node_id)
  where status in ('pending','approved');

alter table public.automation_provider_send_audits
  add column if not exists approval_request_id uuid null references public.automation_approval_requests(id) on delete set null;

create index if not exists automation_provider_send_audits_approval_idx
  on public.automation_provider_send_audits (organization_id, approval_request_id)
  where approval_request_id is not null;

create or replace function public.ensure_whatsapp_send_approval_v1(
  p_organization_id uuid,
  p_enrollment_id uuid,
  p_node_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_enrollment public.automation_enrollments%rowtype;
  v_workflow public.automation_workflows%rowtype;
  v_node public.automation_flow_nodes%rowtype;
  v_config jsonb := '{}'::jsonb;
  v_existing public.automation_approval_requests%rowtype;
  v_request_id uuid;
  v_account_id uuid;
  v_template_name text;
  v_template_language text;
  v_request_payload jsonb := '{}'::jsonb;
begin
  if p_organization_id is null or p_enrollment_id is null or p_node_id is null then
    return jsonb_build_object('ok',false,'approval_created',false,'customer_message_sent',false,'reason','organization_id, enrollment_id and node_id are required');
  end if;

  select * into v_enrollment
  from public.automation_enrollments e
  where e.id = p_enrollment_id
    and e.organization_id = p_organization_id
  for update;

  if v_enrollment.id is null then
    return jsonb_build_object('ok',false,'approval_created',false,'customer_message_sent',false,'reason','enrollment_not_found');
  end if;

  if v_enrollment.status <> 'active' or v_enrollment.current_node_id is distinct from p_node_id then
    return jsonb_build_object('ok',true,'approval_created',false,'customer_message_sent',false,'reason','enrollment_not_active_at_node');
  end if;

  select * into v_workflow
  from public.automation_workflows w
  where w.id = v_enrollment.workflow_id
    and w.organization_id = p_organization_id;

  if v_workflow.id is null
     or v_workflow.status <> 'active'
     or v_workflow.runtime_flow_enabled is not true
     or v_workflow.current_published_version is distinct from v_enrollment.flow_version then
    return jsonb_build_object('ok',true,'approval_created',false,'customer_message_sent',false,'reason','workflow_runtime_not_eligible');
  end if;

  if not exists (
    select 1 from public.automation_flow_versions fv
    where fv.organization_id = p_organization_id
      and fv.workflow_id = v_enrollment.workflow_id
      and fv.version_number = v_enrollment.flow_version
      and fv.status = 'published'
  ) then
    return jsonb_build_object('ok',false,'approval_created',false,'customer_message_sent',false,'reason','flow_version_not_published');
  end if;

  select * into v_node
  from public.automation_flow_nodes n
  where n.id = p_node_id
    and n.organization_id = p_organization_id
    and n.workflow_id = v_enrollment.workflow_id
    and n.version_number = v_enrollment.flow_version
    and n.enabled = true;

  if v_node.id is null then
    return jsonb_build_object('ok',false,'approval_created',false,'customer_message_sent',false,'reason','published_node_not_found');
  end if;

  v_config := coalesce(v_node.config, '{}'::jsonb);

  if v_node.node_type <> 'action'
     or lower(coalesce(v_config->>'action_type','')) <> 'send_message'
     or lower(coalesce(v_config->>'channel','')) <> 'whatsapp' then
    return jsonb_build_object('ok',true,'approval_created',false,'customer_message_sent',false,'reason','node_is_not_whatsapp_send_action');
  end if;

  select * into v_existing
  from public.automation_approval_requests ar
  where ar.organization_id = p_organization_id
    and ar.enrollment_id = p_enrollment_id
    and ar.node_id = p_node_id
    and ar.status in ('pending','approved')
  order by ar.created_at desc
  limit 1;

  if v_existing.id is not null then
    if v_enrollment.status <> 'paused' then
      update public.automation_enrollments
      set status='paused',
          next_action_at=null,
          metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
            'approval_request_id',v_existing.id,
            'approval_status',v_existing.status,
            'approval_node_id',p_node_id,
            'customer_message_sent',false
          )
      where id=p_enrollment_id and organization_id=p_organization_id;
    end if;

    return jsonb_build_object('ok',true,'approval_created',false,'approval_request_id',v_existing.id,'status',v_existing.status,'idempotent_reuse',true,'customer_message_sent',false);
  end if;

  v_account_id := nullif(v_config->>'whatsapp_account_id','')::uuid;
  v_template_name := nullif(btrim(coalesce(v_config->>'template_name','')), '');
  v_template_language := nullif(btrim(coalesce(v_config->>'template_language','')), '');
  v_request_payload := coalesce(v_config->'request_payload','{}'::jsonb);

  if jsonb_typeof(v_request_payload) <> 'object' then
    return jsonb_build_object('ok',false,'approval_created',false,'customer_message_sent',false,'reason','request_payload_must_be_object');
  end if;

  if v_account_id is not null and not exists (
    select 1 from public.whatsapp_accounts wa
    where wa.id=v_account_id and wa.organization_id=p_organization_id and wa.active=true
  ) then
    return jsonb_build_object('ok',false,'approval_created',false,'customer_message_sent',false,'reason','whatsapp_account_tenant_mismatch_or_inactive');
  end if;

  insert into public.automation_approval_requests (
    organization_id,workflow_id,enrollment_id,lead_id,flow_version,node_id,
    approval_type,channel,status,whatsapp_account_id,template_name,template_language,
    request_payload,requested_at,metadata
  ) values (
    p_organization_id,v_enrollment.workflow_id,v_enrollment.id,v_enrollment.lead_id,v_enrollment.flow_version,p_node_id,
    'whatsapp_send','whatsapp','pending',v_account_id,v_template_name,v_template_language,
    v_request_payload,v_now,jsonb_build_object(
      'source','automation_send_node_v1',
      'node_key',v_node.node_key,
      'node_label',v_node.label,
      'customer_message_sent',false
    )
  ) returning id into v_request_id;

  update public.automation_enrollments
  set status='paused',
      next_action_at=null,
      last_event_at=v_now,
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'approval_request_id',v_request_id,
        'approval_status','pending',
        'approval_node_id',p_node_id,
        'approval_node_key',v_node.node_key,
        'customer_message_sent',false
      )
  where id=v_enrollment.id and organization_id=p_organization_id and current_node_id=p_node_id;

  return jsonb_build_object('ok',true,'approval_created',true,'approval_request_id',v_request_id,'status','pending','idempotent_reuse',false,'customer_message_sent',false);
end;
$$;

create or replace function public.automation_enrollment_whatsapp_send_approval_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.status='active' and new.current_node_id is not null then
    perform public.ensure_whatsapp_send_approval_v1(new.organization_id,new.id,new.current_node_id,now());
  end if;
  return new;
end;
$$;

drop trigger if exists automation_enrollments_whatsapp_send_approval_v1 on public.automation_enrollments;
create trigger automation_enrollments_whatsapp_send_approval_v1
after insert or update of current_node_id,status on public.automation_enrollments
for each row execute function public.automation_enrollment_whatsapp_send_approval_trigger_v1();

create or replace function public.decide_automation_approval_v1(
  p_organization_id uuid,
  p_approval_request_id uuid,
  p_decision text,
  p_reason text default null,
  p_decided_by uuid default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_now timestamptz := coalesce(p_now,now());
  v_decision text := lower(nullif(btrim(coalesce(p_decision,'')),''));
  v_actor uuid := coalesce(p_decided_by,auth.uid());
  v_request public.automation_approval_requests%rowtype;
begin
  if p_organization_id is null or p_approval_request_id is null or v_decision not in ('approve','reject') then
    return jsonb_build_object('ok',false,'customer_message_sent',false,'reason','organization_id, approval_request_id and approve/reject decision are required');
  end if;

  if auth.role() <> 'service_role' then
    if v_actor is null or not exists (
      select 1 from public.organization_members om
      where om.organization_id=p_organization_id
        and om.user_id=v_actor
        and om.active=true
        and om.role in ('admin','admissions')
    ) then
      return jsonb_build_object('ok',false,'customer_message_sent',false,'reason','not_authorized_to_approve');
    end if;
  end if;

  select * into v_request
  from public.automation_approval_requests ar
  where ar.id=p_approval_request_id and ar.organization_id=p_organization_id
  for update;

  if v_request.id is null then
    return jsonb_build_object('ok',false,'customer_message_sent',false,'reason','approval_request_not_found');
  end if;

  if v_request.status <> 'pending' then
    return jsonb_build_object('ok',true,'approval_request_id',v_request.id,'status',v_request.status,'idempotent_reuse',true,'customer_message_sent',false);
  end if;

  update public.automation_approval_requests
  set status=case when v_decision='approve' then 'approved' else 'rejected' end,
      decided_at=v_now,
      decided_by=v_actor,
      decision_reason=nullif(btrim(coalesce(p_reason,'')),''),
      updated_at=v_now,
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('decision',v_decision,'customer_message_sent',false)
  where id=v_request.id and organization_id=p_organization_id;

  if v_decision='reject' then
    update public.automation_enrollments
    set status='stopped',
        stopped_reason='human_approval_rejected',
        next_action_at=null,
        last_event_at=v_now,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'approval_request_id',v_request.id,
          'approval_status','rejected',
          'customer_message_sent',false
        )
    where id=v_request.enrollment_id
      and organization_id=p_organization_id
      and current_node_id=v_request.node_id;
  else
    update public.automation_enrollments
    set status='paused',
        next_action_at=null,
        last_event_at=v_now,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'approval_request_id',v_request.id,
          'approval_status','approved',
          'approved_by',v_actor,
          'approved_at',v_now,
          'customer_message_sent',false
        )
    where id=v_request.enrollment_id
      and organization_id=p_organization_id
      and current_node_id=v_request.node_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'approval_request_id',v_request.id,
    'status',case when v_decision='approve' then 'approved' else 'rejected' end,
    'decision',v_decision,
    'enrollment_id',v_request.enrollment_id,
    'customer_message_sent',false
  );
end;
$$;

create or replace function public.evaluate_automation_send_policy_v2(
  p_organization_id uuid,
  p_lead_id uuid,
  p_channel text,
  p_workflow_id uuid default null,
  p_approval_request_id uuid default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_base jsonb;
  v_approval public.automation_approval_requests%rowtype;
  v_approval_valid boolean := false;
  v_send_allowed boolean := false;
  v_reasons jsonb := '[]'::jsonb;
  v_reason text;
begin
  v_base := public.evaluate_automation_send_policy_v1(p_organization_id,p_lead_id,p_channel,p_workflow_id,p_now);

  if p_approval_request_id is not null then
    select * into v_approval
    from public.automation_approval_requests ar
    where ar.id=p_approval_request_id
      and ar.organization_id=p_organization_id
      and ar.lead_id=p_lead_id
      and (p_workflow_id is null or ar.workflow_id=p_workflow_id)
      and ar.channel=lower(coalesce(p_channel,''))
      and ar.status='approved'
    limit 1;
    v_approval_valid := v_approval.id is not null;
  end if;

  for v_reason in select value from jsonb_array_elements_text(coalesce(v_base->'block_reasons','[]'::jsonb))
  loop
    if not (v_approval_valid and v_reason in ('autonomous_send_disabled','human_approval_required')) then
      v_reasons := v_reasons || jsonb_build_array(v_reason);
    end if;
  end loop;

  v_send_allowed :=
    coalesce((v_base->>'suppressed')::boolean,false) is false
    and coalesce((v_base->>'policy_missing')::boolean,true) is false
    and coalesce((v_base->>'policy_enabled')::boolean,false) is true
    and coalesce((v_base->>'frequency_limited')::boolean,true) is false
    and (
      v_approval_valid
      or (
        coalesce((v_base->>'autonomous_send_enabled')::boolean,false) is true
        and coalesce((v_base->>'requires_human_approval')::boolean,true) is false
      )
    );

  return v_base || jsonb_build_object(
    'send_allowed',v_send_allowed,
    'approval_request_id',p_approval_request_id,
    'human_approval_satisfied',v_approval_valid,
    'block_reasons',v_reasons,
    'customer_message_sent',false
  );
end;
$$;

create or replace function public.resolve_whatsapp_channel_policy_v3(
  p_organization_id uuid,
  p_lead_id uuid,
  p_workflow_id uuid default null,
  p_template_name text default null,
  p_template_language text default null,
  p_whatsapp_account_id uuid default null,
  p_approval_request_id uuid default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_channel jsonb;
  v_base jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_reason text;
  v_channel_allowed boolean := false;
  v_final boolean := false;
begin
  v_channel := public.resolve_whatsapp_channel_policy_v2(
    p_organization_id,p_lead_id,p_workflow_id,p_template_name,p_template_language,p_whatsapp_account_id,p_now
  );
  v_base := public.evaluate_automation_send_policy_v2(
    p_organization_id,p_lead_id,'whatsapp',p_workflow_id,p_approval_request_id,p_now
  );

  v_channel_allowed := coalesce((v_channel->>'channel_policy_allowed')::boolean,false);
  v_final := coalesce((v_base->>'send_allowed')::boolean,false) and v_channel_allowed;

  for v_reason in select value from jsonb_array_elements_text(coalesce(v_channel->'block_reasons','[]'::jsonb))
  loop
    if v_reason <> 'base_messaging_policy_blocked' then
      v_reasons := v_reasons || jsonb_build_array(v_reason);
    end if;
  end loop;

  if coalesce((v_base->>'send_allowed')::boolean,false) is not true then
    v_reasons := v_reasons || jsonb_build_array('base_messaging_policy_blocked');
  end if;

  return v_channel || jsonb_build_object(
    'base_policy',v_base,
    'base_send_allowed',coalesce((v_base->>'send_allowed')::boolean,false),
    'approval_request_id',p_approval_request_id,
    'human_approval_satisfied',coalesce((v_base->>'human_approval_satisfied')::boolean,false),
    'send_allowed',v_final,
    'block_reasons',v_reasons,
    'customer_message_sent',false
  );
end;
$$;

create or replace function public.prepare_approved_whatsapp_provider_send_v1(
  p_organization_id uuid,
  p_approval_request_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_now timestamptz := coalesce(p_now,now());
  v_request public.automation_approval_requests%rowtype;
  v_policy jsonb;
  v_provider_enabled boolean := false;
  v_policy_allowed boolean := false;
  v_status text := 'blocked';
  v_reasons jsonb := '[]'::jsonb;
  v_template_id uuid;
  v_audit_id uuid;
  v_existing public.automation_provider_send_audits%rowtype;
  v_idempotency_key text;
begin
  if p_organization_id is null or p_approval_request_id is null then
    return jsonb_build_object('ok',false,'status','blocked','provider_call_allowed',false,'customer_message_sent',false,'reason','organization_id and approval_request_id are required');
  end if;

  select * into v_request
  from public.automation_approval_requests ar
  where ar.id=p_approval_request_id and ar.organization_id=p_organization_id;

  if v_request.id is null then
    return jsonb_build_object('ok',false,'status','blocked','provider_call_allowed',false,'customer_message_sent',false,'reason','approval_request_not_found');
  end if;

  if v_request.status <> 'approved' then
    return jsonb_build_object('ok',true,'status','blocked','provider_call_allowed',false,'customer_message_sent',false,'reason','approval_not_approved');
  end if;

  if not exists (
    select 1 from public.automation_enrollments e
    where e.id=v_request.enrollment_id
      and e.organization_id=p_organization_id
      and e.workflow_id=v_request.workflow_id
      and e.lead_id=v_request.lead_id
      and e.current_node_id=v_request.node_id
      and e.flow_version=v_request.flow_version
      and e.status='paused'
  ) then
    return jsonb_build_object('ok',true,'status','blocked','provider_call_allowed',false,'customer_message_sent',false,'reason','approval_enrollment_state_mismatch');
  end if;

  v_idempotency_key := 'approval:' || v_request.id::text || ':whatsapp:v1';

  select * into v_existing
  from public.automation_provider_send_audits a
  where a.organization_id=p_organization_id and a.idempotency_key=v_idempotency_key
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'ok',true,'audit_id',v_existing.id,'status',v_existing.status,'idempotent_reuse',true,
      'provider_call_allowed',v_existing.status='ready' and v_existing.customer_message_sent=false,
      'customer_message_sent',v_existing.customer_message_sent,'block_reasons',v_existing.block_reasons
    );
  end if;

  v_policy := public.resolve_whatsapp_channel_policy_v3(
    p_organization_id,v_request.lead_id,v_request.workflow_id,
    v_request.template_name,v_request.template_language,v_request.whatsapp_account_id,
    v_request.id,v_now
  );
  v_policy_allowed := coalesce((v_policy->>'send_allowed')::boolean,false);

  select coalesce(s.provider_send_enabled,false)
  into v_provider_enabled
  from public.automation_provider_send_settings s
  where s.organization_id=p_organization_id
    and s.channel='whatsapp'
    and s.provider='meta_cloud_api'
  limit 1;
  v_provider_enabled := coalesce(v_provider_enabled,false);

  if not v_policy_allowed then
    v_reasons := coalesce(v_policy->'block_reasons','[]'::jsonb);
  end if;
  if not v_provider_enabled then
    v_reasons := v_reasons || jsonb_build_array('provider_send_disabled');
  end if;

  if v_policy_allowed and v_provider_enabled then v_status:='ready'; else v_status:='blocked'; end if;

  if coalesce(v_policy->'template_policy'->>'template_id','') <> '' then
    v_template_id := (v_policy->'template_policy'->>'template_id')::uuid;
  end if;

  insert into public.automation_provider_send_audits (
    organization_id,workflow_id,enrollment_id,lead_id,channel,provider,
    whatsapp_account_id,whatsapp_template_id,approval_request_id,
    request_mode,idempotency_key,status,policy_snapshot,request_payload,block_reasons,
    customer_message_sent,prepared_at
  ) values (
    p_organization_id,v_request.workflow_id,v_request.enrollment_id,v_request.lead_id,'whatsapp','meta_cloud_api',
    v_request.whatsapp_account_id,v_template_id,v_request.id,
    'live',v_idempotency_key,v_status,v_policy,v_request.request_payload,v_reasons,
    false,v_now
  ) returning id into v_audit_id;

  update public.automation_approval_requests
  set provider_send_audit_id=v_audit_id,updated_at=v_now,
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('provider_send_audit_id',v_audit_id,'provider_prepare_status',v_status,'customer_message_sent',false)
  where id=v_request.id and organization_id=p_organization_id;

  return jsonb_build_object(
    'ok',true,'approval_request_id',v_request.id,'audit_id',v_audit_id,'status',v_status,
    'idempotent_reuse',false,'policy_send_allowed',v_policy_allowed,'provider_send_enabled',v_provider_enabled,
    'provider_call_allowed',v_status='ready','block_reasons',v_reasons,'customer_message_sent',false
  );
end;
$$;

revoke all on public.automation_approval_requests from public, anon;
grant select on public.automation_approval_requests to authenticated;
grant all on public.automation_approval_requests to service_role;

revoke all on function public.ensure_whatsapp_send_approval_v1(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.ensure_whatsapp_send_approval_v1(uuid,uuid,uuid,timestamptz) to service_role;

revoke all on function public.decide_automation_approval_v1(uuid,uuid,text,text,uuid,timestamptz) from public, anon;
grant execute on function public.decide_automation_approval_v1(uuid,uuid,text,text,uuid,timestamptz) to authenticated, service_role;

revoke all on function public.evaluate_automation_send_policy_v2(uuid,uuid,text,uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.evaluate_automation_send_policy_v2(uuid,uuid,text,uuid,uuid,timestamptz) to service_role;

revoke all on function public.resolve_whatsapp_channel_policy_v3(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.resolve_whatsapp_channel_policy_v3(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz) to service_role;

revoke all on function public.prepare_approved_whatsapp_provider_send_v1(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.prepare_approved_whatsapp_provider_send_v1(uuid,uuid,timestamptz) to service_role;

commit;
