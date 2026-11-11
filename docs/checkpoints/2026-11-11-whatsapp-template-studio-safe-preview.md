# WhatsApp Template Studio — safe frontend preview (November 11, 2026)

## Goal
Let authenticated workspace owners/admins inspect the newly merged Template Studio UI on the existing `/automation/templates` page **without activating the new draft database schema or Meta template submissions**.

## Changes
- When `WA_TEMPLATE_STUDIO_ENABLED` is not true, authorized users see **Preview creator**.
- The link opens `/automation/templates/new?preview=1`, showing the full interactive editor with an explicit preview-only notice.
- The editor retains interactive field editing, variable samples and message preview, but **Save draft and Submit to Meta are disabled**, and both action functions fail closed.
- When the Studio flag is eventually enabled after authorized migration and acceptance, the normal **New template** action replaces the preview.
- The original REST draft and submit APIs remain gated off in production.

## Database preflight
- Supabase project `SalsysOS R2 Temporary Staging 20261109` has zero connected WhatsApp accounts, zero users, zero templates, and no Vercel deployment. This is not a full end-to-end test environment yet.
- The committed `20261111103500_whatsapp_template_drafts_v1.sql` migration was tested in an explicit transaction, including RLS, client table-grant restrictions and privileged trigger execution grants.
- That transaction was rolled back. A follow-up read confirmed `public.whatsapp_template_drafts` is still absent.
- Production database was not modified.

## Verification
- `npm run verify:whatsapp-template-studio` checks the default-off feature gates and new preview-only contract.
- `npm run verify:whatsapp-template-authoring-behavior` invokes the pure validators and Meta payload builder with synthetic data, and stubs network transport entirely.
- Existing CI/typecheck, migration replay, CodeQL and synthetic UI checks must pass on the PR head.

## Holds
- No real user sign-in, authorized staging template submission, connected test WABA, or live template approval evidence exists yet.
- Keep both `WA_TEMPLATE_STUDIO_ENABLED` and `WA_TEMPLATE_AUTHORING_ENABLED` unset/OFF in production.
- Do not apply the draft-table migration to production or resume R2/AI staging acceptance by merging this UI-only preview.
- No Meta API calls, WhatsApp customer messages, or new behavioral tracking are authorized.
