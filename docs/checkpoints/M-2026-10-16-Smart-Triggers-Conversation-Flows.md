# Checkpoint — Smart Triggers + Conversation Flows

**Date:** 2026-10-16  
**Status:** ACTIVE  
**Branch:** `feature/smart-triggers-v1`  
**PR:** #31  

## Decision locked

SalsysOS Smart Triggers will evolve beyond simple `WHEN -> THEN` automations into a WATI/AiSensy-style visual conversation-flow system, while preserving SalsysOS-specific tenant isolation, CRM context, Organization Knowledge grounding, AI review, provider policy enforcement and auditability.

Target system:

```text
Smart Triggers
+ Visual Conversation Flow Builder
+ Per-lead Scheduler / Wait States
+ Wait for Reply / Stop on Reply
+ WhatsApp + Instagram Messaging
+ AI Decisions + Organization Knowledge
+ Human Approval / Human Handoff
+ Suppressions / Opt-out / Caps / Quiet Hours
+ Audit / Dedupe / Retry / Analytics
```

The current Smart Trigger foundation is retained. Do not replace the existing automation tables with a parallel system.

## Existing foundation — verified

Implemented production foundation:

- `automation_workflows`
- `automation_triggers`
- `automation_conditions`
- `automation_actions`
- `automation_events`
- `automation_runs`
- `automation_action_runs`
- `automation_enrollments`
- `automation_suppressions`

Admin workspace:

- `/automation`
- draft workflow creation
- tenant-scoped workflow library
- safe definition `lead.created -> create_followup`

Controlled runtime workspace:

- `/automation/runtime-test`
- manual activation only
- manual test execution only
- no background event listener
- no customer auto-send

## Verified draft-state test

After saving `New lead follow-up`:

```text
workflows      1
triggers       1
actions        1
events         0
runs           0
action_runs    0
enrollments    0
suppressions   0
```

Therefore saving a workflow definition does not execute it.

## Runtime bug found and fixed

First controlled runtime execution exposed:

```text
record "new" has no field "conversation_id"
```

Root cause: the reusable tenant-alignment trigger referenced optional row fields directly even though different automation tables expose different foreign-key columns.

Fix:

```text
migration: fix_automation_tenant_alignment_optional_fields_v1
commit: bf11f866954533de5a7a17e1cca15e4b40778bbc
```

The guard now reads optional IDs through a JSON projection of `NEW` and validates only fields present on the row.

The failed test inserted the deterministic test event before failing, but created no run/action-run/task/customer message. Retry must reuse/dedupe the event rather than create a second event.

## Conversation-flow architecture

Planned node types:

- Trigger
- Send Message
- WhatsApp Template
- AI Reply
- Ask Question
- Condition
- Wait
- Wait for Reply
- Update Lead
- Assign Owner
- Create Follow-up
- Human Approval
- Human Handoff
- Webhook/API
- AI Decision
- Stop Flow

Planned orchestration persistence, subject to schema validation:

- `automation_flow_nodes`
- `automation_flow_edges`
- `automation_wait_states`
- `automation_scheduled_jobs`
- `automation_variables`

## Scheduling model

Scheduling is per lead/enrollment, not only a broadcast campaign scheduler.

Example:

```text
T+0       welcome
T+10 min  ask course
T+6 hr    no-reply follow-up
T+1 day   reminder
T+3 days  nurture
```

A customer reply must invalidate stale no-reply jobs and move the enrollment into the correct reply branch.

## Channel-policy rule

Flow definitions cannot directly bypass provider rules.

WhatsApp requires a policy resolver for service-window eligibility and approved template use when necessary. Instagram requires the connected tenant identity and conversation-bound recipient context. Every provider send must be logged and attributable to the workflow/run/action.

## AI rule

AI nodes use:

```text
lead context
+ conversation context
+ structured CRM data
+ currently approved Organization Knowledge
+ channel policy
+ risk rules
```

Draft/archived knowledge is not authoritative.

AI rollout levels:

1. deterministic system actions;
2. AI-assisted drafts/decisions with human approval;
3. low-risk autonomous AI only after explicit controlled validation and opt-in.

## Safety lock

Do not enable autonomous customer messaging until all of these are validated:

- deterministic runtime;
- deduplication;
- scheduler/wait states;
- stop-on-reply;
- suppressions/opt-out;
- quiet hours;
- attempt/message caps;
- WhatsApp/Instagram provider-policy layer;
- human approval/handoff;
- audit trail;
- cross-tenant adversarial isolation.

## Canonical checklist

Full implementation checklist:

`docs/SMART_TRIGGERS_CONVERSATION_FLOWS_CHECKLIST.md`

## Exact next checkpoint

1. Open the latest PR #31 preview.
2. Open `/automation/runtime-test`.
3. Select the same lead used during the failed test.
4. Run the controlled test once.
5. Verify exactly:
   - one deduped/reused event;
   - one completed run;
   - one completed action-run;
   - one internal follow-up task;
   - zero customer messages.
6. Run the exact same workflow+lead again.
7. Verify dedupe returns the existing run/task and creates no duplicate task.
8. Verify Test Yoga School cannot see or run SalsysOS automation.

Only after the controlled deterministic runtime passes should implementation continue to scheduler/wait-state design.