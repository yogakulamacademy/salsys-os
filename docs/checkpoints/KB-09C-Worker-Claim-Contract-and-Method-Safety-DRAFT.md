# KB-09C — Discovery worker method and claimed-job safety (DRAFT / NOT DEPLOYED)

**Date:** 2026-11-07. **Parent:** [KB-09B draft PR #634](https://github.com/yogakulamacademy/salsys-os/pull/634), exact parent HEAD `5c0c96c8f38ee54882e38770a6b989b07a8a81a7`.

## Findings

1. The draft worker exported `GET = POST`. A GET request could invoke the **state-changing** `claim_knowledge_discovery_job_v1` RPC and begin a source fetch. Authentication did protect it, but GET is a poor contract for a privileged mutation (including probing, prefetch/caching behavior or operator confusion). No scheduler has been authorized; the prior generic Vercel Cron approach is already incompatible with the dedicated runner secret required by KB-09B.
2. The draft worker treated *any* nonarray claim RPC payload as an empty queue. An invalid, incomplete or unexpectedly duplicated lease response could be incorrectly acknowledged as idle or proceed to site verification with missing tenant/lease fields.

## Narrow fix on this unmerged branch

- **POST** is the sole state-changing worker entry point. **GET responds HTTP 405**, `Allow: POST`, `Cache-Control: no-store`; it does not read environment secrets, create a service client, claim a job or fetch any website. The framework-generated HEAD behavior is likewise not an authorized worker invocation.
- After the privileged claim RPC, only an actual empty array means idle. A singleton claim must contain UUID-formatted `job_id`, `organization_id` and `lease_token`, a bounded `seed_url` and an integer `max_pages` from 1 to 50. Null, nonarray, multiple, or malformed replies fail with generic HTTP 503 and **no page processing**. The existing URL parser / HTTPS / hostname, domain ownership, purpose-limited consent and pilot gate remain in force for a structurally valid claim.
- Existing SQL `claim_knowledge_discovery_job_v1` and `commit_knowledge_discovery_page_v1`, leases, tenant checks, and retries are **unchanged**. Authentication remains the dedicated runner token only (KB-09B); the shared `CRON_SECRET` remains disallowed.
- Tests assert GET cannot mutate even with the correct bearer, malformed and duplicate leases do not run a tick, claim RPC errors are not represented as idle, unsafe seed URLs cannot run a fetch, and existing authorization and cancellation gates remain. The KB-09A offline static guard now rejects a GET-to-POST alias or loss of claim validation.

## Unresolved issues, no overclaims

- **No real scheduler is created or approved.** A future POST-only job dispatcher must be independently designed, authenticated with the *dedicated* runner secret, rate-limited and reviewed for retry semantics. Generic platform cron GET with `CRON_SECRET` must not be enabled as a workaround.
- Once SQL claims a job, a later DNS/ownership/consent/URL error can still leave a lease to expire; only existing SQL reclaim/retry logic resolves it. Real error-state transitions and alerting need an independent, transaction-bound, tenant-scoped design and staged concurrency testing. This PR deliberately does NOT introduce a new service-role RPC or database migration.
- Claim-shape checks defend against malformed RPC responses, not against compromised privileged service credentials, forged site content, real authenticated tenant isolation, or independent legal consent.
- The pilot remains default OFF and all real staging cases **0/16** independently witnessed. [Gate #601](https://github.com/yogakulamacademy/salsys-os/issues/601), reviewer/environment [#612](https://github.com/yogakulamacademy/salsys-os/issues/612), legal/DBA [#613](https://github.com/yogakulamacademy/salsys-os/issues/613) and staging cost [#614](https://github.com/yogakulamacademy/salsys-os/issues/614) remain blocked. Owner deferred any new paid staging until revenue and separately approved exact costs.

**No hosted Supabase Production/Recovery SQL or Auth, customer crawling or tracking, AI provider calls, consent grants, GitHub rule changes, paid resources, merge or deployment.**
