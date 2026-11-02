# SalsysOS Active Handoff

Smart/dynamic Journey continuation: read `SMART-JOURNEY-WORKSPACE.md` alongside the critical `AI-KNOWLEDGE-AGENT-WORKFLOW.md`. The new service reminders and evidence interactions do not enable autonomous sending or complete the financial/identity gates.

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-02  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`

**Current user-prioritized workstream:** shared UI consistency → Journey/growth improvements → R13. The isolated Journey branch builds on draft UI PR #437; neither is production acceptance. Read `docs/JOURNEY-EVIDENCE-CHECKPOINT.md` and the **critical** `docs/AI-KNOWLEDGE-AGENT-WORKFLOW.md`. AI Knowledge, approved sales assets and the future risk-governed WhatsApp/Instagram agent must remain in the upcoming workflow. Current draft-only messaging is not changed by the planning update. The commercial R13 continuation point below is preserved for when that workstream resumes.

Read first:

1. `docs/SalsysOS_Current_Checkpoint.md`
2. `docs/checkpoints/M-2026-11-02-R13-Commercial-SaaS-Audit-Design-v1.md`
3. `docs/checkpoints/M-2026-11-02-R11-V1-Scope-Revision-No-Accommodation-v2.md`
4. `docs/checkpoints/M-2026-11-02-R11-V1-Production-Closeout-v1.md` — historical implementation evidence

Historical checkpoint files are immutable evidence records. The R11 scope-revision checkpoint supersedes the residential/accommodation product requirement without deleting historical security or migration evidence.

---

## 1. Exact continuation point

**R13-P0 — Commercial State Foundation**

R11 V1 is complete under the revised scope:

```text
R11-P0 Capability + Security Foundation       COMPLETE
R11-P1 Education Product Surface Gating       COMPLETE
R11-P2 Generic Catalog Adapter Boundary       COMPLETE
R11-P3 Accommodation / Residential Extension  CANCELLED / RETIRED FROM PRODUCT SCOPE
R11 V1                                         COMPLETE
```

Accommodation property/room/bed inventory, occupancy, room pools and student-room assignment are not SalsysOS Education product features. Existing mature database/security structures may remain dormant and must not be reintroduced as CRM product surfaces.

R13 audit/design is complete and locked.

P0 is provider-neutral commercial structure only. Do not implement signup, provider billing, suspension or offboarding yet.

---

## 2. Audit facts

Existing product already has:

- controlled platform-admin customer provisioning;
- service-role-only organization bootstrap;
- owner membership + functional workspaces;
- onboarding with optional sign-in enforcement;
- organization status `active / suspended / archived`;
- explicit organization capabilities.

Missing commercial product structures:

- plan catalog;
- plan/capability entitlements;
- organization subscription state;
- SaaS subscription event ledger;
- SaaS billing/trial/provider state.

Existing `public.payments` is Lead/Enrollment customer commerce and must remain separate.

---

## 3. Locked P0 structures

Build only:

```text
logical commercial plan catalog
plan -> capability entitlement map
organization subscription state
append-only subscription event/audit ledger
commercial readiness / entitlement-drift view
```

Do not seed invented plan names/prices.

Do not create subscription rows for current organizations merely to populate the feature.

An existing organization with no commercial subscription row is `unmanaged_legacy`.

---

## 4. Concept boundaries

```text
organizations.status        tenant access lifecycle
subscription status         commercial contract lifecycle
plan entitlement            commercially permitted optional capability
organization_capabilities   actual runtime product access/configuration
```

Subscription statuses for P0:

```text
trialing
active
past_due
canceled
expired
```

`past_due` does not directly suspend the organization.

Entitlement does not directly mutate a capability.

---

## 5. P0 safety rules

- service-role/platform-controlled mutation only;
- no direct browser commercial writes;
- no fake subscriptions/events;
- no change to existing organization statuses;
- no capability reconciliation writes;
- no external billing provider references required;
- provider reference fields may be nullable for future P3;
- event history append-only;
- rollback-only tests must leave zero evidence behind;
- existing four organizations remain unchanged.

---

## 6. Later phases — do not mix into P0

### P1
Entitlement Governance + Platform Admin Controls.

### P2
Self-Serve Trial Signup + verified identity + abuse/rate-limit controls.

### P3
Billing Provider Adapter + verified/idempotent webhooks.

### P4
Commercial enforcement, grace/suspension/reactivation, customer cancellation/export/archive/offboarding.

Hard organization deletion is not a normal customer action because canonical CRM/payment/raw-event/identity evidence includes RESTRICT/NO ACTION organization references.

---

## 7. P0 acceptance contract

- schema is provider-neutral;
- lifecycle/status invariants are constrained;
- at most one current subscription exists per organization;
- entitlement references capability catalog;
- readiness distinguishes unmanaged legacy from managed state;
- drift remains diagnostic only;
- no existing organization/capability/workspace/onboarding truth changes;
- no fake commercial evidence remains;
- CRM/Admissions/Customer 360 stays stable;
- CI/CodeQL/Production Smoke/Vercel exact SHA green.

---

## 8. Parked work

Do not resume automatically:

- legacy accommodation/residential database structures — dormant only, not active product scope;
- Yogakulam Hostinger/PHP commerce completion;
- PA-1 live identity decision;
- Google Ads production approval;
- Meta Ads permission/account selection;
- Search Indexing activation;
- predictive model promotion / automatic learning-based ranking.
