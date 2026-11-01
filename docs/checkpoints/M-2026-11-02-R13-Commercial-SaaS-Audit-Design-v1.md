# SalsysOS — R13 Commercial SaaS Readiness — Audit & Design V1

**Date:** 2026-11-02  
**Repository:** `yogakulamacademy/salsys-os`  
**Production baseline:** R11 V1 closed / runtime SHA `1846b1fc845b0325f0a8ac6b409c67744d65245e`

## Decision

R13 is a genuine commercial-product layer that is not yet built. Existing tenant security, controlled provisioning, onboarding and capability state are strong enough to reuse; R13 must not replace them with billing-provider state.

The first implementation checkpoint is:

# R13-P0 — Commercial State Foundation

P0 is provider-neutral and evidence-neutral. It does not open public signup, choose a payment provider, suspend tenants, change capabilities, or backfill fake subscriptions for existing organizations.

---

## 1. Live audit findings

### Existing tenant foundation is real

Production currently has four active organizations. Each has at least one owner/admin authority path. Controlled platform-admin provisioning already exists and atomically creates:

- Supabase Auth owner identity;
- organization;
- owner profile;
- owner organization membership;
- active functional workspaces;
- onboarding row with `enforce_on_sign_in=true`.

The provisioning boundary is service-role-only and is triggered from the platform-admin `/settings/organizations` server action.

### Onboarding is not commercial state

Only Demo org currently has a completed onboarding row. Existing legacy organizations were intentionally not backfilled/enforced.

Onboarding records business/setup readiness. It must not be reused as subscription or billing state.

### Commercial schema is absent

Production contains no canonical SalsysOS tables for:

- SaaS plans;
- organization subscriptions;
- plan entitlements;
- SaaS invoices;
- SaaS billing-provider customers/subscriptions;
- trials.

This is an actual R13 product gap rather than a hidden subsystem needing promotion.

### Existing `payments` is customer CRM commerce truth

`public.payments` is tied to Leads/Enrollments and stores customer/course payment state.

It must **not** be reused for SalsysOS subscription billing.

SaaS commercial truth needs a separate namespace/data model.

### Existing organization lifecycle can support access suspension

`organizations.status` already allows:

```text
active
suspended
archived
```

The trusted workspace/session context requires organization status `active`, so the current tenant-access architecture already has a canonical suspension boundary.

However, R13 must not assume that setting `status='suspended'` is sufficient for every background worker, webhook, integration or automation path. Commercial enforcement requires a later dedicated audit/acceptance checkpoint.

### Hard organization deletion is not an acceptable normal customer action

The database contains a large mix of organization foreign keys with `RESTRICT`, `NO ACTION` and `CASCADE`, including canonical CRM, payment, raw-event, identity, analytics and privacy evidence.

Therefore customer-controlled “delete account” must be modeled as an export/offboarding/archive/retention workflow, not `DELETE FROM organizations`.

### R11 capabilities are runtime product-access truth

Canonical capability codes currently include:

```text
education_core
education_catalog_sync
wellness_residential
```

Capabilities are explicitly organization-scoped and dependency-checked.

R13 plan entitlements may describe what an organization is commercially allowed to use, but must not replace capability rows or overwrite capability config.

---

## 2. Locked conceptual separation

R13 must preserve four separate concepts:

### Organization lifecycle

Canonical tenant accessibility:

```text
organizations.status
active / suspended / archived
```

### Commercial subscription lifecycle

Commercial contract state, separate from tenant access.

P0 canonical statuses:

```text
trialing
active
past_due
canceled
expired
```

A `past_due` subscription does **not** directly imply organization suspension.

### Plan entitlements

Commercial maximum/allowance for optional capabilities.

Entitlement does not mean the capability is already configured or enabled.

### Runtime capabilities

Actual product/runtime access/configuration stored in `organization_capabilities`.

Capability config remains canonical runtime truth.

---

## 3. R13-P0 — Commercial State Foundation

P0 should introduce only provider-neutral canonical structures.

### Plan catalog

Logical SalsysOS plans, independent of Stripe/another provider.

Required properties:

- stable plan code;
- display name/description;
- active/inactive lifecycle;
- versionable metadata/limits that contain no secrets;
- no hard-coded external provider price IDs as canonical plan identity.

P0 must not seed invented production pricing or product tiers unless the business has explicitly approved them.

### Plan capability entitlements

Maps a logical plan to optional `capability_catalog` capability codes.

Rules:

- entitlement means commercially permitted, not automatically enabled;
- capability dependency rules remain authoritative;
- entitlement config/limits must not overwrite organization capability config;
- a plan downgrade must not directly delete/disable a data-bearing capability.

### Organization subscription state

At most one current canonical commercial subscription per organization for V1.

Required fields include:

- organization;
- logical plan;
- commercial lifecycle status;
- trial/current-period/cancellation timestamps where applicable;
- source (`manual` / future provider-managed source);
- nullable provider key and provider references;
- created/updated timestamps;
- non-secret metadata.

