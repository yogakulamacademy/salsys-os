# R1 — Foundation, Tenancy, Security & Production Baseline Closeout

**Date:** 2026-10-18  
**Repository:** `yogakulamacademy/salsys-os`  
**Branch:** `feature/system-intelligence-v2`  
**Production Supabase:** `doaozrkrtgeslddwhclj`

## Status

**R1 baseline: COMPLETE.**

This closes the foundation/tenancy/security baseline required for later phases. It does **not** replace the broader W8 / final production-security sign-off, which still includes full second-tenant adversarial regression, residual SECURITY DEFINER/service-role review, legacy admin cleanup, provider/runtime review and final commercial cutover.

## Verified production facts

### Tenant identity and session authority

- Tenant session enforcement is enabled in production.
- `bind_current_tenant_session(uuid)` is SECURITY DEFINER, executable by authenticated users, and validates that the authenticated user is an active member of the requested active organization before binding the session.
- A session cannot be rebound to a different organization after it has been bound.
- `current_tenant_organization_id()` resolves tenant context from the authenticated session binding and active organization membership.
- Server workspace resolution binds the authenticated session before returning active tenant context.

### Core tenancy data integrity

- `organizations`, `organization_members`, `organization_workspaces`, `workspace_memberships`, and `profiles` all have RLS enabled.
- Production currently has zero users with more than one active organization membership.
- Production currently has zero active workspace memberships without a matching active organization membership.
- Core organization membership roles are present and tenant scoped.

### Core RLS policy posture

- `organizations`: member read; admin update.
- `organization_members`: member read; admin insert/update/delete.
- `organization_workspaces`: member read; admin insert/update/delete, with the protected admin workspace excluded from ordinary mutation policy.
- `workspace_memberships`: self/admin read; admin insert/update/delete.
- `profiles`: CRM users can read only profiles linked through an organization they are authorized to access.

### Production baseline

- Canonical production database project remains `doaozrkrtgeslddwhclj`.
- Current feature branch deployment is green on Vercel at the start of this closeout.
- Existing Next.js server paths derive tenant context through authenticated server helpers instead of trusting a browser-supplied organization ID as authority.

## R1 completion gate

R1 is considered complete because the platform now has a verified production baseline for:

1. authenticated user identity;
2. organization membership;
3. tenant-session binding;
4. server-derived tenant resolution;
5. core RLS on identity/tenancy tables;
6. role-aware organization administration;
7. workspace membership integrity;
8. production deployment and database baseline.

## Explicitly not claimed by R1

The following remain later hardening/commercialization work and must not be interpreted as completed merely because R1 is closed:

- full W8 security sign-off;
- every table/RPC/service-role path audited globally;
- final controlled second-tenant adversarial matrix;
- provider-specific webhook/OAuth security sign-off;
- legacy multi-organization admin cleanup;
- billing/subscription isolation;
- commercial SaaS provisioning and account lifecycle;
- autonomous action safety controls.

## Next phase

Proceed to **R2 — Lead Capture, Identity, Raw Events & Data Quality**.

R2 closeout should verify the complete path:

`source event → raw evidence → consent/sanitization → identity resolution → lead creation/dedupe → attribution handoff → retry/recovery → data-quality monitoring`

and close any remaining edge cases without reopening already-frozen Tracking Contract v1 unless a real defect is found.
