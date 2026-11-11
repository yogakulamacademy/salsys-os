# KB-09E — Early-denial leased-job cancellation rehearsal (DRAFT / DO NOT DEPLOY)

**Date:** 2026-11-07. **Parent:** [KB-09D draft #637](https://github.com/yogakulamacademy/salsys-os/pull/637), exact parent head `02e733c6c57cad24bb0e79889daf949240a4d927`.

## Problem and existing protections

The draft Knowledge Builder worker claims a queued job via
`claim_knowledge_discovery_job_v1` before verifying site host allowlist,
ownership and current consent. Some early denials currently return 403/500
without a page-commit RPC; a claimed lease can remain `running` until its
two-minute expiry, when the existing SQL may reclaim/retry. That is not a
production incident: the worker/pilot remains unmerged and disabled by
default.

The **existing KB-06B consent withdrawal** already locks matching jobs
BEFORE the consent row, cancels queued/running jobs and audits withdrawal.
The **KB-06A commit** similarly locks the claimed job and a matching
consent record. Any future early-abort must honor those lock conventions,
not introduce a best-effort client-side job UPDATE.

## Exactly what this prototype demonstrates

`docs/sql/KB-09E-claimed-job-early-denial-CAS-REHEARSAL-DRAFT.sql`
is **not a migration**. Its guard rejects execution unless the database
is named `salsys_kb09e_<18 random hex digits>`, includes only the known
synthetic knowledge-discovery foundation marker + KB-01B/KB-06A tables,
and has no real public leads or contacts. CI creates the random localhost
PostgreSQL DB and destroys it afterward.

The **private** service-only rehearsal function:

1. Requires a simulated `service_role` JWT, explicit tenant UUID, job
   UUID, lease UUID and an allowlisted terminal denial reason.
2. Locks the exact tenant/job row `FOR UPDATE`, rejects any lost/expired
   lease or status mismatch, and derives the host from its **stored** HTTPS
   seed rather than accepting caller-supplied host strings.
3. Reads and locks the **current tenant/host** consent or proof record.
   A stale denial claim that is no longer true **does not cancel**.
   Only two supported reasons are `consent_not_active` and
   `ownership_proof_expired`. Host allowlist changes and transient
   network errors are **not** inferred from SQL and are not handled here.
4. Cancels the current lease with a tenant/job/token compare-and-set
   and writes an audit row in the **same transaction**; only a
   SHA-256 digest of the lease is stored, not the raw lease credential.
   An audit insertion error rolls back the cancellation.
5. Does not requeue work, bypass consent, increase attempts, fabricate a
   denial or grant a reviewer approval. Once cancelled, old token replay
   is rejected.

## Independent-session negative tests

`tests/database/knowledge-early-denial-lease-cas.test.mjs` loads the
**exact existing KB-01B and KB-06A SQL drafts** in a new temporary
PostgreSQL fixture; uses the actual `claim_knowledge_discovery_job_v1`
and `commit_knowledge_discovery_page_v1` transaction contracts;
asserts: wrong tenant/member/token denied, still-valid consent/proof
refuses false cancellation, real expiry cancels with an audit digest,
duplicate token replay denied, audit uniqueness failure rolls back job
changes, competing abort requests yield one winner/one stale failure,
abort-before-commit denies late page writes and commit-before-abort
leaves earlier commits intact. Another tenant remains unaffected.

**A critical remaining gap:** A page commit that wins before ownership
expiry is noticed can succeed because the existing KB-06A SQL commit
checks consent but does not independently revalidate domain ownership.
This prototype does not add an ownership check to the real commit
function. The policy for racing ownership refreshes, proof revocation,
expired proof and already issued network requests needs independent
security design and witnessed live transaction tests.

## Release constraints

The mock `service_role` claim is **not** authenticated production
Supabase verification. The real worker is **not connected** to this
fixture-only RPC; `lib/knowledge-discovery/runner.ts`,
`app/api/knowledge/discovery/worker/route.ts`, real SQL functions,
RLS and Co-Pilot retrieval are all untouched by KB-09E.
No scheduler, hosted database, paid service, customer web crawl,
AI provider request, consent grant, migration, `main` merge or
production rollout is involved.

Release gate [#601](https://github.com/yogakulamacademy/salsys-os/issues/601)
stays **OPEN/BLOCKED at 0/16** independently witnessed real staging
acceptance. Independent reviewer/environment #612, legal/DBA/retention
#613 and paid isolated staging budget #614 remain unresolved.
Owner deferred new paid staging until SalsysOS earns revenue and then
requires fresh explicit price approval.
