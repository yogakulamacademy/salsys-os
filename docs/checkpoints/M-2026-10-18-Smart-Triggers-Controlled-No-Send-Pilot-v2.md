# M-2026-10-18 — Smart Triggers Controlled No-Send Pilot v2

## Scope

Integrate the established Smart Triggers runtime onto the current System Intelligence v3 code line and prove the safety-critical scheduler primitives without sending any customer message.

Branch: `feature/smart-triggers-production-pilot-v2`

## Integration checkpoint

The Smart Triggers runtime and its database migration history were selectively reconciled from `feature/smart-triggers-runtime-worker` onto the current System Intelligence v3 branch. This avoided a blind merge across a heavily diverged history.

Integrated runtime surfaces include:

- `lib/automation/*`
- `app/api/automation/*`
- WhatsApp template sync runtime support
- Smart Triggers migration history
- Smart Triggers runtime/checklist documentation

The public middleware allow-list was updated for `/api/automation/runtime-scheduler`. This does **not** make the scheduler unauthenticated: the route retains its own fail-closed `CRON_SECRET` bearer validation plus the Supabase scheduler-token verification RPC.

## Build verification

Preview deployment for the middleware-integrated checkpoint:

- deployment: `dpl_9zp3rVqXpZjaCSgxFiGdqpdTXcRY`
- commit: `31b38ff337c439a760727a957cd28fa94db20b57`
- state: READY
- Next.js: 15.5.26
- compile: successful
- lint/type validity stage: completed
- deployment: completed

The protected Vercel preview could not be used as a scheduler HTTP E2E target because Preview Deployment Authentication intercepted the request before a verifiable application-function invocation. Preview protection was intentionally not weakened.

## Explicit fail-closed preview flag

A branch-scoped Vercel Preview environment variable was added for this pilot branch:

`AUTOMATION_SCHEDULER_ENABLED=false`

This makes the no-run posture explicit for this branch. No scheduler enablement was applied to production.

## Production database safety state

Verified before the pilot:

- scheduler settings remain disabled
- scheduled cron execution remains inactive
- autonomous messaging remains disabled
- provider sending remains disabled
- pilot mode remains enabled with a maximum of one provider message if a future explicitly approved pilot is configured
- no pilot lead is currently selected

No secrets were read or exposed.

## Rollback-only database pilot

A synthetic lead, workflow, and scheduled job were created inside a single SQL transaction against the existing `test-yoga-school` tenant. The transaction was rolled back after assertions.

Observed results:

| Assertion | Result |
|---|---:|
| first lease claim | 1 |
| second claim of same job | 0 |
| foreign-tenant claim of same job | 0 |
| base send allowed | false |
| suppression detected after synthetic suppression | true |
| suppressed send allowed | false |
| customer messages sent | 0 |

Base policy block reasons were:

- `policy_disabled`
- `autonomous_send_disabled`
- `human_approval_required`

After suppression, `suppressed` was added to the block reasons and sending remained false.

This verifies the key database-level controls used by the runtime:

1. a due job can be leased only once;
2. the same claimed job is not immediately re-claimed;
3. tenant scoping prevents a foreign organization from claiming the job;
4. outbound messaging stays denied by default;
5. active suppression is honored;
6. the test produced zero customer sends.

## Cleanup verification

After `ROLLBACK`, production was queried for the synthetic pilot marker. Remaining objects:

- synthetic leads: 0
- synthetic workflows: 0
- synthetic scheduled jobs: 0
- synthetic suppressions: 0

The pilot left no synthetic production rows behind.

## Runtime retry/backoff contract

The integrated worker implements bounded retry behavior for claimed-job failures:

- attempt count comes from the lease claim;
- failures are requeued while attempts remain;
- retry delay is exponential from 30 seconds and capped at 3600 seconds;
- exhausted jobs become `failed`;
- updates remain organization-scoped and require the job still to be `claimed`.

A full HTTP-driven worker E2E is still pending because the protected preview was intentionally not opened to unauthenticated traffic.

## Current gate

**PASS for controlled no-send database safety verification.**

Still OFF:

- production scheduler
- production cron execution
- autonomous messaging
- provider sending

Next checkpoint: exercise one controlled runtime `resume_wait` / `resume_reply_timeout` path with a synthetic, non-message flow under an isolated pilot context, then verify requeue/backoff and reply-race behavior. Do not enable customer messaging as part of that checkpoint.
