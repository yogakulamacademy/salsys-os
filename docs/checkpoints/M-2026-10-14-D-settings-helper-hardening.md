# Milestone M-2026-10-14-D — Settings helper and tenant-control hardening

Date: 2026-10-14

## Completed

- Production migration `20261014093616_legacy_settings_and_internal_tenant_helper_hardening` applied.
- Legacy `get_crm_stage_settings()` and `get_crm_settings_audit(integer)` wrappers converted from `SECURITY DEFINER` to `SECURITY INVOKER`.
- Both legacy wrappers now require a resolved tenant via `current_tenant_organization_id()` and delegate only to their tenant-scoped v2 implementations.
- Direct authenticated execution removed from internal/global helpers `can_manage_crm_settings()`, `can_read_crm_settings()`, and `tenant_session_enforcement_enabled()`; trusted `service_role` access remains.
- Authenticated access to the two user-facing settings wrappers remains available.

## Verification

- Privilege audit confirms the three internal helpers are no longer executable by `authenticated` and remain executable by `service_role`.
- Both settings wrappers are no longer SECURITY DEFINER and remain executable by authenticated users.
- Rollback-only test with a bound SalsysOS tenant session successfully loaded both stage settings and settings audit.
- The same test without a tenant binding was rejected with `Tenant context is not bound`, which is the desired behavior for the legacy multi-organization identity.
- Supabase security advisor authenticated-executable SECURITY DEFINER count reduced from 53 to 48.
- No table privileges were widened and no production business data was modified.
- The 20 known RLS-enabled/no-policy backend/service tables remain informational and unchanged.

## Current progress estimates

- W1–W8 workspace program: ~77%
- W5 Sales Workspace: ~98–99%
- W8 Admin/Security/QA: ~87%
- Technical platform: ~77–78%
- Behavioral Intelligence: ~35–40%
- Privacy & Compliance Control Plane: ~15–20%
- First commercial-ready multi-tenant product: ~64–66%
- Full expanded SalsysOS platform scope: ~60–62%
- Wider R0–R14 commercial roadmap: ~50%

## Remaining blockers

- strict tenant-session enforcement remains OFF intentionally
- one legacy admin identity still has active memberships in three organizations
- genuine persisted tenant-specific app session binding must be observed before strict cutover
- remaining SECURITY DEFINER functions require classification rather than blanket revocation
- W8G service-client/integration mutation audit remains open
- W8I adversarial matrix remains incomplete
- W8J second-tenant controlled validation remains pending
- W8K production strict-enforcement cutover/sign-off remains pending
- Supabase leaked-password protection remains an external Auth configuration warning

## Next checkpoint

Continue W8F classification of the remaining 48 authenticated-executable SECURITY DEFINER functions, then finish W8G direct service-mutation tenant audit and expand W8I cross-tenant adversarial tests.
