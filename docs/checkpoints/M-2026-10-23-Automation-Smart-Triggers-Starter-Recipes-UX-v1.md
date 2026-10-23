# M-2026-10-23 — Automation Smart Triggers + Starter Recipes UX V1

## Status

**MERGED AND DEPLOYED TO PRODUCTION — production deployments verified READY.**

This checkpoint records the October 23 Automation workspace UX expansion covering Smart Triggers V2 and the redesigned Starter Recipes gallery. These are product UX and draft-authoring milestones inside the existing Automation/Workflow area; they do **not** close the broader Smart Triggers/workflow-engine product area because some runtime capabilities remain intentionally fail-closed.

## Latest verified Automation UX production head

- production head: `373540f69bd1be066d6348fabc3b57e30ad6f6d0`
- production deployment: `dpl_GoSY5YHTrmK26maTSPnvtec7Ej6v`
- deployment state: `READY`
- aliases include `crm.salsysos.com` and `salsysos.com`

## Production evidence

### Smart Triggers V2

- PR: `#142` — Build Smart Triggers AND OR UX
- production merge commit: `353ffcd20b83d607dc978af2427f46b36e9cedb9`
- production deployment: `dpl_9J3CS2LB32r89ENygn335mdA5hs7`
- deployment state: `READY`
- route: `/automation/triggers`

Implemented production UX:

- guided `When -> Only if -> Then -> Review` builder;
- supported event selection;
- Every lead vs condition-filtered mode;
- multiple condition groups;
- `AND` / `OR` within groups;
- `AND` / `OR` between groups;
- bounded condition complexity (max 4 groups, max 6 rules per group);
- plain-language rule summary;
- internal action selection;
- delay / responsibility controls;
- live journey preview;
- safe sample simulation;
- saved-trigger library/search/archive/open-in-Flow-Builder;
- real condition expression persistence in workflow/trigger draft data;
- generated Flow Builder draft structure.

### Starter Recipes gallery

Initial redesign:

- PR: `#143` — Redesign Starter Recipes gallery UX
- production merge commit: `fe8a35e962c50956a0a8744886ca9d066f2b8f40`
- production deployment: `dpl_FtuYKbF4MvSahVtLfC3ZrRJ6v8An`
- deployment state: `READY`

Final UI QA:

- PR: `#144` — Finalize Starter Recipes UI QA
- production merge commit: `373540f69bd1be066d6348fabc3b57e30ad6f6d0`
- production deployment: `dpl_GoSY5YHTrmK26maTSPnvtec7Ej6v`
- deployment state: `READY`
- route: `/automation/recipes`

Implemented production UX:

- safe-by-default guidance;
- `Find -> Install as draft -> Customize & activate` usage guide;
- category filters and recipe search;
- richer recipe cards with `WHEN -> THEN`, delay and safety metadata;
- recipe preview drawer;
- install confirmation modal;
- real installed-recipe state derived from tenant-scoped workflow metadata;
- My Recipes view with the current workflow status;
- direct Flow Builder handoff for installed workflows;
- responsive single-column behavior on smaller screens;
- improved empty states and advanced-workflow guidance;
- Escape-to-close and background-scroll locking for preview/modal overlays;
- backdrop dismissal for confirmation/safety modals;
- accessible filter/search state;
- truthful `Open workflow` wording instead of implying every installed recipe remains a draft after later activation or pausing.

The production recipe installer backend was intentionally preserved. Recipe installation remains tenant-scoped, admin-gated, duplicate-safe, draft-only at install time, runtime-off, and currently limited to internal `create_followup` actions.

## Runtime / safety boundary

The new Smart Triggers authoring UI is deliberately ahead of some runtime capabilities.

### Nested AND/OR condition expressions

Nested condition expressions can be authored, persisted and reviewed, but validation/publishing is blocked while the nested-condition runtime evaluator remains unverified. A condition-bearing Smart Trigger must not become live if the runtime could ignore or misinterpret the configured expression.

### Additional internal actions

`assign_owner` and `notify_user` can be configured in Smart Trigger drafts, but validation/publishing remains blocked until production executors for those action types are explicitly verified.

The existing verified `create_followup` path retains the standard Flow Builder validation, publish and runtime controls.

### Messaging and activation

- autonomous customer messaging remains OFF;
- Starter Recipes do not send customer messages;
- runtime remains OFF by default;
- approved messaging actions, waits, branches and human approvals belong in Flow Builder and remain subject to existing provider/policy/readiness gates;
- no prototype-only behavior is presented as production execution capability.

## Relationship to Flow Builder

The Flow Builder production UX milestones remain separately recorded in:

- `docs/checkpoints/M-2026-10-23-Conversation-Flow-Builder-UX-v1.md`
- `docs/checkpoints/M-2026-10-23-Flow-Builder-Final-UI-QA-v1.md`

Product boundary:

- **Starter Recipes** = safe prebuilt draft templates;
- **Smart Triggers** = simple event + optional conditions + one internal action authoring;
- **Flow Builder** = multi-step journeys, branching, waits, approvals and advanced messaging orchestration.

## Closeout status

This milestone is **production-deployed UX V1**, not Automation area closure.

The ordered product closeout remains unchanged. Universal Tracking live production proof remains the active major closeout target. Smart Triggers/workflow engine remains later in the ordered sequence and still requires a final runtime closeout audit, including the currently blocked nested-condition evaluator and unverified action executors.
