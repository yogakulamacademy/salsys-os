# SalsysOS — R10 Recommendation Lifecycle & Action-Outcome Learning V1 — Audit & Design

**Date:** 2026-11-01  
**Production organization:** Yogakulam Academy  
**Verified production head at audit start:** `e380a0815915b8b53e7fb19a54a2fdf974c68fba`

## Purpose

Audit the existing R10 prediction, recommendation, command-center and outcome-learning foundation before adding any new recommendation product behavior.

The audit is read-only. No recommendation, prediction, customer, payment, identity, provider or production business state was modified.

## Executive conclusion

R10 is **not** missing its foundational data model.

Production already has:

- deterministic system-awareness snapshots and events;
- deterministic event-intelligence prediction infrastructure;
- privacy-gated lead feature snapshots;
- recommendation and recommendation-event tables;
- recommendation feedback RPCs;
- business-outcome observation logic;
- recommendation effectiveness / learning surfaces;
- predictive-readiness and model-promotion guardrails;
- Owner Command Center readiness views;
- scheduled system-awareness / feature-snapshot / prediction-outcome jobs.

The real missing product loop is activation and product-surface integration:

`fresh observed signal -> recommendation -> privileged human decision -> action -> observed downstream outcome -> learning`

Before that loop is activated, one tenant-integrity defect and several permission/reproducibility gaps must be fixed.

---

## 1. Live R10 inventory

Yogakulam production currently contains:

```text
system_intelligence_snapshots                 313
system_intelligence_events                     84
system_intelligence_recommendations             0
system_intelligence_recommendation_events       0
system_intelligence_learning_profiles            0
lead_scoring_predictions                        0
event_intelligence_predictions                767
event_intelligence_prediction_outcomes           0
```

`v_r10_recommendation_effectiveness_v1` reports:

```text
recommendations_total               0
recommendations_shown               0
recommendations_accepted            0
recommendations_completed           0
observed_outcome_events             0
learning_status                     no_recommendations
```

Interpretation: the recommendation schema is dormant, not absent.

---

## 2. Predictive scoring remains correctly gated

`v_r10_predictive_readiness_v1` currently reports:

```text
total_leads                         603
labeled_outcomes                      1
positive_outcomes                     1
negative_outcomes                     0
unlabeled_leads                     602
labeled_outcome_rate_pct             0.2
min_positive_outcomes                 20
min_negative_outcomes                 20
min_labeled_outcome_rate_pct          50
predictive_readiness_status           insufficient_positive_outcomes
prediction_generation_allowed         false
recommendation_calibration_ready      false
```

Readiness reason:

`Positive outcome history is too small for a defensible conversion model.`

Therefore R10 V1 must **not** publish trained lead-conversion probabilities, fabricate predictive confidence or bypass the readiness gate.

Deterministic operational scoring remains the safe fallback.

---

## 3. The 767 event-intelligence predictions are deterministic rules

Current production breakdown:

```text
session_conversion_intent     500   deterministic   expired
traffic_decline_risk          152   deterministic   expired
seo_growth_opportunity        101   deterministic   active
seo_growth_opportunity         11   deterministic   expired
paid_attribution_gap_risk       3   deterministic   expired
```

These were generated on 2026-10-19.

They are not a trained lead-conversion model.

### Freshness

`v_event_intelligence_prediction_freshness_health_v1` reports for the only active prediction family:

```text
prediction_type               seo_growth_opportunity
active_predictions            101
fresh_active_predictions        0
stale_active_predictions      101
freshness_status              stale_active_predictions_present
```

The other prediction families have no active predictions.

Therefore the first R10 recommendation generator must not treat the existing 767 prediction rows as fresh general next-best-action evidence.

---

## 4. Existing recommendation lifecycle is already substantial

`system_intelligence_recommendations` already stores:

- tenant organization;
- recommendation key;
- surface/source version;
- signal/category/role scope;
- deterministic score;
- action + reason text;
- lifecycle state;
- shown/accepted/dismissed/acted/completed timestamps;
- baseline metric/value + desired direction;
- downstream outcome metadata;
- target Lead IDs/count;
- business-outcome summary.

`system_intelligence_recommendation_events` already stores:

- recommendation lineage;
- event type;
- actor user;
- outcome class;
- outcome metric/delta;
- note;
- event timestamp.

Allowed event types already include:

```text
shown
accepted
dismissed
action_started
action_completed
outcome_observed
business_outcome_observed
```

Outcome classes already include:

```text
positive
neutral
negative
mixed
inconclusive
```

---

## 5. Existing recommendation functions

Production already has:

