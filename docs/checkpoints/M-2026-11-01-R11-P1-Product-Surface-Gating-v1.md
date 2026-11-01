# R11-P1 — Product Surface Gating V1

**Checkpoint date:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Feature PR:** #426  
**Production merge SHA:** `616458d5f089bd6e07815f6b44a0c724a05cc9e0`

This is an immutable production-closeout record for **R11-P1 — Product Surface Gating**.

---

## 1. Outcome

R11-P1 is **complete and production-accepted**.

P1 makes Education product surfaces obey the explicit R11 capability model established in P0. It does not infer vertical access from organization name, onboarding industry, nullable CRM fields, or the presence of course data.

The production proving tenant remains Yogakulam Academy. No synthetic second-tenant Education records were created.

---

## 2. Product-surface behavior now live

### Trusted workspace capability context

`/api/workspace` now returns enabled capability codes derived server-side for the authenticated session-bound organization.

The normal workspace API remains read-only for capability state.

### Navigation

Education navigation is hidden when `education_core` is not enabled.

The capability-aware navigation gate covers both active shell layers and Education destinations including:

- Admissions;
- Operations;
- Availability;
- Course Management / Programs & Batches;
- Enrollments.

Navigation hiding is only UX. It is not the authorization boundary.

### Server route boundaries

The Education Operations route family now requires:

```text
education_core
+
session-bound organization
+
owner/admin/manager role
```

This applies to the existing Operations access boundary used by:

```text
/operations
/availability
/course-management
/enrollments
```

Admissions uses its own privileged Education-aware server layout gate.

### Lead surface

For organizations with `education_core`, the existing full Education Lead form remains unchanged in behavior.

For organizations without `education_core`:

- course/batch datasets are not loaded for create/edit Lead pages;
- a generic CRM Lead form is rendered;
- the form does not expose `course_id`, `preferred_batch_id`, `preferred_location`, `preferred_month`, or `preferred_mode`;
- generic CRM/commercial fields remain available.

---

## 3. Canonical database enforcement

P1 does not rely on UI hiding.

### Education operations authorization

`can_access_education_operations(org_id)` requires `education_core` and, for authenticated product traffic, a bound owner/admin/manager role.

### Course Management

The proven large Course Management V2 aggregator was preserved rather than rewritten.

The existing public signature remains:

```text
get_course_management_workspace_v2(uuid,text,text,text)
```

Its prior implementation was moved behind an internal function, while the public V2 entry now enforces the Education capability + privileged role boundary first.

### Admissions

`get_admissions_snapshot(uuid)` now enforces the same Education capability + privileged role boundary before delegating to its existing internal snapshot builder.

### Lead Education fields

`leads_enforce_education_capability` is a canonical BEFORE INSERT OR UPDATE trigger.

For a non-Education tenant:

- INSERT cannot create Education-only Lead preference values;
- UPDATE preserves any historical Education values but cannot change them.

The final trigger function reads capability truth directly from canonical capability tables so enforcement does not depend on a browser JWT being present.

### Enrollment truth

Existing Enrollment RLS role/lead checks remain in place and now independently require `education_core` for SELECT / INSERT / UPDATE / DELETE.

---

## 4. Production migrations

Repository migration files:

```text
20261101180500_r11_p1_education_surface_authorization_v1.sql
20261101180600_r11_p1_lead_capability_trigger_context_v1.sql
```

Production Supabase migration ledger:

```text
20261101181750  r11_p1_education_surface_authorization_v1
20261101181833  r11_p1_lead_capability_trigger_context_v1
```

The second production apply used the reviewed functional SQL for the trigger-function replacement after the connector rejected the full comment/transaction-wrapped payload. Functional behavior matches the repository migration; omitted text was non-functional comments/transaction wrappers.

---

## 5. Production tenant truth after P1

```text
Yogakulam Academy  capabilities: education_core, education_catalog_sync, wellness_residential
                    courses: 16
                    batches: 85
                    enrollments: 0

Demo org           capabilities: none
                    courses: 0
                    batches: 0
                    enrollments: 0

SalsysOS           capabilities: none
                    courses: 0
                    batches: 0
                    enrollments: 0

Test Yoga School   capabilities: none
                    courses: 0
                    batches: 0
                    enrollments: 0
```

No fake second-tenant Education activity was inserted.

---

## 6. Runtime acceptance

Using an existing authenticated, bound Yogakulam privileged session, read-only acceptance proved:

```text
Yogakulam Education operations access  true
SalsysOS Education operations access   false
Course Management courses              16
Course Management batches              85
Admissions snapshot                    canonical JSON object
```

A rollback-only Lead DML exercise was attempted but the connector safety layer blocked the UPDATE before PostgreSQL execution. No customer row was touched. Trigger acceptance therefore relies on the live trigger/function definition, canonical capability readback, CI verifier, and non-mutating product/runtime checks; no DML result is claimed.

### Service-role nuance

Do not assume the public Course Management wrapper is a general service-role execution path. Its preserved internal aggregator still contains authenticated CRM-user checks. The production owner/admin/manager path is verified and is the intended P1 product path.

---

## 7. Health regression

After P1 migrations:

```text
CRM Core V2             healthy
integrity issues        0
lead count              614

Admissions automation   healthy
runs / 24h              96
failures / 24h          0

Customer 360 V2         degraded
open identity conflicts 2
```

The Customer 360 warning is the same pre-existing identity-review boundary and is not an R11-P1 regression.

---

## 8. Release evidence

Feature PR pre-merge:

```text
PR #426
head SHA                 bd6132a7b218b1a62994c817375f7a105a718762
CI #1386                 passed
CodeQL #671              passed
Vercel preview           dpl_C2dsC65cA1x17DiaRgQknWwH1cM8 READY
```

Production merge:

```text
main SHA                 616458d5f089bd6e07815f6b44a0c724a05cc9e0
CI #1387                 passed
CodeQL #672              passed
Production Smoke #175    passed
Production Smoke #175    attempt 2 passed after DB migrations
```

Vercel production:

```text
deployment               dpl_Ht1voiBU1B958cUfj4yBQ3px5JNQ
state                    READY
git SHA                  616458d5f089bd6e07815f6b44a0c724a05cc9e0
aliases                  crm.salsysos.com, salsysos.com, www.salsysos.com
```

---

## 9. Advisor readback

No P1-specific blocking advisor finding was discovered.

Security advisor entries for the authenticated SECURITY DEFINER product RPCs are expected generic linter warnings; those RPCs have explicit capability/tenant/role checks.

The performance advisor continues to report a broad pre-existing backlog of unindexed foreign keys, auth RLS init-plan warnings, and unused indexes. P1 created no new tables, foreign keys, or indexes.

---

## 10. Explicit non-scope preserved

P1 did **not**:

- refactor the Yogakulam catalog parser/adapter;
- add a generic catalog adapter registry;
- add residential/accommodation surface gating;
- add billing/subscription/plan entitlements;
- fabricate Education data for another tenant;
- resolve the parked PA-1 identity decision;
- change Google Ads / Meta Ads external approval boundaries.

---

## 11. Next exact checkpoint

**R11-P2 — Catalog Adapter Boundary**

Locked P2 scope from the R11 design:

1. define a generic Education catalog adapter interface/registry;
2. keep the working Yogakulam adapter intact behind a provider key;
3. make adapter selection tenant-configurable through non-secret capability config;
4. prevent external sync execution when capability/provider config is absent;
5. keep the tenant-scoped sync ledger/health canonical.

Manual course/batch management must remain possible under `education_core` without external catalog sync.

Do not begin R11-P3 residential/accommodation gating until P2 is production-accepted.
