# KB-09J — Atomic tenant-session discovery enqueue and seed

**STATUS: DRAFT / DISPOSABLE LOOPBACK POSTGRES ONLY / DO NOT MERGE OR DEPLOY**  
**Date:** 2026-11-08  
**Stack parent:** [KB-09I draft PR #646](https://github.com/yogakulamacademy/salsys-os/pull/646), exact parent SHA `82c9a13b127b0dd150b0ec5af0362aae79442153`.

## Exact problem and corrective interface

The draft API previously issued two separate `service_role` direct `INSERT` requests: a queued discovery job, then its initial `discovered` page. That allowed a seed failure or interrupted request to leave an orphan queued job and allowed a BYPASSRLS-equivalent service token to forge jobs/pages across tenants. KB-09I's narrow service-side seed failure repair was **not atomic creation** and did not remove the direct INSERT privilege.

This new **draft-only** step replaces those two application operations with a single session-authenticated `enqueue_knowledge_discovery_job_v1` RPC:

- Retains the existing API's same-origin, bounded request, current signed-in user, owner/admin UI checks, pilot OFF-by-default, exact host allowlist, initial consent and domain proof checks, page limit 1–50, 202/403/409/429/503 response contracts.
- Removes `createAdminClient` from the route; POST invokes the RPC using the **current signed-in Supabase client**. The RPC accepts organization ID, server-derived canonical root seed URL and page limit only—**not** actor/user/session/role/job ID/status.
- On success the RPC reports `ok=true`, `status='queued'`, `seed_inserted=true` and an internally generated job UUID. Missing RPC, malformed acknowledgment, seed failure, or unexpected outcome fail closed, **never** via a privileged insert/update fallback.
- KB-09I's service-only seed-failure repair exists in its prior disposable prototype but is no longer called by the new route. Its legacy cleanup role and eventual migration/drop need independent review.

## Disposable PostgreSQL rehearsal

`docs/sql/KB-09J-atomic-session-authorized-enqueue-REHEARSAL-DRAFT.sql` is hard-guarded to a random `salsys_kb09f_<18 hex>` database with required KB-01B/06A/06B/09F/09G/09H/09I fixture objects and without customer leads/contacts. **NOT a deployable migration**.

- PUBLIC `SECURITY INVOKER` wrapper is executable **only by `authenticated`**; it delegates to a private `SECURITY DEFINER` function with explicit schema and function grants, fixed search path and caller authorization.
- The private function reuses the existing KB-06B session-bound actor helper that verifies an active, bound `auth.sessions` session and current owner/admin membership in the specific tenant. The creator is obtained from this helper.
- In the database transaction, it checks the exact current configured tenant domain, an existing **current** domain ownership proof and an active purpose-limited consent, with locking; refuses malformed/cross-host URLs. It uses the existing KB-01B per-tenant advisory serialization and its unique active-job + 15-minute cooldown + 3 scans/24h SQL constraints.
- It inserts the queued job and exact seed page **in the same statement**. A seed INSERT exception aborts both writes; proof/consent expiry during execution also throws to roll back both writes.
- In this disposable fixture **only**, the previously retained direct `INSERT` grant on jobs/pages is revoked from `service_role`, including an inherited `BYPASSRLS` writer, while owner-owned worker commit functions remain reachable through their existing reviewed grants.
- No raw credentials, fetched site content, customer data, or external API calls are used.

## Synthetic test inventory

The existing loopback-only `tests/database/knowledge-commit-ownership-races.test.mjs` is extended to load the exact guarded KB-09J SQL and synthetic onboarding rows; it checks role ACL, cross-tenant and forged/revoked sessions, invalid URL and configuration mismatch, ownership/consent denial, proof-row transaction race, correct creator and one canonical seed, duplicate active-job and original cooldown, revocation of service-role/BYPASSRLS INSERT permissions, and a deliberately failing page INSERT that rolls back its whole job.

`tests/knowledge-discovery/route-authorization.test.mjs` validates the exact `.rpc()` arguments and success/error API behavior with simulated authenticated callers, no service-role dependency, stale app reads followed by authoritative SQL denial, missing RPC, malformed acknowledgments, and quota/active-job errors.

No real signed Supabase Auth, third-party owned site, actual customer tenant A/B, consent approval, retention, or model grounding is demonstrated by these synthetic tests. CI/CodeQL evidence is recorded separately after the exact branch commit completes.

## Outstanding security decisions and release gates

1. **Do not deploy the KB-09J SQL or grant REVOKEs.** Review all worker/route/ops callers and required future migrations; independent DBA/security review must approve transaction-lock order, PostgreSQL role ownership and grants, existing legacy error RPC, and no direct privileged bypass elsewhere.
2. Session-binding helper currently depends on separately authorized `tenant_session_bindings` provisioned for KB-06B. Real `auth.sessions` and signed Auth role semantics require independently witnessed staging.
3. Enqueue locks proof and consent during the RPC but an **outer caller-controlled transaction may commit after expiry**. The KB-09G proof-at-external-COMMIT policy question remains open. Consent-withdrawal interaction with enqueue / visibility under concurrent transactions also needs real two-session acceptance. This draft does not claim proof-at-COMMIT safety.
4. Privileged `service_role` DML on **domain proof and site consent tables** remains outside this fix. Worker claim/commit migration and exact server-role grant sequencing still require review; a database owner/superuser remains capable of privileged direct writes.
5. Independent legal audit/retention/erasure decisions, GitHub mandatory reviewer/protected workflow controls, isolated synthetic-only staging, 16 independently witnessed cases and separate final release approval remain outstanding.

**Gate [#601](https://github.com/yogakulamacademy/salsys-os/issues/601): OPEN/BLOCKED 0/16 real independently witnessed staging cases.** [#612](https://github.com/yogakulamacademy/salsys-os/issues/612) security/reviewer, [#613](https://github.com/yogakulamacademy/salsys-os/issues/613) privacy/DBA and [#614](https://github.com/yogakulamacademy/salsys-os/issues/614) staging/billing still need approvals. Owner defers new paid staging until SalsysOS generates revenue; revenue does not itself authorize any charge and a fresh explicit price approval is still necessary.

**Non-actions:** No hosted Production/Recovery/staging Supabase operation, live website crawling, customer data mutation, LLM/provider call, new paid project, GitHub ruleset or protected-environment change, main merge, or deployment.
