# SalsysOS Current Checkpoint

**Checkpoint date:** 2026-11-01  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Latest verified R10 runtime head:** `0ff9a29096c44975ba3ea39099e7ecfa1a7bd0ac`  
**Latest canonical docs head before this branch:** `ac421002be3ee8f7983f464f75c4f20acd2265f3`  
**Fast resume file:** `docs/SalsysOS_Active_Handoff.md`

> Historical checkpoint files under `docs/checkpoints/` are immutable evidence records.

---

## 1. Current position

SalsysOS is a **Sales + Analysis Operating System**.

Current state:

- broad 14-surface engineering closeout: complete;
- R9 AEO / GEO / AI Visibility V1: closed;
- R10 Predictive Intelligence + Owner Command Center V1 engineering: closed through P0-P3;
- post-R10 North-Star rebaseline: complete;
- **current exact checkpoint: R11 — Education / Wellness Vertical Pack V1 — Audit & Design**.

Read first:

- `docs/checkpoints/M-2026-11-01-Post-R10-Rebaseline-v1.md`
- `docs/checkpoints/M-2026-11-01-R10-V1-Engineering-Closeout-v1.md`
- `docs/SalsysOS_Active_Handoff.md`

---

## 2. Why R11 is next

Production has a substantial real education/wellness operating layer:

```text
active organizations                  4
courses                              16
course batches                       85
upcoming capacity rows               63
person/course affinity rows          21
person/course recommendation rows    20
```

All current course and batch rows belong to Yogakulam Academy.

The other active organizations, including `Test Yoga School`, currently have no course/batch data.

Interpretation:

- the vertical engine is real and production-used;
- the core schema is already organization-scoped and largely generic;
- the missing product layer is reusable configuration/activation and second-tenant readiness, not another Yogakulam-specific feature set.

---

## 3. Existing R11 foundation is already reusable

`courses` is organization-scoped and models generic education concepts:

- code / name / category / hours;
- active state;
- metadata;
- source/external identity and sync timestamps.

`course_batches` is organization-scoped and models:

- course linkage and batch code;
- location / delivery mode / timezone;
- dates/times;
- capacity and seats remaining;
- currency and pricing;
- enrollment state;
- optional accommodation capacity/remaining;
- external-source identity and sync metadata.

Key application boundaries are already tenant-scoped:

- course-management writes include `organization_id`;
- Admissions uses organization-scoped canonical snapshots;
- capacity management operates through the batch/organization boundary.

R11 therefore does **not** require a foundational data-model rewrite.

---

## 4. Exact R11 audit/design questions

Before implementation, define and verify:

1. the organization-level vertical/capability model;
2. generic Education core vs Wellness/Residential extensions;
3. route/navigation/action gating for organizations without the pack;
4. role/permission boundaries for course and batch administration;
5. second-tenant configuration without copying Yogakulam data or logic;
6. tenant-configurable course/catalog source synchronization;
7. optional/non-destructive vertical defaults or templates;
8. acceptance proof for reuse that does not seed fake customer activity.

Do **not** create fake courses/batches in `Test Yoga School` merely to make multi-tenant readiness appear proven.

---

## 5. R13 remains the next larger commercial program

Controlled tenant provisioning/onboarding is already healthy:

```text
active organizations                  4
active orgs with owner/admin          4
active orgs without owner/admin       0
organization_onboarding rows          1
enforced onboarding rows              1
incomplete enforced onboarding        0
```

However, public signup and commercial entitlement infrastructure remain unimplemented:

- billing/subscription enforcement;
- plan limits/entitlements;
- public tenant signup;
- signup abuse controls/throttling;
- customer-controlled organization deletion;
- automated billing-triggered suspension;
- cross-tenant workspace switching.

Sequence decision: define/prove the reusable vertical pack first, then commercialize that product boundary through R13.

---

## 6. Generic workspace shell

All current active organizations receive the same enabled workspace shell:

```text
admin
finance
marketing
reports
sales
```

Education/Wellness capability is not currently represented as a formal organization-level vertical pack/capability profile.

That is a central R11 audit target.

---

## 7. R10 remains closed

R10-P0 through P3 are complete. Real recommendation effectiveness must accumulate organically.

Do not invent an R10-P4 merely because recommendation/feedback/outcome sample counts are currently zero.

Predictive model promotion and automatic learning-based re-ranking remain evidence-gated.

---

## 8. Other parked boundaries

Do not resume automatically:

- Yogakulam live commerce completion / Hostinger PHP emitter;
- PA-1 live identity decision;
- Google Ads production API approval;
- Meta Ads permission/App Review/account selection;
- broad Search Indexing activation.

---

## 9. R11 audit acceptance contract

The audit/design checkpoint is complete only when it produces:

- a clear vertical capability configuration model;
- a documented generic Education core;
- documented optional Wellness/Residential extensions;
- a route/navigation/authorization gating contract;
- a tenant-configurable catalog/source-sync contract;
- a safe second-tenant enablement path;
- an implementation sequence with no synthetic production data requirement;
- explicit non-goals preventing R13 billing/signup scope from leaking into R11.

No product code should be implemented until that contract is locked.

---

## 10. Locked engineering rules

- one controlled checkpoint at a time;
- verify before modifying;
- production facts beat stale planning percentages;
- PostgreSQL/Supabase remains canonical truth;
- tenant authority remains explicit/server-derived;
- vertical capability must never bypass existing tenant/role permissions;
- no fake customer/course/batch/recommendation/revenue evidence;
- generic education concepts must remain distinct from optional wellness-specific extensions;
- external/human-blocked work stays parked unless explicitly resumed.

---

## 11. Resume instruction

1. read `docs/SalsysOS_Active_Handoff.md`;
2. read `docs/checkpoints/M-2026-11-01-Post-R10-Rebaseline-v1.md`;
3. verify current `main`, Supabase and Vercel provenance;
4. continue the R11 read-only audit;
5. lock the R11 Vertical Pack V1 design before implementation;
6. do not seed a second tenant with fake vertical data for acceptance.
