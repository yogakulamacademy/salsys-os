# SalsysOS — Smart Triggers + Conversation Flows Checklist

**Status:** Active product roadmap / implementation checklist  
**Date:** 2026-10-16  
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

The existing Smart Trigger tables remain the foundation. They are not being discarded.

## Target Conversation Flow

Example:

```text
NEW LEAD
  -> Wait 2 minutes
  -> Send welcome message
  -> Ask which course they want
  -> Branch by answer
  -> Save lead/course attributes
  -> Generate grounded AI reply
  -> Wait for reply
  -> If no reply after 6 hours: follow-up
  -> If reply arrives: cancel pending follow-up and continue
  -> If high intent: assign admissions user + notify
  -> If payment pending: schedule reminder
  -> End / human handoff
```

## Automation Levels

### 1. Deterministic automation
Safe system operations that can execute without AI, for example:
- create follow-up task;
- wait / resume;
- update stage;
- assign owner;
- add tag;
- notify staff;
- branch on structured CRM fields.

### 2. AI-assisted automation
AI may:
- classify intent;
- classify risk;
- summarize conversation;
- generate a draft reply;
- recommend next action;
- answer using approved Organization Knowledge.

Human approval remains required before consequential customer-facing actions.

### 3. Low-risk autonomous AI
Future mode only after controlled validation. Must remain opt-in and constrained by:
- approved Organization Knowledge;
- channel policy;
- risk classification;
- audit trail;
- suppression / opt-out;
- stop-on-reply;
- message caps;
- quiet hours;
- tenant isolation.

## Node / Block Catalog

Planned visual flow nodes:

- **Trigger** — new lead, inbound message, stage change, payment pending, tag added, scheduled date, webhook, AI signal.
- **Send Message** — channel-aware outbound message.
- **WhatsApp Template** — approved template when required by WhatsApp policy/window.
- **AI Reply** — Claude + tenant-scoped Organization Knowledge + CRM context.
- **Ask Question** — capture course, location, month, budget, mode, etc.
- **Condition** — if/else branching.
- **Wait** — duration or exact date/time.
- **Wait for Reply** — pause until customer replies or timeout occurs.
- **Update Lead** — stage, course, intent, country, tags, custom fields.
- **Assign Owner** — salesperson/admissions routing.
- **Create Follow-up** — internal CRM task.
- **Human Approval** — pause before a sensitive/consequential action.
- **Human Handoff** — stop automation and transfer conversation to staff.
- **Webhook/API** — external integration step.
- **AI Decision** — intent/risk/lead classification / next-best-action.
- **Stop Flow** — terminate enrollment.

## Data Model

### Existing V1 foundation — implemented

- `automation_workflows`
- `automation_triggers`
- `automation_conditions`
- `automation_actions`
- `automation_events`
- `automation_runs`
- `automation_action_runs`
- `automation_enrollments`
- `automation_suppressions`

These tables remain canonical for workflow definitions, execution ledgers, enrollments, audit, suppression and safety controls.

### Planned flow-orchestration additions

- `automation_flow_nodes`
- `automation_flow_edges`
- `automation_wait_states`
- `automation_scheduled_jobs`
- `automation_variables`

Exact schema is not locked until the deterministic runtime test and scheduler design are validated.

## Per-Lead Scheduling Model

Scheduling is enrollment-specific, not only campaign-level.

Example:

```text
Lead enters flow
T+0       Welcome
T+10 min  Ask course
T+6 hr    Follow-up if no reply
T+1 day   Reminder if still no reply
T+3 days  Nurture
```

If the lead replies while waiting:

```text
pending no-reply step -> cancel / invalidate
reply event -> resume correct branch
```

Required persisted state eventually includes:

```text
lead_id
workflow_id
current_node_id
status
next_action_at
last_event_at
attempt_count
flow variables / captured answers
```

## Channel Policy Layer

Channel sending must remain separate from flow logic.

### WhatsApp
- respect the rolling customer-service window;
- free-form / AI-generated reply only when the WhatsApp conversation window is open;
- approved template required when the applicable WhatsApp window is closed or when starting/restarting outreach;
- every inbound customer reply should refresh the policy state used by the resolver;
- template status/language/category/variables must be validated before send;
- if the flow asks to send but policy requirements are not satisfied, fail closed and create a staff-visible reason instead of bypassing policy;
- message and provider result must be auditable in CRM.

### Instagram
- send only through connected tenant Instagram identity;
- use conversation-bound external recipient/thread identifiers;
- respect provider/API policy and message eligibility;
- log outbound provider result in CRM.

### General
Flow engine asks a **Channel Policy Resolver** whether a requested customer message is eligible. The flow definition must not bypass provider policy.

Conceptually:

```text
Flow requests customer message
        ↓
Channel Policy Resolver
   ↙                 ↘
WhatsApp            Instagram
   ↓                   ↓
window/template       eligibility
policy check          policy check
   ↓                   ↓
approved send path OR fail closed
        ↓
provider send
        ↓
CRM audit
```

## Organization Knowledge Integration

AI customer-facing replies must use:

```text
lead context
+ current conversation
+ structured CRM data
+ currently approved Organization Knowledge
+ channel policy
+ risk rules
```