- `touch_system_intelligence_recommendation_v2(...)`
- `record_system_intelligence_recommendation_feedback_v1(...)`
- `observe_system_intelligence_recommendation_outcomes_v1(integer)`
- `recompute_system_intelligence_learning_profile_v1(uuid,text,text)`
- `get_system_intelligence_recommendation_effectiveness_v1()`
- `get_system_intelligence_recommendation_calibration_v1()`
- `get_system_intelligence_action_completion_effectiveness_v1()`

### Existing good behavior

The current recommendation-touch function:

- derives the tenant from the authenticated session;
- verifies tenant membership;
- validates target Lead IDs against the tenant;
- records recommendation exposure history.

The current feedback function:

- derives the tenant from the authenticated session;
- validates recommendation tenancy;
- records accepted/dismissed/action-started/action-completed events;
- updates recommendation lifecycle timestamps.

The current outcome observer:

- derives the tenant from the authenticated session;
- evaluates only acted recommendations with target Leads;
- waits at least 15 minutes after action start;
- checks observed downstream CRM/payment/enrollment facts;
- records positive/negative/mixed/inconclusive evidence;
- explicitly states that temporal outcome evidence is **not causal attribution**.

The learning-profile recomputation function is already service-role-only.

---

## 6. Security defect — recommendation-event tenant linkage

The current INSERT RLS policy for `system_intelligence_recommendation_events` contains an effective check equivalent to:

```text
r.organization_id = r.organization_id
```

rather than comparing the recommendation organization to the new event's organization.

The original ledgered migration intended:

```text
r.organization_id = organization_id
```

but the unqualified `organization_id` inside the subquery resolved to the inner recommendation row, producing a tautology.

### Current production impact

```text
recommendation_event_rows                0
orphan_recommendation_refs               0
cross_tenant_recommendation_refs         0
```

No cross-tenant contamination is currently observed.

### Required fix

Before recommendation events become active:

1. replace the policy with an explicit outer-row tenant comparison;
2. add a composite relationship so the database itself prevents cross-tenant recommendation/event linkage:
   - unique `(id, organization_id)` on recommendations;
   - foreign key `(recommendation_id, organization_id)` -> recommendations `(id, organization_id)`;
3. add a regression contract that fails if either protection disappears.

---

## 7. Permission drift — authenticated mutation surface is too broad

The original R10 migration granted only the privileges needed for the recommendation lifecycle.

Current production grants show `authenticated` has all of the following on both recommendation tables:

```text
DELETE
INSERT
REFERENCES
SELECT
TRIGGER
TRUNCATE
UPDATE
```

That is broader than the product's intended human-governed recommendation boundary.

The recommendation creator, feedback RPC and outcome observer are also executable by `authenticated` today.

### Required V1 permission model

The product already has a canonical role helper:

`has_organization_role(org_id, roles[])`

and `/home` already requires one of:

```text
owner
admin
manager
```

R10 V1 should align with that boundary.

Recommended permission contract:

- direct recommendation-table mutation from `authenticated`: **revoked**;
- authenticated table access: SELECT only, tenant-RLS protected;
- recommendation creation: controlled privileged function/server path only;
- recommendation feedback: owner/admin/manager only;
- recommendation outcome observer: service-role machine path only;
- read-only effectiveness/calibration functions may remain available to authenticated tenant members where appropriate;
- viewers/admissions users must not gain mutation authority merely because they are organization members.

Yogakulam currently has active roles:

```text
admin        1
admissions   1
viewer       1
```

The current Home Command Center is restricted to privileged roles, so only the admin currently reaches that surface in this tenant.

---

## 8. Target-list integrity gap

Current recommendation constraints enforce:

```text
target_lead_count between 0 and 500
```

but do not enforce the cardinality of `target_lead_ids` itself.

The current v2 touch function computes a capped count while potentially retaining a larger array.

### Required fix

Add a database constraint:

```text
cardinality(target_lead_ids) <= 500
```

and ensure the privileged recommendation writer truncates/validates target arrays before storage.

---

## 9. Lifecycle transition hardening

The current feedback function validates event type but does not enforce a strict state-transition graph.

R10 V1 should use this state machine:

```text
active -> accepted
active -> dismissed
accepted -> dismissed        (allowed before action starts)
accepted -> acted            via action_started
acted -> completed           via action_completed + completed_at
```

Rules:

- dismissed is terminal for that recommendation record;
- action_started is not accepted from an unaccepted recommendation;
- action_completed is not accepted before action_started;
- completed actions cannot be restarted;
- retries of the same lifecycle command are idempotent and do not create duplicate lifecycle events;
- `shown` may repeat;
- observed business-outcome events may repeat only when new downstream evidence exists.

