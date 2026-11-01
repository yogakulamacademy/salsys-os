# SalsysOS Current Checkpoint

**Checkpoint date:** 2026-11-01  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production head:** `e380a0815915b8b53e7fb19a54a2fdf974c68fba`  
**Fast resume file:** `docs/SalsysOS_Active_Handoff.md`

> Historical checkpoint files under `docs/checkpoints/` are immutable evidence records.

---

## 1. Current position

SalsysOS is a **Sales + Analysis Operating System**.

Current state:

- broad 14-surface engineering closeout: complete;
- R9 AEO / GEO / AI Visibility V1: formally closed;
- North-Star rebaseline: complete;
- R10 recommendation lifecycle audit/design: complete;
- current exact checkpoint: **R10-P0 — Recommendation Security & Reproducibility Hardening**.

Read first:

`docs/checkpoints/M-2026-11-01-R10-Audit-Design-v1.md`

---

## 2. Verified R9 closeout release

PR #408 formalized R9 closeout.

```text
main SHA                   e380a0815915b8b53e7fb19a54a2fdf974c68fba
CI                         #1338 passed
CodeQL                     #623 passed
Production Smoke           #157 passed
Vercel production          READY on exact SHA
```

R9 remains closed with honest zero measured mentions/recommendations/citations and clean direct-evidence integrity.

---

## 3. R10 audit result

R10's foundation is materially implemented already.

Production inventory:

```text
system_intelligence_snapshots                 313
system_intelligence_events                     84
system_intelligence_recommendations             0
system_intelligence_recommendation_events       0
system_intelligence_learning_profiles            0
event_intelligence_predictions                767
event_intelligence_prediction_outcomes           0
lead_scoring_predictions                        0
```

Existing R10 capabilities include:

- system-awareness snapshots/events;
- recommendation + recommendation-event ledgers;
- recommendation feedback functions;
- downstream outcome observer;
- recommendation effectiveness / learning surfaces;
- privacy-gated lead feature snapshots;
- predictive-readiness/model-promotion guardrails;
- Owner Command Center contract.

The missing product loop is:

`fresh observed signal -> recommendation -> privileged human action -> observed outcome -> learning`

---

## 4. Predictive model remains gated

Current production readiness:

```text
total_leads                         603
labeled_outcomes                      1
positive_outcomes                     1
negative_outcomes                     0
labeled_outcome_rate_pct             0.2
prediction_generation_allowed         false
predictive_readiness_status           insufficient_positive_outcomes
```

Do not generate trained lead-conversion probabilities or present the deterministic event-intelligence ledger as a predictive conversion model.

The 767 event-intelligence rows are deterministic rules; the only active family has 101 stale SEO opportunity rows and zero fresh active predictions.

---

## 5. R10-P0 blockers

### A. Recommendation-event tenant policy defect

The current INSERT RLS policy effectively compares:

`r.organization_id = r.organization_id`

rather than recommendation organization to event organization.

Current production has zero recommendation-event rows and zero observed mismatches, so there is no current contamination evidence.

P0 must add both:

- explicit correct RLS tenant comparison;
- composite `(recommendation_id, organization_id)` foreign-key enforcement.

### B. Authenticated mutation privileges are too broad

`authenticated` currently holds DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE on both recommendation tables.

P0 must reduce browser/authenticated table access to the minimum required surface.

### C. Mutating RPC authorization is too broad

Recommendation creation, recommendation feedback and outcome observation are currently executable by authenticated members.

The product already has `has_organization_role(org_id, roles[])` and `/home` already requires:

`owner | admin | manager`

P0 must align recommendation creation/feedback to that privileged boundary and move machine outcome observation to service-role execution.

### D. Target array bound is incomplete

`target_lead_count <= 500` is enforced, but `target_lead_ids` array cardinality is not.

P0 must enforce the actual stored array bound.

### E. Lifecycle transition rules are not strict enough

P0 must fail closed on invalid transitions and make retries idempotent.

### F. Recommendation-lifecycle migration provenance is incomplete

Production contains ledgered recommendation-lifecycle migrations absent from source control.

P0 must restore the exact required historical SQL from the Supabase migration ledger and pin it to ledger hashes before the new hardening migration is allowed to depend on it.

---

## 6. R10-P0 acceptance contract

P0 is complete only when:

1. required historical recommendation-lifecycle migrations are restored exactly from the production ledger;
2. restored files are hash-protected in CI;
3. recommendation/event cross-tenant linkage is impossible at RLS + FK layers;
4. current mismatch/orphan counts remain zero;
5. authenticated direct mutation privileges are removed unless explicitly required by a controlled boundary;
6. recommendation creation is owner/admin/manager or trusted service only;
7. human feedback is owner/admin/manager only;
8. outcome observation is service-role machine only;
9. target Lead arrays cannot exceed the intended bound;
10. invalid lifecycle transitions fail closed;
11. retrying a lifecycle command does not duplicate lifecycle events;
12. current recommendation/event row counts remain zero during P0;
13. no synthetic recommendation/outcome rows are inserted for testing;
14. CI, CodeQL, migration provenance, deploy provenance and post-deploy read-only verification pass.

No recommendation UI is activated in P0.

---

## 7. R10-P1 after P0

After P0 closes, build **Deterministic Recommended Actions on Command Center**.

V1 source signals are limited to fresh observed CRM facts:

- reply backlog;
- overdue follow-ups;
- first touch needed;
- payment pending.

Exclude:

- stale event-intelligence predictions;
- unready conversion probabilities;
- generic raw system-failure counts;
- browser-only payment/enrollment/revenue claims;
- autonomous external actions.

Existing observed attention cards on `/home` remain unchanged. Recommendations appear in a separate clearly labeled layer.

---

## 8. Important awareness caveat

`v_r10_system_awareness_v1` currently ranks raw system failures ahead of CRM pressure.

The current 24-hour failure is Google Ads, which is the known external Cloud-project production-access blocker. Operational Readiness correctly labels it `configuration_blocked`.

Therefore generic system-health recommendations are excluded from R10 V1 until awareness becomes provider-readiness-aware.

---

## 9. Parked boundaries

Do not resume automatically:

- commerce completion / live Hostinger PHP emitter;
- PA-1 live identity decision;
- Google/Meta provider approval work;
- Search Indexing activation.

Do not create fake data to make any parked boundary green.

---

## 10. Locked engineering rules

- one controlled checkpoint at a time;
- verify before modifying;
- tenant authority is server-derived;
- PostgreSQL remains canonical truth;
- OpenSearch remains derived/rebuildable;
- observed/deterministic/inferred/modelled evidence remains distinct;
- no fake recommendations, outcomes, conversions, revenue, citations or training evidence;
- high-impact actions remain human-governed;
- stale or unready predictive evidence fails safe.

---

## 11. Resume instruction

1. read `docs/SalsysOS_Active_Handoff.md`;
2. read `docs/checkpoints/M-2026-11-01-R10-Audit-Design-v1.md`;
3. verify current `main`, Supabase and Vercel provenance;
4. continue with **R10-P0** only;
5. do not activate recommendation UI during P0.
