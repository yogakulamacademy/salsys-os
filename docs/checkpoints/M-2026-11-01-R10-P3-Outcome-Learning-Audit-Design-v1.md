# R10-P3 Observed Outcome & Learning Runner — Audit & Design V1

**Date:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Design status:** Locked before implementation

---

## 1. Scope

R10-P3 covers:

- scheduled observation of downstream CRM/payment/enrollment evidence after a human starts a recommendation action;
- append-only temporal outcome events;
- descriptive learning-profile recomputation;
- recommendation effectiveness / calibration / completion read models;
- scheduler run telemetry and System Health visibility.

P3 does **not** activate trained conversion probabilities, causal attribution, autonomous customer/provider actions, AI recommendation prose, or automatic learning-based priority changes.

The existing P1 deterministic admissions priority remains the live ranking source.

---

## 2. Current production evidence state

Read-only audit at design time:

```text
recommendations                    0
acted recommendations              0
completed recommendations          0
outcome events                     0
learning profiles                  0
learning profiles with samples     0
```

No recommendation/outcome data will be fabricated to exercise P3.

`pg_cron` is already installed and used by other SalsysOS sweep functions. No recommendation-outcome cron job currently exists.

---

## 3. Existing observer is not machine-runner ready

Current function:

```text
observe_system_intelligence_recommendation_outcomes_v1(limit)
```

Current grants:

```text
service_role
postgres
```

But the function body still requires:

```text
auth.uid() is not null
current_tenant_organization_id() is not null
session_is_bound_to_organization(...)
is_organization_member(...)
```

A normal database `pg_cron` execution or service-role machine call does not satisfy a human user-bound tenant session.

### Decision

Do not schedule V1.

Create a machine-safe V2 observer with an explicit organization argument and a trusted function boundary.

---

## 4. Locked machine observer contract

Add:

```text
observe_system_intelligence_recommendation_outcomes_v2(
  p_organization_id uuid,
  p_limit integer default 50
)
```

Required behavior:

- `SECURITY DEFINER`;
- fixed `search_path` including `pg_temp`;
- executable only by `service_role` / database owner path;
- explicit organization existence/active validation;
- never derive machine tenant from browser/session state;
- evaluate only recommendations belonging to `p_organization_id`;
- recommendation must have `acted_at` and target Leads;
- wait at least 15 minutes from `acted_at`;
- positive evidence remains only observed paid payment / confirmed-or-completed enrollment / forward lead-stage movement after action start;
- negative evidence remains only observed lost/unqualified stage / cancelled enrollment / refunded-or-partially-refunded payment after action start;
- inconclusive may be recorded only once after 72 hours without observed positive/negative evidence;
- multiple later outcome observations are allowed only when genuinely newer downstream evidence appears;
- every event remains explicitly temporal, not causal;
- update recommendation latest-outcome fields only inside the same transaction as the corresponding event.

V1 remains unscheduled and should be documented as legacy human-session logic; no new runner may call it.

---

## 5. Source-version mismatch

Live P1/P2 recommendations are written with:

```text
source_version = 'r10-p1'
```

But these read models currently filter:

```text
source_version = 'v2'
```

Affected functions:

- `get_system_intelligence_recommendation_effectiveness_v1()`;
- `get_system_intelligence_action_completion_effectiveness_v1()`;
- `get_system_intelligence_recommendation_calibration_v1()` indirectly through effectiveness.

### Decision

For P3 V1, recommendation effectiveness/completion reads must deliberately include the supported R10 deterministic family:

```text
source_version in ('v2','r10-p1')
```

Do not remove source-family filtering entirely. Future recommendation source versions require explicit inclusion.

---

## 6. Learning-sample duplication risk

Current learning-profile recomputation counts outcome **event rows**.

Outcome events may legitimately repeat for one recommendation when newer downstream evidence appears.

Therefore one recommendation could contribute multiple samples and be over-weighted relative to another recommendation.

### Decision

Add a hardened learning recomputation function that derives one current sample per recommendation from the recommendation's latest business-outcome state, not from the number of historical outcome-event rows.

Recommended contract:

```text
recompute_system_intelligence_learning_profile_v2(
  p_organization_id uuid,
  p_signal_id text,
  p_role_scope text
)
```

It should aggregate supported recommendation rows by their latest stored `last_business_outcome_class`.

Each recommendation contributes at most one latest sample.

`inconclusive` remains counted separately from resolved positive/neutral/negative/mixed samples.

---

## 7. Learning profiles stay descriptive in P3

`system_intelligence_learning_profiles` currently contains:

- sample counts;
- bounded `score_adjustment` (-8 to +8);
- confidence;
- recompute timestamps.

No current application/function consumes this table to modify live P1 priority.

### Decision

P3 may recompute the profile for descriptive learning/evaluation only.

Do **not** apply `score_adjustment` to `r10-p1` recommendation priority in P3.

No probability, model confidence, or causal-success label may be inferred from this table.

Any future decision to use learning adjustments in ranking requires a separate checkpoint with real evidence and explicit product approval.

---

## 8. Learning-profile privilege defect

Current `authenticated` table grants include:

