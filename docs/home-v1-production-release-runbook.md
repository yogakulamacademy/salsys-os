# Home V1 — limited production release runbook

**Status: not released.** Product owner waived all staging tests for this Home V1 release. The waiver is a conscious reduction in assurance, not a statement that staging tests passed or that production authorization is verified.

## Release scope and exclusions

In scope: four executive KPI slots; acquisition and historical qualification cohort evidence; current open-opportunity valuation with separate currencies; recorded CRM payment-ledger trend; source intelligence; batch demand; prioritized action queue; mobile section shortcuts; reporting coverage; and geography **field completeness**.

Not in scope: a trustworthy geographic world map, independently settled or recognized revenue, course-attributed collections, or real-time data freshness SLA. Do not promote these limitations as completed features.

## Immutable release and owner approval

- Identify the exact feature-branch commit and ensure **CI, CodeQL and clean Migration Replay all pass for that exact SHA**.
- Obtain the release owner's explicit decision to publish this **limited Home V1**. Do not interpret the waiver of staging as automatic approval of a production database change or a merge.
- Identify who can access the production Supabase SQL console and the production Vercel deployment, and confirm backups, maintenance/rollback ownership, and a rollback communication channel.
- Verify whether merging `main` auto-deploys on Vercel. Do not merge before database readiness and any required release controls are confirmed.
- Preserve the existing production dashboard function definition and grants privately before changing it. Never paste the definition, credentials, user data or session IDs into a public issue.

## Production preflight — read only

1. Confirm the intended production project through an independent approved connection.
2. Run `docs/sql/home-v1-production-rpc-preflight.sql` read-only. Before migration, `get_dashboard_snapshot` may be installed and the two Home metric RPCs absent. After migration, **all three** metadata rows must pass.
3. Verify required dependencies (organization/session-binding tables, leads, lead stage history, internal snapshot function and role/binding helpers). Missing dependency is a stop condition.
4. Compare applied migration history against the two Home migrations in this PR; do not rerun an already applied migration or assume branch order is sufficient. Review current function signatures/ACLs, trigger behavior and any other API consumer of `get_dashboard_snapshot`.
5. Confirm production application environment has the required auth and organization-session binding mechanics. No login credentials or real user data should appear in CI logs.

## Reviewed migration order — NOT approval to execute

Under a separate, explicitly authorized production-change window only:

1. First apply `supabase/migrations/20261115091500_home_dashboard_privileged_rpc_guard_v1.sql` (hardens existing snapshot RPC). This **changes direct-RPC permissions for any existing nonprivileged consumers**. Audit consumers before applying.
2. Then apply `supabase/migrations/20261115103000_home_v1_historical_qualification_and_pipeline_v1.sql` (creates the qualification and open-pipeline reporting RPCs).
3. Re-run `docs/sql/home-v1-production-rpc-preflight.sql`, requiring metadata_pass=true for every RPC. **This static SQL inspection alone does not prove that live authorization works.**
4. Use authorized, owner-controlled production accounts to verify /home access and correct failure behavior for unauthorized roles and cross-organization requests if the owner permits production smoke tests. Do not forge JWTs, impersonate users or inspect unnecessary lead data.
5. Only after the database dependency gate is satisfied should the release owner approve merging the reviewed commit and permitting a Vercel deployment. Monitor errors and restore on material regression.

There is **no authorized production database change or merge in this runbook**. The migrations use SECURITY DEFINER and session-bound checks; treat any unexpected permissions as a stop condition.

## Rollback rules

- **Frontend:** revert the production deployment to the previous known-good immutable application commit through the approved deployment process. Reverting the frontend does **not** reverse SQL changes.
- **Existing snapshot RPC:** restore the **exact previously captured production function definition and grants** if authorized and necessary, after confirming any downstream consumers. Do not improvise a permissive replacement in an incident.
- **New Home RPCs:** if their removal is approved and no consumer still depends on them, separately revoke their execution and remove them only after dependency review. Avoid blanket `DROP ... CASCADE` or uncontrolled function drops.
- Preserve audit/change records and verify the restored UI and authorization; if the failure is an access-control incident, prioritize restrictive permissions and stop further deployment.
- No destructive rollback can be declared safe without an actual dependency/permissions review of the affected production schema.

## Status and explicit waiver

- Staging testing: **WAIVED BY PRODUCT OWNER** — not performed.
- Synthetic GitHub/browser CI: required for the exact final commit.
- Production metadata readiness: currently missing the two new Home RPCs until an authorized production migration occurs.
- Final visual review and live data attribution: not independently verified.
- Decision: **NO-GO pending latest green CI, reviewed production migration/rollback approval and explicit limited-V1 release approval.**
