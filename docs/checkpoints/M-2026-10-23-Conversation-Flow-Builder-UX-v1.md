# M-2026-10-23 — Conversation Flow Builder UX V1

## Status

**MERGED AND DEPLOYED TO PRODUCTION — production deployment verified READY.**

This checkpoint records the production UX redesign of the SalsysOS Conversation Flow Builder based on the approved Flow Builder interface reference, while preserving the existing automation runtime, tenant boundaries, persistence, validation and messaging safety controls.

## Production references

- Repository: `yogakulamacademy/salsys-os`
- Production branch: `main`
- Pull request: `#140` — `Redesign Conversation Flow Builder UX`
- PR head: `ae2a05c82b2ff7167acdd7ea900d04d4a1c236c3`
- Production merge commit: `c09bec81678e07226e26aba4f302372fa734cb26`
- Production deployment: `dpl_A4RyuYCrrH2nW3QDaKgnCzCzjt1J`
- Production deployment state: **READY**
- Production aliases include `crm.salsysos.com`

## Scope

The implementation deliberately reused the existing production Flow Builder backend and changed the interaction/visual structure rather than introducing a second workflow engine.

Updated production UX includes:

- approved SalsysOS Flow Builder header hierarchy;
- workflow name, draft/version state, validation state and publish controls;
- sticky horizontal Step Library above the canvas;
- searchable step types for Action, Condition, Delay, Wait for reply, Assign owner, Approval and End Flow;
- larger dotted journey canvas;
- clearer green SalsysOS node-selection and connector language;
- zoom in/out/reset controls;
- drag positioning with existing layout persistence;
- persistent/collapsible right-side Node Settings inspector;
- contextual condition/branch connection editing inside the inspector;
- existing WhatsApp approved-template configuration retained;
- existing node create/update/delete behavior retained;
- existing edge persistence retained;
- responsive inspector behavior retained for narrow screens.

## Preserved backend authority

This milestone does **not** replace or weaken the existing automation backend.

Preserved:

- tenant-scoped workflow loading;
- `automation_workflows`, `automation_flow_nodes`, `automation_flow_edges` and flow-version authority;
- server-side validation and definition hashing;
- publish gating on fresh validation;
- runtime enablement remaining separate from publication;
- existing node server actions;
- existing edge server actions;
- existing layout persistence;
- approved WhatsApp template selection;
- human-approval requirement for guarded WhatsApp sends;
- provider/channel eligibility rules;
- current fail-closed messaging policy.

No database migration and no automation-runtime behavior change were part of PR #140.

## Validation

Before merge:

- Universal Tracking Intelligence SDK contracts — passed;
- Tracking live-closeout contracts — passed;
- Universal platform adapter contracts — passed;
- Web platform adapter contracts — passed;
- WordPress adapter contracts — passed;
- Tracking Source Management UI contracts — passed;
- Intelligence accuracy/freshness/calibration contracts — passed;
- Commercial Intelligence contracts — passed;
- WhatsApp Operations/Broadcast/Growth contracts — passed;
- Instagram Operations contracts — passed;
- CRM Core closeout contracts — passed;
- Customer 360 Identity closeout contracts — passed;
- TypeScript typecheck — passed;
- production build — passed;
- Vercel preview for PR head — READY.

After merge:

- production deployment `dpl_A4RyuYCrrH2nW3QDaKgnCzCzjt1J` built from exact merge commit `c09bec81678e07226e26aba4f302372fa734cb26`;
- Vercel production state — **READY**;
- production alias includes `crm.salsysos.com`.

## Product boundary

This milestone is a production UX enhancement of the existing Smart Triggers / workflow-engine area. It does not by itself close the wider Smart Triggers/workflow-engine product closeout, because runtime/pilot/provider evidence remains governed by the existing ordered closeout plan.

The next Flow Builder work should be evidence-driven QA and usability refinement rather than adding a parallel automation system.
