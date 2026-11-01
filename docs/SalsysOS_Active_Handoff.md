# SalsysOS Active Handoff

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`

Read first:

1. `docs/SalsysOS_Current_Checkpoint.md`
2. `docs/checkpoints/M-2026-11-01-R11-P1-Product-Surface-Gating-v1.md`
3. `docs/checkpoints/M-2026-11-01-R11-Vertical-Pack-Audit-Design-v1.md`

Historical checkpoint files are immutable evidence records.

---

## 1. Exact continuation point

**R11-P2 — Catalog Adapter Boundary**

R11-P0 and R11-P1 are complete and production-accepted.

P2 must put a generic tenant-configured Education catalog adapter selection boundary around the existing proven Yogakulam adapter. Do **not** rewrite the Yogakulam parser into a generic scraper.

Do not begin R11-P3 residential/accommodation surface gating until P2 is production-accepted.

---

## 2. P1 production baseline

```text
Feature PR / merge SHA   #426 / 616458d5f089bd6e07815f6b44a0c724a05cc9e0
Supabase migration       20261101181750 r11_p1_education_surface_authorization_v1
Supabase migration       20261101181833 r11_p1_lead_capability_trigger_context_v1
Vercel deployment        dpl_Ht1voiBU1B958cUfj4yBQ3px5JNQ READY
Production Smoke         #175 attempt 2 passed after DB migrations
CodeQL                   #672 passed
CI                       #1387 passed
```

Production aliases on that deployment include:

```text
crm.salsysos.com
salsysos.com
www.salsysos.com
```

---

## 3. Live capability/data state

```text
Yogakulam Academy  education_core=true
                    education_catalog_sync=true
                    wellness_residential=true
                    courses=16 batches=85 enrollments=0

Demo org           no R11 capability rows; courses=0 batches=0 enrollments=0
SalsysOS           no R11 capability rows; courses=0 batches=0 enrollments=0
Test Yoga School   no R11 capability rows; courses=0 batches=0 enrollments=0
```

No fake second-tenant Education data exists.

---

## 4. P1 security/product truth to preserve

Enabled capability codes are supplied through trusted server-derived workspace context.

Education management surfaces require `education_core` + bound organization + owner/admin/manager.

Navigation hiding is UX only; server/data boundaries fail closed independently.

Education route family includes:

```text
/admissions
/operations
/availability
/course-management
/enrollments
```

Non-Education Lead create/edit:

- does not load course/batch data;
- uses the generic CRM form;
- does not render course/batch/location/month/mode Education controls.

Canonical DB protection:

- Lead trigger blocks creation/change of Education-only preference fields for non-Education tenants while preserving historical values;
- Enrollment RLS requires `education_core` in addition to its prior access/admin rules;
- public Course Management and Admissions product RPCs enforce capability + privileged role.

Important nuance: do not rely on service-role traversal of the public Course Management product wrapper; its preserved internal aggregator still enforces authenticated CRM-user checks. The verified P1 product path is authenticated owner/admin/manager.

---

## 5. Production runtime proof

Using an existing bound privileged Yogakulam session, read-only acceptance proved:

```text
Yogakulam Education operations access  true
SalsysOS Education operations access   false
Course Management                      16 courses / 85 batches
Admissions snapshot                    canonical object
```

The connector blocked the rollback-only Lead UPDATE test before PostgreSQL execution. No customer row was touched and no DML success should be inferred.

---

## 6. Health boundary

```text
CRM Core V2             healthy / 0 integrity issues
Admissions automation   healthy / 96 runs / 0 failures in 24h
Customer 360 V2         degraded only because of 2 pre-existing identity conflicts
```

The PA-1 identity decision remains a separate parked human-review boundary.

---

## 7. R11-P2 required scope

Locked design sequence:

1. define a generic Education catalog adapter interface/registry;
2. keep the existing Yogakulam adapter intact behind a provider key;
3. make adapter selection tenant-configurable through **non-secret** capability config;
4. fail closed when `education_catalog_sync` or provider configuration is absent;
5. keep sync run ledger and health tenant-scoped/canonical;
6. keep manual course/batch management available under `education_core` even without external sync.

Current design evidence says the sync route directly calls `syncYogakulamCourseCatalog(...)`; P2 should replace that hard-coded selection seam, not rewrite the adapter itself.

---

## 8. P2 constraints

- no generic rewrite of Yogakulam parsing logic;
- no provider secret in capability config JSON;
- no provider inference from org name or onboarding industry;
- no fake Test Yoga School catalog/sync records in production;
- no dependency from `education_core` to external sync;
- no P3 residential/accommodation surface work;
- no R13 billing/subscription/entitlement work.

---

## 9. Acceptance strategy for P2

Use real Yogakulam data plus non-mutating/rollback/CI proof:

- Yogakulam provider resolves through the new registry/config boundary;
- current real catalog behavior remains 16 courses / 85 batches unless the upstream source legitimately changes during validation;
- missing provider config fails closed;
- disabled `education_catalog_sync` fails closed;
- manual Education Core catalog management remains independent;
- non-Education tenants remain without fake courses/batches/sync runs;
- sync ledger/health remains organization-scoped.

---

## 10. Parked work

Do not resume automatically:

- Yogakulam Hostinger/PHP commerce completion;
- PA-1 live identity decision;
- Google Ads production approval;
- Meta Ads permission/account selection;
- Search Indexing activation;
- predictive model promotion / automatic learning-based recommendation ranking.
