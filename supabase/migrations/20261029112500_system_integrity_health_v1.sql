-- PH-3 reliability/observability:
-- Normalize core data-integrity health into a dedicated contract without
-- forcing snapshot semantics into the existing sync/event system-health views.

create or replace view public.v_system_integrity_health_v1
with (security_invoker = true)
as
select
  v.organization_id,
  'crm_core'::text as integrity_key,
  'CRM Core'::text as integrity_name,
  'data_integrity'::text as integrity_group,
  v.health_status::text as source_status,
  case
    when v.health_status = 'healthy' then 'healthy'::text
    else 'warning'::text
  end as health_status,
  v.integrity_issue_count::bigint as issue_count,
  jsonb_build_object(
    'lead_count', v.lead_count,
    'leads_without_contacts', v.leads_without_contacts,
    'leads_without_stage_history', v.leads_without_stage_history,
    'stage_history_mismatch', v.stage_history_mismatch,
    'stage_status_mismatch', v.stage_status_mismatch,
    'next_followup_mismatch', v.next_followup_mismatch,
    'invalid_lead_owner', v.invalid_lead_owner,
    'invalid_open_task_assignee', v.invalid_open_task_assignee,
    'invalid_open_conversation_assignee', v.invalid_open_conversation_assignee,
    'contact_tenant_mismatch', v.contact_tenant_mismatch,
    'task_tenant_mismatch', v.task_tenant_mismatch,
    'attribution_tenant_mismatch', v.attribution_tenant_mismatch,
    'person_link_tenant_mismatch', v.person_link_tenant_mismatch,
    'conversation_tenant_mismatch', v.conversation_tenant_mismatch,
    'message_lineage_mismatch', v.message_lineage_mismatch,
    'duplicate_primary_contact_type', v.duplicate_primary_contact_type
  ) as details,
  now() as checked_at
from public.v_crm_core_integrity_health_v2 v

union all

select
  v.organization_id,
  'customer360'::text as integrity_key,
  'Customer 360'::text as integrity_name,
  'data_integrity'::text as integrity_group,
  v.health_status::text as source_status,
  case
    when v.health_status = 'healthy' then 'healthy'::text
    else 'warning'::text
  end as health_status,
  v.integrity_issue_count::bigint as issue_count,
  jsonb_build_object(
    'lead_count', v.lead_count,
    'person_count', v.person_count,
    'identifier_count', v.identifier_count,
    'person_session_count', v.person_session_count,
    'raw_orphan_persons', v.orphan_persons,
    'retained_deleted_lead_persons', v.retained_deleted_lead_persons,
    'actionable_orphan_persons', v.actionable_orphan_persons,
    'unclassified_leadless_persons', v.unclassified_leadless_persons,
    'raw_persons_missing_complete_journey', v.persons_missing_complete_journey,
    'actionable_persons_missing_complete_journey', v.actionable_persons_missing_complete_journey,
    'open_identity_conflicts', v.open_identity_conflicts,
    'identifiers_shared_across_persons', v.identifiers_shared_across_persons,
    'person_lead_tenant_mismatches', v.person_lead_tenant_mismatches,
    'identifier_tenant_mismatches', v.identifier_tenant_mismatches,
    'person_session_tenant_mismatches', v.person_session_tenant_mismatches,
    'visitor_link_tenant_mismatches', v.visitor_link_tenant_mismatches,
    'journey_person_tenant_mismatches', v.journey_person_tenant_mismatches,
    'duplicate_canonical_journey_keys', v.duplicate_canonical_journey_keys
  ) as details,
  now() as checked_at
from public.v_customer360_identity_integrity_health_v2 v;

revoke all on public.v_system_integrity_health_v1
  from public, anon, authenticated;
grant select on public.v_system_integrity_health_v1
  to service_role;

comment on view public.v_system_integrity_health_v1 is
  'PH-3 normalized tenant-scoped core integrity health. Keeps CRM Core and Customer 360 snapshot semantics separate from sync/event health; degraded source status normalizes to warning without inventing critical severity.';
