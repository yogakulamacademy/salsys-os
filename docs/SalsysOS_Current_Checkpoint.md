# SalsysOS Current Checkpoint

**Checkpoint date:** 2026-11-01  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Latest production runtime head:** `742f9d88290332d53e41a025c48295c6aa41818c`  
**Fast resume file:** `docs/SalsysOS_Active_Handoff.md`

> Historical checkpoint files under `docs/checkpoints/` are immutable evidence records.

---

## 1. Current position

SalsysOS is a **Sales + Analysis Operating System**.

Current state:

- broad 14-surface engineering closeout: complete;
- R9 V1: closed;
- R10 V1 (P0-P3): closed;
- post-R10 rebaseline: complete;
- R11 Education / Wellness Vertical Pack V1 audit/design: complete and locked;
- **R11-P0 Capability + Security Foundation: complete and production-accepted**;
- **current exact checkpoint: R11-P1 — Product Surface Gating**.

Read first:

1. `docs/checkpoints/M-2026-11-01-R11-P0-Capability-Security-Foundation-v1.md`
2. `docs/checkpoints/M-2026-11-01-R11-Vertical-Pack-Audit-Design-v1.md`
3. `docs/SalsysOS_Active_Handoff.md`

---

## 2. R11-P0 production truth

Production merge:

```text
PR        #424
main SHA  742f9d88290332d53e41a025c48295c6aa41818c
```

Supabase migration:

```text
version 20261101174300
name    r11_capability_security_foundation_v1
```

Vercel production:

```text
deployment dpl_FKSi2T6LMKwhHnWngD4f6hPdeQef
state      READY
SHA        742f9d88290332d53e41a025c48295c6aa41818c
```

Release gates:

```text
Production Smoke #173   passed
CodeQL #668             passed
CI #1383 attempt 2      passed
```

---

## 3. Canonical capability model now live

Capability state is separate from functional workspaces and separate from future billing.

```text
education_core
wellness_residential      -> requires education_core
education_catalog_sync    -> requires education_core
```

Canonical tables/helpers:

```text
capability_catalog
organization_capabilities
organization_has_capability(org_id, capability_code)
set_organization_capability_v1(...)
```

Capability mutation remains trusted/service-role only. Unknown/disabled capability codes fail closed.

---

## 4. Current tenant capability state

Yogakulam Academy has all three R11 capabilities explicitly enabled from real production usage.

```text
Yogakulam Academy  courses 16  batches 85  all 3 capabilities enabled
Demo org           courses 0   batches 0   no capability rows
SalsysOS           courses 0   batches 0   no capability rows
Test Yoga School   courses 0   batches 0   no capability rows
```

No synthetic second-tenant Education data was created.

---

## 5. Course-management security boundary after P0

Authenticated direct table privileges are now exactly:

```text
courses        SELECT / INSERT / UPDATE
course_batches SELECT / INSERT / UPDATE
```

No authenticated direct `DELETE`, `TRUNCATE`, `TRIGGER`, or `REFERENCES` remains.

Course/batch reads now require `education_core`.

Course-management mutation authority requires:

```text
education_core
+
valid bound tenant
+
owner/admin/manager role
```

Hardened explicit-org V2 batch-admin RPCs are executable by authenticated sessions and service role. Legacy implicit-org V1 RPCs remain unavailable to authenticated users.

---

## 6. Health after P0

- CRM Core V2: healthy, 0 integrity issues;
- Customer 360 V2: degraded only because of the same 2 pre-existing open identity conflicts;
- PA-1 identity decision remains a separate parked human-approval boundary;
- no R11-P0 data-health regression detected.

---

## 7. Exact R11-P1 goal

P1 makes the product surface consistently obey the capability model.

Required scope:

1. expose organization capability state through a trusted server/workspace context;
2. capability-gate sidebar/navigation;
3. capability + role gate Course Management direct route/data access;
4. capability-gate Admissions/Education-specific surfaces;
5. hide Education-specific Lead selectors/controls for organizations without `education_core` while preserving nullable canonical database fields;
6. prove generic CRM remains functional for non-Education organizations;
7. preserve Yogakulam's existing Education behavior.

Navigation hiding is not authorization. Server/data boundaries must fail closed too.

---

## 8. P1 design constraints

- do not remove Education columns from generic Lead/Person schemas;
- do not infer access from organization name or onboarding `industry`;
- do not overload `organization_workspaces` as capability state;
- do not create fake Test Yoga School courses/batches for acceptance;
- do not refactor the Yogakulam catalog adapter yet (P2);
- do not build residential/accommodation surface gating yet (P3);
- do not add billing/subscription/plan entitlement logic (R13).

---

## 9. Later phases

### R11-P2 — Catalog adapter boundary

Preserve the proven Yogakulam adapter as one provider behind a generic tenant-configured adapter selection boundary.

### R11-P3 — Optional Residential extension gating

Capability-gate accommodation/residential surfaces while keeping Education Core usable without residential data.

### R13 — commercial SaaS shell

Public signup, billing/subscriptions, plan entitlements, signup abuse controls, customer-controlled deletion and billing-driven suspension remain later scope.

---

## 10. Parked boundaries

Do not resume automatically:

- live Yogakulam commerce completion;
- PA-1 live identity decision;
- Google Ads production approval;
- Meta Ads provider approval/account selection;
- Search Indexing activation;
- predictive-model promotion / learning-based ranking.

---

## 11. Resume instruction

1. verify current `main`, Supabase and Vercel provenance;
2. read the R11-P0 production closeout and locked R11 design;
3. audit P1 surface dependencies read-only before changing code;
4. implement **R11-P1 only**;
5. prove non-Education organizations cannot see/use Education-only product surfaces while generic CRM still works;
6. preserve Yogakulam's real Education behavior;
7. do not begin P2/P3 until P1 is production-accepted.
