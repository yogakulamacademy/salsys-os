begin;

-- Deskcomm-inspired, operator-triggered WhatsApp human-handoff V1.
-- No background ingestion, automatic provider sends, AI activation or auto-resume.
-- All effects (idempotent ledger, task, enrollment pause, pending-job cancel)
-- happen inside one PostgreSQL transaction. Production rollout is controlled
-- independently by server-side SALSYS_DESKCOMM_HANDOFF_ACTIONS (default false).

-- A second, database-enforced kill switch protects direct PostgREST/RPC callers
-- even if they bypass the Next.js UI/server feature flag. No tenant has a row
-- or is enabled by migration. Only service_role can provision a staging pilot.
create table if not exists public.whatsapp_handoff_pilot_controls (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  actions_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_handoff_pilot_controls enable row level security;
revoke all on public.whatsapp_handoff_pilot_controls from public,anon,authenticated;
grant all on public.whatsapp_handoff_pilot_controls to service_role;

create table if not exists public.whatsapp_human_handoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  raw_event_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete restrict,
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  task_id uuid references public.tasks(id) on delete restrict,
  assigned_to uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'open' check (status in ('open','closed')),
  -- Keep the automation hold even after a staff task is closed. Only an
  -- additional, explicit authorized action can allow FUTURE new enrollments.
  ai_hold_active boolean not null default true,
  ai_hold_released_by uuid references public.profiles(id) on delete restrict,
  ai_hold_released_at timestamptz,
  reason text not null default 'human_requested' check (reason = 'human_requested'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  closed_by uuid references public.profiles(id) on delete restrict,
  closed_at timestamptz,
  close_reason text check (close_reason in ('resolved_by_staff','dismissed_after_review')),
  constraint whatsapp_human_handoffs_unique_source unique (organization_id,raw_event_id),
  constraint whatsapp_human_handoffs_closure_check check (
    (status = 'open' and closed_at is null and closed_by is null and close_reason is null)
    or (status = 'closed' and closed_at is not null and closed_by is not null and close_reason is not null)
  ),
  constraint whatsapp_human_handoffs_hold_release_check check (
    (ai_hold_active is true and ai_hold_released_by is null and ai_hold_released_at is null)
    or (ai_hold_active is false and ai_hold_released_by is not null and ai_hold_released_at is not null)
  ),
  constraint whatsapp_human_handoffs_raw_tenant_fk
    foreign key (organization_id,raw_event_id)
    references public.raw_events(organization_id,id)
    on delete restrict
);

create index if not exists whatsapp_human_handoffs_org_open_idx
  on public.whatsapp_human_handoffs(organization_id,status,created_at desc);
create index if not exists whatsapp_human_handoffs_lead_idx
  on public.whatsapp_human_handoffs(organization_id,lead_id,created_at desc);

alter table public.whatsapp_human_handoffs enable row level security;
revoke all on public.whatsapp_human_handoffs from public,anon,authenticated;
grant select on public.whatsapp_human_handoffs to authenticated;
grant all on public.whatsapp_human_handoffs to service_role;

drop policy if exists whatsapp_human_handoffs_admin_read on public.whatsapp_human_handoffs;
create policy whatsapp_human_handoffs_admin_read
on public.whatsapp_human_handoffs for select to authenticated
using (
  public.has_organization_role(
    organization_id,
    array['owner','admin']::text[]
  )
);

-- Advisory lock serializes a new enrollment with the staff handoff on the
-- same (tenant,lead) before either transaction sees the other committed row.
-- This prevents a subsequent smart trigger from restarting automation while
-- a human hold is active, even after the task is marked closed.
create or replace function public.guard_human_handoff_enrollment_v1()
returns trigger
language plpgsql
security definer
set search_path = public,auth,pg_temp
as $function$
begin
  if new.status = 'active' then
    -- Zero advisory-lock overhead for tenants that have never opted into the
    -- pilot and have no outstanding holds. A previously opened hold remains
    -- enforced even if the pilot is later disabled.
    if not exists (
      select 1 from public.whatsapp_handoff_pilot_controls p
      where p.organization_id = new.organization_id and p.actions_enabled is true
    ) and not exists (
      select 1 from public.whatsapp_human_handoffs h
      where h.organization_id = new.organization_id
        and h.lead_id = new.lead_id
        and h.ai_hold_active is true
    ) then
      return new;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
      'whatsapp-human-handoff:' || new.organization_id::text || ':' || new.lead_id::text,0
    ));
    if exists (
      select 1 from public.whatsapp_human_handoffs h
      where h.organization_id = new.organization_id
        and h.lead_id = new.lead_id
        and h.ai_hold_active is true
    ) then
      raise exception 'Automation enrollment is held for human review';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_human_handoff_enrollment_v1
  on public.automation_enrollments;
