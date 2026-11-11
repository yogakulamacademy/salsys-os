# KB-09D — Claimed-job commit acknowledgement truthfulness (DRAFT / DO NOT DEPLOY)

**Date:** 2026-11-07. **Parent:** [KB-09C draft #635](https://github.com/yogakulamacademy/salsys-os/pull/635), exact parent commit `d68841fbb53860df02efb6c7658a4e9b7b6c313a`.

## Confirmed pre-release failure

The Knowledge Builder page-processing core previously returned `{ok:true,status:reason}`
when `commit_knowledge_discovery_page_v1` returned an unsuccessful transaction
result `{ok:false,reason:'inactive_or_stale_lease'}` or
`{ok:false,reason:'consent_not_active'}`. The worker route then returned
HTTP 200 `state:'processed'` with this nested result, even though no page
update was acknowledged by PostgreSQL.

This was an **incorrect success signal** that could mislead an eventual runner
or operator; there is no authorized production discovery pilot or scheduler,
and no evidence of customer exploitation.

## KB-09D narrow correction

- `lib/knowledge-discovery/run-core.ts` preserves the SQL rejection as
  `{ok:false,reason}`. Malformed/null/no-ack commit results fail closed with
  `commit_not_acknowledged`. Only an explicit committed `{ok:true,...}`
  produces a successful tick. Unexpected transport errors still propagate.
- `app/api/knowledge/discovery/worker/route.ts` returns generic HTTP **503**
  with `Cache-Control:no-store` on a declined or absent processing outcome.
  It does not expose the lease token, internal SQL reason, source URL or
  customer content in the error response. A true acknowledged result retains
  the existing success envelope.
- `tests/knowledge-discovery/run-core-commit-outcome.test.mjs` exercises
  rejected lease, revoked-consent, page-status conflict, null/malformed result,
  successful commit and thrown transport failure with **zero website I/O**.
  `tests/knowledge-discovery/worker-authorization.test.mjs` covers the
  corresponding HTTP rejection with no internal reason/lease leakage.
  Existing authorization and default-off, POST-only discovery worker controls
  remain in effect. An additional offline guard and adversarial tests prevent
  reverting this behavior unnoticed.

## Why this is not yet a complete job-failure-handling design

The actual SQL `claim_knowledge_discovery_job_v1` (in the **draft**
KB-01B/KB-06A schema) obtains the lease **before** checking current
owner proof, allowlist and consent in the worker. If checks fail afterward,
the existing lease can expire and be retried. The current SQL bounds retries
and reclaims stale leases; these are **not** separately verified on real
independent tenant sessions in production-like staging. This PR does NOT
alter those SQL functions, revoke leases, introduce an error-ack RPC,
or prevent a future worker's retries. Do not invent lease-release behavior
without tenant/lease-token CAS, revocation/consent transaction locks,
deduplicated audit and two-session race tests. Current 503 behavior is an
accurate failure acknowledgment; it does not by itself guarantee eventual
delivery, monitoring or recovery.

**Operational status:** no approved scheduler (a future dispatcher must use
POST and dedicated `KNOWLEDGE_DISCOVERY_RUNNER_SECRET`), no pilot enabled,
no website crawl, AI provider, customer data, hosted Supabase query/migration,
paid staging, environment/rules change, merge or deployment.

[Release gate #601](https://github.com/yogakulamacademy/salsys-os/issues/601)
remains **BLOCKED at 0/16 independently witnessed real staging scenarios**.
Independent review #612, legal/DBA #613 and staging budget #614 remain open.
Owner deferred any paid staging until the product earns revenue and a fresh
explicit budget approval is given. Green synthetic CI does not close these.
