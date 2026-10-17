# SalsysOS — Smart Triggers + Conversation Flows Checklist

**Status:** Active product roadmap / implementation checklist  
**Date:** 2026-10-17  
**Branch:** `feature/smart-triggers-v1`  
**PR:** #31  

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

Conversation-flow/runtime foundation now implemented:

- `automation_flow_nodes`
- `automation_flow_edges`
- `automation_wait_states`
- `automation_scheduled_jobs`
- `automation_variables`
- `automation_flow_versions`

Workflow version pointers now include:

- `current_draft_version`
- `current_published_version`
- `runtime_flow_enabled`

Enrollments support:

- `current_node_id`
- `flow_version`
- `next_action_at`
- per-enrollment variables
- pinned published-flow execution state

## Smart Trigger Implementation Checklist

### ST-1 — Foundation
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

### ST-2 — Admin Workspace
- [x] `/automation`
- [x] tenant-scoped workflow library
- [x] create safe draft workflow
- [x] draft save does not execute anything
- [x] first definition: `lead.created -> create_followup`
- [ ] workflow duplicate UX
- [ ] pause/resume/archive controls
- [x] visual workflow edit foundation moved into `/automation/flow-builder`

### ST-3 — Controlled Deterministic Runtime
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

### ST-4 — Event Runtime
- [ ] canonical event emitter API
- [ ] automatic `lead.created`
- [x] controlled `message.received` event path validated
- [ ] `lead.stage_changed`
- [ ] `payment.pending`
- [ ] tag/custom-field events
- [ ] provider/webhook event adapter
- [ ] durable retry policy
- [ ] dead-letter / failed-run visibility

### ST-5 — Scheduler + Wait States
- [x] persisted delay wait-state foundation
- [ ] exact datetime node
- [ ] wait-until business hours
- [x] persisted wait-for-reply node
- [x] persistent `next_action_at`
- [x] scheduled-job ledger
- [x] controlled due-job claim/resume behavior
- [x] retry attempt counter exercised in controlled delay resume
- [ ] production scheduler worker / recurring due-job pickup
- [ ] retry/backoff policy
- [ ] timezone-safe production execution
- [ ] quiet-hours enforcement
- [x] cancel stale reply-timeout job when reply arrives
- [ ] general cancel/reschedule job API

### ST-6 — Stop-on-Reply / Conversation State
- [x] controlled inbound reply cancels pending no-reply timeout
- [x] reply wait resumes correct `reply_received` branch
- [x] no-reply timeout follows `reply_timeout` branch
- [x] no-reply branch can enter delay and resume to next node
- [x] duplicate reply/timeout processing fails closed in controlled tests
- [ ] real webhook inbound reply integration
- [ ] multiple-channel conversation policy
- [ ] prevent nurture after human takeover
- [ ] human takeover pauses automation
- [ ] explicit resume automation control

### ST-7 — Visual Conversation Flow Builder
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
- [ ] ask-question node
- [ ] AI nodes
- [ ] production-ready interaction polish

### ST-8 — Customer Messaging Actions
- [ ] WhatsApp channel eligibility resolver
- [ ] WhatsApp free-form send node
- [ ] WhatsApp approved-template node
- [ ] Instagram send node
- [ ] provider result logging
- [ ] rate / attempt limits
- [ ] message caps
- [ ] fail closed when channel identity unavailable
- [ ] fail closed when template/policy requirement not satisfied

### ST-9 — AI + Knowledge Nodes
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

### ST-10 — Safety / Compliance / Audit
- [x] tenant isolation foundation
- [x] run/action audit ledgers
- [x] suppression table foundation
- [x] published flow immutability guard
- [x] enrollment pinned to immutable published version
- [x] runtime stays disabled during all controlled graph tests
- [x] controlled graph tests verified zero customer messages
- [ ] opt-out keyword handling
- [ ] do-not-contact enforcement
- [ ] per-channel suppression
- [ ] workflow suppression
- [ ] message frequency caps
- [ ] human approval audit
- [x] flow version audit foundation
- [ ] provider-send audit
- [ ] cancellation audit expansion
- [ ] adversarial cross-tenant graph/runtime tests

### ST-11 — Analytics
- [ ] workflow enrollment count
- [ ] completion / drop-off rate
- [ ] node-level conversion
- [ ] reply rate by step
- [ ] time-to-first-response
- [ ] handoff rate
- [ ] template/send failure rate
- [ ] AI draft acceptance rate
- [ ] lead-to-enrollment impact

### ST-12 — Production Rollout
- [ ] deterministic internal-only runtime final sign-off
- [ ] scheduler worker sign-off
- [x] controlled stop-on-reply logic sign-off
- [ ] suppression sign-off
- [ ] channel policy sign-off
- [ ] human-approval sign-off
- [ ] WhatsApp test flow
- [ ] Instagram test flow
- [ ] cross-tenant adversarial test
- [ ] rate-limit / retry test
- [ ] controlled production pilot
- [ ] broader tenant rollout

## Verified Flow Checkpoints

### Draft graph structure

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

### Versioning

```text
Published Version 1 = immutable snapshot
Draft Version 2     = editable clone
Runtime enabled     = false
```

Verified Version 2 edit did not alter Version 1.

### Published enrollment pinning

A controlled enrollment was pinned to Published v1 while Draft v2 existed.

Verified:

```text
flow_version = 1
Draft at start = 2
current_node = published v1 trigger
runtime_flow_enabled = false
```

### Published reply branch

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

### Published no-reply branch

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

Final verified state on 2026-10-17:

```text
Enrollment status       completed
Pinned flow version     v1
Current node            No reply branch (end)
Delay wait              resumed
resume_wait job          completed
Job attempts            1
Current published        v1
Current draft            v2
Runtime enabled          false
Automation runs          0
Automation action runs   0
Customer message sent    false
```

## Current Exact Checkpoint

The controlled conversation-flow engine now proves all of the following against an immutable published snapshot:

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
- no customer messages are sent during these runtime tests.

### Next exact action

Move from test-specific/manual flow actions toward the **general production runtime worker foundation**:

1. extract shared published-node execution into reusable runtime functions;
2. implement generic due-job claim/process logic for `resume_wait` and `resume_reply_timeout`;
3. add controlled worker test with runtime still disabled globally;
4. validate idempotency/concurrency and retry behavior;
5. run final cross-tenant adversarial runtime tests;
6. only then consider enabling scheduled background processing for internal-only actions.

## Locked Rule

Do not enable autonomous customer messaging merely because the flow builder/runtime works.

Customer auto-send remains blocked until scheduler, suppression, channel policies, provider audit, human-review controls, rate limits and tenant-isolation tests are signed off.
