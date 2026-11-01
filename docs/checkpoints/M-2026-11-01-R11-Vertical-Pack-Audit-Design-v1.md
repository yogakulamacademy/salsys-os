# SalsysOS — R11 Education / Wellness Vertical Pack V1 — Audit & Design

**Date:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Baseline head:** `85c81fadc5acd41f0fd0c1f37cfa8212eeaa15c1`  
**Design status:** Locked before implementation

## Purpose

Turn the already-substantial Yogakulam Education/Wellness operating layer into an explicit, reusable, tenant-safe vertical pack without rewriting the generic CRM or seeding fake second-tenant data.

This audit/design was read-only. No organization capability, course, batch, accommodation, billing or customer state was changed.

---

## 1. Executive conclusion

R11 is **not** missing its foundational education data model.

Production already has:

- organization-scoped courses and batches;
- admissions capacity/demand intelligence;
- course/batch preferences on Leads and Person journey surfaces;
- course/batch management;
- enrollment linkage;
- person/course affinity and recommendations;
- a normalized residential accommodation subsystem;
- a proven Yogakulam website course-catalog adapter;
- tenant-scoped sync health and course-management permissions.

The real productization gap is:

`explicit vertical capability -> gated product surface -> optional extensions -> configurable source adapter -> reusable second-tenant enablement`

The existing generic CRM must remain intact.

---

## 2. Live production evidence

Across 4 active organizations:

```text
courses                              16
course batches                       85
upcoming capacity rows               63
person/course affinity rows          21
person/course recommendation rows    20
```

All 16 courses and all 85 batches belong to Yogakulam Academy.

Other active organizations, including `Test Yoga School`, currently have no course/batch rows.

This means multi-tenant schema support exists, but vertical configuration/reuse is not yet production-proven with a second education tenant.

---

## 3. Education Core is already generic

The `courses` table is organization-scoped and models generic concepts:

- code;
- name;
- category;
- hours;
- active state;
- metadata;
- source/external identity;
- source/sync timestamps.

The `course_batches` table is organization-scoped and models:

- course linkage;
- batch code;
- location;
- mode;
- dates/times/timezone;
- capacity / seats remaining;
- currency / expected value;
- enrollment-open state;
- source/external identity and sync state.

Current batch mode vocabulary:

```text
residential
online
non_residential
hybrid
```

No foundational rewrite is required.

---

## 4. Education fields embedded in CRM remain nullable canonical fields

The generic Lead / Person journey model already contains Education-oriented fields such as:

- `interested_course_id`;
- `preferred_batch_id`;
- preferred location/month/mode.

These fields are referenced by Leads, Conversations, attribution and Person 360.

R11 V1 must **not** remove or fork those columns for non-Education tenants.

For organizations without `education_core`:

- fields remain nullable canonical schema;
- Education-specific input/selectors are hidden or disabled at the product-surface layer;
- generic CRM continues to work normally.

---

## 5. Current access gap — navigation and direct route are not capability-aware

Current sidebar behavior:

- privileged users see `Admissions Desk`;
- privileged users see `Course management`;
- this is based on role only, not industry/vertical capability.

Current `get_course_management_workspace_v2(...)` allows any authenticated CRM member of the selected organization to read the Course Management workspace if they directly access the route.

Mutations are separately protected by `can_administer_course_management(org_id)`, which permits:

```text
owner
admin
manager
service_role
```

R11 V1 must make route/navigation/data authorization consistent:

```text
capability enabled + valid tenant + valid role
```

Navigation hiding alone is never sufficient authorization.

---

## 6. Security prerequisite — direct course/batch privileges are broader than needed

Live RLS write policies correctly require course-management administration and tenant membership.

However, `authenticated` currently has broad table privileges on `courses` and `course_batches`, including:

```text
DELETE
INSERT
REFERENCES
SELECT
TRIGGER
TRUNCATE
UPDATE
```

`TRUNCATE` is not protected by row-level security and is unnecessary for the product.

Repository audit found no current application delete path for courses or batches.

### Locked R11-P0 privilege contract

For authenticated users:

```text
SELECT
INSERT
UPDATE
```

Only, subject to existing/new tenant + role + capability RLS.

Do not grant direct authenticated:

```text
DELETE
TRUNCATE
TRIGGER
REFERENCES
```

