# SalsysOS Active Handoff

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-02  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production runtime head:** `1846b1fc845b0325f0a8ac6b409c67744d65245e`

Read first:

1. `docs/SalsysOS_Current_Checkpoint.md`
2. `docs/checkpoints/M-2026-11-02-R11-V1-Production-Closeout-v1.md`
3. `docs/SalsysOS_North_Star_Product_Context.md`

Historical checkpoint files are immutable evidence records.

---

## 1. Exact continuation point

**R13 — Commercial SaaS Readiness — Audit & Design**

R11 Education / Wellness Vertical Pack V1 is complete and production-accepted through P0-P3.

Do not reopen R11 feature work unless production evidence reveals a genuine regression.

---

## 2. Final R11 release

```text
Final main SHA          1846b1fc845b0325f0a8ac6b409c67744d65245e
CI                      #1404 passed
CodeQL                  #689 passed
Production Smoke        #180 passed
Vercel production       READY on exact SHA
Vercel deployment       dpl_5j1m4wM11NeLShzkV6z3peWz25ED
```

Final P3 hardening migration:

```text
20261101195631 r11_p3_anon_residential_grant_hardening_v1
bytes 1942
MD5   863a1bed570e34986c10a226330f21cf
```

---

## 3. R11 capability boundary now live

```text
education_core
education_catalog_sync   -> requires education_core
wellness_residential     -> requires education_core
```

Yogakulam production:

```text
education_core          enabled
education_catalog_sync  enabled
provider                yogakulam_website
wellness_residential    enabled
courses                  16
batches                  85
```

Other active organizations remain without fake Education/residential data.

---

## 4. Residential least-privilege boundary

Base tables:

```text
anon           no privileges
authenticated  SELECT / INSERT / UPDATE
```

Residential security-invoker views:

```text
anon           no privileges
authenticated  SELECT only
```

Accommodation mutation RPCs remain service-role-only.

The live `wellness_residential` disable guard was rollback-tested and correctly rejected disabling the capability while real residential data exists.

---

## 5. Current health

```text
CRM Core V2             healthy / 0 integrity issues
Admissions automation   healthy / 96 runs / 0 failures in 24h
Customer 360 V2         degraded only by 2 pre-existing identity conflicts
```

---

## 6. R13 audit questions

Audit read-only before any implementation.

Determine the exact current state of:

- public/self-serve signup;
- controlled provisioning and onboarding reuse;
- subscription/billing tables and provider integrations;
- plan catalog / entitlement model;
- relationship between commercial entitlements and existing runtime capabilities;
- trial/active/past-due/suspended/cancelled/reactivated lifecycle;
- billing-driven suspension semantics;
- signup abuse/rate-limit controls;
- customer-controlled organization deletion/export/retention;
- platform-admin override/recovery;
- migration/backfill for the four existing organizations;
- provider-neutral foundation possible before selecting Stripe/another payment provider.

Important design rule:

**Capabilities remain canonical runtime/product access truth. Billing/plan entitlements may drive capability changes through controlled workflows, but capability rows must not be replaced by subscription fields or inferred directly from payment state.**

---

## 7. R13 implementation boundary

Do not code until the audit/design contract is locked.

Likely sequencing to evaluate, not yet implement:

1. commercial plan + entitlement foundation;
2. organization subscription lifecycle;
3. controlled entitlement -> capability reconciliation;
4. self-serve signup/trial provisioning;
5. billing provider adapter/webhook boundary;
6. suspension/reactivation and admin recovery;
7. deletion/export/retention controls;
8. customer-facing billing/settings UI.

The audit may change this order.

---

## 8. Parked work

Do not resume automatically:

- Yogakulam Hostinger/PHP commerce completion;
- PA-1 live identity decision;
- Google Ads production approval;
- Meta Ads permission/account selection;
- Search Indexing activation;
- predictive model promotion / automatic learning-based ranking.

---

## 9. Safety rules

- verify before modifying;
- one checkpoint at a time;
- tenant authority remains server-derived;
- capabilities and billing entitlements remain separate concepts;
- no fake subscribers, invoices, revenue, plans or trials in production;
- do not suspend/delete existing organizations during audit;
- preserve canonical customer/CRM data through commercial lifecycle changes;
- privacy/legal restrictions fail closed;
- provider-neutral design before provider-specific writes where practical.
