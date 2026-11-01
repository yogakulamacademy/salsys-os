# SalsysOS Active Handoff

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production runtime head:** `5162d40f324ec79157c0db24ff2c303ef325ea62`  
**Latest docs closeout merge:** `4ddcea8b661d7371c3e6c52adcb0b75f4c724ec1`

Read first:

1. `docs/SalsysOS_Current_Checkpoint.md`
2. `docs/checkpoints/M-2026-11-01-R10-P3-Outcome-Learning-Audit-Design-v1.md`
3. `docs/checkpoints/M-2026-11-01-R10-P2-Human-Feedback-Closeout-v1.md`
4. `docs/checkpoints/M-2026-11-01-R10-P2-Human-Feedback-Audit-Design-v1.md`

Historical checkpoint files are immutable evidence records.

---

## 1. Exact continuation point

**R10-P3 — Observed Outcome & Learning Runner — implementation against locked design**

P3 audit/design is complete. Do not redesign the evidence model during implementation unless a new verified invariant gap is found.

---

## 2. P2 runtime remains verified

```text
Implementation PR           #417
runtime SHA                 5162d40f324ec79157c0db24ff2c303ef325ea62
post-merge CI               #1360 passed
post-merge CodeQL           #645 passed
Production Smoke            #166 passed
Vercel production           READY on exact runtime SHA
```

No synthetic recommendation, feedback or outcome evidence was created during P2 acceptance.

---

## 3. P3 audit findings to fix before scheduling

### Machine observer mismatch

Legacy `observe_system_intelligence_recommendation_outcomes_v1(...)` is granted only to trusted machine roles but still requires `auth.uid()` plus a user-bound tenant session.

**Do not schedule V1.**

Build a V2 observer with explicit organization scope and a trusted machine boundary.

### Source-family mismatch

Live Command Center recommendations use:

```text
source_version = 'r10-p1'
```

Current effectiveness/action-completion functions filter only `source_version='v2'` and would omit live R10 recommendations.

### Learning sample duplication

Legacy learning recomputation counts outcome event rows. Repeated newer temporal observations for one recommendation can therefore over-weight that recommendation.

P3 V2 must use one latest outcome sample per recommendation.

### Learning-profile privilege defect

`authenticated` currently has broad direct table privileges on `system_intelligence_learning_profiles`, including mutation and TRUNCATE.

P3 must reduce this table to tenant-RLS SELECT-only for authenticated users.

### No outcome-run telemetry

There is no recommendation-outcome run ledger or System Health source. The generic `system_intelligence_events` vocabulary is not a suitable runner ledger.

---

## 4. Locked P3 implementation

Add:

```text
observe_system_intelligence_recommendation_outcomes_v2(org_id, limit)
recompute_system_intelligence_learning_profile_v2(org_id, signal_id, role_scope)
system_intelligence_outcome_runs
sweep_system_intelligence_recommendation_outcomes_v1(...)
```

Also:

- include supported source families `('v2','r10-p1')` in effectiveness/completion reads;
- revoke authenticated learning-profile mutations/TRUNCATE;
- run one database-native sweep every 15 minutes through `pg_cron`;
- isolate tenant failures so one organization cannot abort the full sweep;
- integrate the outcome-run ledger into canonical `v_system_health`;
- preserve non-causal outcome wording;
- extend R10 regression verification.

---

## 5. Machine observer boundary

V2 observer must:

- be `SECURITY DEFINER` with fixed `search_path`;
- accept an explicit organization ID;
- validate organization existence/activity;
- be executable only from trusted database/service-role paths;
- never derive machine tenancy from browser/session state;
- process only the specified tenant's acted recommendations with target Leads;
- preserve the existing 15-minute post-action boundary;
- insert an outcome event only for genuinely newer downstream evidence or first 72-hour inconclusive state;
- update latest recommendation outcome fields in the same transaction;
- retain the explicit statement that temporal evidence is not causal attribution.

---

## 6. Learning remains descriptive

V2 learning recomputation must aggregate at most one latest outcome sample per recommendation.

Do **not** apply `system_intelligence_learning_profiles.score_adjustment` to live P1 recommendation ranking during P3.

Live priority remains the canonical deterministic admissions priority.

Learning aggregates are descriptive evidence, not probability/confidence for conversion and not proof of causal success.

---

## 7. Runner and operational health

Initial cron cadence:

```text
*/15 * * * *
```

Add tenant-scoped `system_intelligence_outcome_runs` for operational telemetry:

- status;
- scanned/observed counts;
- positive/negative/mixed/inconclusive counts;
- learning profiles recomputed;
- compact error evidence;
- timestamps.

A successful sweep with zero outcome observations is valid operational telemetry and does not fabricate a business outcome.

System Health must derive runner health from this run ledger, not from whether recommendations/outcomes happen to exist.

---

## 8. Implementation order

1. create P3 hardening migration;
2. lock learning-profile table to authenticated SELECT-only;
3. add run ledger + RLS;
4. add V2 machine observer;
5. add V2 latest-per-recommendation learning recompute;
6. correct supported recommendation source-family reads;
7. add bounded per-tenant sweep runner;
8. register exactly one 15-minute cron job;
9. extend `v_system_health`;
10. extend R10 verifier;
11. CI + CodeQL;
12. apply migration only after gates are green;
13. verify cron, System Health, grants and evidence counts read-only;
14. do not seed recommendation/outcome/learning evidence;
15. close P3 only after production acceptance.

---

## 9. Parked work

Do not resume automatically:

- predictive model promotion;
- automatic learning-based priority adjustment;
- commerce completion / Hostinger PHP emitter;
- PA-1 live identity decision;
- Google/Meta provider approval;
- Search Indexing activation.

---

## 10. Safety rules

- one controlled checkpoint at a time;
- verify before modifying;
- no fake recommendation/feedback/outcome/learning evidence;
- no trained probabilities while readiness is blocked;
- no autonomous external/customer action;
- PostgreSQL remains canonical truth;
- machine tenant scope must be explicit;
- temporal outcome evidence must never be presented as causal attribution.
