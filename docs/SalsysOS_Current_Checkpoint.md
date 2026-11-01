# SalsysOS Current Checkpoint

**Checkpoint date:** 2026-11-01  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Latest production runtime head:** `616458d5f089bd6e07815f6b44a0c724a05cc9e0`  
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
- R11-P0 Capability + Security Foundation: complete and production-accepted;
- **R11-P1 Product Surface Gating: complete and production-accepted**;
- **current exact checkpoint: R11-P2 — Catalog Adapter Boundary**.

Read first:

1. `docs/checkpoints/M-2026-11-01-R11-P1-Product-Surface-Gating-v1.md`
2. `docs/checkpoints/M-2026-11-01-R11-Vertical-Pack-Audit-Design-v1.md`
3. `docs/SalsysOS_Active_Handoff.md`

---

## 2. R11-P1 production truth

Production merge:

```text
PR        #426
main SHA  616458d5f089bd6e07815f6b44a0c724a05cc9e0
```

Supabase migration ledger:

```text
20261101181750  r11_p1_education_surface_authorization_v1
20261101181833  r11_p1_lead_capability_trigger_context_v1
```

Vercel production:

```text
deployment dpl_Ht1voiBU1B958cUfj4yBQ3px5JNQ
state      READY
SHA        616458d5f089bd6e07815f6b44a0c724a05cc9e0
aliases    crm.salsysos.com / salsysos.com / www.salsysos.com
```

Release gates:

```text
Production Smoke #175 attempt 2  passed after DB migrations
CodeQL #672                     passed
CI #1387                        passed
```

---

## 3. Capability-aware product surface now live

Enabled capability codes are exposed through trusted server-derived workspace context.

Education management surfaces require:

```text
education_core
+
session-bound organization
+
owner/admin/manager role
```

Education navigation is hidden when the capability is disabled, but authorization is enforced independently at server/data boundaries.

Covered product surfaces include:

```text
Admissions
Operations
Availability
Course Management / Programs & Batches
Enrollments
Education-specific Lead controls
```

For non-Education organizations, Lead create/edit uses a generic CRM form and does not load course/batch data.

Canonical Lead truth also has a trigger preventing non-Education tenants from creating/changing Education-only preference values. Enrollment RLS independently requires `education_core`.

---

## 4. Current tenant capability/data state

```text
Yogakulam Academy  education_core=true
                    education_catalog_sync=true
                    wellness_residential=true
                    courses=16 batches=85 enrollments=0

Demo org           no R11 capability rows; courses=0 batches=0 enrollments=0
SalsysOS           no R11 capability rows; courses=0 batches=0 enrollments=0
Test Yoga School   no R11 capability rows; courses=0 batches=0 enrollments=0
```

No synthetic second-tenant Education data exists.

Authenticated runtime proof:

```text
Yogakulam Education operations access  true
SalsysOS Education operations access   false
Course Management                      16 courses / 85 batches
Admissions snapshot                    canonical object
```

---

## 5. Health after P1

```text
CRM Core V2             healthy / 0 integrity issues
Admissions automation   healthy / 96 runs / 0 failures in 24h
Customer 360 V2         degraded only by 2 pre-existing identity conflicts
```

The Customer 360 warning is not an R11-P1 regression.

The rollback-only Lead DML test was blocked by the connector before PostgreSQL execution; no customer row was touched and no DML result is claimed.

---

## 6. Exact R11-P2 goal

P2 introduces a reusable Education catalog adapter boundary **without rewriting the proven Yogakulam parser**.

Locked scope:

1. define a generic Education catalog adapter interface/registry;
2. preserve the working Yogakulam adapter behind a provider key;
3. make adapter selection tenant-configurable through non-secret capability config;
4. prevent external sync execution when `education_catalog_sync` or provider configuration is absent;
5. keep tenant-scoped sync ledger/health canonical;
6. keep manual course/batch management available under `education_core` without external sync.

---

## 7. P2 constraints

- do not convert the Yogakulam adapter into a generic scraper/parser;
- do not put provider secrets in capability JSON/config;
- do not infer provider selection from organization name;
- do not create fake production catalog/sync data for a second tenant;
- do not require external sync for Education Core;
- do not start residential/accommodation surface gating yet (R11-P3);
- do not add billing/subscription/plan entitlement logic (R13).

---

## 8. Parked boundaries

Do not resume automatically:

- live Yogakulam commerce completion;
- PA-1 live identity decision;
- Google Ads production approval;
- Meta Ads provider approval/account selection;
- Search Indexing activation;
- predictive-model promotion / learning-based ranking.

---

## 9. Resume instruction

1. verify current `main`, Supabase and Vercel provenance;
2. read the R11-P1 production closeout and locked R11 design;
3. audit the current Yogakulam catalog sync route, adapter and sync ledger read-only;
4. finalize the smallest provider registry/config contract before code;
5. implement **R11-P2 only**;
6. preserve the proven Yogakulam adapter and real 16-course / 85-batch behavior;
7. prove missing/disabled sync capability or provider config fails closed without fake tenant data;
8. do not begin P3 until P2 is production-accepted.
