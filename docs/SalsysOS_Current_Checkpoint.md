# SalsysOS Current Checkpoint

**Checkpoint date:** 2026-11-01  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Canonical rebaseline head before this design branch:** `85c81fadc5acd41f0fd0c1f37cfa8212eeaa15c1`  
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
- R11 Education / Wellness Vertical Pack V1 audit/design: **complete and locked**;
- **current exact checkpoint: R11-P0 — Capability + Security Foundation**.

Read first:

- `docs/checkpoints/M-2026-11-01-R11-Vertical-Pack-Audit-Design-v1.md`
- `docs/checkpoints/M-2026-11-01-Post-R10-Rebaseline-v1.md`
- `docs/SalsysOS_Active_Handoff.md`

---

## 2. Locked R11 capability model

R11 introduces product capability state separate from functional workspaces and separate from future billing.

Canonical model to implement:

```text
capability_catalog
organization_capabilities
```

V1 capability codes:

```text
education_core
wellness_residential
education_catalog_sync
```

Dependencies:

```text
wellness_residential   requires education_core
education_catalog_sync requires education_core
```

Onboarding `industry` may suggest a pack but is never authorization.

`organization_workspaces` remains the functional workspace model and must not be overloaded as vertical capability state.

---

## 3. Existing Education engine remains canonical

No foundational rewrite is planned.

Existing tenant-scoped truth remains:

- courses;
- course batches;
- Admissions capacity/demand;
- Lead/Person nullable course/batch preferences;
- enrollment linkage;
- person/course affinity/recommendation;
- course-management audit/state;
- course catalog sync ledger/health.

Education-specific fields embedded in generic CRM remain nullable; R11 surface gating hides/disables their product controls for tenants without `education_core`.

---

## 4. R11-P0 security prerequisite

Current RLS write checks correctly limit course management administration to:

```text
owner
admin
manager
service_role
```

However authenticated table grants on `courses` and `course_batches` currently include unnecessary broad privileges such as `DELETE`, `TRUNCATE`, `TRIGGER` and `REFERENCES`.

Repository audit found no active application delete path for courses/batches.

P0 must reduce the authenticated direct table boundary to only the privileges required by current application behavior:

```text
SELECT
INSERT
UPDATE
```

subject to RLS + tenant + role + capability checks.

Authenticated users must not retain direct:

```text
DELETE
TRUNCATE
TRIGGER
REFERENCES
```

---

## 5. P0 capability authority

P0 must provide a canonical tenant-safe helper equivalent to:

```text
organization_has_capability(org_id, capability_code)
```

Requirements:

- explicit organization identity;
- authenticated tenant binding for user-facing reads;
- trusted service/server path for administrative activation;
- unknown/disabled codes fail closed;
- capability dependencies cannot be bypassed;
- capability JSON/config contains non-secret configuration only.

Capability mutation is a high-impact configuration action. R11-P0 should keep it behind a trusted platform/admin server boundary rather than direct arbitrary-member writes.

---

## 6. Existing organization activation strategy

P0 must preserve current real Yogakulam behavior through explicit capability activation, not name/industry inference.

Expected:

```text
Yogakulam Academy
  education_core          enabled
  education_catalog_sync  enabled
  wellness_residential    explicit product decision/config

Other organizations
  disabled unless deliberately configured
```

Do not seed courses/batches into `Test Yoga School` or another tenant.

---

## 7. Later R11 phases — not P0 scope

### R11-P1 — Product surface gating

- workspace/server capability context;
- sidebar/navigation gating;
- Course Management direct route/data capability + role gating;
- Admissions/Education-specific surface gating;
- Education-specific Lead controls hidden for non-Education tenants.

### R11-P2 — Catalog adapter boundary

- generic adapter registry/interface;
- preserve `yogakulam_website` as one adapter;
- tenant-configurable non-secret adapter selection;
- sync execution fails closed without capability/config.

### R11-P3 — Optional Residential extension

- capability-gate accommodation/residential surfaces;
- Education core remains usable without residential data.

Do not implement P1/P2/P3 as part of P0 unless a verified dependency makes it unavoidable.

---

## 8. R13 remains later

Do not add signup/billing/subscriptions/plan entitlements to R11-P0.

R13 will later attach commercial packaging to the capability/product boundary after R11 is productized.

---

## 9. R11-P0 acceptance contract

P0 is complete only when:

1. capability catalog/state is canonical and tenant-safe;
2. capability state is distinct from functional workspace state;
3. dependency rules fail closed;
4. mutation authority is trusted/admin-controlled;
5. authenticated course/batch table grants are least-privilege and no longer include DELETE/TRUNCATE/TRIGGER/REFERENCES;
6. existing owner/admin/manager course mutation remains functional under capability authority;
7. Yogakulam's real Education use is preserved through explicit capability state;
8. other tenants receive no fake vertical data;
9. no route/UI/catalog-adapter rewrite is smuggled into P0;
10. migration provenance, CI, CodeQL, deployment and production readback are clean.

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

1. read `docs/SalsysOS_Active_Handoff.md`;
2. read the locked R11 audit/design checkpoint;
3. verify current `main`, Supabase and Vercel provenance;
4. implement **R11-P0 only** against the locked contract;
5. do not create fake second-tenant Education data;
6. do not begin P1/P2/P3 before P0 production acceptance is complete.
