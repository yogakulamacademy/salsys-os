# SalsysOS — Smart Triggers + Conversation Flows Checklist

**Status:** Active product roadmap / implementation checklist  
**Date:** 2026-10-17  
**Current branch:** `feature/smart-triggers-runtime-worker`  
**Parent feature branch:** `feature/smart-triggers-v1`  
**Parent PR:** #31 — Add Smart Triggers + Conversation Flow automation foundation  
**Approx. Smart Triggers completion:** ~79%  
**Approx. overall SalsysOS completion:** ~77%  

## Product direction — locked

```text
Smart Triggers
+ Visual Conversation Flow Builder
+ Per-lead Scheduler / Wait States
+ WhatsApp + Instagram Channel Policies
+ AI Decisions grounded in Organization Knowledge
+ Human Approval / Human Handoff
+ Audit, Deduplication, Suppression and Stop-on-Reply
```

Customer auto-send remains blocked until scheduler, suppression, channel policy, provider audit, human-review, rate-limit and tenant-isolation checkpoints are signed off.

---

## Current runtime architecture

Core tables:

- `automation_workflows`
- `automation_triggers`
- `automation_conditions`
- `automation_actions`
- `automation_events`
- `automation_runs`
- `automation_action_runs`
- `automation_enrollments`
- `automation_suppressions`
- `automation_flow_nodes`
- `automation_flow_edges`
- `automation_wait_states`
- `automation_scheduled_jobs`
- `automation_variables`
- `automation_flow_versions`
- `automation_scheduler_settings`
- `automation_scheduler_invocations`

Workflow/runtime controls:

- `current_draft_version`
- `current_published_version`
- `runtime_flow_enabled`
- `automation_scheduler_settings.enabled`
- Vercel `AUTOMATION_SCHEDULER_ENABLED`

Runtime modules/routes on `feature/smart-triggers-runtime-worker`:

- `lib/automation/runtime-worker.ts`
- `lib/automation/runtime-scheduler.ts`
- `lib/automation/runtime-scheduler-api.ts`
- `/api/automation/runtime-scheduler`
- `/automation/runtime-worker-test`
- `/automation/runtime-worker-retry-test`
- `/automation/runtime-scheduler-test`

Database capabilities verified:

- `claim_automation_scheduled_jobs_v1`
- `FOR UPDATE SKIP LOCKED`
- `pg_cron` installed
- `pg_net` installed
- `supabase_vault` installed
- `invoke_automation_runtime_scheduler_v1()` installed

Current production safety state:

```text
Published flow                         v1
Editable draft                         v2
runtime_flow_enabled                   false
DB scheduler setting                   true
Cron registered                        true
Cron interval                          every minute
Vault scheduler secret                 exists
Customer auto-send                     disabled
```

Important: the recurring DB scheduler is currently issuing HTTP requests every minute, but those requests are **not yet reaching the scheduler API handler on production**. Production currently redirects `/api/automation/runtime-scheduler` to the login page because the scheduler route/public middleware change is only present on the feature branch, not on `main`/production.

---

# Implementation checklist

## ST-1 — Foundation

- [x] tenant-scoped workflow schema
- [x] RLS policies
- [x] organization-alignment guards
- [x] workflows / triggers / conditions / actions
- [x] events / runs / action-runs
- [x] enrollments
- [x] suppressions
- [x] dedupe keys
- [x] quiet-hours fields
- [x] max-attempt fields
- [x] stop-on-reply field

## ST-2 — Admin workspace

- [x] `/automation`
- [x] tenant-scoped workflow library
- [x] safe draft workflow creation
- [x] draft save does not execute
- [x] visual flow-builder foundation
- [ ] workflow duplicate UX
- [ ] pause/resume/archive controls

## ST-3 — Controlled deterministic runtime

- [x] `/automation/runtime-test`
- [x] controlled lead selection
- [x] event ledger insertion
- [x] runtime dedupe
- [x] internal `create_followup`
- [x] deterministic run passes
- [x] duplicate rerun deduplicates
- [x] zero customer messages verified
- [ ] final adversarial cross-tenant legacy-runtime test

## ST-4 — Event runtime

- [ ] canonical event emitter API
- [ ] automatic `lead.created`
- [x] controlled `message.received`
- [ ] `lead.stage_changed`
- [ ] `payment.pending`
- [ ] tag/custom-field events
- [ ] provider/webhook event adapter
- [ ] failed-event visibility

