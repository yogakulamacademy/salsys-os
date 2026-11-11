# R2 staging-only function ACL migration — implementation handoff (2026-11-10)

**Status: migration package PREPARED / NOT APPLIED / release NO-GO.** This package is a separately reviewable implementation of the independently approved [design PR #682](https://github.com/yogakulamacademy/salsys-os/pull/682). It is not an approval to merge, to install on a hosted project, or to run 16 witnessed staging cases.

## Source identity and placement

- Approved design head: `572baa10344998c40a9ba76ccd8f45958c352f9d`; reviewer `thedetourclubind-cloud`, GitHub `APPROVED` on 2026-11-10 at 04:07:19 UTC; full CI and CodeQL SUCCESS.
- Exact approved SQL: `docs/sql/r2-staging-postinstall-function-grants-parity-v1.sql`, git blob `4dce41ad8f75d486c33e1364646ca24d44bf5c31`. The implementation test recomputes that Git blob digest from actual stage package bytes. Any byte difference is a new review event.
- Pinned Supabase CLI **3.0.0** generated the filename through the no-credential GitHub run [#42754801657](https://github.com/yogakulamacademy/salsys-os/actions/runs/42754801657), using `supabase migration new r2_staging_privileged_function_grants_v1` in a throwaway runner directory. Log confirms `20261110041634_r2_staging_privileged_function_grants_v1.sql`.
- Stage-only package: `supabase/staging-only/migrations/20261110041634_r2_staging_privileged_function_grants_v1.sql`. **It deliberately does not live under `supabase/migrations/`** and must never be included by the normal production migration replay or CD pipeline. The transient CLI-name-generator workflow must be removed before final PR review.
- Proposed transaction: 26 exact `REVOKE EXECUTE` statements, four search-path changes, no `GRANT`, verified preflight and postflight, 5s lock timeout and 30s statement timeout. Preserve human-only Sales Asset approval. The approved PR's disposable PostgreSQL suite already exercised the exact SQL with synthetic functions; that was **not** a hosted staging execution.

## Target and strict stop conditions

**Only potential target after independent migration-implementation/DBA authorization:** temporary isolated staging Supabase project `ndxpjqkthuzxlmbenxti`. Production `doaozrkrtgeslddwhclj` is explicitly **forbidden** for this stage-only package. Never select a project by display name alone or use the default linked CLI project.

Read-only baseline, last verified November 10: **431** staging migration versions, **0** `auth.users`, **25** anon-executable `public` functions (22 definers + 3 invokers), four mutable search paths, and no `privacy_erasure_jobs` / `privacy_export_runs`. No staging CRM, no legitimate staging tracking source, no live signed-in E2E, and **0/16** acceptance cases witnessed. No production writes occurred.

Abort and obtain new review if the project ID, approved SQL blob, function signatures, human-only Sales Asset body/permissions, roles, migration ledger, stage availability or any critical catalog audit differs from the reviewed baseline. In particular, a pending temporary-stage deletion/cleanup must be resolved by a human before installation, not overridden.

## Required next independent approvals (not another design PR review)

1. **DBA/security migration-implementation review** of this exact package commit, selected stage project ID, generated version, exact SQL blob, transaction/lock impact, postflight, and recovery. The approvals on #682/#683/#684 are **design approval** only, not hosted DDL or production release approval.
2. **Explicit authorized stage-only apply** after pre-apply catalog readback. Use the reviewed SQL via the approved operator's migration tooling; never execute the `docs/sql` review copy directly, never bulk replay missing production migrations and never automatically merge this PR into the production migration directory.
3. **Post-apply readback** using both exact [#682](https://github.com/yogakulamacademy/salsys-os/pull/682) SELECT-only audits:
   - `docs/sql/r2-staging-postinstall-global-anon-function-audit-v1.sql` must return `PUBLIC_FUNCTION_EXECUTE_CATALOG_PASS_NOT_E2E`, `anon_callable_functions=0`, with 3 expected invoker wrappers no longer anon-executable.
   - `docs/sql/r2-staging-postinstall-function-role-parity-audit-v1.sql` must return `FUNCTION_STAGE_POLICY_CATALOG_PASS_NOT_TENANT_ACCEPTANCE` with `role_mismatched_functions=0`, `structural_mismatches=0`, `verified_fixed_search_paths=4`, preserving the denied `service_role` Sales Asset approval.
   - Rerun independently approved [#675](https://github.com/yogakulamacademy/salsys-os/pull/675) RLS/privilege catalog audit plus Supabase Security Advisors; confirm no unexpected new function exposures, migration version recorded **once**, and production source unchanged. Audit function access without invoking mutating functions.
4. A successful catalog readback is **metadata acceptance only**. Keep 0/16 real-user staging acceptance **on hold** until tenant-isolation, privacy dependencies, lead reliability, isolated app/CMP and authorized test users are ready.

## Rollback and failure containment

- If preflight or postflight fails in the package transaction, PostgreSQL **ROLLBACK** must leave the prior stage schema and role privileges unchanged. Record the error code, catalog evidence and ledger state without exposing credentials or customer data.
- If a problem is discovered **after COMMIT**, stop stage access/senders/collector, quarantine the disposable stage and escalate to the DBA. **Do not blindly GRANT anon or service_role permissions back**; that would knowingly recreate the original exposures or bypass human-only approval.
- Preferred stage recovery: recreate/replay an independently reviewed *disposable* baseline, or a separately reviewed least-privilege compensating migration, then rerun the catalog audits and synthetic tests. Do not drop or overwrite a stage while other pending acceptance/deletion ownership actions are unresolved.
- Production rollback is not part of this stage-only package; a later production change needs its own explicit review, backup/restore rehearsal and release authorization.

## Ordered remainder of R2

Approved #682 staging ACL correction (this package, separate apply gate) → approved [#683](https://github.com/yogakulamacademy/salsys-os/pull/683) seven-table tenant guard (separate versioned staging migration and negative tests) → approved [#684](https://github.com/yogakulamacademy/salsys-os/pull/684) privacy-schema dependency (separate DBA/privacy policy review and versioned stage migration) → independently reviewed [#667](https://github.com/yogakulamacademy/salsys-os/pull/667) reliability migration joint stage rehearsal → isolated HTTPS CRM/website/CMP → 16 human-witnessed test cases → retention/withdrawal/restore and final production release gate.

**Never claim R2 release closed solely because design reviews are approved or disposable database CI is green.** Canonical blocker: [issue #531](https://github.com/yogakulamacademy/salsys-os/issues/531).