```text
SELECT
INSERT
UPDATE
DELETE
TRUNCATE
REFERENCES
TRIGGER
```

RLS is enabled and only a SELECT policy exists, but `TRUNCATE` is not a row-level operation and should never be exposed to authenticated clients.

### Decision

P3 hardening must revoke direct mutation privileges from `authenticated` and leave tenant-RLS SELECT only.

Learning-profile writes occur only through controlled trusted functions.

---

## 9. Runner design

Create a database-native sweep function following the existing SalsysOS SEO sweep pattern:

```text
sweep_system_intelligence_recommendation_outcomes_v1(...)
```

Required behavior:

- `SECURITY DEFINER`;
- database/cron trusted execution only;
- fan out across active organizations explicitly;
- no browser/session tenant dependency;
- per-organization exception isolation;
- bounded recommendations processed per organization;
- call the V2 observer;
- recompute learning profiles only for signal/role combinations with real observed outcome evidence;
- return an aggregate JSON summary;
- one tenant failure must not abort all other tenants.

### Schedule

Initial schedule:

```text
*/15 * * * *
```

This matches the observer's minimum 15-minute post-action boundary while remaining low-frequency enough for a descriptive learning loop.

---

## 10. Run ledger

The existing `system_intelligence_events` table is not appropriate for runner telemetry because its event vocabulary is constrained to issue/state-change events.

Add a dedicated tenant-scoped run ledger:

```text
system_intelligence_outcome_runs
```

Minimum fields:

- id;
- organization_id;
- trigger/source;
- status (`running | success | partial | failed`);
- recommendations_scanned;
- outcome_events_recorded;
- positive / negative / mixed / inconclusive counts;
- learning_profiles_recomputed;
- error_message / compact error metadata;
- started_at;
- completed_at;
- created_at.

Security:

- tenant-RLS SELECT for organization members;
- authenticated direct INSERT/UPDATE/DELETE/TRUNCATE denied;
- runner/trusted function writes only.

A scheduled no-op run may truthfully record `success` with zero observed outcomes. This is operational telemetry, not fabricated business-outcome evidence.

---

## 11. System Health integration

Extend canonical `v_system_health` with a new system key such as:

```text
intelligence_outcomes
Recommendation Outcome Learning
```

Source it only from `system_intelligence_outcome_runs`.

Suggested stale threshold:

```text
60 minutes
```

Health semantics:

- latest failed/partial run after latest success -> warning/critical according to existing health vocabulary;
- recent successful sweep -> healthy;
- no missing-evidence inference from recommendation/outcome counts;
- health reflects runner operation, not whether recommendations happened to exist.

Do not use business-outcome counts themselves as infrastructure health.

---

## 12. Effectiveness / calibration semantics

Retain existing conservative thresholds:

```text
insufficient   < 5 observed recommendation outcomes
emerging       5-19
established    20-49
mature         50+
```

Calibration remains locked unless existing resolved-evidence thresholds are met.

P3 must preserve explicit wording that calibration comes from temporal outcome evidence only and does not imply causal attribution.

Because current evidence is zero, no calibration can become ready during implementation unless real operator activity occurs independently.

---

## 13. Regression contracts

P3 CI must verify at minimum:

1. V1 observer is not used by the cron runner;
2. V2 observer requires explicit organization scope and trusted execution;
3. no authenticated direct learning-profile mutation grants remain;
4. effectiveness/completion includes `r10-p1`;
5. learning recomputation counts at most one latest sample per recommendation;
6. outcome events are not unique by event type because genuinely newer observations may repeat;
7. repeated sweeps without new evidence do not create duplicate outcome events;
8. sweep isolates tenant failures;
9. cron schedule exists exactly once;
10. System Health consumes the run ledger, not business-outcome counts;
11. P1 priority remains canonical deterministic admissions priority;
12. no `score_adjustment` is applied to live ranking;
13. no prediction probability or causal-attribution claim is introduced;
14. migrations do not seed recommendation/outcome/learning evidence.

---

## 14. Implementation sequence

1. create P3 hardening migration;
2. revoke learning-profile direct mutation grants;
3. add tenant-scoped run ledger + RLS;
4. add V2 machine observer;
5. add V2 latest-per-recommendation learning recomputation;
6. correct effectiveness/completion source-family filters;
7. add bounded per-tenant sweep runner;
8. register one stagger-safe 15-minute pg_cron job;
9. integrate run ledger into canonical System Health;
10. extend the R10 verifier;
11. CI + CodeQL;
12. apply migration;
13. post-deploy read-only verification;
14. do **not** create synthetic recommendation/outcome/learning evidence;
15. close P3 only after runtime provenance and scheduler health are verified.

---

## 15. Safety boundary

P3 is an observed-outcome infrastructure checkpoint, not a predictive-model checkpoint.

Keep separate:

- deterministic recommendation priority;
- human lifecycle feedback;
- temporal downstream evidence;
- descriptive learning aggregates;
- trained model probabilities.

No layer may be silently relabeled as another.

---

## Decision

The R10-P3 audit/design checkpoint is complete.

The next exact checkpoint is:

# R10-P3 — Implementation against the locked outcome/learning runner contract