Service role / database ownership remain separate trusted boundaries.

---

## 7. Wellness / Residential is an optional extension, not Education Core

Production already contains a normalized residential subsystem:

- `accommodation_properties`;
- `accommodation_rooms`;
- `batch_accommodation_types`;
- `batch_accommodation_room_pool`;
- `enrollment_accommodation_assignments`;
- live inventory / roster views.

Current batch schema also contains residential-commercial fields such as:

- private/shared/course-only price;
- accommodation capacity/remaining/note.

Live evidence is still limited:

```text
accommodation properties     1
rooms                        0
batch accommodation types    0
room-pool rows                0
assignments                   0
```

Therefore R11 V1 must classify residential operations as an optional capability, not a required Education invariant.

---

## 8. External catalog sync is provider-specific today

The database sync ledger/health model is tenant-generic, but the current application adapter is explicitly Yogakulam-specific:

`lib/integrations/yogakulam-courses.ts`

It contains:

- `SOURCE_SYSTEM = yogakulam_website`;
- `YOGAKULAM_COURSE_FEED_URL` / Yogakulam default feed URL;
- Yoga-specific external course-key mappings;
- Yoga-specific default course names.

The sync route directly calls `syncYogakulamCourseCatalog(...)`.

Production sync evidence:

```text
organizations with sync runs        1
source_system                       yogakulam_website
Yogakulam sync runs                 3
latest status                       success
latest trigger                      manual
```

### Locked adapter rule

Do **not** rewrite the working Yogakulam adapter into a generic parser.

Instead:

- preserve it as one provider adapter;
- add a generic adapter-selection/configuration boundary around it;
- allow future Education tenants to choose a different adapter or manual-only catalog mode;
- never store provider secrets in capability JSON/config.

---

## 9. Functional workspaces are not vertical capabilities

All 4 active organizations currently have the same functional workspace shell:

```text
admin
finance
marketing
reports
sales
```

`workspace_catalog` describes functional work areas. `admin` currently includes courses among many unrelated administrative functions.

R11 must **not** overload `organization_workspaces` to mean “Education enabled.”

A separate capability model is required.

---

## 10. Onboarding industry is a hint, not authority

`organization_onboarding.industry` exists, but only one current organization has an onboarding row and that row is `Demo org / real_estate`.

Legacy organizations may have no onboarding row.

Therefore:

- onboarding industry may suggest a vertical pack;
- it must never authorize product access;
- capability state must be explicit and durable.

---

## 11. Locked capability model

R11 V1 introduces a product-capability boundary separate from workspaces and future billing.

Recommended canonical model:

### `capability_catalog`

Global catalog of supported product capabilities.

Minimum fields:

```text
code
name
description
status
sort_order
config_schema_version
```

### `organization_capabilities`

Tenant-scoped capability state.

Minimum fields:

```text
organization_id
capability_code
enabled
config jsonb
enabled_at
updated_at
updated_by
```

Primary identity:

```text
(organization_id, capability_code)
```

Capability config is non-secret configuration only.

V1 capability codes:

```text
education_core
wellness_residential
education_catalog_sync
```

Dependencies:

```text
wellness_residential   requires education_core
education_catalog_sync requires education_core
```

---

## 12. Capability authority and mutation boundary

Capability reads may be tenant-visible where needed for UI gating.

Capability mutation is a high-impact product/configuration action.

R11 V1 should keep activation behind a trusted platform/admin server boundary rather than allowing arbitrary organization members to edit capability rows directly.

A canonical helper should answer:

```text
organization_has_capability(org_id, capability_code)
```

Requirements:

- tenant-safe for authenticated reads;
- explicit-org support for trusted server/service paths;
- no client-supplied org authority without verified tenant binding;
- fail closed for unknown/disabled capability codes.

R13 may later map commercial plans/entitlements to the same capability model, but R11 must contain **no billing/subscription logic**.

---

## 13. Locked surface-gating contract

### `education_core`

Gates at minimum:

- Course Management navigation;
- Course Management route/data access;
- Admissions Desk navigation/route where the surface depends on course/batch semantics;
- course/batch selectors on Education-specific Lead workflows;
- Education-specific capacity/demand surfaces.

Role rules remain independently enforced.

Course-management mutation remains owner/admin/manager only.

### `wellness_residential`

