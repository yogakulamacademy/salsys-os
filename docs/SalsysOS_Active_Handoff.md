# SalsysOS Active Handoff

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`

Read first:

1. `docs/SalsysOS_Current_Checkpoint.md`
2. `docs/checkpoints/M-2026-11-01-Post-R10-Rebaseline-v1.md`
3. `docs/checkpoints/M-2026-11-01-R10-V1-Engineering-Closeout-v1.md`

Historical checkpoint files are immutable evidence records.

---

## 1. Exact continuation point

**R11 — Education / Wellness Vertical Pack V1 — Audit & Design**

R10 V1 engineering is closed. The post-R10 rebaseline selected R11 before R13 because the education/wellness engine already exists and the next highest-value step is to make it explicitly reusable/configurable across tenants.

Do not start R11 implementation until the audit/design contract is locked.

---

## 2. Current R11 evidence

Across 4 active organizations:

```text
courses                              16
course batches                       85
upcoming capacity rows               63
person/course affinity rows          21
person/course recommendation rows    20
```

All current course/batch rows belong to Yogakulam Academy.

`Test Yoga School` exists as another active organization but has no course/batch data.

Do not seed fake courses or batches there to manufacture multi-tenant proof.

---

## 3. Existing generic foundation

The current course/batch schema is already organization-scoped and largely reusable.

Generic Education concepts already modeled:

- course identity/name/category/hours;
- batch date/time/timezone/location/mode;
- capacity/seats;
- currency/pricing;
- enrollment state;
- external source/catalog IDs and sync timestamps.

Potential Wellness/Residential extensions already present:

- private/shared/course-only pricing;
- accommodation capacity/remaining/note.

The audit must decide which are optional extensions rather than mandatory Education semantics.

---

## 4. Tenant shell today

All active organizations currently receive the same generic enabled workspaces:

```text
admin
finance
marketing
reports
sales
```

There is no formal organization-level Education/Wellness vertical capability profile today.

This is the central productization gap to audit.

---

## 5. R11 audit work

Verify read-only:

1. course-management route/navigation access boundaries;
2. Admissions route/navigation dependencies on course/batch capability;
3. current role/permission model for course/batch mutation;
4. course/batch constraints that are generic vs wellness-specific;
5. catalog/source sync configuration and any Yogakulam-specific assumptions;
6. whether an organization capability/settings model already exists elsewhere;
7. how a second tenant would enable the pack without copying Yogakulam data;
8. how defaults/templates can be optional and non-destructive.

Then lock a single R11 V1 implementation contract.

---

## 6. R13 remains later

Controlled customer organization provisioning/onboarding already exists, but R13 still lacks public signup, subscriptions/billing, plan entitlements, signup abuse controls, customer-controlled deletion and billing-driven suspension.

Do not pull those commercial concerns into R11 V1. First define the reusable vertical product boundary; then R13 can attach commercial plans/entitlements to it.

---

## 7. Parked work

Do not resume automatically:

- Yogakulam Hostinger/PHP commerce completion;
- PA-1 live identity decision;
- Google Ads production API approval;
- Meta Ads provider permission/account selection;
- Search Indexing activation;
- predictive model promotion / automatic learning-based recommendation ranking.

---

## 8. Safety rules

- verify before modifying;
- one checkpoint at a time;
- PostgreSQL remains canonical truth;
- tenant authority is server-derived/explicit;
- vertical capability cannot weaken role/tenant isolation;
- no fake second-tenant data for acceptance;
- generic Education core and optional Wellness/Residential extensions must remain distinguishable;
- do not mix R13 billing/signup scope into R11 design.
