# SalsysOS — Post-R10 North-Star Rebaseline V1

**Date:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Baseline production/doc head:** `ac421002be3ee8f7983f464f75c4f20acd2265f3`

## Purpose

Select the next internal product checkpoint after formal R10 V1 engineering closeout.

This rebaseline is read-only. It compares remaining internal productization opportunities against current production/repository evidence and keeps external/provider/human-blocked work parked.

---

## 1. R10 is no longer the next engineering gap

R10 V1 is closed through P0-P3.

Real recommendation/business-effectiveness samples remain an operational evidence dependency, not a reason to invent another R10 phase.

Predictive model promotion and automatic learning-based ranking remain explicitly evidence-gated.

---

## 2. R11 live Education/Wellness inventory

Across 4 active organizations, current production contains:

```text
courses                              16
course_batches                       85
upcoming capacity rows               63
person/course affinity rows          21
person/course recommendation rows    20
```

All 16 courses and all 85 batches currently belong to Yogakulam Academy.

The other active organizations, including `Test Yoga School`, currently contain no course/batch rows.

Interpretation:

- the Education/Wellness vertical has substantial real functionality;
- the reusable multi-tenant product has not yet been proven with a second configured education tenant;
- the next R11 value is packaging/configuration/reuse, not adding more Yogakulam-specific features.

---

## 3. R11 schema is already largely tenant-generic

`courses` includes generic fields such as:

- organization;
- code;
- name;
- category;
- hours;
- active state;
- metadata;
- source/external identity + sync timestamps.

`course_batches` includes:

- organization/course linkage;
- batch code;
- location;
- delivery mode;
- dates/times/timezone;
- capacity / seats remaining;
- currency/pricing;
- active + enrollment state;
- accommodation capacity/remaining;
- external source identity/sync metadata.

Key application paths are already organization-scoped:

- course-management writes include `organization_id`;
- Admissions reads use organization-scoped canonical snapshots;
- capacity management is tied to the batch/organization boundary.

This means R11 does not need a foundational rewrite.

---

## 4. R11 productization gap

The current system still lacks a formal reusable **Education/Wellness Vertical Pack** boundary.

Current generic tenant provisioning creates the same workspace shell for every active organization:

```text
admin
finance
marketing
reports
sales
```

Education features are not activated/configured through a vertical capability profile.

The R11 audit must determine:

1. which course/admissions capabilities are generic education concepts;
2. which batch fields are wellness/residential extensions (for example private/shared/course-only pricing and accommodation capacity);
3. how an organization opts into/configures the education vertical without code changes;
4. how route/navigation/capability access should behave for tenants without the pack;
5. how a second education tenant can be configured without copying Yogakulam data or logic;
6. how source/catalog sync becomes tenant-configurable;
7. how vertical defaults/templates remain optional and non-destructive.

---

## 5. R13 Commercial SaaS Readiness evidence

Current tenancy/onboarding baseline is healthy:

```text
active organizations                 4
active orgs with owner/admin         4
active orgs without owner/admin      0
organization_onboarding rows         1
enforced onboarding rows             1
incomplete enforced onboarding       0
```

Controlled platform-admin provisioning already exists and atomically creates:

- organization;
- owner identity/profile/membership;
- functional workspaces;
- onboarding row with enforcement.

However, production currently has no billing/subscription/plan-entitlement schema.

Repository evidence also confirms these remain intentionally unimplemented:

- public tenant signup;
- billing/subscription enforcement;
- plan limits/entitlements;
- signup abuse controls/throttling;
- customer-controlled organization deletion;
- automated billing-triggered suspension;
- cross-tenant workspace switching.

---

## 6. R11 vs R13 sequencing decision

### Why R13 is not next

R13 is a large commercial shell. Building signup/billing/entitlements before the vertical is explicitly packaged would commercialize an incompletely defined product surface.

### Why R11 is next

R11 has a strong existing engine and real production depth. The highest-leverage next step is to make that capability **reusable, configurable and tenant-safe as a product pack**.

That produces a clearer unit to sell and later attach R13 plans/entitlements to.

---

## 7. Exact next checkpoint

# R11 — Education / Wellness Vertical Pack V1 — Audit & Design

No implementation yet.

The audit/design must define:

- vertical capability model;
- generic education core vs wellness/residential extensions;
- route/navigation/workspace gating;
- second-tenant configuration path;
- tenant-configurable catalog/source sync;
- safe defaults/templates;
- acceptance criteria proving reuse without synthetic customer activity.

Do not seed fake courses/batches into `Test Yoga School` merely to prove multi-tenant readiness.

---

## 8. R13 remains the next larger commercial program

After the R11 vertical pack is defined/proven, R13 can package actual reusable capabilities into:

- signup/provisioning;
- plans/entitlements;
- billing/subscriptions;
- lifecycle/suspension/deletion controls;
- commercial onboarding.

R13 remains high priority, but it follows the vertical-pack boundary rather than preceding it.

---

## 9. Parked work remains unchanged

Do not resume automatically:

- live Yogakulam commerce completion / Hostinger PHP emitter;
- PA-1 live identity merge/dismissal;
- Google Ads production API approval;
- Meta Ads provider permission/account selection;
- Search Indexing activation;
- predictive-model promotion / automatic learning-based ranking.

---

## Decision

**Post-R10 rebaseline complete.**

The next controlled program is **R11 Education / Wellness Vertical Pack V1 — audit/design first**.
