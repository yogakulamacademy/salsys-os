# SalsysOS — R11 Education / Wellness Vertical Pack V1 Scope Revision

**Date:** 2026-11-02  
**Repository:** `yogakulamacademy/salsys-os`  
**Purpose:** Final product-scope correction after R11 production acceptance.

---

## Decision

**R11 Education / Wellness Vertical Pack V1 remains COMPLETE and production-accepted, with accommodation / residential operations removed from the active product scope.**

The accepted R11 product is:

```text
P0 — Capability + Security Foundation                COMPLETE
P1 — Education Product Surface Gating                COMPLETE
P2 — Generic Catalog Adapter Boundary                COMPLETE
P3 — Accommodation / Residential Extension           CANCELLED / RETIRED FROM PRODUCT SCOPE
R11 V1                                                COMPLETE
```

This scope revision supersedes the product requirement represented by the earlier P3 closeout. It does **not** erase or invalidate historical implementation/security evidence from the original R11 closeout.

---

## 1. Why P3 is retired

SalsysOS is a Sales + Analysis Operating System. Room inventory, bed inventory, occupancy, room pools, property/venue administration and student-to-room assignment are hotel/campus operations rather than core sales, conversion, attribution or revenue workflows.

The Wellness / Education vertical should stay focused on:

- course/program;
- batch/cohort;
- location;
- online/offline/residential commercial mode;
- course dates;
- package/price preference such as Private / Twin / Shared when commercially relevant;
- deposits and balance payments;
- enrollment;
- admissions notes and logistics context;
- customer journey, attribution and revenue.

---

## 2. Explicitly out of scope

Do not build or expose these as SalsysOS Education product surfaces:

- accommodation property / venue management;
- physical room inventory;
- physical bed inventory;
- room pools;
- occupancy management;
- room maintenance / availability operations;
- student-to-room assignment;
- accommodation assignment workflows.

The historical Course Management accommodation UI/code had already been removed in commit:

```text
b11c4d85eafa3e879480a0c8e6e549937590fe34
Remove dormant accommodation management code
```

No accommodation management UI needs to be reintroduced.

---

## 3. Residual database/capability structures

Existing accommodation/residential database structures and historical `wellness_residential` security boundaries may remain dormant.

Rules:

- do not delete mature database structures merely for cleanup;
- do not expose them in CRM product navigation or workflows;
- do not require them for courses, batches, admissions, enrollment or revenue;
- do not spend engineering time extending them;
- do not include them in R11 acceptance criteria;
- future schema removal, if ever justified, must be a separate low-risk migration project.

The dormant structures are implementation history, not active product scope.

---

## 4. R11 acceptance basis

### P0 — Capability + Security Foundation

Accepted in production through PR #424 / merge `742f9d88290332d53e41a025c48295c6aa41818c`.

### P1 — Education Product Surface Gating

Accepted in production through PR #426 / merge `616458d5f089bd6e07815f6b44a0c724a05cc9e0`.

### P2 — Generic Catalog Adapter Boundary

Accepted in production through PR #428 / merge `8bbe594050a17a95a7dd762a4db0f7b09a3430ba`.

P2 production acceptance proved:

- generic tenant-configured Education catalog adapter registry/runner;
- explicit provider selection rather than tenant-name inference;
- Yogakulam retained as `yogakulam_website` provider behind the generic boundary;
- manual Education Core works without external catalog sync;
- other active organizations remain without fabricated course/batch data;
- tenant-scoped sync ledger/health remains canonical;
- CI, CodeQL, Production Smoke and Vercel production provenance passed.

Therefore no remaining R11 engineering requirement depends on accommodation management.

---

## 5. Final R11 closeout statement

**R11 — Wellness / Education Productization: COMPLETE.**

The reusable first vertical now has:

- explicit tenant capability boundaries;
- Education-aware product surface gating;
- generic CRM behavior for non-Education organizations;
- reusable course/program/batch concepts;
- provider-neutral catalog adapter selection;
- tenant-safe catalog sync boundaries;
- admissions/enrollment/payment/revenue integration points;
- commercial package preferences without room-management operations.

No new R11 feature development remains.

---

## 6. Next phase

Proceed directly to:

# R13 — Commercial SaaS Readiness

Current exact checkpoint:

**R13-P0 — Commercial State Foundation**

Primary scope:

- logical plan catalog;
- plan-to-capability entitlement mapping;
- organization subscription state;
- append-only subscription event/audit ledger;
- provider-neutral commercial readiness/drift model;
- later self-service onboarding, billing, usage/limits and commercial packaging.

R12 Realty remains a separate future vertical and is not required before R13 commercialization work.
