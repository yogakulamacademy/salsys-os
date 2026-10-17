# SalsysOS — Smart Triggers + Conversation Flows Checklist

**Status:** Active product roadmap / implementation checklist  
**Date:** 2026-10-17  
**Current branch:** `feature/smart-triggers-runtime-worker`  
**Parent feature branch:** `feature/smart-triggers-v1`  
**Parent PR:** #31 — Add Smart Triggers + Conversation Flow automation foundation  
**Approx. Smart Triggers completion:** ~70%  
**Approx. overall SalsysOS completion:** ~75%  

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

Runtime worker foundation now also includes:

- atomic due-job claim RPC: `claim_automation_scheduled_jobs_v1`
- `FOR UPDATE SKIP LOCKED` concurrency protection
- attempt-count increment at claim time
- max-attempt enforcement
- generic runtime worker module: `lib/automation/runtime-worker.ts`
- controlled worker UI: `/automation/runtime-worker-test`
- generic processing target types:
  - `resume_wait`
  - `resume_reply_timeout`

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
- [ ] final adversarial cross-tenant runtime test using Test Yoga School

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
- [ ] controlled generic worker E2E validation
- [ ] concurrent/double-claim worker validation
- [ ] production recurring due-job pickup / cron
- [ ] retry/backoff policy
- [ ] failed-job/dead-letter policy
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
- [ ] opt-out keyword handling
- [ ] do-not-contact enforcement
- [ ] per-channel suppression
- [ ] workflow suppression
- [ ] message frequency caps
- [ ] human approval audit
- [x] flow version audit foundation
- [ ] provider-send audit
- [ ] cancellation audit expansion
- [ ] worker concurrency/adversarial tests
- [ ] cross-tenant generic-worker test
- [ ] adversarial cross-tenant graph/runtime tests

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
- [ ] generic scheduler worker sign-off
- [x] controlled stop-on-reply logic sign-off
- [ ] recurring background scheduler sign-off
- [ ] suppression sign-off
- [ ] channel policy sign-off
- [ ] human-approval sign-off
- [ ] WhatsApp test flow
- [ ] Instagram test flow
- [ ] cross-tenant adversarial test
- [ ] worker concurrency test
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

## 6. Generic Runtime Worker Foundation — NEW

The work has now moved from manual/test-specific node actions toward a reusable worker.

Implemented:

```text
automation_scheduled_jobs
        ↓
claim_automation_scheduled_jobs_v1()
        ↓ atomic claim
status = claimed
attempt_count += 1
        ↓
lib/automation/runtime-worker.ts
        ↓
resume_reply_timeout OR resume_wait
```

Safety characteristics already in place:

- organization-scoped claims;
- scheduled-only claims;
- max-attempt guard;
- row locking;
- `SKIP LOCKED` for concurrent workers;
- service-role-only RPC execution;
- no automatic provider/customer send;
- automatic background runtime still disabled;
- controlled test page `/automation/runtime-worker-test` created.

Production Supabase migration applied:

```text
claim_automation_scheduled_jobs_v1
```

Current runtime-worker branch commits include:

```text
886e6a2ff66e0629db731c093b7c0f013e076493  Add atomic scheduled-job claim RPC
1e3af6a1817351aa3a76f7a1f55825e5a2ba5f99  Generic runtime worker implementation checkpoint
173de97e4123c00a91afbe467fcb08359ac52a84  Controlled runtime-worker test UI checkpoint
```

The generic worker itself is **not yet signed off**. The next E2E test must prove the reusable worker processes a prepared job correctly before background scheduling is enabled.

---

# Current Exact Checkpoint

The conversation-flow engine now proves all of the following against an immutable published snapshot:

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
- no customer messages are sent during these runtime tests;
- an atomic reusable scheduled-job claim layer now exists;
- a generic runtime-worker module now exists;
- a controlled worker-test UI now exists.

Automatic runtime remains OFF.

Customer messaging remains OFF.

## Next exact action

Use `/automation/runtime-worker-test` after the latest preview is Ready:

1. select one test lead;
2. click **Prepare controlled worker job**;
3. verify one pinned published enrollment + one reply wait + one scheduled `resume_reply_timeout` job;
4. click **Process one job with generic worker**;
5. verify the generic worker claims exactly one job and follows the published v1 no-reply branch;
6. rerun to validate idempotency / no double processing;
7. run concurrency/double-claim validation;
8. run cross-tenant worker validation using Test Yoga School;
9. only after those pass, add recurring background due-job pickup for internal-only runtime.

---

# Remaining Major Smart Trigger Work

The largest remaining blocks are:

1. generic runtime-worker E2E + concurrency sign-off;
2. automatic event emitter + webhook event adapter;
3. recurring scheduler / background due-job pickup;
4. retry/backoff + failed/dead-letter handling;
5. suppression / opt-out / DNC / frequency-cap enforcement;
6. WhatsApp channel policy + approved-template handling;
7. WhatsApp + Instagram actual send nodes and provider audit;
8. AI flow nodes grounded in Organization Knowledge;
9. human approval / handoff runtime;
10. analytics + production monitoring;
11. cross-tenant adversarial tests;
12. controlled production pilots.

---

# Locked Rule

Do not enable autonomous customer messaging merely because the flow builder/runtime works.

Customer auto-send remains blocked until scheduler, suppression, channel policies, provider audit, human-review controls, rate limits, retries and tenant-isolation tests are signed off.
