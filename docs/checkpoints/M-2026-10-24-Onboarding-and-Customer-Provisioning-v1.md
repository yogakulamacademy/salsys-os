# SalsysOS Milestone — Onboarding + Customer Organization Provisioning V1

**Date:** 2026-10-24  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`

## Production evidence

### Onboarding foundation

Verified production milestones completed before customer provisioning:

- six-step onboarding flow with Business, Goals, Website, Channels, Team and Finish/readiness stages;
- real website-health verification rather than a decorative completion state;
- Team onboarding reuses the existing tenant employee/membership system instead of creating a second team model;
- Channels and Team may be skipped honestly while Business, Goals and a healthy Website remain core readiness requirements;
- `completed_at` is written only when onboarding reaches verified completion;
- `/onboarding` resume routing now honors persisted `current_step` and dedicated step routes;
- explicit `enforce_on_sign_in boolean not null default false` activation flag added to `organization_onboarding`;
- sign-in checks onboarding only after canonical tenant binding and only for users allowed to manage that organization;
- missing rows, false enforcement flags, non-managing users and temporary onboarding lookup failures preserve the normal post-login destination.

Production activation merge:

- merge commit: `9d92c3b9e8f3e0ee160a1364fb875a111c39eca3`
- deployment: `dpl_Fg1WQyoZNGGCBLP2uVRwhKvccPMo`
- state: `READY`

Existing organizations were verified to have no onboarding rows before activation and remained untouched because enforcement defaults OFF.

### Customer Organization Provisioning V1

PR #154 introduced the first controlled SaaS tenant bootstrap workflow without opening public self-signup.

Implemented:

- SalsysOS-platform-admin-only `/settings/organizations` screen;
- trusted server action creates the customer owner Supabase Auth identity;
- service-role-only `provision_customer_organization_v1(uuid,text,text,text)` RPC;
- atomic database provisioning of:
  - organization;
  - owner profile;
  - owner organization membership;
  - all active functional organization workspaces;
  - `organization_onboarding` row beginning at `business` with `enforce_on_sign_in=true`;
- if database provisioning fails after Auth creation, the new Auth user is deleted so no orphan login remains;
- existing organization registry is visible without enrolling or mutating legacy tenants.

Production provisioning merge:

- PR: `#154` — Customer Organization Provisioning V1
- production merge commit: `804e1b8e44dde38776d4c1de4e0835b4f0f4a8ec`
- production deployment: `dpl_4MMro9yW7KuR6VMwkUhB76SW2Bdw`
- deployment state: `READY`
- production aliases include `salsysos.com`, `crm.salsysos.com`, `salsys-os.vercel.app`, and `www.salsysos.com`.

Database migration history was aligned to the exact production-applied migration version:

- `20261023184246_customer_organization_provisioning_v1.sql`

Production verification:

- provisioning function is `SECURITY DEFINER` but executable only by `service_role` (`postgres` and `service_role` ACL only);
- no new authenticated-executable SECURITY DEFINER advisor finding was introduced by this function;
- SalsysOS, Test Yoga School and Yogakulam Academy remained unchanged and still had no onboarding row after the migration verification;
- CI passed all existing product contract suites, TypeScript and full Next.js build;
- preview deployment passed before merge.

## Product boundary

This milestone closes **controlled customer-organization provisioning V1**, not public/self-serve SaaS signup.

Still intentionally not implemented here:

- public tenant signup;
- billing/subscription enforcement;
- plan limits/entitlements;
- abuse controls and signup throttling;
- customer-controlled organization deletion;
- automated billing-triggered suspension;
- cross-tenant workspace switching.

Tenant isolation rules remain unchanged: one trusted active tenant context, no cross-tenant fallback, and existing organizations do not inherit onboarding state from other tenants.

## Roadmap impact

This is a SaaS-readiness and onboarding milestone. It does **not** reorder the canonical product closeout sequence and does **not** close Universal Tracking.

Area 3 — Universal Tracking SDK + Consent remains the active product-integrity closeout target until the live Yogakulam acquisition-to-revenue path is proven and reconciled.
