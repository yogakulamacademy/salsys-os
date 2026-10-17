# SalsysOS — Smart Triggers + Conversation Flows Checklist

**Status:** Active product roadmap / implementation checklist  
**Date:** 2026-10-17  
**Current branch:** `feature/smart-triggers-runtime-worker`  
**Parent feature branch:** `feature/smart-triggers-v1`  
**Parent PR:** #31 — Add Smart Triggers + Conversation Flow automation foundation  
**Approx. Smart Triggers completion:** ~74%  
**Approx. overall SalsysOS completion:** ~76%  

## Product Direction — Locked

SalsysOS automation is not limited to simple `WHEN -> THEN` rules.

The target is a WATI/AiSensy-style conversation automation system adapted to SalsysOS:

```text
Smart Triggers
+ Visual Conversation Flow Builder
+ Per-lead Scheduler / Wait States
+ WhatsApp + Instagram Channel Policies
+ AI Decisions grounded in Organization Knowledge
+ Human Approval / Human Handoff
+ Audit, Deduplication, Suppression and Stop-on-Reply
```

Customer auto-send remains blocked until channel-policy, suppression, approval, audit, tenant-isolation and production-runtime checkpoints are complete.

---

## Current Data Model

Core automation foundation:

- `automation_workflows`
- `automation_triggers`
- `automation_conditions`
- `automation_actions`
- `automation_events`
- `automation_runs`
- `automation_action_runs`
- `automation_enrollments`
- `automation_suppressions`

Conversation-flow/runtime foundation implemented:

- `automation_flow_nodes`
- `automation_flow_edges`
- `automation_wait_states`
- `automation_scheduled_jobs`
- `automation_variables`
- `automation_flow_versions`

Workflow version pointers:

- `current_draft_version`
- `current_published_version`
- `runtime_flow_enabled`

Enrollments support:

- `current_node_id`
- `flow_version`
- `next_action_at`
- per-enrollment variables
- pinned published-flow execution state

Runtime worker foundation now includes:

- atomic due-job claim RPC: `claim_automation_scheduled_jobs_v1`
- `FOR UPDATE SKIP LOCKED` concurrency protection
- attempt-count increment at claim time
- max-attempt enforcement
- generic runtime worker module: `lib/automation/runtime-worker.ts`
- controlled worker UI: `/automation/runtime-worker-test`
- generic processing target types:
  - `resume_wait`
  - `resume_reply_timeout`
- controlled E2E worker execution validated
- duplicate/idempotent rerun protection validated
- two-worker race validation on both supported job types
- cross-tenant claim isolation validated using Test Yoga School

The claim RPC is applied to production Supabase, but automatic background pickup remains disabled.

---

# Smart Trigger Implementation Checklist

## ST-1 — Foundation

- [x] tenant-scoped workflow schema
- [x] RLS policies
- [x] organization-alignment guards
- [x] workflow definitions
- [x] triggers
- [x] conditions
- [x] actions
- [x] events
- [x] run ledger
- [x] action-run ledger
- [x] enrollments
- [x] suppressions
- [x] dedupe keys
- [x] quiet-hours fields
- [x] max-attempt fields
- [x] stop-on-reply field

## ST-2 — Admin Workspace

- [x] `/automation`
- [x] tenant-scoped workflow library
- [x] create safe draft workflow
- [x] draft save does not execute anything
- [x] first definition: `lead.created -> create_followup`
- [x] visual workflow edit foundation in `/automation/flow-builder`
- [ ] workflow duplicate UX
- [ ] pause/resume/archive controls

## ST-3 — Controlled Deterministic Runtime

- [x] `/automation/runtime-test`
- [x] manual activation for controlled testing
- [x] manual lead selection
- [x] event ledger insertion
- [x] runtime dedupe design
- [x] internal `create_followup` action implementation
- [x] no provider/customer-message action in controlled test
- [x] optional-field tenant-alignment fix
- [x] first deterministic run passes
- [x] identical rerun deduplicates
- [x] verify 1 event / 1 run / 1 action-run / 1 task
- [x] verify zero customer messages
- [ ] final adversarial cross-tenant runtime test for legacy deterministic runtime