A partial unique index or equivalent idempotency guard should prevent duplicate accepted/dismissed/action_started/action_completed event rows for the same recommendation/event type.

---

## 10. Source-control reproducibility gap

As with R9, production contains R10 migrations that are absent from `main`.

At minimum, the recommendation lifecycle chain includes these ledgered migrations:

```text
20261018111825 system_intelligence_recommendation_learning_v1
20261018114501 system_intelligence_outcome_observation_v1
20261018115609 system_intelligence_business_learning_v1
20261018153024 system_intelligence_outcome_observer_v1
20261018153555 system_intelligence_effectiveness_v1
20261018154443 system_intelligence_calibration_readiness_v1
20261018155528 system_intelligence_action_completion_v1
20261018155811 system_intelligence_action_completion_effectiveness_v1
```

R10 predictive/system-awareness ledger migrations are also present in production and need a later full provenance reconciliation before formal R10 closeout.

### P0 rule

The first R10 implementation checkpoint must restore the exact historical recommendation-lifecycle migrations required by the new hardening migration, using the production migration ledger as canonical source and hash protection.

Do not reconstruct them from current object definitions when exact ledger statements are available.

---

## 11. Owner Command Center behavior

The current `/home` Command Center is already evidence-first and deterministic.

It displays observed operational facts such as:

- Needs reply;
- Overdue follow-ups;
- First touch needed;
- Payment pending.

It does **not** currently consume `system_intelligence_recommendations`.

This is a good boundary.

R10 V1 should add a separately labeled **Recommended actions** layer and must not replace or relabel the existing observed-fact cards as model recommendations.

---

## 12. Current system-awareness caveat

`v_r10_system_awareness_v1` currently treats any raw 24-hour system failure as the highest issue before CRM pressure.

Yogakulam's current one 24-hour system failure is:

```text
system_key     google_ads
status         failed
provider       Google Ads
```

This is the known external Google Cloud production-access blocker, which Operational Readiness correctly classifies as `configuration_blocked` rather than an internal SalsysOS defect.

Therefore R10 V1 must **not** generate generic `system_failures` recommendations from the current system-awareness top issue.

A future awareness revision can consume provider-readiness classification before system-health recommendations are activated.

---

## 13. Safe R10 V1 recommendation sources

The first recommendation lifecycle should use only fresh, directly observed CRM operating facts.

Allowed V1 signals:

1. `reply_backlog`
   - source: `needs_reply = true`;
   - evidence: CRM conversation state;
   - target selection: oldest relevant inbound conversations first, bounded to a safe target size.

2. `overdue_followups`
   - source: open follow-up tasks whose due time is already past;
   - evidence: scheduled task state.

3. `first_touch_needed`
   - source: leads with no recorded first outbound contact;
   - evidence: CRM contact history.

4. `payment_pending`
   - source: CRM payment-pending stage / verified payment state;
   - evidence: pipeline + payment records.

Explicitly excluded from R10 V1 recommendation generation:

- stale event-intelligence predictions;
- unready conversion probabilities;
- generic raw system-failure counts;
- inferred provider health;
- browser-only payment/enrollment/revenue claims;
- any synthetic recommendation outcome.

---

## 14. Recommendation semantics

V1 recommendation scores are **deterministic priority scores**, not probabilities and not confidence estimates.

Each recommendation must expose:

- what action is recommended;
- why it is recommended;
- which observed metric/state triggered it;
- the baseline value;
- the desired direction;
- target Lead count;
- evidence label;
- deterministic priority score;
- explicit status/lifecycle state.

No AI-generated prose is required for V1.

---

## 15. Generation / exposure boundary

The existing `touch_*` function records a `shown` event whenever it creates/refreshes a recommendation.

Therefore it must not be used by an unattended background generator unless the schema is changed to separate generation from exposure.

For the smallest safe V1, recommendation generation should occur at the privileged Command Center presentation boundary:

1. authenticated owner/admin/manager requests `/home`;
2. server derives the active tenant and evaluates the four deterministic CRM signals;
3. a hardened recommendation RPC creates/refreshes only recommendations that will be displayed;
4. `shown` therefore means presented on the privileged Command Center request;
5. the page then reads the current recommendation rows and renders a separate Recommended actions panel.

This avoids synthetic exposure counts and avoids a new background generation scheduler in V1.

A later version may separate generated/presented/impression semantics if recommendation precomputation becomes necessary.

---

## 16. Recommendation episode / duplication rule

V1 must avoid creating a new duplicate recommendation on every page load.

