# R2 stage-only function hardening and approved-human-gate review — 2026-11-09

**State: proposal only, awaiting independent approval. No SQL applied to staging or production.**

## Evidence and release blocker

Temporary staging `ndxpjqkthuzxlmbenxti` has exactly 431 migrations, no Auth users or storage objects, and 5 inert cron jobs with no `pg_net` extension. Independently approved catalog query from PR #675 returned **`PRIVILEGE_CATALOG_REVIEW_REQUIRED`**. 22 postgres-owned public `SECURITY DEFINER` functions are executable by `anon` through inherited **PUBLIC EXECUTE** grants (13 trigger-returning, 9 ordinary functions). Fresh production read-only comparison on the same day confirms all 22 same signatures deny anonymous EXECUTE; 21 deny authenticated as well; only `attach_whatsapp_outbound_message_id` permits authenticated EXECUTE. All 22 explicitly allow `service_role` in both systems.

A complete read-only comparison of all 314 staging SECURITY DEFINER functions against production found 312 matching signatures and two additional role-EXECUTE differences beyond the 22 anonymous exposures. The WhatsApp retry authenticated permission is corrected; the Sales Asset service_role grant mismatch is **intentionally NOT copied** because staging installed the repository's human-only approval guard (`20261103195300_sales_asset_human_approval_guard_v1`) and Production lacks that migration. Production's broader role grant is a separate security/DBA review item, not an authorized stage-hardening target. Three stage-only public function signatures are excluded from full role-parity comparisons.

Supabase advisors also reported four `function_search_path_mutable` warnings on staging. Those four are **SECURITY INVOKER** functions, not SECURITY DEFINER, and production fixes each to `search_path=public, pg_temp`. The 40 `rls_enabled_no_policy` INFO notices and 134 authenticated callable SECURITY DEFINER functions need separate review; this patch does not assert those are safe.

## Review-only SQL proposal

`docs/sql/r2-staging-postinstall-function-grants-parity-v1.sql` is an **explicit, transactional, fail-closed security patch**:
- Precondition: the 22 distinct definer signatures and four search-path signatures exist with verified ownership and expected roles; the three anonymous-callable invoker compatibility wrappers preserve authenticated/service_role access. Sales Asset approval must be the checked-in human-admin-only implementation with `service_role` EXECUTE denied and its body explicitly requiring an authenticated actor and organization admin. It intentionally does **not** accept Production's broader Sales Asset grant.
- Revoke only `EXECUTE` on exactly 22 named functions from `PUBLIC` and `anon`, additionally revoking `authenticated` on the exact 21 functions where Production denies it. Preserve `authenticated` on `attach_whatsapp_outbound_message_id`. Never revoke `service_role`.
- Revoke only the staged authenticated EXECUTE excess on `prepare_failed_whatsapp_provider_retry_v1`. **Do not GRANT `service_role` on `approve_sales_asset_v1`**. That function must remain authenticated human-admin-only, per migration `20261103195300` and its readiness regression test.
- Pin only the four documented INVOKER-function search paths to `public, pg_temp`, matching live production settings.
- Postcondition: all 22 anonymous-exposed definers deny anonymous calls; exactly one among those retains authenticated access, and all 22 retain service_role; the retry function is service-role-only. Sales Asset approval retains authenticated access while denying both anonymous and service_role EXECUTE, with human actor/admin body guards verified. Three INVOKER wrappers deny anonymous execution while retaining authenticated/service_role; four search paths match reviewed settings. Transactional failure must roll back all changes.
- No table changes, inserts, deletes, copied records, egress, cron, API keys, domains or production identifiers; SQL uses bounded lock and statement timeouts.

`tests/readiness/r2-staging-postinstall-function-grants-parity-v1.test.cjs` supplies **static regression checks only**. It does not execute SQL or prove signed-in tenant isolation.

## Read-only stage-policy post-installation gate

`docs/sql/r2-staging-postinstall-function-role-parity-audit-v1.sql` is an independent, **SELECT-only stage-policy** verification for 24 privileged-function signatures (including the intentionally stricter Sales Asset human-only rule) and four INVOKER search paths. It produces aggregate counts and human-guard checks, not customer data. It is not general Production parity and does not apply any changes.

