# SalsysOS — R11 Education / Wellness Vertical Pack V1 Production Closeout

**Date:** 2026-11-02  
**Production organization:** Yogakulam Academy  
**Final runtime merge SHA:** `1846b1fc845b0325f0a8ac6b409c67744d65245e`

## Decision

**R11 Education / Wellness Vertical Pack V1 engineering is complete and production-accepted.**

The vertical pack is now capability-driven rather than tenant-name-driven, preserves generic CRM behavior for non-Education organizations, keeps the Yogakulam catalog adapter behind a tenant-configured provider boundary, and isolates the optional residential extension behind `wellness_residential`.

No synthetic second-tenant course, batch, enrollment, accommodation inventory, room-pool or assignment data was created to obtain this closeout.

---

## 1. R11 phase summary

### P0 — Capability + Security Foundation

Production merge:

```text
PR        #424
SHA       742f9d88290332d53e41a025c48295c6aa41818c
Migration 20261101174300 r11_capability_security_foundation_v1
```

Delivered:

- `education_core`;
- `education_catalog_sync` requiring `education_core`;
- `wellness_residential` requiring `education_core`;
- tenant-scoped capability state separate from functional workspaces and billing;
- explicit Yogakulam activation from real production usage;
- least-privilege course/batch table grants;
- hardened V2 Course Management RPC execution boundary;
- dependency lifecycle guard.

### P1 — Product Surface Gating

Production merge:

```text
PR        #426
SHA       616458d5f089bd6e07815f6b44a0c724a05cc9e0
Migrations
          20261101181750 r11_p1_education_surface_authorization_v1
          20261101181833 r11_p1_lead_capability_trigger_context_v1
```

Delivered:

- capability-aware trusted workspace context;
- Education-aware navigation;
- fail-closed server route/RPC access for Admissions / Operations / Availability / Enrollments / Course Management;
- generic Lead create/edit experience for non-Education organizations;
- canonical Lead trigger protection against forged Education-only preferences;
- enrollment RLS aligned with `education_core`;
- generic CRM schema preserved.

### P2 — Catalog Adapter Boundary

Production merge:

```text
PR        #428
SHA       8bbe594050a17a95a7dd762a4db0f7b09a3430ba
Migration 20261101184439 r11_p2_catalog_adapter_config_v1
```

Delivered:

- generic Education catalog adapter registry/runner;
- tenant-configured non-secret provider selection;
- first provider key `yogakulam_website`;
- existing proven Yogakulam parser/sync engine preserved behind a thin adapter;
- provider secrets remain environment-backed;
- missing/disabled capability, missing provider, unsupported provider and ambiguous multi-tenant execution fail closed;
- tenant/source-scoped sync ledger remains canonical.

Production acceptance preserved:

```text
Yogakulam courses / batches       16 / 85
Other active org courses/batches   0 / 0
Yogakulam sync runs                3
Latest sync                        2026-10-03
```

### P3 — Optional Residential Extension Gating

Feature merge:

```text
PR        #430
SHA       132fe10b3b7f5ac21c21611930873e1e3cbeb4de
Migrations
          20261101193508 r11_p3_residential_capability_boundary_v1
          20261101193522 r11_p3_residential_trigger_context_v1
```

Post-merge hardening:

```text
PR        #431
Final SHA 1846b1fc845b0325f0a8ac6b409c67744d65245e
Migration 20261101195631 r11_p3_anon_residential_grant_hardening_v1
Bytes     1942
MD5       863a1bed570e34986c10a226330f21cf
```

Delivered:

- `wellness_residential` gates residential-only accommodation/inventory/assignment truth;
- base Education Core remains independent of residential capability;
- mixed residential fields on course batches are protected by canonical triggers;
- Course Management masks residential commercial fields when the capability is disabled;
- capability disable fails closed when real residential data exists;
- accommodation mutation RPCs remain service-role-only;
- residential base tables/views use least privilege.

---

## 2. Final residential security boundary

### Canonical base tables

