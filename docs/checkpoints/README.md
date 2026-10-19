# SalsysOS Checkpoint Index

**Last synchronized:** 2026-10-19

This directory contains milestone evidence. Historical checkpoint files should remain truthful to the state that was verified at the time. Do not rewrite old milestones merely to match a newer plan.

## Current canonical state

Read in this order:

1. `../SalsysOS_Current_Checkpoint.md` — latest operational checkpoint.
2. `../SalsysOS_North_Star_Product_Context.md` — canonical product direction and roadmap state.
3. `../tracking-attribution-setup.md` — current universal first-party tracking/Event Intelligence deployment plan.

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
- update `../SalsysOS_Current_Checkpoint.md`;
- update the North-Star context if scope/progress changed;
- preserve historical evidence;
- include exact production commit/migration references where useful;
- distinguish built, merged, deployed, tested and fully E2E-proven states.