Use a stable recommendation key per current operating episode and do not create a new unresolved recommendation while the same signal already has an active/accepted/acted recommendation.

At minimum:

- repeated Home loads refresh/show the same unresolved signal recommendation;
- dismissed or completed records are not mutated back into an unresolved state;
- a later recurrence of the same signal creates a new recommendation episode only after the previous episode is terminal and the signal has cleared/reappeared or the implementation has a deterministic new episode key.

Exact episode-key logic must be covered by tests before activation.

---

## 17. Human feedback contract

Command Center recommendation actions remain human-governed.

V1 UI actions:

```text
Accept
Dismiss
Start action
Mark complete
```

All mutations must flow through the hardened recommendation feedback boundary.

No recommendation button directly performs customer messaging, ad spend, payment changes, enrollment changes or another high-impact external action.

Recommendation acceptance means `I intend to do this`, not `SalsysOS executed it`.

---

## 18. Outcome learning contract

The existing business-outcome observer is useful after a human starts an action.

A later R10 V1 sub-checkpoint should add a machine-authenticated route that:

1. enumerates eligible organizations server-side;
2. invokes a service-role-only outcome observer;
3. records only observed Lead/payment/enrollment movement after the action timestamp;
4. never rewrites the original recommendation or prediction evidence;
5. keeps the explicit statement that temporal association is not causal attribution;
6. leaves unresolved recommendations unresolved until evidence or the inconclusive horizon exists.

Human `action_completed` and observed business outcome are separate concepts and must remain separate.

---

## 19. Recommended implementation sequence

### R10-P0 — Recommendation Security & Reproducibility Hardening

No user-facing recommendation activation yet.

Scope:

1. restore exact ledgered recommendation-lifecycle migrations missing from source control;
2. pin restored historical SQL to production-ledger hashes;
3. fix recommendation-event tenant RLS;
4. add composite recommendation/event tenant FK;
5. revoke unnecessary authenticated table mutation privileges;
6. restrict recommendation creation to privileged owner/admin/manager path;
7. restrict feedback to owner/admin/manager;
8. move outcome observation to service-role-only machine path;
9. enforce target Lead array cardinality <=500;
10. enforce/idempotently guard lifecycle transitions;
11. verify existing production recommendation/event rows remain zero and no customer data changes occur.

### R10-P1 — Deterministic Recommended Actions on Command Center

Scope:

- generate only the four CRM-observed recommendation families;
- add separate Recommended actions UI on `/home`;
- preserve existing observed attention cards;
- no stale prediction use;
- no predictive probability use;
- no autonomous external action.

### R10-P2 — Human Feedback Lifecycle

Scope:

- Accept / Dismiss / Start / Complete interactions;
- append-only lifecycle events;
- role enforcement;
- idempotent state transitions;
- auditable actor/timestamps.

This may be implemented with P1 if the UI/API boundary is sufficiently small, but it must retain the P0 security contract.

### R10-P3 — Observed Outcome & Learning Runner

Scope:

- service-role scheduled outcome observation;
- business-outcome event recording;
- learning-profile recomputation after enough samples;
- effectiveness/calibration surfaces.

### Predictive-model activation — later, gated

Do not activate trained lead conversion probabilities until the existing readiness contract says `prediction_generation_allowed = true` and model evaluation/promotion guardrails pass.

---

## 20. R10-P0 acceptance contract

R10-P0 is complete only when all of the following are true:

1. required historical recommendation-lifecycle migrations exist in source control and match production-ledger hashes;
2. cross-tenant recommendation/event linkage is impossible at both RLS and FK levels;
3. current mismatch/orphan counts remain zero;
4. authenticated direct DELETE/TRUNCATE/INSERT/UPDATE privileges are removed unless explicitly required by a controlled function boundary;
5. recommendation creation requires owner/admin/manager or trusted service execution;
6. feedback requires owner/admin/manager;
7. outcome observation is not directly executable as an arbitrary authenticated member;
8. target Lead IDs cannot exceed the intended bound;
9. invalid lifecycle transitions fail closed;
10. lifecycle retries are idempotent;
11. current zero recommendation rows remain zero during P0;
12. no fake recommendation, feedback, action or outcome row is created for testing;
13. CI, CodeQL, migration provenance checks, deployment provenance and post-deploy read-only verification pass.

---

## Decision

The R10 Audit & Design checkpoint is complete.

The next exact checkpoint is:

# R10-P0 — Recommendation Security & Reproducibility Hardening

This is a prerequisite safety/provenance checkpoint. It must land before any recommendation is shown to production users.