The revised stage-policy audit was run read-only on both projects. It is expected to **FAIL** on both pre-fix staging and the existing Production Sales Asset grant; Production is not the stage-policy authority for that function:

| Result | Temporary R2 staging | Production |
| --- | ---: | ---: |
| Expected exact definer functions present | 24/24 | 24/24 |
| Anonymous-role differences against stage policy | 22 | 0 |
| Authenticated-role permission differences | 22 | 0 |
| Service-role differences against **stage policy** | 0 | 1 |
| Matching INVOKER search paths | 0/4 | 4/4 |
| Verdict | `FUNCTION_STAGE_POLICY_REVIEW_REQUIRED` | `FUNCTION_STAGE_POLICY_REVIEW_REQUIRED` |

`tests/readiness/r2-staging-postinstall-function-grants-parity-v1.test.cjs` verifies 24 exact signature contracts, the one human-only service-role denial, source-guard checks, three extra invoker wrappers, four paths and the two independent read-only audit fail-closed states.

After any separately approved **stage-only** versioned migration, demand `FUNCTION_STAGE_POLICY_CATALOG_PASS_NOT_TENANT_ACCEPTANCE` on staging with 24 structurally valid function signatures, **zero stage-policy** role mismatches, and 4/4 fixed paths. Also rerun global anonymous-function audit, PR #675 broader catalog gate and security advisors. Existing Production intentionally fails this stage-policy audit until the separate human-only production security question is decided; do not run this proposed patch on Production. Catalog checks do not prove tenant or privacy acceptance.

## Follow-up full-public-function execution audit (2026-11-09)

The original review covered 22 anonymous-callable SECURITY DEFINER routines, one matched extra authenticated retry grant and **one intentionally preserved** Sales Asset service-role discrepancy, for 24 exact definer signatures. A broader public-function audit additionally found three anonymous-callable SECURITY INVOKER compatibility wrappers omitted from the definer-only #675 audit.

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

## Security-source provenance override — important

Production migration ledger has `sales_asset_library_foundation_v1` (20261103195200), but not the immediately following `sales_asset_human_approval_guard_v1` (20261103195300) that is installed in staging. The checked-in guard explicitly revokes `service_role` execution and prevents background workers from minting human approval. Production presently has the broader grant and permissive service-role authorization path; **this is a reviewable governance drift, not proof of unauthorized execution**. Production remediation is a distinct approved security release, outside this staging proposal. It would be unsafe to treat production roles as the sole authority for this approval workflow.

## Mandatory approval / implementation sequence

1. Independent reviewer `thedetourclubind-cloud` checks the *exact current PR head*, including 22 definer anonymous-exposure fixes, one retry authenticated-role correction, three invoker anonymous-exposure fixes, four paths and the **explicit human-only Sales Asset exception**. Full CI and CodeQL must pass. Independently verify why the human guard migration `20261103195300` is absent in Production; no service-role grant should be added to staging.
2. **After approved design**, operator generates a timestamped migration using `supabase migration new r2_postinstall_function_grant_parity` in an isolated Codespaces checkout with the reviewed schema, copies the identical SQL into the CLI-generated file, and submits the migration file for independent review on the exact new PR head. Do **not** invent migration filenames or commit to `main` prematurely.
3. Operator checks staging project ref `ndxpjqkthuzxlmbenxti`, original 431 migration history and absence of customer data; captures an ACL and rollback baseline. No production database linkage or production Preview hosting.
4. With explicit **staging-only installation** authorization, perform a reviewed remote dry run first and then apply **only the new approved migration** to temporary staging (not reapply the 431 migrations). Stop on mismatch: no reset, repair or auto retry.
5. Independently rerun PR #675 SELECT-only catalog gate. Require `CATALOG_GUARDS_PASS_NOT_ACCEPTANCE` and no `anon_security_definer_function_executable` or mutable-search-path advisor warnings; compare selected effective grants with live production via separate read-only inspection. Investigate any further differences.
6. Only after privilege pass, proceed to separately reviewed #667 reliability staging integration, isolated HTTPS CRM and CMP, real tenant A/B/lead/consent/no-send testing, rollback, and final production owner release approval.

**This proposal does NOT authorize a hosted change, staging E2E, production merge, database reset, or collector activation.** See tracking issue [#531](https://github.com/yogakulamacademy/salsys-os/issues/531).
