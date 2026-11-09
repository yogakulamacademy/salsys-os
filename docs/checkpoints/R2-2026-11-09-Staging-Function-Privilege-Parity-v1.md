# R2 staged schema: function-privilege parity review — 2026-11-09

**State: proposal only, awaiting independent approval. No SQL applied to staging or production.**

## Evidence and release blocker

Temporary staging `ndxpjqkthuzxlmbenxti` has exactly 431 migrations, no Auth users or storage objects, and 5 inert cron jobs with no `pg_net` extension. Independently approved catalog query from PR #675 returned **`PRIVILEGE_CATALOG_REVIEW_REQUIRED`**. 22 postgres-owned public `SECURITY DEFINER` functions are executable by `anon` through inherited **PUBLIC EXECUTE** grants (13 trigger-returning, 9 ordinary functions). Fresh production read-only comparison on the same day confirms all 22 same signatures deny anonymous EXECUTE; 21 deny authenticated as well; only `attach_whatsapp_outbound_message_id` permits authenticated EXECUTE. All 22 explicitly allow `service_role` in both systems.

A complete read-only comparison of all 314 staging SECURITY DEFINER functions against production found **312 identical signatures** and precisely two more matched-grant differences outside these 22: `prepare_failed_whatsapp_provider_retry_v1` permits `authenticated` EXECUTE on staging but not production, while `approve_sales_asset_v1` lacks production's explicit `service_role` EXECUTE. Both deny `anon` on staging and production. Two staging-only function signatures (different from production) are explicitly outside this grant-parity claim and require separate application-contract testing.

Supabase advisors also reported four `function_search_path_mutable` warnings on staging. Those four are **SECURITY INVOKER** functions, not SECURITY DEFINER, and production fixes each to `search_path=public, pg_temp`. The 40 `rls_enabled_no_policy` INFO notices and 134 authenticated callable SECURITY DEFINER functions need separate review; this patch does not assert those are safe.

## Review-only SQL proposal

`docs/sql/r2-staging-postinstall-function-grants-parity-v1.sql` is an **explicit, transactional, fail-closed security patch**:
- Precondition: all 22 expected distinct `public` signatures exist, are postgres-owned SECURITY DEFINER functions, and `service_role` has EXECUTE; all four expected INVOKER search-path functions exist. The two additional exact-role checks allow either already-correct production grants or the identified fresh-staging grants so a later versioned migration can be idempotent; postconditions enforce the desired end state.
- Revoke only `EXECUTE` on exactly 22 named functions from `PUBLIC` and `anon`, additionally revoking `authenticated` on the exact 21 functions where Production denies it. Preserve `authenticated` on `attach_whatsapp_outbound_message_id`. Never revoke `service_role`.
- Revoke only the staging-only `authenticated` EXECUTE grant on the exact `prepare_failed_whatsapp_provider_retry_v1` signature; grant only the missing `service_role` EXECUTE on exact `approve_sales_asset_v1` signature. Both match production and keep their existing anonymous restrictions.
- Pin only the four documented INVOKER-function search paths to `public, pg_temp`, matching live production settings.
- Postcondition: all 22 have `anon=false`, exactly one retains `authenticated=true`, and all retain `service_role=true`; the WhatsApp retry function denies `authenticated` and retains service-only access; the sales asset function allows `authenticated` and `service_role` while denying `anon`; all four paths match production. Any mismatch triggers an exception and transactional rollback.
- No table changes, inserts, deletes, copied records, egress, cron, API keys, domains or production identifiers; SQL uses bounded lock and statement timeouts.

`tests/readiness/r2-staging-postinstall-function-grants-parity-v1.test.cjs` supplies **static regression checks only**. It does not execute SQL or prove signed-in tenant isolation.

## Read-only post-installation parity gate

`docs/sql/r2-staging-postinstall-function-role-parity-audit-v1.sql` is an independent, **SELECT-only** catalog verification for the **24 exact privileged-function signatures** and four INVOKER function `search_path` settings covered by this proposal. It reports aggregate mismatch counts, no function bodies, customer records, raw identifiers, or secrets. It does not apply or undo changes.

Its first execution against both connected projects on November 9, 2026 independently established the expected baseline:

| Result | Temporary R2 staging | Production |
| --- | ---: | ---: |
| Expected exact definer functions present | 24/24 | 24/24 |
| Anonymous-role permission differences | 22 | 0 |
| Authenticated-role permission differences | 22 | 0 |
| Service-role permission differences | 1 | 0 |
| Matching INVOKER search paths | 0/4 | 4/4 |
| Verdict | `FUNCTION_PARITY_REVIEW_REQUIRED` | `FUNCTION_PARITY_CATALOG_PASS_NOT_TENANT_ACCEPTANCE` |

`tests/readiness/r2-staging-postinstall-function-grants-parity-v1.test.cjs` now verifies that the read-only gate contains the same 24 exact function signatures, intended authenticated role permissions, four search-path targets and fail-closed status logic as the proposed SQL.

