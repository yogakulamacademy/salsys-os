# SalsysOS Active Handoff

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`

Read first:

1. `docs/SalsysOS_Current_Checkpoint.md`
2. `docs/checkpoints/M-2026-11-01-R11-Vertical-Pack-Audit-Design-v1.md`
3. `docs/checkpoints/M-2026-11-01-Post-R10-Rebaseline-v1.md`

Historical checkpoint files are immutable evidence records.

---

## 1. Exact continuation point

**R11-P0 — Capability + Security Foundation**

The R11 Education/Wellness Vertical Pack audit/design is complete and locked. Implement P0 only; do not begin product-surface gating, adapter refactoring or residential UI changes until P0 is production-accepted.

---

## 2. Locked capability model

Introduce product capability state separate from workspaces and billing:

```text
capability_catalog
organization_capabilities
```

V1 codes:

```text
education_core
wellness_residential
education_catalog_sync
```

Dependencies:

```text
wellness_residential   -> education_core
education_catalog_sync -> education_core
```

Onboarding industry is a suggestion only, never access authority.

---

## 3. P0 course/batch privilege hardening

Current course/batch RLS already limits administration to owner/admin/manager, but authenticated table grants are broader than necessary.

P0 target authenticated course/batch privileges:

```text
SELECT
INSERT
UPDATE
```

Remove direct authenticated:

```text
DELETE
TRUNCATE
TRIGGER
REFERENCES
```

No current application course/batch delete path was found.

---

## 4. P0 hardened V2 RPC compatibility

Current Course Management server actions use the authenticated user/session Supabase client for these hardened explicit-org functions:

```text
update_course_batch_admin_v2(uuid,uuid,integer,integer,numeric,text,text)
set_course_batch_enrollment_state_v2(uuid,uuid,boolean,text)
set_course_batch_active_state_v2(uuid,uuid,boolean)
```

Each function is `SECURITY DEFINER` and internally calls `can_administer_course_management(org_id)`, which requires bound-tenant owner/admin/manager authorization for authenticated users and preserves `auth.uid()` in audit events.

Current function ACLs are service-role-only due to historical grant drift.

P0 must:

- grant authenticated EXECUTE only on these three hardened V2 RPCs;
- keep legacy V1 course-admin RPCs revoked from authenticated users;
- keep function-internal tenant/role checks intact;
- not replace the user-facing server actions with a service-role client.

---

## 5. Capability authority

Add a canonical tenant-safe capability helper.

Requirements:

- explicit org identity;
- tenant-bound authenticated read path;
- trusted server/service mutation path;
- unknown/disabled codes fail closed;
- dependency rules fail closed;
- config contains no provider secrets.

Capability activation is high-impact configuration and must not be directly writable by arbitrary members.

---

## 6. Existing tenant preservation

Yogakulam is the only current tenant with real Education catalog data:

```text
courses         16
course batches  85
```

P0 must preserve that real behavior through explicit capability activation.

Use stable slug `yogakulam-academy` for migration lookup; do not hardcode the generated organization UUID.

Do not infer capability from organization name or onboarding industry.

Do not create fake courses/batches for Test Yoga School or another tenant.

---

## 7. Later R11 phases

Do not pull into P0:

- **P1:** route/navigation/lead-control capability gating;
- **P2:** generic external catalog adapter boundary;
- **P3:** optional residential/accommodation surface gating.

The existing Yogakulam adapter remains untouched during P0.

---

## 8. R13 remains later

No billing/subscriptions/public signup/plan entitlements in R11-P0.

R13 commercial packaging follows after the reusable vertical boundary is proven.

---

## 9. Acceptance rules

P0 must finish with:

- canonical capability catalog/state;
- tenant-safe fail-closed helper;
- trusted activation boundary;
- dependency enforcement;
- least-privilege course/batch grants;
- authenticated V2 course-admin RPC path restored while V1 remains blocked;
- explicit Yogakulam capability state;
- zero fake second-tenant vertical data;
- CI/CodeQL/deployment/provenance/readback green.

---

## 10. Parked work

Do not resume automatically:

- Yogakulam Hostinger/PHP commerce completion;
- PA-1 live identity decision;
- Google Ads production approval;
- Meta Ads permission/account selection;
- Search Indexing activation;
- predictive model promotion / automatic learning-based recommendation ranking.