P0 must not create rows for the four current organizations merely to make the feature appear populated. Existing organizations with no row are explicitly **unmanaged legacy**, not “free”, “paid”, “trialing” or “past due”.

### Append-only subscription event/audit ledger

Every commercial state transition must be auditable.

Required evidence:

- organization/subscription;
- previous/new status where applicable;
- event type;
- source;
- actor/provider reference;
- idempotency/external-event reference where applicable;
- reason/metadata;
- timestamp.

P0 must not fabricate transition events.

### Commercial readiness view

Read-only operational interpretation per organization, distinguishing at minimum:

```text
unmanaged_legacy
managed_healthy
managed_attention
```

and surfacing entitlement/runtime capability drift without changing capability state.

Examples of drift:

- entitled capability not enabled/configured;
- runtime capability enabled but absent from current plan entitlement;
- capability dependency/configuration prevents automatic enablement.

The view is diagnostic only in P0.

---

## 4. P0 authorization / security contract

- plan/subscription/event mutation is service-role/platform-controlled only;
- no browser-direct INSERT/UPDATE/DELETE/TRUNCATE on commercial truth tables;
- any authenticated read surface must be tenant-scoped and owner/admin-authorized;
- plan catalog may be globally readable only through an intentional product/API surface, not accidental table grants;
- provider references and metadata must contain no provider secrets;
- no SECURITY DEFINER function is exposed broadly without explicit grants and internal authorization;
- subscription events are append-only evidence;
- commercial state must never be inferred from CRM `payments`.

---

## 5. Existing organizations migration rule

P0 migration must preserve all four current organizations exactly.

Do **not** backfill a fake subscription or plan.

Expected post-P0 state:

```text
existing organization rows       unchanged
existing capabilities            unchanged
existing workspaces               unchanged
existing onboarding               unchanged
organization status               unchanged
organization subscription rows    0 unless explicitly created later
subscription event rows           0 unless a real transition happens later
```

Rollback-only test data may be used inside a transaction, but must leave zero evidence behind.

---

## 6. Later R13 checkpoints

### P1 — Entitlement Governance + Platform Admin Controls

- create/manage logical plans;
- assign/change plan for a tenant;
- show entitlement vs runtime-capability drift;
- controlled reconciliation requests;
- human-governed removal/downgrade impact where data-bearing capabilities are involved;
- no billing provider required.

### P2 — Self-Serve Trial Signup

- public signup entry;
- verified user identity/email before trusted tenant activation;
- slug/idempotency controls;
- abuse/rate-limit protections;
- trial-plan assignment;
- reuse controlled provisioning/onboarding primitives;
- no fake auto-confirmed identities.

### P3 — Billing Provider Boundary

- provider adapter abstraction;
- verified webhook/signature boundary;
- provider-event idempotency ledger;
- provider customer/subscription references;
- canonical mapping from provider events to subscription state;
- provider event never directly mutates organization capability rows;
- SaaS invoices/payments remain separate from CRM customer-course `payments`.

No provider is selected by this audit/design checkpoint.

### P4 — Commercial Enforcement + Offboarding

- grace policy;
- controlled organization suspension/reactivation;
- explicit audit of background jobs/webhooks during suspension;
- platform-admin recovery/override;
- customer billing/cancellation surface;
- organization export/offboarding/archive request;
- legal hold/privacy/retention checks;
- no direct customer hard-delete of the organization row.

---

## 7. R13 V1 non-goals until separately approved

- inventing subscription prices or plan names;
- selecting Stripe/another billing provider without a provider checkpoint;
- migrating CRM/customer `payments` into SaaS billing;
- auto-suspending organizations after one failed payment;
- auto-revoking data-bearing capabilities on downgrade;
- public signup without abuse controls and verified identity;
- hard-deleting production organizations;
- creating fake subscriptions/invoices/provider webhooks for acceptance.

---

## 8. P0 acceptance contract

Before P0 is called complete:

1. canonical plan, entitlement, subscription and event structures exist;
2. commercial structures are tenant-safe and least privilege;
3. subscription lifecycle statuses are constrained;
4. one-current-subscription V1 invariant is enforced;
5. plan entitlement references the existing capability catalog;
6. no commercial table reuses CRM `payments` semantics;
7. subscription event history is append-only/auditable;
8. commercial readiness distinguishes unmanaged legacy from managed state;
9. entitlement drift is diagnostic only and does not mutate runtime capabilities;
10. all four existing organizations/statuses/capabilities/workspaces/onboarding remain unchanged;
11. no fake plan/subscription/event rows are left in production;
12. rollback-only lifecycle tests pass;
13. CRM/Admissions/Customer 360 health does not regress;
14. CI, CodeQL, Production Smoke and exact Vercel provenance are green.

## Decision

R13 Audit & Design V1 is locked.

Next exact implementation checkpoint:

# R13-P0 — Commercial State Foundation

Do not implement public signup, billing-provider integration, entitlement reconciliation writes, suspension or customer offboarding in P0.
