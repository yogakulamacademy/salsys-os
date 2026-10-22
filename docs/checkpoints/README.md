# SalsysOS Checkpoint Index

**Last synchronized:** 2026-10-22

This directory contains milestone evidence. Historical checkpoint files should remain truthful to the state that was verified at the time. Do not rewrite old milestones merely to match a newer plan.

## Current canonical state

Read in this order:

1. `../SalsysOS_Current_Checkpoint.md` — latest operational checkpoint.
2. `M-2026-10-22-Universal-Tracking-Server-Integration-v1.md` — latest Universal Tracking + Server Integration production/platform checkpoint and live Yogakulam PHP cutover status.
3. `../SalsysOS_North_Star_Product_Context.md` — canonical product direction and roadmap state.
4. `../tracking-attribution-setup.md` — current universal first-party tracking/Event Intelligence deployment plan.
5. `M-2026-10-21-CRM-Operations-Studio-UX-v1.md` — active non-production CRM/Inbox UX checkpoint on its separate UX line.

## Active Universal Tracking checkpoint

- `M-2026-10-22-Universal-Tracking-Server-Integration-v1.md`

Current status: the SalsysOS universal server Events API, canonical site/www alias consolidation, server-source create/edit/pause/rotate/delete management, and platform-first guided installation UX are deployed. The external Yogakulam PHP/Hostinger contact-form integration is still being installed and tested, so live acquisition-to-revenue tracking closeout is **not** claimed yet.

The current safe contact-form integration direction is:

`validate -> DB insert -> enquiry ID -> server-confirmed web.form_submitted -> existing CRM lead capture -> emails -> success response`

The existing CRM capture path remains responsible for lead creation until duplicate semantics across ingestion paths are explicitly proven.

## Active CRM / UX checkpoint

- `M-2026-10-21-CRM-Operations-Studio-UX-v1.md`

Current status: CRM/Inbox UX work remains historically tracked on its own branch/checkpoint line. Do not infer merge state from this index; verify current branch/PR state before resuming UX work.

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
