begin;

-- ============================================================
-- MIGRATION 037
-- Lead ingest event tenant isolation + least privilege
--
-- lead_ingest_events contains tenant-owned ingestion receipts.
-- Authenticated CRM users may read rows only for organizations
-- in which they have an active membership.
--
-- Website ingestion itself remains server/service-role owned.
-- ============================================================

alter policy lead_ingest_events_read
on public.lead_ingest_events
to authenticated
using (
  public.is_crm_user()
  and public.is_organization_member(organization_id)
);

-- The authenticated role only requires SELECT because
-- security-invoker reporting/intelligence views read this table.
-- Ingestion/writes are performed through server-owned
-- SECURITY DEFINER functions.

revoke all privileges
on table public.lead_ingest_events
from authenticated;

grant select
on table public.lead_ingest_events
to authenticated;

-- Anonymous clients must never access ingestion receipts.

revoke all privileges
on table public.lead_ingest_events
from anon;

commit;
