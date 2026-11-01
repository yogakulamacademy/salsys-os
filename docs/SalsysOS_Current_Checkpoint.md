# SalsysOS Current Checkpoint

**Checkpoint date:** 2026-11-02  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production runtime head:** `1846b1fc845b0325f0a8ac6b409c67744d65245e`  
**Fast resume file:** `docs/SalsysOS_Active_Handoff.md`

> Historical checkpoint files under `docs/checkpoints/` are immutable evidence records.

---

## 1. Current position

SalsysOS is a **Sales + Analysis Operating System**.

Current state:

- broad 14-surface engineering closeout: complete;
- R9 V1: closed;
- R10 V1 (P0-P3): closed;
- **R11 Education / Wellness Vertical Pack V1 (P0-P3): closed and production-accepted**;
- current exact checkpoint: **R13 — Commercial SaaS Readiness — Audit & Design**.

Read first:

1. `docs/checkpoints/M-2026-11-02-R11-V1-Production-Closeout-v1.md`
2. `docs/SalsysOS_Active_Handoff.md`
3. `docs/SalsysOS_North_Star_Product_Context.md`

---

## 2. Verified R11 production release

Final R11 runtime:

```text
main SHA             1846b1fc845b0325f0a8ac6b409c67744d65245e
CI                   #1404 passed
CodeQL               #689 passed
Production Smoke     #180 passed
Vercel production    READY on exact SHA
Vercel deployment    dpl_5j1m4wM11NeLShzkV6z3peWz25ED
```

R11 production migrations:

```text
20261101174300 r11_capability_security_foundation_v1
20261101181750 r11_p1_education_surface_authorization_v1
20261101181833 r11_p1_lead_capability_trigger_context_v1
20261101184439 r11_p2_catalog_adapter_config_v1
20261101193508 r11_p3_residential_capability_boundary_v1
20261101193522 r11_p3_residential_trigger_context_v1
20261101195631 r11_p3_anon_residential_grant_hardening_v1
```

Final P3 hardening provenance:

```text
file   20261101195631_r11_p3_anon_residential_grant_hardening_v1.sql
bytes  1942
MD5    863a1bed570e34986c10a226330f21cf
```

---

## 3. R11 V1 product boundary now proven

Capabilities are explicit organization state, separate from workspaces and separate from billing:

```text
education_core
education_catalog_sync      requires education_core
wellness_residential        requires education_core
```

Production Yogakulam state:

```text
education_core          true
education_catalog_sync  true
wellness_residential    true
catalog provider        yogakulam_website
courses / batches       16 / 85
```

Other active organizations remain without synthetic Education/residential data.

R11 guarantees now include:

- generic CRM remains usable without Education capabilities;
- Education-specific navigation/routes/RPCs/Lead controls fail closed for non-Education tenants;
- external catalog provider selection is tenant-configured and provider-neutral;
- the Yogakulam adapter is one provider implementation, not the core architecture;
- residential truth is optional and separately capability-gated;
- residential base tables/views use least privilege;
- no synthetic second-tenant or residential evidence was introduced for closeout.

---

## 4. R11 final health boundary

```text
CRM Core V2             healthy / 0 integrity issues
Admissions automation   healthy / 96 runs / 0 failures in 24h
Customer 360 V2         degraded only by 2 pre-existing identity conflicts
```

The Customer 360 warning is not an R11 regression.

---

## 5. Residential security boundary

Base tables:

```text
anon           no direct privileges
authenticated  SELECT / INSERT / UPDATE only
```

Security-invoker residential views:

```text
anon           no privileges
authenticated  SELECT only
```

Accommodation mutation RPCs remain service-role-only.

A rollback-only attempt to disable Yogakulam `wellness_residential` while its real accommodation property exists correctly failed with:

`WELLNESS_RESIDENTIAL_DATA_PRESENT`

No business state changed.

---

## 6. Exact next checkpoint — R13 AUDIT & DESIGN

R13 is the next major internal product gap. Controlled provisioning/onboarding exists, but the commercial SaaS shell is not yet built.

Audit read-only before implementation.

Required design questions:

1. public/self-serve signup and tenant creation;
2. billing/subscription state model;
3. plan/entitlement model;
4. mapping plan entitlements onto existing capability state without conflating billing truth and capability truth;
5. trial, active, past-due, suspended, cancelled and reactivation semantics;
6. signup abuse controls / throttling;
7. customer-controlled organization deletion/export/retention boundaries;
8. billing-driven suspension while preserving canonical customer data;
9. platform-admin override/recovery paths;
10. migration/backfill for existing organizations;
11. what can be implemented provider-neutrally before selecting a billing provider.

No R13 implementation code until the audit/design contract is locked.

---

## 7. Parked boundaries

Do not resume automatically:

- live Yogakulam PHP commerce completion;
- PA-1 live identity decision;
- Google Ads production approval;
- Meta Ads provider approval/account selection;
- Search Indexing activation;
- predictive-model promotion / automatic learning-based recommendation ranking.

---

## 8. Locked engineering rules

- one controlled checkpoint at a time;
- verify before modifying;
- production truth beats planning estimates;
- tenant authority is server-derived;
- PostgreSQL/Supabase remains canonical transactional truth;
- capabilities are product/runtime truth, not a synonym for billing entitlements;
- OpenSearch remains derived/rebuildable;
- observed/deterministic/inferred/modelled evidence remain distinct;
- no fake events, customers, revenue, subscriptions, outcomes or training evidence;
- privacy/legal restrictions fail closed;
- provider failures remain raw evidence;
- migrations, CI, CodeQL, Vercel provenance and live readback are part of completion.

---

## 9. Resume instruction

1. verify current `main`, Supabase and Vercel provenance;
2. read the R11 V1 closeout record;
3. audit existing organization provisioning/onboarding and any hidden commercial/billing code read-only;
4. inventory subscription/plan/entitlement gaps against production schema and app routes;
5. define the smallest provider-neutral R13 V1 contract;
6. lock the audit/design checkpoint before implementation;
7. do not resume parked commerce/provider/PA-1 work without its own explicit decision.