## ST-4 — Event Runtime

- [ ] canonical event emitter API
- [ ] automatic `lead.created`
- [x] controlled `message.received` event path validated
- [ ] `lead.stage_changed`
- [ ] `payment.pending`
- [ ] tag/custom-field events
- [ ] provider/webhook event adapter
- [ ] durable retry policy
- [ ] dead-letter / failed-run visibility

## ST-5 — Scheduler + Wait States

- [x] persisted delay wait-state foundation
- [x] persisted wait-for-reply node
- [x] persistent `next_action_at`
- [x] scheduled-job ledger
- [x] scheduled-job dedupe index
- [x] controlled due-job claim/resume behavior
- [x] retry attempt counter exercised in controlled delay resume
- [x] atomic generic job-claim RPC created
- [x] atomic claim uses row lock + `SKIP LOCKED`
- [x] max attempts enforced during claim
- [x] generic runtime-worker module created
- [x] controlled runtime-worker test page created
- [x] controlled generic worker E2E validation
- [x] idempotent rerun / completed-job no-reclaim validation
- [x] concurrent/double-claim validation for `resume_reply_timeout`
- [x] concurrent/double-claim validation for `resume_wait`
- [x] cross-tenant worker claim isolation validation
- [ ] production recurring due-job pickup / cron
- [ ] retry/backoff E2E validation
- [ ] failed-job/dead-letter E2E validation
- [ ] timezone-safe production execution
- [ ] exact datetime node
- [ ] wait-until business hours
- [ ] quiet-hours enforcement
- [x] cancel stale reply-timeout job when reply arrives
- [ ] general cancel/reschedule job API

## ST-6 — Stop-on-Reply / Conversation State

- [x] controlled inbound reply cancels pending no-reply timeout
- [x] reply wait resumes correct `reply_received` branch
- [x] no-reply timeout follows `reply_timeout` branch
- [x] no-reply branch can enter delay and resume to next node
- [x] duplicate reply/timeout processing fails closed in controlled tests
- [x] published reply branch validated against pinned version
- [x] published no-reply branch validated against pinned version
- [x] published delay resume validated to terminal node
- [ ] real webhook inbound reply integration
- [ ] multiple-channel conversation policy
- [ ] prevent nurture after human takeover
- [ ] human takeover pauses automation
- [ ] explicit resume automation control

## ST-7 — Visual Conversation Flow Builder

- [x] persisted canvas / node UI
- [x] drag + save layout
- [x] node inspector
- [x] editable edge labels / branch values
- [x] branch target rewiring
- [x] create draft nodes
- [x] delete non-trigger draft nodes
- [x] create draft connections
- [x] trigger node support
- [x] condition node support
- [x] wait node support
- [x] wait-for-reply support
- [x] internal action node foundation
- [x] human approval / handoff node types available in draft catalog
- [x] graph validation before publish
- [x] reachability validation
- [x] branch-value validation
- [x] controlled V1 cycle blocking
- [x] versioned flow definitions
- [x] immutable published snapshots
- [x] draft vs published versions
- [x] validation definition hash / stale-validation protection
- [x] publish v1 -> clone editable v2
- [x] database-level published node/edge immutability guard
- [x] verify Draft v2 edit does not alter Published v1
- [ ] ask-question node
- [ ] AI nodes
- [ ] production-ready interaction polish

## ST-8 — Customer Messaging Actions

- [ ] WhatsApp channel eligibility resolver
- [ ] WhatsApp free-form send node
- [ ] WhatsApp approved-template node
- [ ] WhatsApp service-window/template-policy resolver
- [ ] Instagram send node
- [ ] provider result logging
- [ ] rate / attempt limits
- [ ] message caps
- [ ] fail closed when channel identity unavailable
- [ ] fail closed when template/policy requirement not satisfied

## ST-9 — AI + Knowledge Nodes

