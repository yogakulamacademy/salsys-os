# M-2026-10-21 — CRM Operations Studio UX V1 checkpoint

## Status

**ACTIVE PREVIEW — not merged to `main`.**

This checkpoint records the current CRM Operations Studio redesign and intelligent Inbox/Lead Inspector work on the dedicated UX branch. It is a development checkpoint, not a production-completion claim.

## Repository / branch state

- Repository: `yogakulamacademy/salsys-os`
- Working branch: `uiux/crm-operations-studio-v1`
- PR: `#98` — **CRM Operations Studio + intelligent Lead Inspector & Inbox**
- PR base: `uiux/salsysos-experience-v1`
- Branch head verified for this checkpoint: `dfc47c102edb31fc007e1eeedad2418b2c4705e0`
- Current GitHub `main` head previously verified independently: `874a0ebc2d447b6f105e99eb60fc07543ad7db44`
- Production/main is intentionally untouched by this work.

## Implemented UX/product changes

### CRM Operations Studio foundation

- Shared CRM Operations visual language and workspace framing for Admissions, Leads, Pipeline and Follow-ups.
- Reuses the established SalsysOS evergreen/mint operational design direction rather than creating a separate design system.
- Existing CRM routes, server authorization, tenant boundaries and canonical mutations remain authoritative.
- Workspace navigation now follows the supplied Conversations prototype breakpoint: it becomes the compact/mobile navigation at `880px` and below rather than waiting for the framework's default large breakpoint.

### Leads + reusable Lead Inspector

- Leads workspace opens the reusable Inspector directly.
- Inspector includes Overview, Journey and Activity views backed by real CRM data.
- Surfaces priority, intent, engagement, next follow-up, attribution/context, payment evidence, Person 360/journey evidence, contact history and recent messaging where available.
- Explicitly distinguishes available, empty and unavailable evidence; missing evidence is not converted into false zero values.
- Canonical `next_best_action` / sales-intelligence evidence is preferred when present.
- Presentation-only fallback guidance is clearly separated from canonical intelligence and does not write scores, stages or outcomes.
- Smart Follow-up presets only prefill a human-controlled task form.
- Follow-up creation continues through the existing authorized `create_followup_task` boundary.

### Pipeline

- CRM Studio pipeline presentation added while preserving the existing server-side `set_lead_stage` mutation boundary.
- Desktop drag/drop remains available.
- Keyboard/touch users can use an accessible stage selector, so stage movement is not dependent on HTML drag/drop.
- Audit wording was generalized to pipeline-board movement rather than claiming every change came from drag/drop.

### Intelligent Inbox / Conversations

- Conversation list exposes operational views for Needs reply, Unread and priority filtering while retaining CRM-backed conversation state.
- `/` now focuses the conversation search when the operator is not already editing a field.
- Inbox filter tabs support Arrow Left / Arrow Right / Home / End keyboard navigation.
- Real conversation waiting/reply state is surfaced directly in the list.
- Dynamic Inbox Intelligence reuses Lead Inspector / canonical sales-intelligence evidence rather than creating a second scoring system.
- Surfaces priority, intent, engagement, next follow-up, priority reason and existing follow-up evidence in context.
- Contextual guidance can recommend a human next action or internal follow-up window without sending a customer message automatically.
- Follow-up planning can use the recommended shortcut or a human-edited next action and due time; the canonical CRM task remains the authoritative record.
- Existing follow-ups expose due/overdue evidence and can be marked complete through the authorized path.
- Lead course/country edits made from Conversations are recorded in CRM Activity for auditability.
- Conversation and Activity are separate views; Activity is a read-only historical timeline rather than a second note editor.
- Conversation / Activity tabs support Arrow Left / Arrow Right / Home / End keyboard navigation.
- Reply draft and Internal note remain separate composer modes. Internal notes are stored as private CRM activity and are never placed in a customer-message payload.
- Non-WhatsApp composer tabs also support Arrow Left / Arrow Right / Home / End.
- Ctrl/Cmd + Enter saves a non-WhatsApp reply draft or adds an Internal note; it never sends a customer message.
- Draft failure preserves operator text rather than clearing it.
- WhatsApp free-form sending remains gated on authoritative workspace/provider connection and the active service window.
- Closed-window WhatsApp continues through approved templates only; website inquiry/phone presence is not treated as WhatsApp eligibility.
- Mobile/tablet CRM inspector is modal, traps focus, closes with Escape and returns focus to the trigger.
- `Alt+I` toggles the CRM inspector and `Alt+R` focuses the reply draft.
- Responsive Conversations layout now follows the supplied prototype boundaries: CRM inspector drawer at `1170px` and below, separate inbox/conversation mobile views at `620px` and below, and the intended compact 3-pane desktop proportions above the drawer breakpoint.
- AI Reply Assistant remains draft-only: intent/risk/escalation context is shown, but a human must review and press Send.
- Existing WhatsApp service-window, template and provider-safety rules remain in force.

