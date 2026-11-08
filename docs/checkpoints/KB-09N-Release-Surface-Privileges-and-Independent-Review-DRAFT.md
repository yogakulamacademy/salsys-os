# KB-09N — Retired seed-repair RPC and full runtime privilege preflight

**DRAFT / DO NOT MERGE / DO NOT DEPLOY / ZERO HOSTED SQL / NOT A MIGRATION**  
**Date:** 2026-11-08  
**Parent:** [KB-09M draft PR #653](https://github.com/yogakulamacademy/salsys-os/pull/653), exact verified unmerged head `d2dfd52c68532072d20b367e5349b8a2af0dbb96`.

## Verified integration finding

The current application `app/api/knowledge/discovery/route.ts` calls the KB-09J session-authorized **atomic** `enqueue_knowledge_discovery_job_v1`, which either creates a queued job *and its seed page together* or rolls back both. It no longer calls `fail_knowledge_discovery_seed_v1`.

However, the earlier KB-09H/I **service-only** emergency seed-failure repair path was still callable through both a PUBLIC PostgREST RPC (`public.fail_knowledge_discovery_seed_v1`) and private privileged function (`kb09h_fixture.fail_unseeded_queued_job_v1`). It can mark a particular queued/unclaimed job failed if supplied its organization/job/creator, even though no legitimate current runtime requires it. An orphaned privileged mutator is an unnecessary attack surface.

In the **random auto-dropped synthetic PostgreSQL fixture only**, KB-09N revokes `EXECUTE` for all non-owner API roles on **both** functions, without `DROP`, replacement DML or a runtime fallback. Existing atomic enqueue and admin cancellation remain available. No customer job or hosted role is touched.

## A second finding: residual REFERENCES privilege

Original KB-01B discovery jobs/pages granted `service_role` `ALL` table privileges. Previous KB-09G/J closed INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER but did not explicitly remove `REFERENCES` on those two tables. KB-09N closes this extra DDL permission **in disposable SQL only** while retaining read-only service SELECT. This is hardening of unnecessary privilege, not a claim that `service_role` can create arbitrary constraints under all Supabase configurations.

## Nine ACTIVE PostgREST contracts: exact role matrix

The `KB-09N` local SQL checks all nine RPCs, not only whether their names exist. The catalog preflight requires **exact one-role EXECUTE access** among anon/authenticated/service_role. PostgreSQL PUBLIC inherited permissions are covered by `has_function_privilege`.

| RPC | Authenticated | Service role | Anon |
|---|---|---|---|
| `enqueue_knowledge_discovery_job_v1` | Yes | No | No |
| `cancel_knowledge_discovery_job_v1` | Yes | No | No |
| `issue_knowledge_discovery_challenge_for_admin_v1` | Yes | No | No |
| `claim_knowledge_discovery_proof_check_for_admin_v1` | Yes | No | No |
| `confirm_checked_knowledge_discovery_proof_v2` | No | Yes | No |
| `grant_knowledge_discovery_consent_v1` | Yes | No | No |
| `withdraw_knowledge_discovery_consent_v1` | Yes | No | No |
| `claim_knowledge_discovery_job_v1` | No | Yes | No |
| `commit_knowledge_discovery_page_with_proof_v1` | No | Yes | No |

**Caveat:** `authenticated` role permission is not authorization by itself: actual database functions must still validate the signed `auth.sessions`, tenant-binding, membership, proof, consent and lease conditions. `service_role` bypasses RLS, so granting EXECUTE exclusively to service_role does not prove the service credential cannot be stolen. This table is a proposed release **least-privilege contract**, not actual production permissions.

The following LEGACY / unsafe interfaces must not be callable by user/API roles after cutover:

- `commit_knowledge_discovery_page_v1` — bypasses new proof check.
- `confirm_checked_knowledge_discovery_proof_v1` and private `kb09k_fixture.confirm_checked_domain_proof_v1` — hash-only service confirmation.
- `issue_knowledge_discovery_domain_challenge_v1` — former service-issued challenge with caller-controlled creator.
- `claim_knowledge_discovery_proof_check_v1` — old service-claimed proof.
- `fail_knowledge_discovery_seed_v1` and private `kb09h_fixture.fail_unseeded_queued_job_v1` — now-obsolete seed repair.

The standalone disposable preflight also insists that `service_role` has **no** INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER or REFERENCES privilege on the six discovery control/data tables: `jobs`, `pages`, `domain_verifications`, `site_consents`, `consent_control`, `consent_audit`. SELECT is retained for service as required by the worker. `knowledge_discovery_consent_control.grants_enabled` must remain OFF in this synthetic fixture.

## Fail-closed proof, rollback and review evidence

`docs/sql/KB-09N-retired-seed-rpc-and-acl-preflight-REHEARSAL-DRAFT.sql` is protected by the same random `salsys_kb09f_<18 hex>` database guard, `test_knowledge_admins` fixture marker, synthetic `auth.sessions`/tenant bindings and exact KB-09M+KB-09L procedures; it refuses nonfixture DBs and real `leads`/`contacts` tables. **This file is NOT a migration.**

`tests/database/knowledge-commit-ownership-races.test.mjs` runs N **only after** the previous F–M PG fixture has passed, then confirms both obsolete service RPCs are inaccessible without changing the queued/completed job, six tables have no service direct DML/DDL and active worker/cancellation RPCs remain. It deliberately temporarily restores (only inside random local fixture) each unsafe seed EXECUTE and job-table REFERENCES grant to prove the **catalog verifier fails**, then revokes again. New cutover static tests ensure the application no longer invokes seed repair and the JSON manifest lists it as retired.

### Release handoff (not an approval)

- **DBA and security reviewer:** independently inspect all F–N SQL, actual production project defaults, `PUBLIC` EXECUTE, roles/inheritance, table/sequence default privileges, private SECURITY DEFINER ownership, PostgREST exposure, lock ordering, migration and rollback diff, READ grants and all out-of-band callers. Re-author a proper versioned migration **only after** explicit isolated-staging authorization; never copy these disposable schemas or guard scripts to a hosted project.
- **Owner/operator:** secure independently reviewed GitHub branch rules and protected manual environment; obtain real isolated staging quote and explicit approval **only after revenue**. Do not use Production or Recovery as staging.
- **Legal/privacy/DBA:** review exact purpose/notice/consent policy, manual operator approval, document/metadata/backup/provider retention, withdrawal, audit immutability and all 12 schema surfaces before allowing data collection.
- **Independent staged witnesses:** validate genuine Supabase `auth.sessions`, two synthetic tenant boundaries, workers and all [16 release scenarios](https://github.com/yogakulamacademy/salsys-os/issues/601), including a separate decision on **proof validity at physical external COMMIT**. Current code checks at SQL execution time, not guaranteed at external COMMIT. Only human security/DBA/owner may approve the policy; if strict physical COMMIT is required, redesign rather than silently accepting the risk.

**Rollback default:** disable discovery pilot and dedicated worker/scheduler; preserve consent withdrawal, audit and tenant data. Never re-enable unsafe seed repair, unchecked page commit or broad service DML to paper over missing RPC. No `DROP CASCADE`, legal data erasure, default-branch merge, hosted secret access or provider call is authorized here.

**Current release status:** #601 **BLOCKED 0/16** independent real staging witnesses; #612 security/protection, #613 privacy/DBA, #614 staging/budget unresolved. The **successful synthetic CI** proves only local engineering.

**Non-actions:** No hosted Supabase migration/SQL/auth, no Production/Recovery/staging writes, no policy activation, no customer data, no website crawl, no model or paid resources, no `main` merge or deployment. The PR remains **DRAFT / UNMERGED**.
