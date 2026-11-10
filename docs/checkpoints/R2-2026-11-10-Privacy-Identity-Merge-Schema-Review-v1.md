# R2 identity merge — minimal privacy dependency contract (REVIEW ONLY)

**NO-GO. No SQL installed on staging or production. No merge, no export/erasure executor, no tracking, no outbound sends, and no acceptance cases marked passed.** This dossier is an independently reviewable schema *proposal*, not a validated privacy system or permission to work around the staging hold.

## Verified reason for the work

The installed `public.merge_identity_resolution_conflict_v1(uuid)` SECURITY DEFINER function checks for relevant erasure jobs and export runs before allowing a human-authorized identity merge. Its normal path references `public.privacy_erasure_jobs` and `public.privacy_export_runs`; **both relations are missing** from the 431-migration isolated temporary stage, though present in production.

The **four parent tables** (`organizations`, `persons`, `privacy_data_subject_requests`, `organization_members`) exist in both projects, with `uuid` primary keys, postgres ownership and RLS enabled. This narrows the needed missing-schema contract to two tables for *this* function; it does not establish that the rest of privacy-rights automation is staging-complete.

## Exact production metadata, independently inspected (no customer rows)

| Contract | Erasure jobs | Export runs |
| --- | ---: | ---: |
| Columns | 11 | 8 |
| Named validated constraints | 6 | 4 |
| Indexes | 3 (including partial pending index) | 1 |
| Enabled row-level security | Yes | Yes |
| Member-read RLS policies | One | One |
| Non-system triggers | 0 | 0 |
| Owner | `postgres` | `postgres` |

Foreign keys reference `organizations(id)`, `persons(id)` and `privacy_data_subject_requests(id)`. **Important:** The production tables use separate FKs, not composite `(organization_id, person_id)` or `(organization_id, request_id)` FK guards. The erasure table has a separate unique `(organization_id, request_id)` constraint. The independent DBA/tenant-reviewer must review how trusted writers enforce cross-tenant consistency; matching these structural contracts alone is not sufficient.

**Difference from production worth deliberate review:** The production table ACL grants broad privileges to `anon` and `authenticated`, while RLS policies govern row access. The proposed temporary-stage-only contract instead uses *least-privilege* table grants: no anonymous SELECT, authenticated member-only SELECT, no authenticated INSERT/UPDATE/DELETE, and explicit service-role operations for separate, not-yet-enabled privileged workflows. Accordingly, the supplied audit is expected to fail against production's broader role ACLs even though all physical objects exist there. **Do not treat the production ACL as the policy to copy.**

## Artifacts

- `docs/sql/r2-staging-identity-merge-privacy-table-review-v1.sql` — **review-only** transactional proposal, bounded lock/statement timeouts, fail-closed guards for missing target tables, existing 4 parent contracts, installed human identity-merge function and **zero anonymously executable public functions** (requires approved #682 staging security migration first). Defines the two complete production-structural table contracts, CHECK/FKs/indexes, RLS policies and narrower stage role grants. Postflight verifies 2 RLS tables, required policies, roles, 10 named constraints and pending index. **No data migration or activation**.
- `docs/sql/r2-identity-merge-privacy-schema-catalog-audit-v1.sql` — independently runnable **SELECT-only** catalog audit, returns aggregate structure/role counts and explicit `privacy_legal_approval=false`, `signed_two_tenant_acceptance=false`, `retention_executor_enabled=false`, `migration_approved=false` and `release_authorized=false`.
- `tests/readiness/r2-identity-merge-privacy-schema-review.test.cjs` — regression checks for explicit table structure, RLS, restrictive role policy and no-executor/approval claims.

## Read-only baseline

The exact committed metadata audit was run on the two projects on November 10, 2026:

| Gate | Temporary R2 staging | Production |
| --- | ---: | ---: |
| Required privacy tables | **0/2** | **2/2** |
| Required parent table contracts | 4/4 | 4/4 |
| Existing identity-merge privacy checks | Present | Present |
| Validated named constraints | 0/10 | 10/10 |
| Member-read policies | 0/2 | 2/2 |
| Stage-proposed strict ACL contracts | 0/2 | 0/2 (intentionally broader production ACLs) |
| Overall stage-safe audit | `SCHEMA_OR_ROLE_REVIEW_REQUIRED` | `SCHEMA_OR_ROLE_REVIEW_REQUIRED` |

These are **metadata checks**, not production policy acceptance or evidence of a working privacy-rights system.

## Mandatory dependencies before any staging installation

1. Independent security reviewer approves exact-head [#682](https://github.com/yogakulamacademy/salsys-os/pull/682) preserving human-only Sales Asset authorization. Separately generated and independently reviewed **versioned** security migration is authorized for temporary stage; its global anonymous-public-function gate and #675 broader catalog checks must pass.
2. Privacy/legal owner approves what retained, exportable, erasable and legal-hold data mean before privacy jobs/exports can be used. The proposed table creation is NOT a consent, retention, access or erasure policy approval.
3. Independent DBA and security reviewer inspect this two-table schema, defaults, foreign keys, RLS policy, stage-only role grants, tenant-writing constraints, rollback and optional supporting SQL/policies. They must confirm the proposal does not mask unresolved rights-automation dependencies.
4. A separate CLI-generated, versioned **stage-only** migration is independently reviewed and specifically authorized; capture a staging backup, migration ledger, function ACL baseline and rollback rehearsal before applying. Do not run a `docs/sql` file directly and do not replay 146 unrelated production-only migrations.
5. Rerun the committed SELECT-only schema audit and Supabase security advisors. Require no anonymous access, correct member-only reads, constraints, ownership and indexes; witness genuine signed-in tenant A/B denied cross-organization queries and correct same-tenant access using **synthetic** test identities. Authorize a human-approved identity merge only in the isolated tenant test environment and only after reviewing the full identity function path and approved data/consent policies.
6. The automation tenant guard draft [#683](https://github.com/yogakulamacademy/salsys-os/pull/683), lead-reliability [#667](https://github.com/yogakulamacademy/salsys-os/pull/667), isolated HTTPS CRM/CMP deployment, no-send/no-tracking checks, 16 witnessed E2E cases, verified history window, backup/rollback and owner/DBA/privacy/legal release signatures remain separate gates.

**Rollback:** Because the proposal creates new tables, rollback would require an independently reviewed decision about how to preserve any post-install test rows and associated legal/consent evidence. Do not assume `DROP TABLE` is safe, and do not delete customer records or any real privacy jobs. No automated rollback is executed by this review packet.
