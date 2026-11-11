# KB-09M — Integration inventory, migration sequencing and non-destructive rollback

**Status:** DRAFT / DO NOT MERGE / NOT A MIGRATION / NOT APPROVED FOR HOSTED SQL  
**Date:** 2026-11-08  
**Stack parent:** [KB-09L draft PR #650](https://github.com/yogakulamacademy/salsys-os/pull/650), exact SHA `461b1d3604a03a010f198eee09897b2abb0693fb`, unmerged.  
**Machine-readable locked contract:** `docs/checkpoints/KB-09M-cutover-inventory-DRAFT.json`.

## Verified integration defect and local draft repair

### Finding

The [worker runner](../../lib/knowledge-discovery/runner.ts) still called `public.commit_knowledge_discovery_page_v1` directly, even though the KB-09F security rehearsal revoked service-role `EXECUTE` on that unchecked commit function and replaced it with the private `kb09f_fixture.commit_page_with_current_proof_v1` which checks **current domain proof** under lock before the original KB-06A consent-aware page commit. Isolated KB-09F tests passed by calling the private helper; the actual worker-to-PUBLIC-RPC contract was therefore **not proven functional**. Deploying previous drafts together risked a failed worker or a tempting unsafe permission regrant.

### Draft-only resolution

- The actual runner now calls `commit_knowledge_discovery_page_with_proof_v1` through `createAdminClient().rpc`; it **never falls back to the legacy commit** on missing RPC, revoked permission or malformed response. Existing job/tenant/page/lease arguments and worker-only dedicated-secret authorization remain intact; other CRM/financial modules unchanged.
- `docs/sql/KB-09M-proof-checked-worker-commit-bridge-REHEARSAL-DRAFT.sql` creates the PUBLIC-schema SECURITY INVOKER adapter exclusively in the **random, auto-dropped local KB-09F test database**. It exposes service-role EXECUTE only and delegates to the existing KB-09F tenant/lease/proof checker, which in turn calls the existing KB-06A consent-aware page commit. Legacy unchecked page-commit EXECUTE remains revoked.
- The exact public RPC—not only a private fixture helper—is tested for service-only grant, invalid tenant, stale lease, expired ownership proof (no page change), correct one-time success, and duplicate-commit denial. A separate mocked runner test covers exact RPC call and fail-closed missing/permission-denied response.
- **The PRIVATE `kb09f_fixture` is test-only. No production-safe/public wrapper is deployed on hosted Supabase.** The runtime change must NOT be merged or released alone: the method will be missing and the worker will fail closed until an independently approved, versioned and reviewed replacement exists.

## Inventory: order matters, NO automated deployment

The reviewed source order is recorded in the JSON contract. The source files are **not installable migrations**. In a future independently approved isolated staging project **only**, qualified reviewers must convert these draft sources to proper versioned, idempotent-as-designed, audited migration artifacts after resolving exact ownership/role behavior:

| Review order | Source | Dependency and risk |
|---|---|---|
| 1 | KB-01B | Discovery proofs, jobs, pages, original claim/commit and triggers. Legacy proof write/commit permissions are insufficiently scoped for a final deployment |
| 2 | KB-06A | Purpose-limited website consent, consent-aware claim and commit overrides; must load after KB-01B |
| 3 | KB-06B | Exact Auth-session owner/admin binding, consent policy control and append-only audit, grant/withdrawal; requires actual `auth.sessions` and separately authorized tenant bindings |
| 4 | KB-06C | Withdrawn-metadata erasure and audit. **Not blanket data-retention approval**; no customer deletion without independent legal/DBA decision |
| 5 | KB-06E | Reviewed-policy document preview, exact text/digest, operator-controlled registry, no automatic consent grants; depends on KB-06B/06C |
| 6 | KB-07D | Consent/erasure audit TRUNCATE protection; must be reviewed with audit-immutability triggers and KB-06C |
| 7 | KB-09F→KB-09M | LOCAL guarded proof, privilege, cancellation, atomic job creation, preimage verification and worker RPC rehearsals. **NOT MIGRATIONS. Do not copy fixture schemas or REVOKEs to any hosted project. Re-author, resolve exact owners and permissions, and approve independently** |

The complete protected synthetic fixture supplies `test_knowledge_admins`, temporary stand-ins for `auth.sessions`, `tenant_session_bindings`, `organization_onboarding`, and TEST-ONLY schemas. Those do not prove the real system's Auth/session provisioning, service-role ownership, default PUBLIC grants, actual applied schema, or independent data privacy controls. Dependencies outside these files (existing CRM/Knowledge tables, earlier KB drafts, reference FKs and human approvals) require full diff and DBA review.

**PostgREST exposure:** A new PUBLIC RPC must have precisely reviewed `EXECUTE` grants and invoker/definer ownership. A service role typically bypasses RLS, so direct table UPDATE/INSERT/TRUNCATE grants must be independently reconciled and removed where appropriate. Supabase's Data API configuration, default ACLs and schema exposure must be reviewed. An unintended PUBLIC function EXECUTE can invalidate the entire tenant boundary. No protected environment, project credential or live SQL configuration is inferred from YAML.

### Required application-to-database RPC contracts at cutover

The JSON inventory pins every runtime caller and role. At minimum, there are **nine** active contracts, including caller-bound job enqueue and cancel, session-authorized proof issue/claim, a service-only proof preimage v2 confirmation, caller-bound consent grant/withdrawal, service-only job claim and the **new proof-checked page commit**. Confirm the exact signatures through a separately approved staged PostgREST request. The legacy unchecked page commit and hash-only proof confirmation must remain inaccessible. The worker's direct SELECT reads must remain scoped and permitted, but no direct privileged DML bypass may be restored to make a broken RPC appear to work.

## Future controlled rollout gates (NOT authorized by this document)

**Gate S0 — Independent owner decisions.** Preserve all existing features and contributors' branches; no blanket KB merge. Confirm exact intended SHA/PR stack, reviewer capacity and qualified independent signoffs, legal purpose/retention/erasure notices, proof-expiry policy, impact on company/financial/audit data, protected GitHub environment and budget approval. Dedicated isolated staging cannot share Production or Recovery. New paid project is deferred until product revenue, then requires **fresh explicit owner price approval**.

**Gate S1 — Separate reviewed migrations and session provisioning.** Create proper migrations through supported tools only after S0 and isolated staging authorization. Security/DBA reviewers must read full SQL diffs, dependency order, function owners, privileges, default grants, RLS, trigger behavior, 12-table retention surface and downstream copies. Apply **only** to the approved test project. Seed synthetic tenants A/B and owned proof website under separate authorization. Validate real `auth.sessions` membership, session revocation and tenant binding rows, their cleanup and audit.

**Gate S2 — Dry-run cutover while OFF.** Keep `KNOWLEDGE_DISCOVERY_PILOT_ENABLED` and consent-grant features OFF. Verify the nine exact runtime RPC signatures; denied legacy RPCs; service SELECT but no direct privileged DML; public/private EXECUTE defaults; policy grants remain disabled. Exercise all hard-fail cases: missing RPC, wrong tenant, revoked session, invalid/expired proof, consent withdrawn, race with late page commit, missing/mismatched policy, lease replay, fail-insert and worker exception. Observe real PostgREST transactions and SQL statement/lock timeouts. Do not enable crawler or provider calls at this point.

**Gate S3 — Independent witnessed acceptance.** Only after all separate approvals, protect the manually triggered environment and run a controlled synthetic-only owned website pilot, real signed session and two-tenant A/B. Have independent witnesses check **all 16** cases in [release gate #601](https://github.com/yogakulamacademy/salsys-os/issues/601), including SSRF/DNS/robots, quotes, the actual model boundary if authorized, consent withdrawal and erasure, retention, historical citations, protected manual workflow, rollback and reconciled audit receipts. Synthetic CI, operator checklists or self-reported green results do not count as real witnesses.

**Gate S4 — Explicit release authorization only.** After S3 passes, obtain named independent security, privacy/legal, DBA and owner signoffs and a separate merge/deployment decision. Never promote simply because GitHub reports `mergeable=true`.

## Safe incident response and rollback — NON-DESTRUCTIVE / REVIEW ONLY

Default emergency response: **turn discovery pilot OFF**, stop/revoke the dedicated runner secret and any authorized scheduler, disable new consent grant operations (do not remove ability to withdraw), isolate pending discovery processing, and preserve exact audit records and current tenant data for independent reconciliation.

- **DO NOT** regrant `service_role` broad direct jobs/pages/proof/consent DML or legacy unchecked RPC EXECUTE to restore service during an incident.
- **DO NOT** automatically drop SQL tables/functions/triggers, use `DROP ... CASCADE`, replay fixtures on hosted environments, delete consent/audit/retention evidence or restore from Production/Recovery as test data.
- If a staged schema change must be reverted, a separate, independently approved, data-aware reverse migration must verify no in-flight leases, no tenant changes, no audit loss, operator registry disabled state, referential integrity and per-surface retention requirements. Where preserving auditable records prevents structural reversal, **leave schema in place with all write features disabled**.
- If the new checked worker RPC is missing/denied, **fail closed and keep worker OFF**. Do not fall back to the unchecked `commit_knowledge_discovery_page_v1`.
- If consent is withdrawn, retain the authenticated withdrawal pathway and legally required immutable audit, stop active work; separate, approved data erasure is a different process.
- Re-enable only after the original defect and all safety controls are independently resolved and a fresh approved cutover is recorded.

## Explicit unresolved blockers

1. **No approved migration set exists.** All KB-09F–M SQL is disposable-only; real SQL ownership and migration ordering have not been independently approved.
2. **Proof expiry at physical external COMMIT remains unresolved.** Earlier tests prove that an outer transaction can return `ok=true` then commit after expiry. Five-second margins are not a commit-time guarantee; security/DBA/product must explicitly approve execution-time semantics or require redesign.
3. **Service key and proof preimage remain privileged assets.** Possession of original proof token is not database attestation of external website publication. Review request logging, transport and service-role privileges; no secrets in audit.
4. **Consent policy activation is not approved or implemented.** KB-09L private synthetic operator receipts never turn on policy grants, do not represent legal approval; real human-reviewed process awaits #613.
5. **Real staging gate:** [#601](https://github.com/yogakulamacademy/salsys-os/issues/601) is **OPEN/BLOCKED at 0/16** independently witnessed cases; [#612](https://github.com/yogakulamacademy/salsys-os/issues/612) security/protection, [#613](https://github.com/yogakulamacademy/salsys-os/issues/613) legal/DBA and [#614](https://github.com/yogakulamacademy/salsys-os/issues/614) isolated staging/price are unresolved.
6. **Existing CMS, CRM, finance and Knowledge approvals must not change.** This draft touches only the isolated discovery worker and its local tests/runbook; no approval/reservation/payment/deletion state can be inferred.

## Evidence and non-actions

- Exact public checked RPC verification: `tests/database/knowledge-commit-ownership-races.test.mjs` on a random auto-dropped local PostgreSQL instance; role ACL, wrong tenant, stale lease, expired proof, one-time success and old RPC denial.
- JS/TS worker contract and missing-RPC fail-closed checks: `tests/knowledge-discovery/worker-commit-contract.test.mjs`.
- Static, source-to-RPC-name and safety gating inventory: `tests/knowledge-discovery/cutover-inventory.test.mjs`.
- GitHub CI and CodeQL receipts must be verified for the **exact final KB-09M SHA** before being recorded. No later deployment implied by green CI.

**No Production, Recovery or hosted staging access; no customer records; no external website fetch/crawl; no actual Supabase migration; no new paid project, model call, owner approval, GitHub protection change, `main` merge or deployment.**
