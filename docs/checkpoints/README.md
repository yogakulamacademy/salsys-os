# SalsysOS Checkpoint Index

**Last synchronized:** 2026-10-21

This directory contains milestone evidence. Historical checkpoint files should remain truthful to the state that was verified at the time. Do not rewrite old milestones merely to match a newer plan.

## Current canonical state

Read in this order:

1. `../SalsysOS_Current_Checkpoint.md` — latest operational checkpoint.
2. `../SalsysOS_North_Star_Product_Context.md` — canonical product direction and roadmap state.
3. `../tracking-attribution-setup.md` — current universal first-party tracking/Event Intelligence deployment plan.
4. `M-2026-10-21-CRM-Operations-Studio-UX-v1.md` — active non-production CRM/Inbox UX checkpoint on PR #98.

## Active CRM / UX checkpoint

- `M-2026-10-21-CRM-Operations-Studio-UX-v1.md`

Current status: the CRM Operations Studio, reusable Lead Inspector, intelligent Inbox, accessible Pipeline movement and preview-auth recovery work are active on `uiux/crm-operations-studio-v1`. PR #98 targets `uiux/salsysos-experience-v1`, not `main`. Real browser sign-in on the latest preview is still a required verification step before this UX checkpoint can be considered ready for merge.

## Active Event Intelligence checkpoints

- `M-2026-10-19-Event-Intelligence-Source-Of-Truth.md`
- `M-2026-10-19-Event-Intelligence-Implementation-Order.md`
- `M-2026-10-19-Event-Intelligence-Derived-v1.md`
- `M-2026-10-19-Event-Intelligence-Feature-Store-v1.md`
- `M-2026-10-19-Event-Intelligence-Predictions-v1.md`
- `M-2026-10-19-Event-Intelligence-OpenSearch-Projection-v1.md`

Current Event Intelligence status: universal ingestion + feature/prediction/OpenSearch projection foundations are merged; direct Yogakulam first-party SDK/relay and full acquisition-to-revenue E2E proof are still pending.

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
