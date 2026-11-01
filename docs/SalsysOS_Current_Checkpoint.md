# SalsysOS Current Checkpoint

**Checkpoint date:** 2026-11-02  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Latest production runtime head:** `8bbe594050a17a95a7dd762a4db0f7b09a3430ba`  
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
- R11-P1 Product Surface Gating: complete and production-accepted;
- **R11-P2 Catalog Adapter Boundary: complete and production-accepted**;
- **current exact checkpoint: R11-P3 — Optional Residential Extension Gating**.

Read first:

1. `docs/checkpoints/M-2026-11-02-R11-P2-Catalog-Adapter-Boundary-v1.md`
2. `docs/checkpoints/M-2026-11-01-R11-Vertical-Pack-Audit-Design-v1.md`
3. `docs/SalsysOS_Active_Handoff.md`

---

## 2. R11-P2 production truth

Production merge:

```text
PR        #428
main SHA  8bbe594050a17a95a7dd762a4db0f7b09a3430ba
```

Supabase migration ledger:

```text
20261101184439  r11_p2_catalog_adapter_config_v1
```

Provider/capability state:

```text
education_catalog_sync config schema version  2
Yogakulam sync enabled                        true
Yogakulam provider                            yogakulam_website
Yogakulam courses / batches                   16 / 85
Other active orgs courses / batches           0 / 0
Other active org sync capability              absent
```

Sync ledger remained unchanged during P2 acceptance:

```text
Yogakulam sync runs  3
latest run           2026-10-03
```

Vercel production:

```text
deployment dpl_GrPwvL6vykgbkJUqgMqh2q33S1VV
state      READY
SHA        8bbe594050a17a95a7dd762a4db0f7b09a3430ba
aliases    crm.salsysos.com / salsysos.com / www.salsysos.com
```

Release gates:

```text
PR CI #1390               passed
PR CodeQL #675            passed
Production CI #1391       passed
Production CodeQL #676    passed
Production Smoke #177     passed
```

---

## 3. R11 capability/data baseline to preserve

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

`education_core` remains independent of external sync. Manual course/batch management remains available without `education_catalog_sync`.

---

## 4. P2 architecture now live

The external Education catalog-sync route no longer hard-codes Yogakulam provider selection.

Instead:

1. tenant capability/provider config is resolved;
2. the generic adapter registry selects a provider by explicit key;
3. `yogakulam_website` delegates to the existing proven Yogakulam parser/sync engine;
4. missing/disabled sync capability, missing provider config, unsupported provider, and ambiguous multi-tenant sync execution fail closed;
5. provider secrets remain environment-backed, not capability-config backed;
6. tenant-scoped sync ledger/health remains canonical.

---

## 5. Health after P2

```text
CRM Core V2             healthy / 0 integrity issues
Admissions automation   healthy / 96 runs / 0 failures in 24h
Customer 360 V2         degraded only by 2 pre-existing identity conflicts
```

The Customer 360 warning is not an R11-P2 regression.

---

## 6. Exact R11-P3 goal

P3 applies the optional `wellness_residential` capability to residential-only product surfaces and canonical data boundaries.

Locked scope:

1. capability-gate accommodation/residential surfaces;
2. preserve the organization-aware accommodation model;
3. gate residential-only inventory/room/assignment controls;
4. gate surfaced residential commercial fields such as private/shared/course-only accommodation pricing and accommodation capacity/remaining/note;
5. preserve base Education Core course/batch/admissions functionality when `wellness_residential` is disabled;
6. do not create synthetic rooms, room-pool rows, assignments, or second-tenant residential data merely for proof.

---

## 7. Current residential evidence

The live normalized subsystem already includes:

```text
accommodation_properties
accommodation_rooms
batch_accommodation_types
batch_accommodation_room_pool
enrollment_accommodation_assignments
live inventory / roster views
```

Earlier locked design evidence:

```text
accommodation properties     1
rooms                        0
batch accommodation types    0
room-pool rows                0
assignments                   0
```

P3 must treat this as an optional extension, not as a required Education invariant.

---

## 8. P3 constraints

- do not make `wellness_residential` control base courses/batches/admissions;
- do not add fake residential inventory or assignments;
- do not infer capability from organization name, industry, nullable data, or location;
- do not add billing/subscription/plan-entitlement logic (R13);
- preserve existing tenant/role/privacy boundaries;
- use read-only audit first before implementation.

---

## 9. Parked boundaries

Do not resume automatically:

- live Yogakulam commerce completion;
- PA-1 live identity decision;
- Google Ads production approval;
- Meta Ads provider approval/account selection;
- Search Indexing activation;
- predictive-model promotion / learning-based ranking.

---

## 10. Resume instruction

1. verify current `main`, Supabase and Vercel provenance;
2. read the R11-P2 production closeout and locked R11 design;
3. audit accommodation tables, views, grants/RLS, current routes/components and residential commercial fields read-only;
4. identify the smallest `wellness_residential` capability boundary without changing base Education behavior;
5. implement **R11-P3 only**;
6. use existing real Yogakulam residential evidence and non-mutating/rollback proof;
7. do not seed fake accommodation data;
8. after P3 production acceptance, formally close R11 V1 before selecting the next roadmap checkpoint.
