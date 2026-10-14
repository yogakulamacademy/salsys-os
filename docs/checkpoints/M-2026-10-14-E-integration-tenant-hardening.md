# Milestone M-2026-10-14-E — Integration and analytics tenant hardening

Date: 2026-10-14

## Completed

- Google, Meta and Instagram OAuth start routes now derive the target organization only from the trusted authenticated workspace/session context. Browser-supplied `organization_id` values are no longer tenant authority.
- Shared `requireIntegrationAdminTenant(...)` authorization requires the trusted active tenant, owner/admin access, and an active organization before OAuth state is written.
- WhatsApp Embedded Signup completion now re-resolves the current trusted tenant and requires an exact match with the tenant recorded in OAuth state before state consumption or integration mutation.
- OAuth state consumption is scoped by both state id and organization id.
- Production OAuth-state audit found zero unused/unexpired pre-hardening states for Google, Meta, Instagram or WhatsApp.
- Meta Ads debug diagnostics are no longer publicly callable; operator/service secret authorization is required before privileged Meta credentials are used.
- Integration settings actions were audited: managed connection reads/writes, disconnect, Google asset discovery and Google asset selection all scope privileged service-client mutations by the trusted active organization and connection.
- GA4 service sync, Meta Ads sync, course-catalog sync and conversion-feedback runner were reviewed as secret-authorized operator/service endpoints rather than browser tenant APIs.
- GA4 health now requires authentication, resolves the current tenant and scopes health/history to that tenant.
- GSC health now requires authentication, resolves the current tenant and scopes every health/history/count query to that tenant.
- Google Ads and Meta Ads health routes already used the current trusted tenant resolver and explicit organization filters.

## Verification

- PR #12 Vercel validation succeeded before merge.
- PR #13 Vercel validation succeeded before merge.
- Production session audit still shows strict tenant-session enforcement OFF, zero persisted tenant bindings, one active multi-organization legacy session and zero bound multi-organization sessions. Strict cutover therefore remains intentionally blocked.
- No production business data was modified by this checkpoint.

## External validation warning

The first Vercel attempt for the GA4/GSC health-route branch was rejected by Vercel's build-rate limit before a build ran. This is an external CI capacity limitation, not a reported compile/test failure. The branch must receive a successful build before merge.

## Current progress estimates

- W1–W8 workspace program: ~77–78%
- W5 Sales Workspace: ~98–99%
- W8 Admin/Security/QA: ~88%
- W8G Integrations/Webhooks tenant binding: ~97%
- Technical platform: ~78%
- Behavioral Intelligence: ~35–40%
- Privacy & Compliance Control Plane: ~15–20%
- First commercial-ready multi-tenant product: ~65–67%
- Full expanded SalsysOS platform scope: ~60–63%
- Wider R0–R14 commercial roadmap: ~50–51%

## Remaining blockers

- strict tenant-session enforcement remains OFF intentionally
- one legacy admin identity still has active memberships in three organizations
- genuine persisted tenant-specific app session binding must be observed before strict cutover
- Google/Meta/Instagram OAuth callbacks can still gain defense-in-depth by explicitly re-resolving active tenant at callback time, although new OAuth state can now only be created from the trusted active tenant and there are no live legacy states
- remaining SECURITY DEFINER functions require classification rather than blanket revocation
- W8I adversarial matrix remains incomplete
- password-reset/recovery tenant preservation remains unimplemented
- W8J controlled second-tenant validation remains pending
- W8K strict-enforcement cutover/sign-off remains pending
- Supabase leaked-password protection remains an external Auth configuration warning

## Next checkpoint

Finish validation/merge of the tenant-scoped GA4/GSC health routes, continue W8F classification of the remaining authenticated SECURITY DEFINER functions, then expand W8I adversarial testing and implement tenant-preserving password recovery before W8J/W8K.