- [x] shared Instagram + WhatsApp AI Reply Co-Pilot exists
- [x] Organization Knowledge V1 exists
- [x] approved-only retrieval validated
- [x] draft exclusion validated
- [x] archive exclusion validated
- [x] cross-tenant knowledge isolation validated
- [ ] reusable AI Reply flow node
- [ ] AI intent classification node
- [ ] AI risk classification node
- [ ] AI next-best-action node
- [ ] structured output validation
- [ ] human-review gate for sensitive intents
- [ ] low-risk auto-send eligibility policy

## ST-10 — Safety / Compliance / Audit

- [x] tenant isolation foundation
- [x] run/action audit ledgers
- [x] suppression table foundation
- [x] published flow immutability guard
- [x] enrollment pinned to immutable published version
- [x] runtime stays disabled during all controlled graph tests
- [x] controlled graph tests verified zero customer messages
- [x] scheduled-job dedupe foundation
- [x] generic worker atomic-claim foundation
- [x] generic worker idempotency validation
- [x] worker concurrency/double-claim validation
- [x] cross-tenant generic-worker claim isolation
- [ ] opt-out keyword handling
- [ ] do-not-contact enforcement
- [ ] per-channel suppression
- [ ] workflow suppression
- [ ] message frequency caps
- [ ] human approval audit
- [x] flow version audit foundation
- [ ] provider-send audit
- [ ] cancellation audit expansion
- [ ] broader adversarial cross-tenant graph/runtime tests

## ST-11 — Analytics

- [ ] workflow enrollment count
- [ ] completion / drop-off rate
- [ ] node-level conversion
- [ ] reply rate by step
- [ ] time-to-first-response
- [ ] handoff rate
- [ ] template/send failure rate
- [ ] AI draft acceptance rate
- [ ] lead-to-enrollment impact
- [ ] scheduler/worker success + failure metrics
- [ ] job retry/dead-letter metrics

## ST-12 — Production Rollout

- [ ] deterministic internal-only runtime final sign-off
- [x] controlled generic scheduler worker sign-off
- [x] controlled stop-on-reply logic sign-off
- [ ] recurring background scheduler sign-off
- [ ] retry/backoff sign-off
- [ ] failed/dead-letter sign-off
- [ ] suppression sign-off
- [ ] channel policy sign-off
- [ ] human-approval sign-off
- [ ] WhatsApp test flow
- [ ] Instagram test flow
- [x] generic worker cross-tenant claim isolation test
- [x] worker concurrency test
- [ ] rate-limit / retry test
- [ ] controlled internal-only production pilot
- [ ] controlled customer-messaging pilot
- [ ] broader tenant rollout

---

# Verified Flow Checkpoints

## 1. Draft graph structure

Validated draft graph:

```text
New lead created
  -> Wait for customer reply
  -> Did the customer reply?
       -> reply_received -> Reply branch (end)
       -> reply_timeout  -> Follow-up delay
                           -> Continue after delay
                           -> No reply branch (end)
```

Validation result:

```text
Nodes          6
Connections    5
Validation     passed
Messaging      disabled
```

## 2. Versioning

```text
Published Version 1 = immutable snapshot
Draft Version 2     = editable clone
Runtime enabled     = false
```

Verified Version 2 edit did not alter Version 1.

## 3. Published enrollment pinning

A controlled enrollment was pinned to Published v1 while Draft v2 existed.

Verified:

```text
flow_version = 1
Draft at start = 2
current_node = published v1 trigger
runtime_flow_enabled = false
```

## 4. Published reply branch

Verified controlled path:

```text
Trigger
-> Wait for reply
-> synthetic message.received
-> cancel reply timeout job
-> reply_outcome = reply_received
-> published reply branch
-> end
```

Result:

```text
Enrollment     completed
Reply wait     resumed
Timeout job    cancelled
Runs           0
Action runs    0
Customer send  0
```

## 5. Published no-reply branch

Verified controlled path:

```text
Trigger
-> Wait for reply
-> timeout
-> reply_outcome = reply_timeout
-> Follow-up delay
-> resume_wait scheduled
-> resume delay
-> Continue after delay
-> No reply branch (end)
```

Final verified state:

