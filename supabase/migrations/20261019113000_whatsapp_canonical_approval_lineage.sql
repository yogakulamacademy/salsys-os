-- Keep the canonical CRM message's human_approved flag derived from the
-- persisted automation approval request, never from a request payload flag.
--
-- The provider-send audit is the durable join point between approval,
-- provider execution and the canonical CRM message. The provider adapter
-- intentionally stores request_payload.human_approved=false while a draft
-- action is being prepared; after a real human approval and successful send,
-- the canonical message must reflect the approved audit lineage instead.

create or replace function public.reconcile_whatsapp_canonical_message_approval_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_approval_status text;
begin
  if new.channel is distinct from 'whatsapp'
     or new.provider is distinct from 'meta_cloud_api'
     or new.crm_message_id is null then
    return new;
  end if;

  v_approval_status := null;

  if new.approval_request_id is not null then
    select ar.status
      into v_approval_status
    from public.automation_approval_requests ar
    where ar.id = new.approval_request_id
      and ar.organization_id = new.organization_id
      and ar.lead_id = new.lead_id
      and (new.workflow_id is null or ar.workflow_id = new.workflow_id)
    limit 1;
  end if;

  update public.messages m
  set human_approved = (v_approval_status = 'approved'),
      metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
        'approval_request_id', new.approval_request_id,
        'approval_status', coalesce(v_approval_status, 'not_linked'),
        'human_approval_source', 'automation_approval_request'
      )
  where m.id = new.crm_message_id
    and m.organization_id = new.organization_id
    and m.lead_id = new.lead_id
    and m.direction = 'outbound'::public.message_direction
    and m.sender_type = 'automation'::public.actor_type;

  return new;
end;
$$;

comment on function public.reconcile_whatsapp_canonical_message_approval_v1() is
  'Reconciles messages.human_approved from the tenant-scoped automation approval linked by a WhatsApp provider-send audit.';

drop trigger if exists automation_provider_send_audit_reconcile_message_approval
  on public.automation_provider_send_audits;

create trigger automation_provider_send_audit_reconcile_message_approval
after insert or update of crm_message_id, approval_request_id, status, customer_message_sent
on public.automation_provider_send_audits
for each row
execute function public.reconcile_whatsapp_canonical_message_approval_v1();

-- One-time repair for existing successful WhatsApp sends whose canonical CRM
-- messages were created before approval lineage reconciliation existed.
update public.messages m
set human_approved = true,
    metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
      'approval_request_id', a.approval_request_id,
      'approval_status', 'approved',
      'human_approval_source', 'automation_approval_request',
      'human_approval_reconciled_at', now()
    )
from public.automation_provider_send_audits a
join public.automation_approval_requests ar
  on ar.id = a.approval_request_id
 and ar.organization_id = a.organization_id
 and ar.status = 'approved'
where a.crm_message_id = m.id
  and a.organization_id = m.organization_id
  and a.lead_id = m.lead_id
  and a.channel = 'whatsapp'
  and a.provider = 'meta_cloud_api'
  and a.customer_message_sent = true
  and m.direction = 'outbound'::public.message_direction
  and m.sender_type = 'automation'::public.actor_type
  and m.human_approved is distinct from true;