## ST-5 — Scheduler + wait states

- [x] persisted delay wait
- [x] persisted wait-for-reply
- [x] `next_action_at`
- [x] scheduled-job ledger
- [x] scheduled-job dedupe
- [x] atomic job-claim RPC
- [x] `SKIP LOCKED` concurrency protection
- [x] max-attempt claim guard
- [x] generic worker module
- [x] worker test page
- [x] generic worker E2E
- [x] completed-job no-reclaim
- [x] concurrency race: `resume_reply_timeout`
- [x] concurrency race: `resume_wait`
- [x] cross-tenant worker claim isolation
- [x] retry/backoff E2E
- [x] terminal failure after max attempts
- [x] failed-job no-reclaim
- [x] controlled due-job discovery
- [x] controlled scheduler sweep E2E
- [x] production scheduler fail-closed gate with `runtime_flow_enabled=false`
- [x] protected scheduler API route on feature branch
- [x] `CRON_SECRET` authentication verified on fresh Preview deployment
- [x] global scheduler kill-switch fail-closed test on Preview (`AUTOMATION_SCHEDULER_ENABLED=false`)
- [x] Supabase scheduler configuration table
- [x] Supabase scheduler invocation audit table
- [x] `pg_cron` registration created
- [x] `pg_net` invocation function created
- [x] recurring cron initially verified inert while DB scheduler setting was disabled
- [x] scheduler authorization secret record created in Supabase Vault
- [x] DB scheduler setting subsequently enabled for authenticated cron testing
- [x] cron is queueing one request per minute through `pg_net`
- [ ] deploy scheduler API route/public middleware change to production
- [ ] authenticated Supabase cron -> production scheduler API handler validation
- [ ] verify production scheduler API JSON response (`enabled=false`, zero work) from cron
- [ ] prove Vault secret parity at the actual production handler
- [ ] recurring background scheduler sign-off
- [ ] timezone-safe production execution sign-off
- [ ] exact datetime node
- [ ] wait-until business hours
- [ ] quiet-hours enforcement
- [x] cancel stale reply timeout on inbound reply
- [ ] general cancel/reschedule API

## ST-6 — Stop-on-reply / conversation state

- [x] reply cancels pending timeout
- [x] `reply_received` branch
- [x] `reply_timeout` branch
- [x] no-reply branch enters delay
- [x] delay resumes to terminal branch
- [x] duplicate reply/timeout fails closed
- [x] published reply branch validated
- [x] published no-reply branch validated
- [ ] real provider webhook inbound-reply integration
- [ ] multi-channel conversation policy
- [ ] human takeover pauses nurture
- [ ] explicit automation resume control

## ST-7 — Visual conversation flow builder

- [x] persisted canvas
- [x] drag/save layout
- [x] node inspector
- [x] editable branch labels/values
- [x] branch target rewiring
- [x] create/delete draft nodes
- [x] create connections
- [x] trigger / condition / wait / wait-for-reply nodes
- [x] internal action foundation
- [x] human approval/handoff node types
- [x] graph validation
- [x] reachability validation
- [x] branch-value validation
- [x] V1 cycle blocking
- [x] flow versioning
- [x] immutable published snapshots
- [x] validation definition hash
- [x] publish v1 -> clone editable v2
- [x] DB published-definition immutability
- [x] Draft v2 edit isolation from Published v1
- [ ] ask-question node
- [ ] AI nodes
- [ ] production UI polish

## ST-8 — Customer messaging actions

- [ ] WhatsApp channel eligibility resolver
- [ ] WhatsApp free-form send node
- [ ] WhatsApp approved-template node
- [ ] service-window/template-policy resolver
- [ ] Instagram send node
- [ ] provider result logging
- [ ] rate/attempt limits
- [ ] message caps
- [ ] fail closed without channel identity
- [ ] fail closed on policy/template mismatch

## ST-9 — AI + Organization Knowledge

- [x] shared Instagram + WhatsApp AI Reply Co-Pilot
- [x] Organization Knowledge V1
- [x] approved-only retrieval
- [x] draft/archive exclusion
- [x] cross-tenant knowledge isolation
- [ ] AI Reply flow node
- [ ] AI intent node
- [ ] AI risk node
- [ ] AI next-best-action node
- [ ] structured output validation
- [ ] human-review gate for sensitive intents
- [ ] low-risk auto-send eligibility policy

## ST-10 — Safety / compliance / audit

