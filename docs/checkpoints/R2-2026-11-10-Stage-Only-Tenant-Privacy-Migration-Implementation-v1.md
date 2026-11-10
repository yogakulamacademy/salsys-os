# R2 stage-only tenant guard and privacy dependencies — migration implementation handoff

**2026-11-10 status: PREPARED / NOT INSTALLED / release NO-GO.**

This implementation package contains **two ordered, distinct, exact-source staging-only SQL files**. It **does not authorize** a hosted apply, automatic migration replay to Production, identity-merge operation, data-subject erasure/export, customer data handling, tracking, scheduling or any active senders.

## Design approvals and source integrity

| Package | Reviewed design | Approved SQL Git blob | CLI-generated stage-only filename |
| --- | --- | --- | --- |
| Seven-table automation tenant guard | [PR #683](https://github.com/yogakulamacademy/salsys-os/pull/683) head `7671e47e688d8c75cf8ad33c0ae2c2af8431011e` | `e621500b5264aab86cbbcd1b91b718631254a9ed` | `20261110043007_r2_staging_automation_tenant_guard_v1.sql` |
| Privacy identity-merge dependencies | [PR #684](https://github.com/yogakulamacademy/salsys-os/pull/684) head `4775f192683c2b9611d4322ffa02dcd34bad0f98` | `2a7af019efb727a2e5036ab1611b1d084edbd142` | `20261110043010_r2_staging_privacy_identity_dependencies_v1.sql` |

Both design PRs received independent `thedetourclubind-cloud` approval on 2026-11-10. The **implementation** still needs a separate DBA/security/privacy review, including function source, parent-key impact, grants and recovery. Stage-apply authorization is a distinct gate.

Pinned Supabase CLI 3.0.0 actually generated the two versioned names in a disposable no-credentials GitHub runner ([run #42756236673](https://github.com/yogakulamacademy/salsys-os/actions/runs/42756236673)). The temporary generator workflow was removed before final package review; do not reintroduce it as a production workflow. The package files are under `supabase/staging-only/migrations/`, **not** `supabase/migrations/`, to prevent the normal production migration chain from replaying them.

Tests in `tests/readiness/r2-stage-only-tenant-privacy-migration-package.test.cjs` verify the Git blob identity of **every byte** against its original approved proposal, filename/order, transaction boundaries, core ACL/schema invariants and absence from the production replay path.

## Hard sequence / STOP conditions

1. **First:** [#685](https://github.com/yogakulamacademy/salsys-os/pull/685) stage-only function ACL package must receive its own independent migration and DBA/security approval, then a separate operator authorization for actual staging application, successful verified application and both exact #682 read-only permission audits. Require zero anon-executable `public` functions, four fixed invoker search paths, correct human-only Sales Asset approval, and approved #675 security catalog gate. **No #685 apply = no tenant or privacy installation.**
2. **Second:** validate the actual temporary isolated Supabase project ID `ndxpjqkthuzxlmbenxti` still exists, is not queued for deletion, has the expected preflight catalog and ledger state, is not linked to Production `doaozrkrtgeslddwhclj`, and is approved for the current isolated stage session. Confirm backup/recreate strategy and no sender/collector/egress credentials or running production integrations.
3. **Third:** independent exact-package implementation review and DBA/security authorization for the **tenant guard** SQL; inspect `md5(p.prosrc)` fail-closed baseline, 7 existing RLS/trigger tables, privileges, schema/object dependencies, interaction with #685's changed grants, and a correct rollback definition. Apply only to the authorized isolated stage using approved migration tooling, record version once, and run `docs/sql/r2-automation-tenant-guard-catalog-audit-v1.sql`. Require `AUTOMATION_TENANT_GUARD_METADATA_PASS_NOT_E2E`. The prior read-only stage audit found 7/7 structural tables and 7/7 triggers but reported REVIEW_REQUIRED for source/ACL mismatch.
4. **Fourth:** independent exact-package DBA **and privacy/legal** approval for the **privacy schema** SQL, including nullable person-set-null behavior, consent/retention/deletion rules, member-read-only RLS, table `GRANT` boundaries, 2 new composite unique keys on *existing parent tables*, related exclusive/index lock risks, and rollback with preserved data. Only then execute the second stage migration. Rerun `docs/sql/r2-identity-merge-privacy-schema-catalog-audit-v1.sql`, require **2/2** parent composite keys and **4/4 distinct validated** same-tenant child foreign keys, and run separate Supabase Security Advisors. **Person-id belonging to a request's person** is a *separate business invariant* not proved by same-tenant FKs; privacy owner must decide before allowing nonempty jobs or exports.
5. **Fifth:** retain isolated stage application no-send barriers, confirm function ACLs remained restricted, run the approved #675 RLS/catalog gate, test synthetic tenant A/B positive and rejection cases and real signed-in test users **only with explicit E2E staging authorization**, then integrate independently approved [#667](https://github.com/yogakulamacademy/salsys-os/pull/667) lead reliability candidate in separate joint migration/recovery rehearsal. Real staging acceptance remains **0/16 witnessed on hold** until the necessary deployment and testing authorization.
6. **Production** never receives these stage-only files by automatic migration replay. Later production-facing changes need separate exact-target privacy/DBA/owner release authorization, production-specific migration contract, backup/restore proof and monitored deployment.

## Failure containment and rollback

- Both SQL sources use bounded `BEGIN`/`COMMIT` transactions, preflight and postflight, `lock_timeout=5s`, `statement_timeout=30s`. A failed preflight/postflight must ROLLBACK; stop rather than retry loops or weakening access rules.
- If the **automation guard** fails after commit, disable staged automation and use a separately reviewed captured original function-body definition to restore; do not enable anonymous EXECUTE or impersonate customers.
- If the **privacy schema** fails after commit, preserve its tables and any captured data, account for both newly created composite parent constraints and dependent child FKs, and use an independently reviewed repair/recreate plan. **Do not drop existing child rows or parent keys blindly.**
- A SQL filename or passing disposable PostgreSQL unit test does not prove hosted rollback; restore must be witnessed separately.
- No migrations, Git merges, staging access enablement, SDK collectors, sends or Production changes were performed by creating this review package.

## Current stage evidence

Previous exact [R2 issue #531](https://github.com/yogakulamacademy/salsys-os/issues/531) read-only checks show temporary stage had **431** migration versions, **zero** Auth test users, **25** anon-executable public functions, missing privacy child tables, and **0/16** real acceptance cases. It is expected to remain in that state until migration implementation approval and stage-only installation authorizations are independently recorded.

**Release gate remains NO-GO** until independently witnessed stage behavior, consent acceptance/withdrawal/GPC, lead reliability, isolated website/CRM deployment, data retention, backup/recovery, legal/privacy and final release authorization are complete.
