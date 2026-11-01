# SalsysOS — R11-P0 Capability + Security Foundation V1 — Production Closeout

**Date:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production merge SHA:** `742f9d88290332d53e41a025c48295c6aa41818c`  
**PR:** #424 — Add R11 P0 capability and course security foundation  
**Status:** COMPLETE / PRODUCTION ACCEPTED

## Scope closed

R11-P0 established the reusable product-capability and course-security foundation only. It intentionally did not implement R11-P1 navigation/product-surface gating, R11-P2 catalog adapter abstraction, R11-P3 residential UI gating, or R13 billing/entitlements.

## Production implementation

Canonical capability model:

```text
capability_catalog
organization_capabilities
```

V1 capabilities:

```text
education_core
wellness_residential      -> requires education_core
education_catalog_sync    -> requires education_core
```

Security/authority changes:

- tenant-safe `organization_has_capability(org_id, capability_code)` helper;
- service-role-only `set_organization_capability_v1` mutation boundary;
- fail-closed dependency trigger;
- `can_administer_course_management(org_id)` now also requires `education_core`;
- `courses_read` and `course_batches_read` require `education_core`;
- authenticated direct table grants reduced to `SELECT`, `INSERT`, `UPDATE` only;
- authenticated `DELETE`, `TRUNCATE`, `TRIGGER`, `REFERENCES` removed;
- authenticated EXECUTE restored only for the three hardened explicit-org V2 course-admin RPCs;
- legacy implicit-org V1 course-admin RPCs remain unavailable to authenticated users.

## Existing tenant activation

Yogakulam Academy was explicitly activated by stable slug `yogakulam-academy`, not by generated UUID or onboarding-industry inference.

Enabled:

```text
education_core
education_catalog_sync
wellness_residential
```

Activation provenance is stored in non-secret capability config.

All other active organizations remain without capability rows unless deliberately configured.

No fake second-tenant courses, batches, enrollments, sync runs, or other customer activity were created.

## Production data readback

After migration:

```text
Demo org          courses 0   batches 0   Education capabilities false
SalsysOS          courses 0   batches 0   Education capabilities false
Test Yoga School  courses 0   batches 0   Education capabilities false
Yogakulam Academy courses 16  batches 85  all three R11 capabilities true
```

Unknown capability codes fail closed (`false`).

## Permission readback

Authenticated table privileges are now exactly:

```text
courses        SELECT / INSERT / UPDATE
course_batches SELECT / INSERT / UPDATE
```

Hardened V2 RPC ACLs:

```text
update_course_batch_admin_v2               authenticated=true  service_role=true
set_course_batch_enrollment_state_v2       authenticated=true  service_role=true
set_course_batch_active_state_v2           authenticated=true  service_role=true
```

Legacy V1 RPC ACLs:

```text
update_course_batch_admin                  authenticated=false service_role=true
set_course_batch_enrollment_state          authenticated=false service_role=true
set_course_batch_active_state              authenticated=false service_role=true
```

This preserves the user-session tenant/role boundary and `auth.uid()` audit attribution rather than escalating normal Course Management actions to service role.

## Dependency lifecycle proof

Rollback-only production test proved:

1. `wellness_residential` cannot be enabled without `education_core` (`CAPABILITY_DEPENDENCY_REQUIRED`);
2. `education_core` cannot be disabled while a dependent capability is enabled (`CAPABILITY_DEPENDENTS_ENABLED`);
3. rollback left Demo org with zero capability rows;
4. Yogakulam retained its three production capability rows.

## Migration provenance

Production Supabase ledger:

```text
version 20261101174300
name    r11_capability_security_foundation_v1
```

The applied SQL was the exact reviewed migration from PR #424 / merge SHA `742f9d88290332d53e41a025c48295c6aa41818c`.

## Health regression

Post-migration:

- CRM Core V2: `healthy`, integrity issues `0`;
- Customer 360 V2: still `degraded` only because of the same 2 pre-existing open identity conflicts;
- no R11-P0 integrity regression was detected.

PA-1 identity review remains a separate parked human-decision boundary.

## Release gates

PR head gates:

- CI #1382 — passed;
- CodeQL #667 — passed.

Production merge SHA gates:

- Production Smoke #173 — passed;
- CodeQL #668 — passed;
- CI #1383 attempt 1 — infrastructure/job cancellation during final Build after all prior checks passed;
- CI #1383 attempt 2 — passed, including full Next.js Build.

Vercel production:

```text
deployment dpl_FKSi2T6LMKwhHnWngD4f6hPdeQef
state      READY
git SHA    742f9d88290332d53e41a025c48295c6aa41818c
```

Production aliases include `crm.salsysos.com`, `salsysos.com`, and `www.salsysos.com`.

## Decision

**R11-P0 is complete and production-accepted.**

The next exact checkpoint is:

**R11-P1 — Product Surface Gating**

P1 must make product surfaces consistently obey the capability model without altering generic CRM truth or creating fake second-tenant business data.
