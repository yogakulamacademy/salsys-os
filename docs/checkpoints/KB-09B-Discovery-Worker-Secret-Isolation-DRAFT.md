# KB-09B — Dedicated credential isolation for discovery worker (DRAFT / NOT DEPLOYED)

**Date:** 2026-11-07. **Parent:** KB-09A [draft #633](https://github.com/yogakulamacademy/salsys-os/pull/633), reviewed HEAD `c46e75fcb814fa366a92c9e0783cd73503295114`.

## Audited weakness

The new discovery worker route `app/api/knowledge/discovery/worker/route.ts`
previously built an accepted bearer-secret list from BOTH
`KNOWLEDGE_DISCOVERY_RUNNER_SECRET` and the existing application-wide
`CRON_SECRET`. The second credential serves unrelated scheduling workloads.
If the KB pilot were explicitly enabled, a credential holder for other cron
jobs would also have had access to the discovery job claim/processing endpoint.

**This is a pre-release least-privilege vulnerability in a draft feature,
not evidence that anyone exploited it.** The default-off discovery pilot
still prevented active job processing; the PR was never merged or deployed.

## Narrow draft-only fix

- The discovery worker now accepts **only**
  `KNOWLEDGE_DISCOVERY_RUNNER_SECRET` for both its `POST` and Vercel-Cron
  compatible `GET` handler. An unset/blank dedicated secret fails with
  HTTP 503 before creating an admin client or claiming a job.
- A bearer using `CRON_SECRET` alone returns HTTP 503 without a dedicated
  secret, or 401 when a separate dedicated runner secret is configured.
  Correct dedicated bearer remains valid only when the pilot is explicitly
  on and the existing host, ownership and consent checks pass.
- `tests/knowledge-discovery/worker-authorization.test.mjs` covers both
  rejection cases and the preserved dedicated-token path. The KB-09A offline
  mainline guard now rejects accidental replacement of the dedicated
  credential with `process.env.CRON_SECRET`.
- No changes to `CRON_SECRET` itself or to unrelated scheduler routes,
  any existing CRM/Co-Pilot/manual-approval contract, or database schema.

## Operational implication / release constraints

**Do not activate or schedule this worker now.** A future scheduler design
must be independently reviewed and be able to present the dedicated
`KNOWLEDGE_DISCOVERY_RUNNER_SECRET`, with secure secret provisioning,
rotation, revocation, auditing and scoped environment controls. Vercel's
default cron bearer handling of `CRON_SECRET` does **not** automatically
satisfy this new dedicated-secret contract. No scheduler has been
configured, and this PR makes no claim that one is ready.

The existing default-off pilot, exact hostname allowlist, time-bound domain
ownership, site consent, DNS/redirect/robots checks and atomic DB commit
rules are unchanged. The fix reduces one credential's authority but does
not prove full endpoint security or independent Auth/tenant/retention
acceptance. Independent reviewer approval is still required for
the complete discovery API stack; production readiness remains blocked.

Release issue [#601](https://github.com/yogakulamacademy/salsys-os/issues/601)
remains **0/16** independently witnessed real isolated staging scenarios.
[#612](https://github.com/yogakulamacademy/salsys-os/issues/612) protected
reviewer, [#613](https://github.com/yogakulamacademy/salsys-os/issues/613)
legal/privacy and DBA, [#614](https://github.com/yogakulamacademy/salsys-os/issues/614)
cost/isolation decisions remain open. Owner defers any paid staging until
SalsysOS produces revenue and then only after fresh explicit approval.

**No Supabase Production/Recovery SQL or Auth, customer data, crawling,
model calls, paid resources, branch-protection change, merge or deployment
were involved.**
