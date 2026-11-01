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

## 3. P0 security hardening

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

## 4. Capability authority

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

## 5. Existing tenant preservation

Yogakulam is the only current tenant with real Education catalog data:

```text
courses         16
course batches  85
```

P0 must preserve that real behavior through explicit capability activation.

Do not infer capability from organization name or onboarding industry.

Do not create fake courses/batches for Test Yoga School or another tenant.

---

## 6. Later R11 phases

Do not pull into P0:

- **P1:** route/navigation/lead-control capability gating;
- **P2:** generic external catalog adapter boundary;
- **P3:** optional residential/accommodation surface gating.

The existing Yogakulam adapter remains untouched during P0.

---

## 7. R13 remains later

No billing/subscriptions/public signup/plan entitlements in R11-P0.

R13 commercial packaging follows after the reusable vertical boundary is proven.

---

## 8. Acceptance rules

P0 must finish with:

- canonical capability catalog/state;
- tenant-safe fail-closed helper;
- trusted activation boundary;
- dependency enforcement;
- least-privilege course/batch grants;
- explicit Yogakulam capability state;
- zero fake second-tenant vertical data;
- CI/CodeQL/deployment/provenance/readback green.

---

## 9. Parked work

Do not resume automatically:

- Yogakulam Hostinger/PHP commerce completion;
- PA-1 live identity decision;
- Google Ads production approval;
- Meta Ads permission/account selection;
- Search Indexing activation;
- predictive-model promotion / automatic learning-based recommendation ranking.