- [x] tenant-isolation foundation
- [x] run/action audit ledgers
- [x] suppression-table foundation
- [x] published-flow immutability
- [x] pinned published-version execution
- [x] zero-send controlled runtime policy
- [x] worker idempotency
- [x] worker concurrency protection
- [x] cross-tenant worker isolation
- [x] retry/terminal-failure auditability
- [x] scheduler global kill-switch foundation
- [x] workflow-level runtime gate
- [x] DB-level scheduler gate
- [x] scheduler invocation audit foundation
- [ ] production cron endpoint routing/auth validation
- [ ] opt-out keyword handling
- [ ] do-not-contact enforcement
- [ ] per-channel suppression
- [ ] workflow suppression enforcement
- [ ] message frequency caps
- [ ] human approval audit
- [ ] provider-send audit
- [ ] broader adversarial graph/runtime tests

## ST-11 — Analytics

- [ ] workflow enrollment count
- [ ] completion/drop-off rate
- [ ] node-level conversion
- [ ] reply rate by step
- [ ] time-to-first-response
- [ ] handoff rate
- [ ] provider/template failure rate
- [ ] AI draft acceptance rate
- [ ] lead-to-enrollment impact
- [ ] scheduler/worker metrics
- [ ] retry/dead-letter metrics

## ST-12 — Production rollout

- [ ] deterministic internal-only runtime final sign-off
- [x] controlled generic worker sign-off
- [x] controlled scheduler sweep sign-off
- [x] stop-on-reply sign-off
- [x] retry/backoff sign-off
- [x] terminal-failure sign-off
- [x] worker concurrency sign-off
- [x] worker cross-tenant isolation sign-off
- [x] scheduler API authentication / kill-switch sign-off on Preview
- [x] Supabase recurring scheduler foundation installed
- [x] inert recurring cron behavior initially verified
- [ ] production scheduler route deployed
- [ ] authenticated recurring cron invocation sign-off
- [ ] recurring background scheduler sign-off
- [ ] suppression sign-off
- [ ] channel-policy sign-off
- [ ] human-approval sign-off
- [ ] WhatsApp test flow
- [ ] Instagram test flow
- [ ] controlled internal-only production pilot
- [ ] controlled customer-messaging pilot
- [ ] broader tenant rollout

---

# Verified checkpoints

## A. Published versioning

```text
Published Version 1 = immutable
Draft Version 2     = editable
runtime_flow_enabled = false
```

Draft v2 edits do not modify Published v1.

## B. Reply path

```text
Trigger
-> Wait for reply
-> message.received
-> cancel timeout
-> reply_received
-> End
```

Zero customer sends.

## C. No-reply path

```text
Trigger
-> Wait for reply
-> timeout
-> reply_timeout
-> Follow-up delay
-> resume_wait
-> Continue after delay
-> No reply branch
-> End
```

Zero customer sends.

## D. Generic worker E2E

Both supported jobs execute through the reusable worker against the enrollment's pinned published version:

- `resume_reply_timeout`
- `resume_wait`

Successful jobs reached `attempt_count = 1`, completed jobs could not be reclaimed, and customer sends stayed at 0.

## E. Worker concurrency

Two workers raced the same job for both supported job types:

```text
resume_reply_timeout: racers 2 -> claims 1
resume_wait:          racers 2 -> claims 1
```

No double execution.

## F. Cross-tenant isolation

Test Yoga School worker scope attempted to claim a SalsysOS job:

```text
foreign claims       0
status unchanged     true
attempts unchanged   true
claimed_at unchanged true
```

## G. Retry + terminal failure

Controlled unsupported internal job:

```text
attempt 1 -> requeued with backoff
attempt 2 -> requeued with longer backoff
attempt 3 -> failed
failed job -> 0 future claims
```

`last_error`, attempts and timestamps remained auditable.

## H. Due-job scheduler sweep

Already-due controlled `resume_wait` jobs were discovered without passing a job ID, atomically claimed and processed through the generic worker.

Verified sweep example:

```text
due candidates  2
claimed         2
completed       2
failed          0
```

## I. Scheduler API safety gates on Preview

Workflow-level gate:

```text
runtime_flow_enabled = false
workflows scanned    = 0
candidates           = 0
claims               = 0
```

Protected scheduler API with valid Preview `CRON_SECRET` and global scheduler disabled:

```text
authorized request      yes
enabled                  false
workflows scanned        0
candidates               0
jobs claimed             0
jobs processed           0
```

