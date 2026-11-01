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
- R11 Education / Wellness Vertical Pack V1 (P0-P3): closed and production-accepted;
- **R13 Commercial SaaS Readiness audit/design: complete and locked**;
- **current exact checkpoint: R13-P0 — Commercial State Foundation**.

Read first:

1. `docs/checkpoints/M-2026-11-02-R13-Commercial-SaaS-Audit-Design-v1.md`
2. `docs/checkpoints/M-2026-11-02-R11-V1-Production-Closeout-v1.md`
3. `docs/SalsysOS_Active_Handoff.md`

---

## 2. R13 audit result

Production already has strong tenant primitives:

- platform-admin-only controlled organization provisioning;
- owner Auth identity creation with rollback on failed DB provisioning;
- service-role-only provisioning RPC;
- functional workspace provisioning;
- owner membership;
- onboarding with opt-in enforcement;
- organization statuses `active / suspended / archived`;
- explicit R11 runtime capabilities.

But production has no canonical SaaS commercial schema for:

- plans;
- plan entitlements;
- organization subscriptions;
- SaaS invoices;
- trials;
- billing-provider customer/subscription state.

The existing `payments` table is Lead/Enrollment customer-commerce truth and must not be reused for SalsysOS billing.

---

## 3. Locked commercial concepts

Keep these separate:

```text
organization lifecycle       organizations.status
commercial subscription      trialing / active / past_due / canceled / expired
commercial entitlements      what a logical plan permits
runtime capabilities         what the organization actually has enabled/configured
```

A `past_due` subscription does not directly suspend an organization.

A plan entitlement does not directly enable/disable a runtime capability.

Capability configuration remains canonical product/runtime truth.

---

## 4. Exact R13-P0 scope

P0 introduces a provider-neutral commercial state model only.

Required structures:

1. logical plan catalog;
2. plan -> capability entitlement mapping;
3. organization subscription state;
4. append-only subscription event/audit ledger;
5. read-only commercial readiness/drift view.

P0 constraints:

- do not choose Stripe/another provider;
- do not create public signup;
- do not suspend/activate/archive organizations;
- do not mutate runtime capabilities;
- do not seed invented plan names/prices;
- do not backfill fake subscriptions for the four existing organizations;
- existing organizations without a subscription row are `unmanaged_legacy`;
- do not fabricate subscription events for acceptance.

---

## 5. P0 security contract

- commercial truth mutation is service-role/platform-controlled;
- no browser-direct INSERT/UPDATE/DELETE/TRUNCATE on commercial truth tables;
- any future authenticated read surface must be tenant-scoped and owner/admin-authorized;
- plan/provider metadata contains no secrets;
- subscription events are append-only evidence;
- provider references are nullable/provider-neutral;
- no SECURITY DEFINER endpoint is broadly executable without explicit grants + internal authorization.

---

## 6. Existing organizations preservation rule

P0 must leave all four existing organizations unchanged:

```text
organization status      unchanged
memberships               unchanged
workspaces                unchanged
onboarding                unchanged
capabilities              unchanged
commercial subscriptions  no production backfill
subscription events       no synthetic rows
```

Rollback-only tests are allowed but must leave zero rows/evidence behind.

---

## 7. Later R13 phases

```text
P1 Entitlement Governance + Platform Admin Controls
P2 Self-Serve Trial Signup + Abuse Controls
P3 Billing Provider Boundary + Verified Webhooks
P4 Commercial Enforcement + Suspension/Recovery + Offboarding
```

Do not pull P1-P4 work into P0.

---

## 8. Organization deletion/offboarding rule

Hard deletion is not a normal customer operation.

The schema contains many organization FKs using RESTRICT/NO ACTION around CRM, raw events, identity, payments and analytics.

Customer account deletion must eventually be an export/offboarding/archive/retention workflow with legal/privacy checks, not `DELETE FROM organizations`.

---

## 9. P0 acceptance contract

Before P0 is complete:

1. plan/entitlement/subscription/event structures exist;
2. lifecycle statuses and one-current-subscription invariant are constrained;
3. entitlements reference existing capability catalog;
4. no CRM `payments` reuse;
5. event ledger is auditable/append-only;
6. readiness distinguishes `unmanaged_legacy` from managed state;
7. entitlement/runtime drift is diagnostic only;
8. all existing organization/capability/onboarding truth is unchanged;
9. no fake plans/subscriptions/events remain in production;
10. rollback lifecycle tests pass;
11. CRM/Admissions/Customer 360 health does not regress;
12. CI, CodeQL, Production Smoke and exact Vercel provenance are green.

---

## 10. Parked boundaries

Do not resume automatically:

- live Yogakulam PHP commerce completion;
- PA-1 live identity decision;
- Google Ads production approval;
- Meta Ads provider approval/account selection;
- Search Indexing activation;
- predictive-model promotion / automatic learning-based recommendation ranking.
