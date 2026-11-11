# WhatsApp Template Studio V1 — Draft checkpoint

## Purpose
Add tenant-safe WhatsApp template authoring and preview to the existing
SalsysOS Automation → Templates workspace. This is a review-only PR.

## Scope
- Keep the existing Meta-synchronized registry authoritative for approved templates.
- Create a separate local draft table protected by RLS, revoked client grants,
  service-only access, and an organization/account consistency trigger.
- Add an admin-only draft API with same-origin write checks.
- Add a dedicated editor with text header, body, footer, one static
  quick-reply or HTTPS URL button, and explicit positional example values.
- Add an explicit second-step Meta approval confirmation and server submission gate.
- Surface local drafts in the existing workspace and render actual Meta-synced
  components in the provider details preview.
- Keep the existing sync, inbox, automation, provider send, and consent logic intact.

## Deliberate V1 exclusions
- Media headers, authentication/OTP templates, carousel/catalog templates,
  multiple buttons, and variable URL buttons require separate provider validation.
- Editing or deleting Meta-approved templates is NOT supported in this PR.
- No WhatsApp customer message is sent by any new action.
- Template submission is not a customer message and does not open a 24-hour window.

## Deployment-compatible default-off flag
- Main is linked to automatic Vercel production deployments.
- New UI, server page, draft GET/POST endpoints and the optional draft-table query are hard-gated behind `WA_TEMPLATE_STUDIO_ENABLED=true` (unset/OFF by default).
- Do NOT turn this on until the draft migration has been independently reviewed and applied in the target environment.
- `WA_TEMPLATE_AUTHORING_ENABLED=true` is a **separate** explicit grant for submitting a draft to Meta, and cannot bypass the studio gate.
- A merged but disabled version does not require the draft table to exist in production. Existing Meta template sync remains available.

## Production safety
- The submit route hard-blocks requests unless
  WA_TEMPLATE_AUTHORING_ENABLED=true is explicitly configured **and** the studio gate is enabled.
- This new flag is independent from the existing WhatsApp sender and
  automation gates, which must remain in their prior fail-closed states.
- Submitting one template to Meta requires two deliberate UI clicks.
- Provider submissions are atomically claimed to prevent concurrent duplicate
  calls. Ambiguous provider outcomes enter an 'uncertain' state, never automatic retry.
- API secrets and WABA IDs come from the tenant-bound encrypted runtime only.
- All API writes require an active admin session, organization permission, and
  same-origin request.

## Dependency order before anyone enables authoring
1. Independent security and product review of this PR.
2. Provision an isolated staging tenant and apply migration via the approved
   deployment/migration process; do not apply this schema to production yet.
3. Verify deny-by-default permissions for unauthenticated, employee, and
   cross-tenant sessions. Test stale sessions.
4. Run npm run verify:whatsapp-template-studio, npm run typecheck,
   npm run build, and the existing WhatsApp end-to-end regression suite.
5. Verify a local draft can be saved and edited without any Meta HTTP request.
6. With explicit staging approval, enable WA_TEMPLATE_AUTHORING_ENABLED=true
   in staging only. Submit a unique test template to the intended WABA.
7. Sync status and verify approval/rejection metadata and rendered body.
8. Confirm no customer sends, no changed provider-send policies, no
   changed production messaging gates, and no new broadcast.
9. Keep production staging hold and production authoring flag OFF until
   independently authorized for release.

## Remaining review questions
- Confirm actual Meta WABA test permission scope.
- Confirm provider error logging policy (redact secrets/personal data).
- Add optional Meta template-status webhook reconciliation in a later PR
  after the current sync-based model is accepted.
- Evaluate more complete button/media support separately.

No migration was executed, no Meta template was created, and no customer
message was sent by constructing this PR.