Draft or archived knowledge is not authoritative.

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
- [ ] workflow edit UX
- [ ] workflow duplicate UX
- [ ] pause/resume/archive controls

### ST-3 — Controlled Deterministic Runtime
- [x] `/automation/runtime-test`
- [x] manual activation for controlled testing
- [x] manual lead selection
- [x] event ledger insertion
- [x] runtime dedupe design
- [x] internal `create_followup` action implementation
- [x] no provider/customer-message action in controlled test
- [x] fix tenant-alignment trigger for optional runtime fields
- [x] controlled execution rerun after trigger fix
- [x] verify 1 event / 1 run / 1 action-run / 1 task
- [x] rerun same workflow+lead and verify deduplication
- [x] verify zero customer messages for controlled runtime
- [ ] verify Test Yoga School cannot see/run SalsysOS workflow

Validated database state after the second identical test:

```text
Events             1
Runs               1
Action runs        1
Follow-up tasks    1
Customer messages  0
Latest run         completed
```

### ST-4 — Event Runtime
- [ ] canonical event emitter API
- [ ] `lead.created`
- [ ] `message.received`
- [ ] `lead.stage_changed`
- [ ] `payment.pending`
- [ ] tag/custom-field events
- [ ] provider/webhook events
- [ ] durable processing / retry policy
- [ ] idempotent event consumption
- [ ] dead-letter / failed-run visibility

### ST-5 — Scheduler + Wait States
- [ ] delay node
- [ ] exact datetime node
- [ ] wait-until business hours
- [ ] wait-for-reply node
- [ ] persistent `next_action_at`
- [ ] scheduler worker / due-job pickup
- [ ] retry/backoff
- [ ] timezone-safe execution
- [ ] quiet-hours enforcement
- [ ] cancel/reschedule pending jobs

### ST-6 — Stop-on-Reply / Conversation State
- [ ] inbound reply cancels stale no-reply steps
- [ ] enrollment resumes correct branch
- [ ] multiple-channel conversation policy
- [ ] prevent duplicate nurture after human reply
- [ ] human takeover pauses automation
- [ ] explicit resume automation control

### ST-7 — Visual Conversation Flow Builder
- [ ] canvas / node UI
- [ ] node inspector
- [ ] edges / branches
- [ ] trigger nodes
- [ ] condition nodes
- [ ] wait nodes
- [ ] ask-question nodes
- [ ] action nodes
- [ ] AI nodes
- [ ] human approval / handoff nodes
- [ ] validation before publish
- [ ] versioned flow definitions
- [ ] draft vs published versions

### ST-8 — Customer Messaging Actions
- [ ] WhatsApp channel eligibility resolver
- [ ] WhatsApp free-form send node
- [ ] WhatsApp approved-template node
- [ ] Instagram send node
- [ ] provider result logging
- [ ] rate / attempt limits
- [ ] message caps
- [ ] fail-closed when channel identity is unavailable
- [ ] fail-closed when template/policy requirement is not satisfied

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
- [ ] opt-out keyword handling
- [ ] do-not-contact enforcement
- [ ] per-channel suppression
- [ ] workflow suppression
- [ ] message frequency caps
- [ ] human approval audit
- [ ] flow version audit
- [ ] provider-send audit
- [ ] cancellation audit
- [ ] adversarial cross-tenant runtime tests

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
- [ ] deterministic internal-only runtime sign-off
- [ ] scheduler sign-off
- [ ] stop-on-reply sign-off
- [ ] suppression sign-off
- [ ] channel policy sign-off
- [ ] human-approval sign-off
- [ ] WhatsApp test flow
- [ ] Instagram test flow
- [ ] cross-tenant adversarial test
- [ ] rate-limit / retry test
- [ ] controlled production pilot
- [ ] broader tenant rollout

## Current Exact Checkpoint

Controlled deterministic runtime and deduplication are now validated for the first safe workflow:

```text
lead.created -> create_followup
```

Verified behavior:

```text
first execution
  -> existing deduped event reused
  -> one automation run completed
  -> one action-run completed
  -> one internal follow-up task created
  -> zero customer messages

second identical execution
  -> existing run found by dedupe key
  -> no new event
  -> no new run
  -> no new action-run
  -> no new task
  -> zero customer messages
```

Runtime fixes included:

```text
fix_automation_tenant_alignment_optional_fields_v1
commit bf11f866954533de5a7a17e1cca15e4b40778bbc

reuse deduped automation test events
commit 5e55b1461193e9ba8d0fbe7de7012e6109e6a866
```

### Next exact action

Complete ST-3 with cross-tenant runtime isolation:

1. verify Test Yoga School cannot read the SalsysOS workflow;
2. verify Test Yoga School cannot activate/run the SalsysOS workflow;
3. verify a foreign lead/workflow pairing is rejected;
4. once passed, mark deterministic internal-only runtime signed off and begin ST-5 Scheduler + Wait States design/implementation.

## Locked Rule

Do not enable autonomous customer messaging merely because the flow builder exists.

Customer auto-send remains blocked until deterministic runtime, scheduler, stop-on-reply, suppressions, provider/channel policies, audit, human-review controls and tenant isolation have all passed controlled E2E validation.
