# SalsysOS Active Handoff

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-03  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified runtime SHA before this docs-only change:** `57c2abf8638cf4bc08773e25c2d435e4c1387de5`

## ACTIVE PRIORITY — UI/UX, NOT R13/AGENT IMPLEMENTATION

The user explicitly requested: **persist the unfinished technical work in GitHub and switch to UI/UX now**. Read **`docs/checkpoints/M-2026-11-03-UI-Priority-Paused-Work-Handoff-v1.md`** for all verified commits, remaining tasks, migration names, acceptance blockers, safe resume sequence, and planning percentages.

- UI source-of-truth: `docs/UI-CONSISTENCY.md` + `docs/SMART-JOURNEY-WORKSPACE.md` + `docs/JOURNEY-EVIDENCE-CHECKPOINT.md`. UI PR #437 and Journey/UI PR #438 have **both merged**. Do **not** treat the old draft branches as work to merge.
- For current UI work, discuss the user's **specific selected screen** and approve the minimal, clean, helpful interface plan before implementing; preserve tenant/role security and data meaning. No new screen is selected by this handoff.
- On **explicit** non-UI resumption, Sales Asset PR #452 is already merged/production-READY, but `20261103215230_sales_asset_course_scope_normalization_v1.sql` and `20261103215330_sales_asset_course_scope_shorthand_v1.sql` are **not applied to production**; the WhatsApp 24-hour pilot window and scope context remain blockers to real media-send acceptance. Verify live state before requesting production SQL approval. Do not send messages autonomously.
- After controlled asset acceptance: real provider-originated GT-01 financial proof, approved Knowledge + WhatsApp/Instagram Conversation Agent, customer journey/identity/permission closeouts, and R13 commercial implementation (P0–P4) remain on the preserved backlog. The GT-01 internal rollback-only production-schema test passed; that does **not** prove live provider completion.
- **No production write, provider send, automation activation, PR merge or roadmap completion is authorized by this docs-only checkpoint.** The old R13 section below remains a **paused future plan**, not the active task.

Read first:
1. `docs/checkpoints/M-2026-11-03-UI-Priority-Paused-Work-Handoff-v1.md`
2. `docs/SalsysOS_Current_Checkpoint.md`
3. `docs/UI-CONSISTENCY.md`
4. `docs/SMART-JOURNEY-WORKSPACE.md`
5. `docs/AI-KNOWLEDGE-AGENT-WORKFLOW.md` — when non-UI agent work resumes
6. `docs/checkpoints/M-2026-11-02-R13-Commercial-SaaS-Audit-Design-v1.md` — when R13 resumes

Historical checkpoint files remain immutable. R11 accommodation/room/bed management is retired, not an unfinished feature.


---

## 1. Paused future R13 continuation point (not active UI work)

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
