# SalsysOS Active Handoff

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`

Read first:

1. `docs/SalsysOS_Current_Checkpoint.md`
2. `docs/checkpoints/M-2026-11-01-R11-P0-Capability-Security-Foundation-v1.md`
3. `docs/checkpoints/M-2026-11-01-R11-Vertical-Pack-Audit-Design-v1.md`

Historical checkpoint files are immutable evidence records.

---

## 1. Exact continuation point

**R11-P1 — Product Surface Gating**

R11-P0 is complete and production-accepted. The capability/security foundation is live. P1 must make navigation, routes, data surfaces and Education-specific controls consistently obey that capability model.

Do not begin P2 catalog-adapter work or P3 residential-surface work until P1 is production-accepted.

---

## 2. P0 production baseline

```text
PR / merge SHA      #424 / 742f9d88290332d53e41a025c48295c6aa41818c
Supabase migration  20261101174300 r11_capability_security_foundation_v1
Vercel deployment   dpl_FKSi2T6LMKwhHnWngD4f6hPdeQef READY
Production Smoke    #173 passed
CodeQL               #668 passed
CI                    #1383 attempt 2 passed
```

The initial CI #1383 attempt was cancelled during Build after prior checks passed; rerun attempt 2 completed successfully including the full Build. No corrective code patch was required.

---

## 3. Live capability state

V1 capability codes:

```text
education_core
wellness_residential      -> education_core
education_catalog_sync    -> education_core
```

Live tenant state:

```text
Yogakulam Academy  education_core=true
                    education_catalog_sync=true
                    wellness_residential=true
                    courses=16 batches=85

Demo org           all R11 capabilities=false / no rows; courses=0 batches=0
SalsysOS           all R11 capabilities=false / no rows; courses=0 batches=0
Test Yoga School   all R11 capabilities=false / no rows; courses=0 batches=0
```

No fake second-tenant Education data exists.

---

## 4. P0 security truth to preserve

Authenticated direct table grants:

```text
courses        SELECT / INSERT / UPDATE
course_batches SELECT / INSERT / UPDATE
```

Authenticated direct DELETE/TRUNCATE/TRIGGER/REFERENCES are removed.

Course/batch reads require `education_core`.

Course-management mutation requires `education_core` plus tenant-bound owner/admin/manager authority.

Hardened explicit-org V2 course-admin RPCs:

```text
update_course_batch_admin_v2
set_course_batch_enrollment_state_v2
set_course_batch_active_state_v2
```

Authenticated + service_role EXECUTE is allowed because each hardened V2 function performs its own tenant/role authorization and preserves `auth.uid()` audit attribution.

Legacy V1 implicit-org course-admin RPCs remain blocked to authenticated users.

---

## 5. Dependency proof

Rollback-only production test proved:

- dependent capability enablement fails without `education_core`;
- `education_core` disablement fails while dependent capabilities remain enabled;
- the rollback left Demo org unchanged with zero capability rows.

Unknown capability codes fail closed.

---

## 6. Health boundary

- CRM Core V2: healthy, integrity issues 0;
- Customer 360 V2: degraded only because of 2 pre-existing identity conflicts;
- PA-1 identity decision remains parked and must not be inferred or auto-resolved.

---

## 7. R11-P1 required scope

Audit first, then implement only what is needed for:

1. trusted workspace/server exposure of capability state;
2. capability-aware sidebar/navigation;
3. Course Management direct route/data authorization using capability + role;
4. Admissions route/surface gating where course/batch semantics are required;
5. Education-specific Lead course/batch selectors hidden or disabled for non-Education tenants;
6. generic Leads/Pipeline/Revenue/Conversations remaining usable without `education_core`;
7. Yogakulam retaining its existing Education experience.

Navigation hiding alone is never authorization.

---

## 8. P1 constraints

- keep generic Lead/Person Education columns nullable and canonical;
- do not infer capability from `industry`, org name, or presence of nullable fields;
- do not mutate `organization_workspaces` to represent vertical access;
- do not seed Test Yoga School or another tenant with fake courses/batches;
- do not refactor `lib/integrations/yogakulam-courses.ts` yet;
- do not add residential UI gating yet;
- do not add billing/subscription/plan-entitlement logic.

---

## 9. Later R11 phases

- **P2:** generic catalog adapter registry/config boundary; Yogakulam remains one provider implementation.
- **P3:** optional residential/accommodation surface gating.

R13 commercial SaaS packaging remains after R11 productization.

---

## 10. Parked work

Do not resume automatically:

- Yogakulam Hostinger/PHP commerce completion;
- PA-1 live identity decision;
- Google Ads production approval;
- Meta Ads permission/account selection;
- Search Indexing activation;
- predictive model promotion / automatic learning-based recommendation ranking.