create trigger guard_human_handoff_enrollment_v1
before insert or update of status,lead_id,organization_id
  on public.automation_enrollments
for each row execute function public.guard_human_handoff_enrollment_v1();

create or replace function public.open_verified_whatsapp_human_handoff_v1(
  p_organization_id uuid,
  p_raw_event_id uuid,
  p_assigned_to uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public,auth,pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_assignee uuid := coalesce(p_assigned_to,auth.uid());
  v_raw public.raw_events%rowtype;
  v_lead_id uuid;
  v_conversation_id uuid;
  v_handoff_id uuid;
  v_task_id uuid;
  v_existing public.whatsapp_human_handoffs%rowtype;
  v_paused integer := 0;
  v_cancelled_jobs integer := 0;
  v_cancelled_waits integer := 0;
begin
  if v_actor is null or p_organization_id is null or p_raw_event_id is null then
    raise exception 'Authenticated organization and raw event are required';
  end if;

  if not public.has_organization_role(
    p_organization_id,array['owner','admin']::text[]
  ) then
    raise exception 'Only active organization owners/admins can open human handoffs';
  end if;

  if not exists (
    select 1 from public.whatsapp_handoff_pilot_controls c
    where c.organization_id = p_organization_id
      and c.actions_enabled is true
  ) then
    raise exception 'WhatsApp human handoff task actions are disabled for this organization';
  end if;

  if v_assignee is null or not exists (
    select 1
    from public.profiles p
    join public.organization_members om
      on om.user_id = p.id
     and om.organization_id = p_organization_id
     and om.active is true
    join public.organization_workspaces ow
      on ow.organization_id = p_organization_id
     and ow.workspace_code = 'sales'
     and ow.enabled is true
    where p.id = v_assignee
      and p.active is true
      and (
        om.role in ('owner','admin')
        or exists (
          select 1 from public.workspace_memberships wm
          where wm.organization_id = p_organization_id
            and wm.workspace_code = 'sales'
            and wm.user_id = p.id
            and wm.active is true
            and wm.role in ('manager','member')
        )
      )
  ) then
    raise exception 'Assignee must be an active Sales workspace member of this organization';
  end if;

  -- Never rely on a client-supplied lead, conversation, sender or message ID.
  -- Only a signed/tenant-bound shadow saved by the existing Meta webhook.
  select r.* into v_raw
  from public.raw_events r
  where r.id = p_raw_event_id
    and r.organization_id = p_organization_id
    and r.source_system = 'whatsapp'
    and r.ingestion_method = 'whatsapp_webhook'
    and r.source_event_type = 'message:text'
  for share;

  if not found
    or v_raw.external_message_id is null
    or v_raw.source_account_id is null
    or v_raw.source_subject_id is null
    or v_raw.metadata #>> '{deskcomm_inbound_shadow,adapter}' is distinct from 'deskcomm_inspired_meta_ingress'
    or v_raw.metadata #>> '{deskcomm_inbound_shadow,schema_version}' is distinct from '1'
    or v_raw.metadata #>> '{deskcomm_inbound_shadow,intent_candidate}' is distinct from 'human_handoff_candidate'
    or v_raw.metadata #>> '{deskcomm_inbound_shadow,evidence_state}' is distinct from 'verified'
    or v_raw.metadata #>> '{deskcomm_inbound_shadow,event_family}' is distinct from 'inbound_message'
    or v_raw.metadata #>> '{deskcomm_inbound_shadow,signature_verified}' is distinct from 'true'
    or v_raw.metadata #>> '{deskcomm_inbound_shadow,active_tenant_sender_binding}' is distinct from 'true'
    or v_raw.metadata #>> '{deskcomm_inbound_shadow,automation_authorized}' is distinct from 'false'
    or v_raw.metadata #>> '{deskcomm_inbound_shadow,replay_authorized}' is distinct from 'false'
  then
    raise exception 'Verified human-request source event is unavailable';
  end if;

  -- Canonical CRM message linkage can be delayed; refuse to create a
  -- handoff until the CRM has persisted its matching inbound message.
  select l.lead_id,l.conversation_id into strict v_lead_id,v_conversation_id
  from public.whatsapp_crm_message_links l
  join public.messages m
    on m.organization_id = l.organization_id
   and m.external_message_id = l.external_message_id
   and m.lead_id = l.lead_id
   and m.conversation_id = l.conversation_id
   and m.direction = 'inbound'
  join public.conversations c
    on c.organization_id = l.organization_id
   and c.id = l.conversation_id
   and c.lead_id = l.lead_id
   and c.channel = 'whatsapp'
   and c.external_account_id = v_raw.source_account_id
   and c.external_conversation_id = v_raw.source_subject_id
  join public.leads lead
    on lead.id = l.lead_id
   and lead.organization_id = l.organization_id
  where l.organization_id = p_organization_id
    and l.external_message_id = v_raw.external_message_id;

  -- STRICT rejects missing or ambiguous joins. Never pick an arbitrary
  -- CRM identity from duplicate provider linkage.

  -- Serialize new enrollments for the same tenant/lead against this hold.
  perform pg_advisory_xact_lock(hashtextextended(
    'whatsapp-human-handoff:' || p_organization_id::text || ':' || v_lead_id::text,0
  ));

  -- Atomic idempotency. The unique (organization,raw_event) claim serializes
  -- concurrent admin actions without duplicating tasks or pausing again.
  insert into public.whatsapp_human_handoffs(
    organization_id,raw_event_id,lead_id,conversation_id,
    assigned_to,created_by
  )
  values (
    p_organization_id,p_raw_event_id,v_lead_id,v_conversation_id,
    v_assignee,v_actor
  )
  on conflict (organization_id,raw_event_id) do nothing
  returning id into v_handoff_id;

  if v_handoff_id is null then
    select * into v_existing
    from public.whatsapp_human_handoffs h
    where h.organization_id = p_organization_id
      and h.raw_event_id = p_raw_event_id
    for update;
    if not found or v_existing.task_id is null then
      raise exception 'Existing handoff transaction is incomplete';
    end if;
    return jsonb_build_object(
      'ok',true,'created',false,'handoff_id',v_existing.id,
      'task_id',v_existing.task_id,'status',v_existing.status,
      'assigned_to',v_existing.assigned_to,'customer_message_sent',false
    );
  end if;

  insert into public.tasks (
    organization_id,lead_id,task_type,title,description,status,
    due_at,assigned_to,created_by_type,created_by_id,metadata
  )
  values (
    p_organization_id,v_lead_id,'human_review',
    'WhatsApp human support requested',
    'Review the verified inbound WhatsApp conversation. No automatic reply was sent.',
    'open',now(),v_assignee,'human',v_actor::text,
    jsonb_build_object(
      'source','deskcomm_human_handoff_v1',
      'handoff_id',v_handoff_id,
      'raw_event_id',p_raw_event_id
    )
  )
  returning id into v_task_id;

  update public.whatsapp_human_handoffs
  set task_id = v_task_id
  where id = v_handoff_id and organization_id = p_organization_id;

  -- Do NOT overwrite an existing earlier follow-up deadline.
  update public.leads
  set next_followup_at = least(coalesce(next_followup_at,now()),now())
  where id = v_lead_id and organization_id = p_organization_id;

  -- Pause ACTIVE automation enrollments only. Existing provider approvals
  -- and a worker already past claim are NOT silently revoked by this action;
  -- their independent provider-send safety gates remain authoritative.
  update public.automation_enrollments
  set status = 'paused'
  where organization_id = p_organization_id
    and lead_id = v_lead_id
    and status = 'active';
  get diagnostics v_paused = row_count;

  -- The scheduler only claims status='scheduled', and the runtime worker
  -- additionally checks that the enrollment is ACTIVE.
  update public.automation_scheduled_jobs
  set status = 'cancelled',cancelled_at = now()
  where organization_id = p_organization_id
    and lead_id = v_lead_id
    and status = 'scheduled';
  get diagnostics v_cancelled_jobs = row_count;

  update public.automation_wait_states
  set status = 'cancelled',cancelled_at = now(),
      cancel_reason = 'human_handoff'
  where organization_id = p_organization_id
    and lead_id = v_lead_id
    and status = 'waiting';
  get diagnostics v_cancelled_waits = row_count;

  return jsonb_build_object(
    'ok',true,'created',true,'handoff_id',v_handoff_id,
    'task_id',v_task_id,'assigned_to',v_assignee,
    'status','open','paused_enrollments',v_paused,
    'cancelled_scheduled_jobs',v_cancelled_jobs,
    'cancelled_wait_states',v_cancelled_waits,
    'customer_message_sent',false
  );
end;
$function$;

-- Closing is an explicit second human action; never requeue cancelled work.
-- Resuming an AI automation requires a NEW, independently approved workflow.
create or replace function public.close_verified_whatsapp_human_handoff_v1(
  p_organization_id uuid,
  p_handoff_id uuid,
  p_resolution text
)
returns jsonb
language plpgsql
security definer
set search_path = public,auth,pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_handoff public.whatsapp_human_handoffs%rowtype;
begin
  if v_actor is null or p_organization_id is null or p_handoff_id is null then
    raise exception 'Authenticated organization and handoff are required';
  end if;
  if not public.has_organization_role(p_organization_id,array['owner','admin']::text[]) then
    raise exception 'Only owners/admins can close human handoffs';
  end if;
  if p_resolution is null or p_resolution not in ('resolved_by_staff','dismissed_after_review') then
    raise exception 'Invalid human handoff resolution';
  end if;

  select * into v_handoff
  from public.whatsapp_human_handoffs
  where id = p_handoff_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Handoff not found in current organization';
  end if;
  if v_handoff.status = 'closed' then
    return jsonb_build_object(
      'ok',true,'closed',true,'changed',false,
      'handoff_id',v_handoff.id,'task_id',v_handoff.task_id,
      'customer_message_sent',false,'automation_resumed',false
    );
  end if;

  update public.whatsapp_human_handoffs
  set status = 'closed',
      closed_by = v_actor,
      closed_at = now(),
      close_reason = p_resolution
  where id = p_handoff_id and organization_id = p_organization_id;

  update public.tasks
  set status = case when p_resolution = 'resolved_by_staff'
    then 'completed'::public.task_status
    else 'cancelled'::public.task_status end,
      completed_at = case when p_resolution = 'resolved_by_staff'
        then now() else null end
  where organization_id = p_organization_id
    and id = v_handoff.task_id
    and lead_id = v_handoff.lead_id
    and status in ('open','snoozed');

  -- Keep the canonical due-date summary consistent with the task lifecycle.
  update public.leads l
  set next_followup_at = (
    select min(t.due_at)
    from public.tasks t
    where t.organization_id = p_organization_id
      and t.lead_id = v_handoff.lead_id
      and t.status in ('open','snoozed')
      and t.due_at is not null
  )
  where l.id = v_handoff.lead_id
    and l.organization_id = p_organization_id;

  -- DO NOT resume paused enrollments or cancelled jobs on task closure.
  return jsonb_build_object(
    'ok',true,'closed',true,'changed',true,
    'handoff_id',v_handoff.id,'task_id',v_handoff.task_id,
    'customer_message_sent',false,'automation_resumed',false
  );
end;
$function$;

-- Explicit AI restart permission: only FUTURE events may create new
-- enrollments. No paused enrollment, cancelled wait, scheduled job or provider
-- send is reactivated. Previously scheduled messages are never replayed.
create or replace function public.release_verified_whatsapp_handoff_ai_hold_v1(
  p_organization_id uuid,
  p_handoff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public,auth,pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_handoff public.whatsapp_human_handoffs%rowtype;
begin
  if v_actor is null or p_organization_id is null or p_handoff_id is null then
    raise exception 'Authenticated organization and handoff are required';
  end if;
  if not public.has_organization_role(p_organization_id,array['owner','admin']::text[]) then
    raise exception 'Only owners/admins can release a human handoff hold';
  end if;
  select * into v_handoff
  from public.whatsapp_human_handoffs
  where organization_id = p_organization_id and id = p_handoff_id
  for update;
  if not found then
    raise exception 'Handoff not found in current organization';
  end if;
  if v_handoff.status <> 'closed' then
    raise exception 'Human review task must be closed before allowing future automation';
  end if;
  if v_handoff.ai_hold_active is false then
    return jsonb_build_object(
      'ok',true,'changed',false,'handoff_id',v_handoff.id,
      'future_automation_allowed',true,'jobs_replayed',false,
      'automation_resumed',false,'customer_message_sent',false
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'whatsapp-human-handoff:' || p_organization_id::text || ':' || v_handoff.lead_id::text,0
  ));

  update public.whatsapp_human_handoffs
  set ai_hold_active = false,
      ai_hold_released_at = now(),
      ai_hold_released_by = v_actor
  where organization_id = p_organization_id and id = p_handoff_id;

  return jsonb_build_object(
    'ok',true,'changed',true,'handoff_id',v_handoff.id,
    'future_automation_allowed',true,'jobs_replayed',false,
    'automation_resumed',false,'customer_message_sent',false
  );
end;
$function$;

revoke all on function public.open_verified_whatsapp_human_handoff_v1(uuid,uuid,uuid) from public,anon;
revoke all on function public.close_verified_whatsapp_human_handoff_v1(uuid,uuid,text) from public,anon;
revoke all on function public.release_verified_whatsapp_handoff_ai_hold_v1(uuid,uuid) from public,anon;
grant execute on function public.open_verified_whatsapp_human_handoff_v1(uuid,uuid,uuid) to authenticated;
grant execute on function public.close_verified_whatsapp_human_handoff_v1(uuid,uuid,text) to authenticated;
grant execute on function public.release_verified_whatsapp_handoff_ai_hold_v1(uuid,uuid) to authenticated;

comment on table public.whatsapp_human_handoffs is
  'Operator-created WhatsApp human handoff ledger. Does not authorize sending or automation resumption.';
comment on function public.open_verified_whatsapp_human_handoff_v1(uuid,uuid,uuid) is
  'Only owners/admins: exact verified inbound source -> tenant lead + staff task + pause current enrollments/cancel unclaimed work in one transaction; never send.';
comment on function public.close_verified_whatsapp_human_handoff_v1(uuid,uuid,text) is
  'Only owners/admins: close handoff/task, never replay or resume existing automations.';
comment on function public.release_verified_whatsapp_handoff_ai_hold_v1(uuid,uuid) is
  'Only owners/admins: release hold after closure so future workflow starts can be evaluated; never restart or replay old jobs.';

commit;