Gates residential-only accommodation/inventory/assignment controls and residential commercial fields where surfaced.

It does not control base course/batch/admissions functionality.

### `education_catalog_sync`

Gates external catalog-sync configuration/execution.

Manual course/batch management remains possible under `education_core` without external sync.

---

## 14. Existing organizations / backward compatibility

Implementation must preserve current production behavior for Yogakulam while preventing Education surfaces from appearing universally.

Expected activation strategy:

- explicitly enable `education_core` for Yogakulam based on existing real course/batch production use;
- explicitly enable `education_catalog_sync` for Yogakulam because its proven adapter/run history exists;
- enable `wellness_residential` only if the production capability is intentionally retained as part of Yogakulam's active vertical configuration;
- all other organizations default disabled unless deliberately configured.

Do not infer capability solely from organization name, existing nullable Lead fields, or onboarding industry.

Do not auto-seed courses/batches for another tenant.

---

## 15. Second-tenant readiness proof without fake production data

R11 V1 must prove reuse without inventing customer activity.

Acceptable evidence:

- CI fixtures/unit/contract tests using non-production tenant data;
- rollback-only database lifecycle tests where appropriate;
- read-only production verification showing non-Education orgs are disabled and cannot access gated surfaces;
- read-only production verification showing Yogakulam retains its real Education data and behavior;
- explicit capability configuration can be validated structurally without creating fake courses/batches.

Unacceptable evidence:

- inserting fake Test Yoga School courses/batches into production;
- copying Yogakulam course records to another org;
- fabricating sync runs or enrollments.

---

## 16. R11 V1 implementation sequence

### R11-P0 — Capability + security foundation

1. add capability catalog + organization capability state;
2. add tenant-safe capability helper/API contract;
3. preserve explicit capability dependencies;
4. tighten authenticated `courses` / `course_batches` table privileges;
5. add regression verification;
6. explicitly activate existing Yogakulam capability state without creating business records.

### R11-P1 — Product surface gating

1. expose capability state through the trusted workspace/server context;
2. capability-gate sidebar/navigation;
3. capability + role gate Course Management direct route/data;
4. capability-gate Admissions/Education-specific controls;
5. hide Education-specific Lead selectors for non-Education tenants while preserving nullable canonical fields;
6. verify non-Education CRM remains functional.

### R11-P2 — Catalog adapter boundary

1. define generic Education catalog adapter interface/registry;
2. keep Yogakulam adapter intact behind provider key;
3. make adapter selection tenant-configurable through non-secret capability config;
4. prevent sync execution when capability/provider config is absent;
5. keep tenant-scoped sync ledger/health canonical.

### R11-P3 — Optional Residential extension gating

Only after the core pack is stable:

1. capability-gate accommodation/residential surfaces;
2. preserve organization-aware accommodation data model;
3. ensure Education tenants without residential capability do not require accommodation data;
4. do not claim live residential workflow maturity from currently sparse production rows.

---

## 17. Explicit non-goals

R11 V1 does **not** include:

- public tenant signup;
- billing/subscriptions;
- commercial plans/entitlements;
- signup abuse controls;
- customer-controlled organization deletion;
- cross-tenant workspace switching;
- predictive-model promotion;
- fake second-tenant course catalogs.

Those commercial concerns remain R13 or later.

---

## 18. R11 V1 acceptance contract

R11 V1 can close only when:

1. capability state is separate from functional workspace state;
2. unknown/disabled capability access fails closed;
3. Yogakulam retains real Education functionality after explicit capability activation;
4. non-Education organizations do not see/access Education-only surfaces;
5. course/batch mutation still requires owner/admin/manager plus tenant/capability authority;
6. authenticated users cannot directly TRUNCATE/DELETE course/batch truth;
7. generic CRM continues working with Education fields null/hidden;
8. external catalog sync is adapter-based and tenant-configured, with Yogakulam preserved as one provider;
9. Education core works without residential capability;
10. residential capability works only as an optional extension;
11. no fake second-tenant production data is required for acceptance;
12. CI, security checks, deployment provenance and production readback are clean.

---

## Decision

**R11 Education / Wellness Vertical Pack V1 audit/design is complete and locked.**

The next implementation checkpoint is:

**R11-P0 — Capability + Security Foundation**

Do not begin R11-P1/P2/P3 before P0 is implemented and production-verified.