```text
accommodation_properties
accommodation_rooms
batch_accommodation_types
batch_accommodation_room_pool
enrollment_accommodation_assignments
```

Final grants:

```text
anon           no direct privileges
authenticated  SELECT / INSERT / UPDATE only
```

### Security-invoker residential views

```text
v_batch_accommodation_inventory
v_batch_accommodation_live_inventory
v_batch_accommodation_summary
v_batch_enrollment_accommodation_roster
v_enrollment_accommodation_assignments
```

Final grants:

```text
anon           no privileges
authenticated  SELECT only
```

### Mutation RPCs

The existing accommodation mutation functions remain:

```text
anon EXECUTE           false
authenticated EXECUTE  false
service_role EXECUTE   true
```

for assignment/release, availability and accommodation property/room/type/pool mutation functions.

---

## 3. Real production residential evidence

Yogakulam production evidence remains intentionally sparse:

```text
accommodation properties     1
rooms                        0
batch accommodation types    0
room-pool rows                0
assignments                   0
mixed residential batches    0
```

Other active organizations remain without synthetic residential data.

The sparse inventory is not treated as a defect and was not padded for testing.

---

## 4. Capability-disable acceptance

A rollback-only service-role test attempted to disable Yogakulam `wellness_residential` while its real accommodation property exists.

Expected guard:

`WELLNESS_RESIDENTIAL_DATA_PRESENT`

The guard fired correctly. The transaction rolled back and the capability remained enabled with its original config.

This proves the dependency/data safety rule without changing production business state.

---

## 5. Final health and release evidence

After P3 hardening:

```text
CRM Core V2             healthy / 0 integrity issues
Admissions automation   healthy / 96 runs / 0 failures in 24h
Customer 360 V2         degraded only by 2 pre-existing identity conflicts
```

Final release on SHA `1846b1fc845b0325f0a8ac6b409c67744d65245e`:

```text
CI                 #1404 passed
CodeQL             #689 passed
Production Smoke   #180 passed
Vercel production  READY on exact merge SHA
```

Production Vercel deployment:

`dpl_5j1m4wM11NeLShzkV6z3peWz25ED`

Production aliases include:

```text
crm.salsysos.com
salsysos.com
www.salsysos.com
```

---

## 6. R11 V1 closeout statement

R11 V1 is closed as an engineering/productization phase.

What is now proven:

- Education Core is an explicit tenant capability, not a Yogakulam-only assumption;
- non-Education tenants retain generic CRM without Education product surfaces;
- catalog sync is provider-selectable through tenant config;
- Yogakulam remains the first production adapter without becoming the architecture itself;
- residential functionality is an optional extension, not an Education invariant;
- base, optional and integration capability boundaries fail closed at data/server/UI layers;
- no second-tenant or residential evidence was fabricated to claim reuse.

What is **not** claimed:

- a second real Education customer has been onboarded and operated end-to-end;
- residential inventory operations have broad real-world usage;
- capabilities are commercial plan entitlements;
- billing/subscription/self-serve signup exists.

Those belong to later commercial/product evidence checkpoints.

---

## 7. Next roadmap checkpoint

The next exact checkpoint is:

# R13 — Commercial SaaS Readiness — Audit & Design

Read-only first.

Primary questions:

1. public/self-serve tenant signup boundary;
2. subscription and billing state model;
3. plan/entitlement model mapped onto existing capabilities without conflating capability truth with billing truth;
4. trial/suspension/reactivation lifecycle;
5. signup abuse controls / throttling;
6. customer-controlled organization deletion / export / retention boundary;
7. billing-driven suspension without deleting customer truth;
8. platform-admin override/recovery boundary;
9. migration path for the four existing organizations;
10. what can be implemented without a live payment-provider commitment.

Do not write R13 billing/product code until this audit/design contract is locked.

---

## 8. Parked boundaries

Remain intentionally separate:

- Yogakulam live PHP commerce completion;
- PA-1 live identity decision;
- Google Ads production API approval;
- Meta Ads permissions/account selection;
- Search Indexing activation;
- predictive model promotion / automatic learning-based ranking.
