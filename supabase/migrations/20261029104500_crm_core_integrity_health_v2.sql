-- PH-3 reliability/observability:
-- Add a compatibility health model for the closed_won auto-archive lifecycle.
-- V1 is intentionally preserved unchanged for compatibility; V2 corrects only
-- stage/status health semantics and reuses all other V1 integrity metrics.

create or replace view public.v_crm_core_integrity_health_v2
with (security_invoker = true)
as
with corrected_stage_status as (
  select
    o.id as organization_id,
    count(l.id) filter (
      where
        (
          l.current_stage = 'enrolled'::public.lead_stage
          and l.status::text <> 'won'
        )
        or (
          l.current_stage = 'closed_won'::public.lead_stage
          and l.status::text not in ('won', 'archived')
        )
        or (
          l.current_stage in (
            'lost'::public.lead_stage,
            'unqualified'::public.lead_stage,
            'duplicate'::public.lead_stage
          )
          and l.status::text <> 'lost'
        )
        or (
          l.current_stage not in (
            'enrolled'::public.lead_stage,
            'closed_won'::public.lead_stage,
            'lost'::public.lead_stage,
            'unqualified'::public.lead_stage,
            'duplicate'::public.lead_stage
          )
          and l.status::text <> 'open'
        )
    )::bigint as stage_status_mismatch
  from public.organizations o
  left join public.leads l
    on l.organization_id = o.id
  group by o.id
),
normalized as (
  select
    v.organization_id,
    v.organization_name,
    v.lead_count,
    v.leads_without_contacts,
    v.leads_without_stage_history,
    v.stage_history_mismatch,
    coalesce(c.stage_status_mismatch, 0)::bigint as stage_status_mismatch,
    v.leads_without_person,
    v.leads_without_attribution,
    v.next_followup_mismatch,
    v.invalid_lead_owner,
    v.invalid_open_task_assignee,
    v.invalid_open_conversation_assignee,
    v.contact_tenant_mismatch,
    v.task_tenant_mismatch,
    v.attribution_tenant_mismatch,
    v.person_link_tenant_mismatch,
    v.conversation_tenant_mismatch,
    v.message_lineage_mismatch,
    v.duplicate_primary_contact_type,
    greatest(
      0::bigint,
      v.integrity_issue_count
        - v.stage_status_mismatch
        + coalesce(c.stage_status_mismatch, 0)::bigint
    )::bigint as integrity_issue_count
  from public.v_crm_core_integrity_health_v1 v
  left join corrected_stage_status c
    on c.organization_id = v.organization_id
)
select
  n.organization_id,
  n.organization_name,
  n.lead_count,
  n.leads_without_contacts,
  n.leads_without_stage_history,
  n.stage_history_mismatch,
  n.stage_status_mismatch,
  n.leads_without_person,
  n.leads_without_attribution,
  n.next_followup_mismatch,
  n.invalid_lead_owner,
  n.invalid_open_task_assignee,
  n.invalid_open_conversation_assignee,
  n.contact_tenant_mismatch,
  n.task_tenant_mismatch,
  n.attribution_tenant_mismatch,
  n.person_link_tenant_mismatch,
  n.conversation_tenant_mismatch,
  n.message_lineage_mismatch,
  n.duplicate_primary_contact_type,
  n.integrity_issue_count,
  case
    when n.integrity_issue_count = 0 then 'healthy'::text
    else 'degraded'::text
  end as health_status
from normalized n;

revoke all on public.v_crm_core_integrity_health_v2 from public, anon, authenticated;
grant select on public.v_crm_core_integrity_health_v2 to service_role;

comment on view public.v_crm_core_integrity_health_v2 is
  'PH-3 CRM Core integrity health compatibility view. Preserves V1 metrics while treating closed_won leads as valid when status is won or archived after the intentional 24-hour auto-archive lifecycle.';