```text
Enrollment status       completed
Pinned flow version     v1
Current node            No reply branch (end)
Delay wait              resumed
resume_wait job         completed
Job attempts            1
Current published       v1
Current draft           v2
Runtime enabled         false
Automation runs         0
Automation action runs  0
Customer message sent   false
```

## 6. Generic Runtime Worker E2E — VERIFIED

Reusable worker path validated end-to-end:

```text
resume_reply_timeout
-> atomic claim
-> attempt_count = 1
-> reply wait expired
-> reply_outcome = reply_timeout
-> Published v1 condition
-> Follow-up delay
-> resume_wait scheduled
-> atomic claim
-> attempt_count = 1
-> delay resumed
-> Continue after delay
-> No reply branch (end)
-> enrollment completed
```

Verified no extra run/action-run records and no customer message.

## 7. Generic Worker Idempotency + Concurrency — VERIFIED

Completed jobs could not be reclaimed. A duplicate atomic claim returned zero rows.

Two independent workers raced the same job at the same time for both worker paths:

```text
resume_reply_timeout: racers 2 -> claims observed 1 -> loser claims 0
resume_wait:          racers 2 -> claims observed 1 -> loser claims 0
```

Both winning jobs processed exactly once and had `attempt_count = 1`.

## 8. Cross-Tenant Worker Isolation — VERIFIED

A worker claim scoped to **Test Yoga School** attempted to claim a scheduled `resume_reply_timeout` job owned by **SalsysOS**.

Database evidence:

```text
Foreign tenant                 Test Yoga School
Claims observed                0
Original job status            scheduled
Original attempt_count         0
Original claimed_at            null
Job status unchanged           true
Attempt count unchanged        true
Claim timestamp unchanged      true
Published version              v1
Draft version                  v2
Automatic runtime              false
Customer message sent          false
```

The foreign tenant could neither claim nor mutate the SalsysOS scheduled job.

---

# Current Exact Checkpoint

The conversation-flow engine now proves all of the following against immutable published flow state:

- draft editing is isolated from published definitions;
- graph validation and hash-locking work;
- publish + clone creates a new editable draft;
- enrollment pins to published version;
- trigger can advance into wait-for-reply;
- reply wins and cancels pending timeout;
- no-reply timeout selects the correct condition branch;
- delay scheduling persists per enrollment;
- delay resume follows the published edge to the terminal node;
- controlled duplicate processing fails closed;
- generic worker executes both supported job types end-to-end;
- completed jobs cannot be reclaimed;
- two concurrent workers cannot double-claim either supported job type;
- a foreign tenant worker scope cannot claim or mutate another tenant's job;
- no customer messages are sent during any controlled runtime test.

Automatic/background runtime remains OFF.

Customer messaging remains OFF.

## Next exact action

Move to **worker retry/backoff + terminal failure/dead-letter validation** before adding recurring background pickup:

1. create a controlled failure-only scheduled job;
2. claim it through the same atomic RPC;
3. force a safe worker failure with no customer/provider action;
4. verify attempt 1 requeues with backoff;
5. repeat until `max_attempts` is reached;
6. verify final status becomes `failed` and stops being claimable;
7. verify `last_error`, attempts and timestamps are auditable;
8. only after retry/failure handling passes, add recurring due-job pickup for internal-only runtime.

---

# Remaining Major Smart Trigger Work

The largest remaining blocks are:

1. retry/backoff + failed/dead-letter validation;
2. recurring scheduler / background due-job pickup;
3. automatic event emitter + webhook event adapter;
4. suppression / opt-out / DNC / frequency-cap enforcement;
5. WhatsApp channel policy + approved-template handling;
6. WhatsApp + Instagram actual send nodes and provider audit;
7. AI flow nodes grounded in Organization Knowledge;
8. human approval / handoff runtime;
9. analytics + production monitoring;
10. broader cross-tenant/adversarial tests;
11. controlled internal-only production pilot;
12. controlled customer-messaging pilot.

---

# Locked Rule

Do not enable autonomous customer messaging merely because the flow builder/runtime works.

Customer auto-send remains blocked until scheduler, suppression, channel policies, provider audit, human-review controls, rate limits, retries and tenant-isolation tests are signed off.
