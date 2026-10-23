# SalsysOS Checkpoint Index

**Last synchronized:** 2026-10-23

This directory contains milestone evidence. Historical checkpoint files should remain truthful to the state that was verified at the time. Do not rewrite old milestones merely to match a newer plan.

## Current canonical state

Read in this order:

1. `../SalsysOS_Current_Checkpoint.md` — latest operational checkpoint.
2. `M-2026-10-23-Conversations-Shared-Inbox-Collaboration-v14.md` — latest production Conversations/Inbox collaboration checkpoint.
3. `M-2026-10-22-Universal-Tracking-Server-Integration-v1.md` — latest Universal Tracking + Server Integration production/platform checkpoint and live Yogakulam PHP cutover status.
4. `../SalsysOS_North_Star_Product_Context.md` — canonical product direction and roadmap state.
5. `../tracking-attribution-setup.md` — current universal first-party tracking/Event Intelligence deployment plan.

## Conversations / Inbox production checkpoint

- `M-2026-10-23-Conversations-Shared-Inbox-Collaboration-v14.md`

Current production state: the Conversations workspace is a CRM-connected shared sales Inbox with the three-column queue/conversation/context layout, ownership-aware `My Inbox / Team / Unassigned` scopes, personal snooze, manager assignment/reassignment, internal notes, teammate @mentions, presence/collision awareness, configurable conversation SLA thresholds and supervisor workload evidence.

Production head recorded by the checkpoint: `fb02f28dd0667a757dbd144aa5ab99a6ce4e97f8`.

Production Vercel deployment: `dpl_BzTpgddz8UFmd2xy7XwMXJo8xzjZ` — **READY**.

Important boundaries remain unchanged:

- CRM lead ownership is authoritative shared ownership state;
- snooze is personal Inbox state;
- internal notes/mentions are not customer messages;
- presence is advisory and does not lock a conversation;
- WhatsApp/Instagram provider and policy gates remain authoritative;
- AI/copilot remains human-reviewed and does not autonomously send.

The older `M-2026-10-21-Conversations-Prototype-QA-v2.md` and `M-2026-10-21-CRM-Operations-Studio-UX-v1.md` files are historical preview/UX evidence and must not be interpreted as the current production release state.

## Active Universal Tracking checkpoint

- `M-2026-10-22-Universal-Tracking-Server-Integration-v1.md`

Current status: the SalsysOS universal server Events API, canonical site/www alias consolidation, server-source create/edit/pause/rotate/delete management, and platform-first guided installation UX are deployed. The external Yogakulam PHP/Hostinger contact-form integration is still being installed and tested, so live acquisition-to-revenue tracking closeout is **not** claimed yet.

The current safe contact-form integration direction is:

`validate -> DB insert -> enquiry ID -> server-confirmed web.form_submitted -> existing CRM lead capture -> emails -> success response`

The existing CRM capture path remains responsible for lead creation until duplicate semantics across ingestion paths are explicitly proven.

## CRM / UX historical checkpoints

- `M-2026-10-21-CRM-Operations-Studio-UX-v1.md`
- `M-2026-10-21-Conversations-Prototype-QA-v2.md`

These remain historical evidence of the pre-production/preview UX line. The current production Inbox state is recorded by the October 23 V14 checkpoint above.

## Active Event Intelligence checkpoints

- `M-2026-10-19-Event-Intelligence-Source-Of-Truth.md`
- `M-2026-10-19-Event-Intelligence-Implementation-Order.md`
- `M-2026-10-19-Event-Intelligence-Derived-v1.md`
- `M-2026-10-19-Event-Intelligence-Feature-Store-v1.md`
- `M-2026-10-19-Event-Intelligence-Predictions-v1.md`
- `M-2026-10-19-Event-Intelligence-OpenSearch-Projection-v1.md`

Current Event Intelligence status: universal ingestion + feature/prediction/OpenSearch projection foundations are merged; direct Yogakulam live E2E acquisition-to-revenue proof is still pending.

## Completed Smart Triggers production checkpoints

- `M-2026-10-19-Smart-Triggers-Stop-On-Reply-Live-Proof.md`
- `M-2026-10-19-Smart-Triggers-Safety-Hardening.md`

These are complete controlled-production proofs. Customer messaging remains fail-closed unless separately armed.

## Maintenance rule

When a meaningful milestone is completed:
- add/update the relevant active checkpoint;
- update `../SalsysOS_Current_Checkpoint.md` when operational/production state changes;
- update the North-Star context if scope/progress changed;
- preserve historical evidence;
- include exact production or branch commit/migration references where useful;
- distinguish built, merged, deployed, tested and fully E2E-proven states.