## Preview authentication hardening added during this checkpoint

Two preview-auth defects were addressed after browser testing exposed them:

1. `1c38efce3e0d346622fa5662e1db2f5e5fa67097` — stale/invalid preview sessions are cleared and redirected to sign-in instead of being misreported as a workspace `503`.
2. `3a655db6101d5c2218fc8bad31cedc324bcf7f24` — transient Supabase sign-in failures are retried once and no longer get mislabeled as an incorrect password when the error is classified as retryable/transient.

The sign-in return path is preserved so a user opening `/conversations` is returned there after successful authentication.

## Current verification state

- GitHub reports PR #98 as open and mergeable at the latest checked state.
- Latest source-QA head for this checkpoint: `dfc47c102edb31fc007e1eeedad2418b2c4705e0`.
- Vercel deployment `dpl_9SSpMW4nAUsSsX6RufrUCoYfXp1j` for that head completed successfully and is **READY**.
- Preview URL: `https://salsys-lgj9k8fbz-salsysos.vercel.app`.
- The deployment compiled successfully, passed Next.js type checking, generated all static pages and completed deployment output generation.
- An unauthenticated fetch of `/conversations` returns the sign-in screen with `next=/conversations`; it does not return the former workspace-verification `503`.
- The prototype-source QA pass has aligned the principal responsive breakpoints and keyboard-navigation behavior described in `salsysos-conversations.html`.
- This does **not** constitute an authenticated visual/browser pass of real CRM data.

## Open blocker / required retest

A real browser sign-in still needs explicit verification on the latest preview. The user previously reported that credentials believed to be correct were shown as **“Invalid email or password.”**

Do **not** mark preview authentication resolved until the real account successfully signs in on the latest preview. If the error persists, verify the preview Supabase environment/project configuration and the account's existence/state before changing password semantics again.

Authenticated visual verification is also still required for the final Conversations fidelity pass because the protected CRM panes cannot be inspected through an unauthenticated deployment fetch.

## Safety / truth constraints preserved

- No prototype/sample CRM records were inserted.
- PostgreSQL/Supabase remains authoritative for CRM state.
- No browser-local scoring engine was introduced.
- No autonomous stage changes are performed from guidance.
- No autonomous customer messaging was enabled.
- AI replies remain draft-only and human-send controlled.
- Draft save, Internal note save, keyboard shortcuts, selection and Automation events do not send customer messages.
- Existing tenant, ownership, service-window, template, approval and provider boundaries remain authoritative.
- This branch is not production and must not be described as deployed to `main`.

## Next checkpoint actions

1. Verify real preview sign-in on the latest branch head.
2. If login still fails, inspect preview Supabase auth/environment alignment rather than assuming the user's password is wrong.
3. Authenticated visual smoke-test `/conversations` at desktop, tablet and mobile widths against the supplied prototype.
4. Validate selected-row density, message bubbles, inspector density, composer states and drawer behavior against real data.
5. Authenticated smoke-test `/leads`, `/admissions`, `/pipeline` and `/follow-ups`.
6. Validate Lead Inspector data-state handling against real Yogakulam records.
7. Validate Inbox priority/reply states and draft-only AI behavior with a real connected conversation.
8. Recheck build/status checks after any subsequent UX/auth fix.
9. Update PR #98 and this checkpoint before merge/rebase decisions.

## Merge rule

Do not merge this UX checkpoint directly to `main`. PR #98 currently targets `uiux/salsysos-experience-v1`. Production remains unchanged until the higher-level UX branch is reviewed and deliberately promoted through the normal release path.