After any separately approved **stage-only** versioned migration: run this **exact read-only** gate first; require `FUNCTION_PARITY_CATALOG_PASS_NOT_TENANT_ACCEPTANCE` with 24 structurally valid function signatures, zero role-mismatched functions, and 4/4 fixed paths. Then separately rerun the approved PR #675 broader anonymous-definer/role exposure audit and Supabase security advisors. Neither passing query proves live tenant authorization, consent, backups, deployability, or formal R2 release acceptance. The two staging-only definer signatures outside the matched catalog remain excluded and need separate owner-admin/tenant functional tests.

## Follow-up full-public-function execution audit (2026-11-09)

The original review covered **22 anonymously executable SECURITY DEFINER functions** and two additional matched-definer role differences (24 exact definer signatures). **A further SELECT-only read of *all* `public` routines identified three additional anonymous-callable SECURITY INVOKER compatibility wrappers**. The original post-install #675 gate counts only definers and would miss these three ordinary invokers.

| Catalog readback | Temporary staging | Production |
| --- | ---: | ---: |
| Total `public` functions | 388 | 505 |
| Anonymously executable SECURITY DEFINER | 22 | 0 |
| Anonymously executable SECURITY INVOKER | 3 | 0 |
| All anonymous-callable public routines | **25** | **0** |

The invokers are `get_pipeline_snapshot()`, `get_reengaged_workspace_v2()`, and `get_tracking_workspace()`. Both databases contain the **same exact postgres-owned, SECURITY INVOKER, STABLE signatures and function bodies**, including their `search_path=public, auth, pg_temp` settings. Only staging gives their function-level ACL `PUBLIC EXECUTE`; Production denies anonymous execution and allows existing `authenticated` and `service_role` EXECUTE.

The proposed SQL therefore additionally revokes `EXECUTE FROM PUBLIC, anon` on **only those three exact signatures**, preserving both intended roles. A fail-closed three-function preflight and postflight prevents unexpected overload, owner, SECURITY INVOKER or effective-role drift. **No caller, including anonymous, is executed during this metadata audit.**

`docs/sql/r2-staging-postinstall-global-anon-function-audit-v1.sql` is a **SELECT-only, all-public-functions catalog gate**: Stage currently returns `PUBLIC_FUNCTION_EXECUTE_REVIEW_REQUIRED` with 25 exposed; Production returns `PUBLIC_FUNCTION_EXECUTE_CATALOG_PASS_NOT_E2E` with zero. After a separately approved staged repair, require the *global* audit to show zero anon-callable public functions **in addition to** the 24-definer role-parity audit, the approved #675 broader catalog audit, and security advisors. All passing catalog gates are still **not** authenticated tenant/browser/consent acceptance.

Default `public`-schema function ACL settings for owners `postgres` and `supabase_admin` were read and found identical between staging and production. The current 25 anonymous openings are **specific function-level PUBLIC grants**, not a demonstrated divergence in default-privilege configuration. As a separate forward-looking consideration, `supabase_admin`'s default ACL allows `anon` on newly created functions in both systems; neither currently has a public function owned by that role. This should be reviewed as a future function-creation policy, not silently changed as part of the narrow R2 stage repair.

## Mandatory approval / implementation sequence

1. Independent reviewer `thedetourclubind-cloud` reviews the *exact current PR head*, especially 22 privileged anonymous-exposure fixes, two additional matched-definer ACL differences, three ordinary invoker anonymous-exposure fixes, the one intentionally authenticated function among the first 22, and four function search paths. Full CI and CodeQL must pass.
2. **After approved design**, operator generates a timestamped migration using `supabase migration new r2_postinstall_function_grant_parity` in an isolated Codespaces checkout with the reviewed schema, copies the identical SQL into the CLI-generated file, and submits the migration file for independent review on the exact new PR head. Do **not** invent migration filenames or commit to `main` prematurely.
3. Operator checks staging project ref `ndxpjqkthuzxlmbenxti`, original 431 migration history and absence of customer data; captures an ACL and rollback baseline. No production database linkage or production Preview hosting.
4. With explicit **staging-only installation** authorization, perform a reviewed remote dry run first and then apply **only the new approved migration** to temporary staging (not reapply the 431 migrations). Stop on mismatch: no reset, repair or auto retry.
5. Independently rerun PR #675 SELECT-only catalog gate. Require `CATALOG_GUARDS_PASS_NOT_ACCEPTANCE` and no `anon_security_definer_function_executable` or mutable-search-path advisor warnings; compare selected effective grants with live production via separate read-only inspection. Investigate any further differences.
6. Only after privilege pass, proceed to separately reviewed #667 reliability staging integration, isolated HTTPS CRM and CMP, real tenant A/B/lead/consent/no-send testing, rollback, and final production owner release approval.

**This proposal does NOT authorize a hosted change, staging E2E, production merge, database reset, or collector activation.** See tracking issue [#531](https://github.com/yogakulamacademy/salsys-os/issues/531).