This passed on a fresh Preview deployment after Vercel environment variables were refreshed.

## J. Supabase recurring scheduler foundation

Migration applied to production:

`20261017144500_automation_runtime_scheduler_foundation_v1.sql`

Git commit:

`3c6d3ca6d1877022f438dd3d164b621322db1095`

Created:

- `automation_scheduler_settings`
- `automation_scheduler_invocations`
- `invoke_automation_runtime_scheduler_v1()`
- cron job `salsys-automation-runtime-scheduler-v1`

Cron schedule:

```text
* * * * *
```

Initial fail-closed validation after installation:

```text
cron job active                     true
DB scheduler enabled                false
last_outcome                        disabled
last_request_id                     null
HTTP scheduler request while off    none
customer messaging                  disabled
```

A Vault secret record named `salsys_runtime_scheduler_cron_secret` was then created.

## K. Latest recurring-cron checkpoint — BLOCKER IDENTIFIED

Current DB state was re-verified after enabling the DB scheduler setting:

```text
DB scheduler enabled          true
cron job active               true
cron schedule                 every minute
Vault secret count            1
latest DB outcome             queued
latest request IDs            created successfully
customer auto-send            disabled
runtime_flow_enabled          false
```

Recent `pg_net` response records return HTTP `200`, but the response body is the **SalsysOS login HTML**, not scheduler JSON.

This means the recurring cron currently reaches `https://salsysos.com`, but **does not reach the scheduler API handler**.

Root cause was verified in GitHub:

- on `feature/smart-triggers-runtime-worker`, `middleware.ts` includes `/api/automation/runtime-scheduler` in `PUBLIC_EXACT_PATHS`;
- the feature branch also contains `app/api/automation/runtime-scheduler/route.ts`;
- on `main`, the scheduler route does not exist yet;
- on `main`, `middleware.ts` does not list `/api/automation/runtime-scheduler` as public.

Therefore the production root domain redirects the cron request to `/login?next=/api/automation/runtime-scheduler` before the feature-branch scheduler handler can run.

Do **not** interpret the HTTP 200 as scheduler authentication success. It is a login-page response.

---

# Current exact checkpoint for the next chat

The worker engine itself is stable through controlled tests. The active work is now the recurring production scheduler handoff.

Exact state to continue from:

```text
Branch                           feature/smart-triggers-runtime-worker
Published flow                   v1
Draft flow                       v2
runtime_flow_enabled             false
Customer messaging               OFF
Supabase cron                    installed + active every minute
DB scheduler setting             enabled=true
Supabase Vault secret            exists
Cron requests                    being queued every minute
Production scheduler handler     NOT reached
Observed HTTP body               login page HTML
Main branch scheduler route      missing
Main middleware public exemption missing
```

## Next exact action

Fix the **production route deployment/routing gap** before doing any further scheduler enablement:

1. keep customer messaging OFF and `runtime_flow_enabled=false`;
2. either merge/deploy the scheduler route + middleware public exemption to production, or temporarily point the DB scheduler endpoint to a verified feature Preview URL for a controlled test;
3. confirm a cron request returns scheduler JSON rather than login HTML;
4. confirm the JSON shows `enabled=false`, `workflowsScanned=0`, `candidatesFound=0`, and `jobsClaimed=0` while the Vercel global kill switch remains off;
5. only then declare Vault/Vercel secret parity proven at the actual handler;
6. after that, decide whether to leave the DB scheduler enabled or turn it back off before the internal-only pilot;
7. only after the authenticated recurring path is proven should we proceed to a controlled internal-only scheduler pilot.

---

# Remaining major Smart Trigger work

1. deploy scheduler route/public middleware to production and prove recurring authenticated cron JSON response;
2. recurring background scheduler production sign-off;
3. automatic event emitter + provider webhook adapter;
4. suppression / opt-out / DNC / frequency-cap enforcement;
5. WhatsApp channel policy + approved-template handling;
6. WhatsApp + Instagram actual send nodes + provider audit;
7. AI flow nodes grounded in Organization Knowledge;
8. human approval / handoff runtime;
9. analytics + production monitoring;
10. broader adversarial tests;
11. controlled internal-only production pilot;
12. controlled customer-messaging pilot.

---

# Locked rule

Do not enable autonomous customer messaging merely because the flow builder, worker or scheduler works.

Customer auto-send remains blocked until suppression, channel policies, provider audit, human-review controls, rate limits, retries and tenant-isolation tests are signed off.
