# R2 Closeout — Lead Capture, Identity, Raw Events & Data Quality

**Date:** 2026-10-18  
**Branch:** `feature/system-intelligence-v2`  
**Production database:** SalsysOS Production  
**Status:** COMPLETE for the R2 baseline

## Scope

R2 covers the trustworthy upstream evidence path:

`source event → privacy / contract gate → immutable raw event → processing / retry → identity resolution → lead ingest / dedupe → attribution handoff → integrity monitoring`

Provider-specific delivery edge cases remain owned by their integration phases and do not reopen the R2 baseline unless they invalidate the shared capture/identity contract.

## Production verification

### Tracking contract

- Tracking Contract v1 release is marked `ready`.
- 7 event families and 20 event contracts are present.
- 4 active Yogakulam tracking sources are configured in strict privacy mode.
- No active secret-mode source is missing its secret hash.
- Required recovery / retention / erasure-planner cron checks pass through the canonical tracking-contract evaluator.
- The canonical tracking-contract evaluator reports `ready_for_external_ingestion = true` for every active organization.

### Raw evidence and processing

- `raw_events` and `raw_event_processing` remain tenant-scoped and RLS-protected.
- Raw event idempotency is enforced by the unique `(organization_id, source_system, source_event_id)` index.
- Processing state supports leases, attempts, retries, replay count and dead-letter handling.
- Production currently has matching raw-event and processing-row counts, so no raw event is missing a processing record.
- The active-tenant tracking integrity views report zero retry-due events, zero unclassified events, zero quarantined events, zero failed lead-ingest events and zero broken session/lead links.

Historical provider-specific webhook status rows can remain failed/dead-lettered when no CRM message exists to attach them to. They are observable integration exceptions rather than a failure of the shared R2 capture contract.

### Lead ingest and dedupe

- `lead_ingest_events` has tenant/source-event idempotency through a unique `(organization_id, source_system, external_event_id)` index.
- All current lead-ingest rows are `processed`.
- No processed lead-ingest row is missing a lead ID.
- Existing-lead matching is preserved rather than forcing duplicate lead creation.

### Identity resolution

For active organizations with live CRM data, integrity checks report:

- zero leads without a person link
- zero person-link tenant mismatches
- zero identifier tenant mismatches
- zero session tenant mismatches
- zero open identity conflicts

### Attribution handoff

Attribution integrity checks report:

- zero leads without attribution
- zero attribution tenant mismatches
- zero converted leads missing required locks
- zero acquisition-state rows missing required locks

### Privacy / consent baseline

- Tracking sources honor strict privacy controls and GPC requirements.
- No overdue privacy subject requests are reported by the health view.
- No failed retention actions are reported.
- Retention remains deliberately disabled / dry-run for destructive execution; this is a production-safety posture, not an R2 blocker.

## Security hardening completed during closeout

`tracking_contract_releases` was the remaining public tracking table with RLS disabled and default browser-role table grants.

Closeout migration:

`20261018200000_tracking_contract_releases_rls_hardening.sql`

The migration:

- enables RLS on `tracking_contract_releases`
- removes direct `anon` and `authenticated` privileges
- keeps the registry on trusted service-role/server paths

Production verification after migration confirms RLS is enabled and browser roles no longer have direct table grants.

## R2 completion decision

R2 is considered complete because the shared platform contract is verified across:

1. tenant-safe raw evidence capture
2. idempotent event ingestion
3. retry/recovery infrastructure
4. deterministic identity linkage
5. lead ingest/dedupe
6. attribution handoff
7. privacy/consent controls
8. integrity health checks
9. hardened release-registry access

This does **not** mean every external provider has zero operational exceptions. Provider-specific WhatsApp / Meta / Google failure recovery belongs to R7 integration closeout.

## Next phase

Proceed to **R3 — CRM Sales Execution closeout**.

R3 should verify the operational path end-to-end:

`lead → owner → stage → contact → conversation → follow-up/task → priority queue → payment/enrollment handoff`

with role/tenant enforcement, action integrity and operator workflow QA before R3 is marked complete.
