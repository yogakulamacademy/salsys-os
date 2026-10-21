# M-2026-10-21 — CRM Operations Studio UX V1 checkpoint

## Status

**ACTIVE PREVIEW — not merged to `main`.**

This checkpoint records the current CRM Operations Studio redesign and intelligent Inbox/Lead Inspector work on the dedicated UX branch. It is a development checkpoint, not a production-completion claim.

## Repository / branch state

- Repository: `yogakulamacademy/salsys-os`
- Working branch: `uiux/crm-operations-studio-v1`
- PR: `#98` — **CRM Operations Studio + intelligent Lead Inspector & Inbox**
- PR base: `uiux/salsysos-experience-v1`
- Branch head verified before this checkpoint: `3a655db6101d5c2218fc8bad31cedc324bcf7f24`
- Current GitHub `main` head verified independently: `874a0ebc2d447b6f105e99eb60fc07543ad7db44`
- Production/main is intentionally untouched by this work.

## Implemented UX/product changes

### CRM Operations Studio foundation

- Shared CRM Operations visual language and workspace framing for Admissions, Leads, Pipeline and Follow-ups.
- Reuses the established SalsysOS evergreen/mint operational design direction rather than creating a separate design system.
- Existing CRM routes, server authorization, tenant boundaries and canonical mutations remain authoritative.

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

### Intelligent Inbox

- Conversation list now exposes operational views for Needs reply, Priority, Reply and Unread states.
- Real conversation waiting/reply state is surfaced directly in the list.
- Dynamic Inbox Intelligence panel reuses Lead Inspector / canonical sales-intelligence evidence rather than creating a second scoring system.
- Surfaces priority, intent, engagement, next follow-up, priority reason and existing follow-up evidence in context.
- Contextual guidance can recommend a human next action or internal follow-up window without sending a customer message automatically.
- Mobile Insights drawer exposes the same customer intelligence on smaller screens.
- AI Reply Assistant remains draft-only: intent/risk/escalation context is shown, but a human must review and press Send.
- Existing WhatsApp service-window, template and provider-safety rules remain in force.

## Preview authentication hardening added during this checkpoint

Two preview-auth defects were addressed after browser testing exposed them:

1. `1c38efce3e0d346622fa5662e1db2f5e5fa67097` — stale/invalid preview sessions are cleared and redirected to sign-in instead of being misreported as a workspace `503`.
2. `3a655db6101d5c2218fc8bad31cedc324bcf7f24` — transient Supabase sign-in failures are retried once and no longer get mislabeled as an incorrect password when the error is classified as retryable/transient.

The sign-in return path is preserved so a user opening `/conversations` is returned there after successful authentication.

## Current verification state

- GitHub reports the PR as open and mergeable.
- Vercel commit status for head `3a655db6101d5c2218fc8bad31cedc324bcf7f24` is **success**.
- No GitHub Actions workflow run was returned for this exact head at checkpoint time; do not treat that as a full CI pass.
- The preview correctly redirects an unauthenticated `/conversations` request to `/login?next=/conversations` rather than returning the former workspace-verification `503`.

## Open blocker / required retest

A real browser sign-in still needs explicit verification after the latest auth change. The user reported that credentials believed to be correct were shown as **“Invalid email or password.”**

Do **not** mark preview authentication resolved until the real account successfully signs in on the latest preview. If the error persists, verify the preview Supabase environment/project configuration and the account's existence/state before changing password semantics again.

## Safety / truth constraints preserved

- No prototype/sample CRM records were inserted.
- PostgreSQL/Supabase remains authoritative for CRM state.
- No browser-local scoring engine was introduced.
- No autonomous stage changes are performed from guidance.
- No autonomous customer messaging was enabled.
- AI replies remain draft-only and human-send controlled.
- Existing tenant, ownership, service-window, template, approval and provider boundaries remain authoritative.
- This branch is not production and must not be described as deployed to `main`.

## Next checkpoint actions

1. Verify real preview sign-in on the latest branch head.
2. If login still fails, inspect preview Supabase auth/environment alignment rather than assuming the user's password is wrong.
3. Authenticated smoke-test `/conversations`, `/leads`, `/admissions`, `/pipeline` and `/follow-ups`.
4. Validate Lead Inspector data-state handling against real Yogakulam records.
5. Validate Inbox priority/reply states and draft-only AI behavior with a real connected conversation.
6. Recheck build/status checks after any auth fix.
7. Update PR #98 and this checkpoint before merge/rebase decisions.

## Merge rule

Do not merge this UX checkpoint directly to `main`. PR #98 currently targets `uiux/salsysos-experience-v1`. Production remains unchanged until the higher-level UX branch is reviewed and deliberately promoted through the normal release path.
