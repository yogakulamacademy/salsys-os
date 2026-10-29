-- PH-3 reliability/observability:
-- Customer 360 health compatibility for retained identities whose provenance lead
-- no longer exists. V1 remains unchanged; V2 preserves the raw V1 counts while
-- separating informational retained leadless identities from actionable graph defects.

create or replace view public.v_customer360_identity_integrity_health_v2
with (security_invoker = true)
as
with leadless_persons as (
  select
    p.organization_id,
    p.id as person_id,
    nullif(
      coalesce(
        nullif(p.metadata->>'lead_id', ''),
        nullif(p.metadata->'identity_backfill'->>'lead_id', '')
      ),
      ''
    ) as provenance_lead_id
  from public.persons p
  where not exists (
    select 1
    from public.person_leads pl
    where pl.organization_id = p.organization_id
      and pl.person_id = p.id
  )
),
leadless_rollup as (
  select
    lp.organization_id,
    count(*) filter (
      where lp.provenance_lead_id is not null
        and not exists (
          select 1
          from public.leads l
          where l.organization_id = lp.organization_id
            and l.id::text = lp.provenance_lead_id
        )
    )::bigint as retained_deleted_lead_persons,
    count(*) filter (
      where lp.provenance_lead_id is not null
        and exists (
          select 1
          from public.leads l
          where l.organization_id = lp.organization_id
            and l.id::text = lp.provenance_lead_id
        )
    )::bigint as actionable_orphan_persons,
    count(*) filter (
      where lp.provenance_lead_id is null
    )::bigint as unclassified_leadless_persons
  from leadless_persons lp
  group by lp.organization_id
),
actionable_journey as (
  select
    p.organization_id,
    count(*) filter (
      where exists (
        select 1
        from public.person_leads pl
        where pl.organization_id = p.organization_id
          and pl.person_id = p.id
      )
      and not exists (
        select 1
        from public.v_person_journey_complete j
        where j.organization_id = p.organization_id
          and j.person_id = p.id
      )
    )::bigint as actionable_persons_missing_complete_journey
  from public.persons p
  group by p.organization_id
),
normalized as (
  select
    v.organization_id,
    v.organization_name,
    v.lead_count,
    v.person_count,
    v.identifier_count,
    v.person_session_count,
    v.visitor_routing_count,
    v.leads_not_exactly_one_person,
    v.orphan_persons,
    coalesce(lr.retained_deleted_lead_persons, 0)::bigint
      as retained_deleted_lead_persons,
    coalesce(lr.actionable_orphan_persons, 0)::bigint
      as actionable_orphan_persons,
    coalesce(lr.unclassified_leadless_persons, 0)::bigint
      as unclassified_leadless_persons,
    v.person_lead_tenant_mismatches,
    v.identifier_tenant_mismatches,
    v.identifiers_shared_across_persons,
    v.person_session_tenant_mismatches,
    v.lead_sessions_missing_person_session,
    v.person_session_wrong_lead_person,
    v.visitor_link_tenant_mismatches,
    v.visitor_current_session_mismatches,
    v.open_identity_conflicts,
    v.missing_identity_policy,
    v.persons_missing_person360,
    v.persons_missing_operational360,
    v.persons_missing_complete_journey,
    coalesce(aj.actionable_persons_missing_complete_journey, 0)::bigint
      as actionable_persons_missing_complete_journey,
    v.leads_missing_journey_intelligence,
    v.journey_person_tenant_mismatches,
    v.duplicate_canonical_journey_keys,
    greatest(
      0::bigint,
      v.integrity_issue_count
        - v.orphan_persons
        - v.persons_missing_complete_journey
        + coalesce(lr.actionable_orphan_persons, 0)::bigint
        + coalesce(aj.actionable_persons_missing_complete_journey, 0)::bigint
    )::bigint as integrity_issue_count
  from public.v_customer360_identity_integrity_health_v1 v
  left join leadless_rollup lr
    on lr.organization_id = v.organization_id
  left join actionable_journey aj
    on aj.organization_id = v.organization_id
)
select
  n.organization_id,
  n.organization_name,
  n.lead_count,
  n.person_count,
  n.identifier_count,
  n.person_session_count,
  n.visitor_routing_count,
  n.leads_not_exactly_one_person,
  n.orphan_persons,
  n.retained_deleted_lead_persons,
  n.actionable_orphan_persons,
  n.unclassified_leadless_persons,
  n.person_lead_tenant_mismatches,
  n.identifier_tenant_mismatches,
  n.identifiers_shared_across_persons,
  n.person_session_tenant_mismatches,
  n.lead_sessions_missing_person_session,
  n.person_session_wrong_lead_person,
  n.visitor_link_tenant_mismatches,
  n.visitor_current_session_mismatches,
  n.open_identity_conflicts,
  n.missing_identity_policy,
  n.persons_missing_person360,
  n.persons_missing_operational360,
  n.persons_missing_complete_journey,
  n.actionable_persons_missing_complete_journey,
  n.leads_missing_journey_intelligence,
  n.journey_person_tenant_mismatches,
  n.duplicate_canonical_journey_keys,
  n.integrity_issue_count,
  case
    when n.integrity_issue_count = 0 then 'healthy'::text
    else 'degraded'::text
  end as health_status
from normalized n;

revoke all on public.v_customer360_identity_integrity_health_v2
  from public, anon, authenticated;
grant select on public.v_customer360_identity_integrity_health_v2
  to service_role;

comment on view public.v_customer360_identity_integrity_health_v2 is
  'PH-3 Customer 360 integrity health compatibility view. Preserves V1 raw counts while excluding retained Persons whose recorded provenance lead no longer exists from actionable integrity totals; current lead-link and identity-conflict defects remain actionable.';
