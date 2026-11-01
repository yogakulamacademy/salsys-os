# SalsysOS Active Handoff

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-02  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`

Read first:

1. `docs/SalsysOS_Current_Checkpoint.md`
2. `docs/checkpoints/M-2026-11-02-R11-P2-Catalog-Adapter-Boundary-v1.md`
3. `docs/checkpoints/M-2026-11-01-R11-Vertical-Pack-Audit-Design-v1.md`

Historical checkpoint files are immutable evidence records.

---

## 1. Exact continuation point

**R11-P3 — Optional Residential Extension Gating**

R11-P0, P1 and P2 are complete and production-accepted.

P3 must capability-gate residential-only accommodation/inventory/assignment controls and surfaced residential commercial fields through `wellness_residential`, while preserving base Education Core behavior.

Use read-only audit first. Do not seed fake residential data.

---

## 2. P2 production baseline

```text
Feature PR / merge SHA   #428 / 8bbe594050a17a95a7dd762a4db0f7b09a3430ba
Supabase migration       20261101184439 r11_p2_catalog_adapter_config_v1
Vercel deployment        dpl_GrPwvL6vykgbkJUqgMqh2q33S1VV READY
Production Smoke         #177 passed
CodeQL                   #676 passed
CI                       #1391 passed
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
                    sync provider=yogakulam_website
                    courses=16 batches=85 enrollments=0

Demo org           no R11 capability rows; courses=0 batches=0 enrollments=0
SalsysOS           no R11 capability rows; courses=0 batches=0 enrollments=0
Test Yoga School   no R11 capability rows; courses=0 batches=0 enrollments=0
```

`education_catalog_sync` config schema version is `2`.

No fake second-tenant Education data exists.

---

## 4. P2 architecture to preserve

- external sync provider selection is explicit tenant config;
- provider key for Yogakulam is `yogakulam_website`;
- the proven Yogakulam parser/sync engine remains intact behind the adapter registry;
- provider secrets stay outside capability JSON;
- missing/disabled sync capability or provider config fails closed;
- manual Education Core catalog management remains independent of external sync;
- `course_catalog_sync_runs` remains tenant/source scoped and canonical.

Current sync history remains unchanged:

```text
Yogakulam sync runs  3
latest run           2026-10-03
```

---

## 5. Health boundary

```text
CRM Core V2             healthy / 0 integrity issues
Admissions automation   healthy / 96 runs / 0 failures in 24h
Customer 360 V2         degraded only because of 2 pre-existing identity conflicts
```

The PA-1 identity decision remains a separate parked human-review boundary.

---

## 6. R11-P3 required scope

Locked design rule for `wellness_residential`:

> Gates residential-only accommodation/inventory/assignment controls and residential commercial fields where surfaced. It does not control base course/batch/admissions functionality.

Audit and implementation must cover, where currently exposed:

```text
accommodation_properties
accommodation_rooms
batch_accommodation_types
batch_accommodation_room_pool
enrollment_accommodation_assignments
live inventory / roster views
```

Also audit residential-commercial fields already present on batch/course-management surfaces, including private/shared/course-only price and accommodation capacity/remaining/note.

---

## 7. Current residential evidence

Locked design evidence before P3:

```text
accommodation properties     1
rooms                        0
batch accommodation types    0
room-pool rows                0
assignments                   0
```

This sparse evidence is intentional. Do not create synthetic inventory just to exercise P3.

---

## 8. P3 safety constraints

- no fake rooms, room pools, assignments or second-tenant residential data;
- no broad Education behavior change when `wellness_residential` is disabled;
- no provider/catalog changes — P2 is closed;
- no billing/subscription/plan-entitlement work — R13 remains separate;
- preserve tenant, role, identity and privacy boundaries;
- navigation hiding is never the sole authorization boundary;
- prefer existing real data + read-only/rollback verification.

---

## 9. Acceptance strategy for P3

Prove at minimum:

- Yogakulam retains its current intended residential capability behavior;
- non-residential/non-enabled tenants cannot access residential-only surfaces/data controls;
- base Education Core Course Management/Admissions remains functional without `wellness_residential`;
- residential canonical tables/views retain tenant isolation;
- no synthetic production inventory is introduced;
- CRM/Admissions/Customer 360 health does not regress;
- CI, CodeQL, Production Smoke and exact Vercel SHA are green.

---

## 10. Parked work

Do not resume automatically:

- Yogakulam Hostinger/PHP commerce completion;
- PA-1 live identity decision;
- Google Ads production approval;
- Meta Ads permission/account selection;
- Search Indexing activation;
- predictive model promotion / automatic learning-based recommendation ranking.
