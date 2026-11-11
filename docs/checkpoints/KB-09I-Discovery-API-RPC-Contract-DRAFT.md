# KB-09I — Discovery route / tenant job-finalization RPC contract

**DRAFT — DO NOT MERGE, DEPLOY OR MIGRATE**  
**Date:** 2026-11-08  
**Stack parent:** KB-09H draft PR #644, exact HEAD `66804b7ba5f393bfda7182abdbe933b693cdd3c2`.

## Purpose

KB-09G proves that broad `service_role` job/page writes bypass proof-aware
commit controls; KB-09H separately proves tenant/admin cancellation and
service-only unseeded-job failure with atomic audit in random disposable
PostgreSQL. The unmerged discovery API still used direct privileged
`knowledge_discovery_jobs UPDATE` for both cases, preventing the KB-09G
grant restrictions from being safely sequenced. This checkpoint establishes
a **draft code/SQL interface only**; it deliberately ships **no migration**.

## Draft API changes

- `DELETE /api/knowledge/discovery` retains the same origin and authenticated
  workspace-admin checks and its existing success / 404 / 503 shapes. It now
  invokes `cancel_knowledge_discovery_job_v1` with the **current signed-in
  user's Supabase client**, not the service-role client. The DB must
  independently verify the session, tenant membership and job-row lock.
  The caller never supplies its actor/session. Only a confirmed audited
  cancellation returns success.
- If initial seed page INSERT fails in `POST /api/knowledge/discovery`, the
  server calls `fail_knowledge_discovery_seed_v1` with the privileged client,
  exact organization, new job ID and expected creator. The SQL is responsible
  for comparing current job/lease/page state, fixing the failure reason and
  atomically writing audit. The API never performs a direct job UPDATE as a
  fallback and does not claim success without an audited repair response.
- Job enqueue and seed-page INSERT **remain privileged direct INSERTs**, so
  this change does not close all privileged write paths. The worker's existing
  claim/commit path, knowledge approvals, Co-Pilot, CRM and finance remain
  unchanged.

## Strict disposable SQL rehearsal

`docs/sql/KB-09I-discovery-public-rpc-bridge-REHEARSAL-DRAFT.sql` uses
the same random disposable `salsys_kb09f_<18 hex>` DB guard as prior stages.
It creates PUBLIC-schema `SECURITY INVOKER` wrappers to the **KB-09H private
fixture procedures** solely to exercise the actual names Supabase `.rpc()`
would need to call. The user cancellation wrapper has
`EXECUTE` only for `authenticated`; the seed failure wrapper only for
`service_role`. Both explicitly revoke `PUBLIC`, `anon` and inappropriate
cross-role access. The private SECURITY DEFINER functions still enforce
tenant/session or service status and exact job-row CAS / append-only audit.

These fixtures are **not real Supabase API migrations**. The draft route
**will fail closed** with HTTP 503 on a missing function. This is intentional
for this unmerged integration; do not deploy the route independently of a
future approved, versioned, production-specific SQL/RPC plan.

## Synthetic verification

- `tests/knowledge-discovery/route-authorization.test.mjs` exercises the
  caller-session route, cross-origin/non-admin/malformed denial, inactive job,
  missing RPC, and first-page error repair with denied, missing or unaudited
  repair outcomes. Its mocks intentionally implement no direct UPDATE.
- `tests/database/knowledge-commit-ownership-races.test.mjs` now loads the
  KB-09I wrapper SQL after the KB-09H fixture, verifies explicit role grants,
  and uses the public wrapper names throughout existing cross-tenant, revoked
  session, duplicate, rollback, and job-row concurrency races.
- These are self-contained simulated sessions and auto-dropped localhost
  PostgreSQL tests. They are **not a real authenticated hosted staging
  witness**. Exact-head CI/CodeQL evidence must be recorded separately.

## Release dependencies still open

1. Independent DBA/security review of exact public RPC placement, session
   verification helper, function owner, role permissions, append-only audit,
   external transaction/ownership-proof expiration and versioned migration
   sequencing. Never deploy KB-09G REVOKEs before this is proven.
2. Close remaining privileged direct INSERT pathways and domain proof/consent
   grant surfaces. Review service-repair failure monitoring, job retries and
   audit retention/erasure policy.
3. Independent two-session A/B tenant staging acceptance and all 16 release
   scenarios; real Supabase Auth, signed JWTs, consent/privacy approvals and
   protected GitHub staging environment. No synthetic test substitutes.
4. Explicit new owner approval is needed for any billed isolated staging
   after revenue, and separate release approval is needed to merge/deploy.

**Release gate #601 stays OPEN/BLOCKED at 0/16 witnessed real staging
scenarios; #612, #613, and #614 are unresolved.** No Production/Recovery,
staging Supabase, customer data, website crawl, paid resource, protected
GitHub ruleset, `main` merge, or deployment may be touched in KB-09I.
