begin;

alter table public.automation_approval_requests enable row level security;

drop policy if exists automation_approval_requests_tenant_select on public.automation_approval_requests;
create policy automation_approval_requests_tenant_select
on public.automation_approval_requests
for select
to authenticated
using (
  organization_id = public.current_tenant_organization_id()
  and public.is_organization_member(organization_id)
);

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
  v_actor uuid;
  v_request public.automation_approval_requests%rowtype;
begin
  if p_organization_id is null or p_approval_request_id is null or v_decision not in ('approve','reject') then
    return jsonb_build_object('ok',false,'customer_message_sent',false,'reason','organization_id, approval_request_id and approve/reject decision are required');
  end if;

  if auth.role() = 'service_role' then
    v_actor := p_decided_by;
  else
    v_actor := auth.uid();

    if v_actor is null then
      return jsonb_build_object('ok',false,'customer_message_sent',false,'reason','not_authenticated');
    end if;

    if p_decided_by is not null and p_decided_by is distinct from v_actor then
      return jsonb_build_object('ok',false,'customer_message_sent',false,'reason','decision_actor_mismatch');
    end if;

    if public.current_tenant_organization_id() is distinct from p_organization_id then
      return jsonb_build_object('ok',false,'customer_message_sent',false,'reason','active_tenant_mismatch');
    end if;

    if not exists (
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

revoke all on public.automation_approval_requests from public, anon;
grant select on public.automation_approval_requests to authenticated;
grant all on public.automation_approval_requests to service_role;

revoke all on function public.decide_automation_approval_v1(uuid,uuid,text,text,uuid,timestamptz) from public, anon;
grant execute on function public.decide_automation_approval_v1(uuid,uuid,text,text,uuid,timestamptz) to authenticated, service_role;

commit;
