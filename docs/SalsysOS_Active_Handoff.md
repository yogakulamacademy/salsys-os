# SalsysOS Active Handoff

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production head:** `e380a0815915b8b53e7fb19a54a2fdf974c68fba`

Read first:

1. `docs/SalsysOS_Current_Checkpoint.md`
2. `docs/checkpoints/M-2026-11-01-R10-Audit-Design-v1.md`
3. `docs/checkpoints/M-2026-11-01-R9-Production-Closeout-v1.md`

Historical checkpoint files are immutable evidence records.

---

## 1. Exact continuation point

**R10-P0 — Recommendation Security & Reproducibility Hardening**

The R10 read-only audit/design is complete. No recommendation UI or recommendation data has been activated yet.

---

## 2. Current R10 production baseline

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

The recommendation lifecycle is dormant, not absent.

---

## 3. Predictive safety boundary

```text
total_leads                         603
labeled_outcomes                      1
positive_outcomes                     1
negative_outcomes                     0
prediction_generation_allowed         false
predictive_readiness_status           insufficient_positive_outcomes
```

Do not publish trained conversion probabilities.

The 767 event-intelligence predictions are deterministic rules, not a trained conversion model. The only active family has 101 stale SEO opportunity rows and zero fresh active predictions.

---

## 4. P0 defects to fix

### Tenant linkage

Recommendation-event INSERT RLS currently has a tautological tenant comparison. Add explicit outer-event org comparison plus composite tenant FK.

### Permissions

Authenticated currently has broad mutation privileges on recommendation tables. Reduce to the minimum controlled surface.

### RPC roles

Recommendation creation, feedback and outcome observation are currently callable by authenticated members.

Use canonical `has_organization_role()` and align human mutation with Home's privileged boundary:

`owner | admin | manager`

Outcome observation becomes service-role machine execution.

### Target bound

Enforce actual `target_lead_ids` cardinality <= 500, not only the stored count field.

### Lifecycle transitions

Enforce valid transitions and retry idempotency.

### Migration provenance

Restore exact production-ledger recommendation-lifecycle migrations needed by the hardening migration and pin them to production-ledger hashes.

---

## 5. P0 acceptance contract

P0 must finish with:

- exact historical migration provenance in source control;
- tenant-safe recommendation/event relationship at RLS + FK layers;
- zero current cross-tenant/orphan recommendation-event rows;
- browser direct mutations removed;
- owner/admin/manager recommendation creation + feedback;
- service-role-only outcome observation;
- bounded target arrays;
- fail-closed/idempotent lifecycle transitions;
- recommendation rows remain 0;
- recommendation event rows remain 0;
- no synthetic test recommendation/outcome rows;
- CI, CodeQL, deployment and post-deploy checks green.

Do not add UI in P0.

---

## 6. R10-P1 after P0

Add a separate **Recommended actions** layer to `/home` using fresh observed CRM facts only:

- reply backlog;
- overdue follow-ups;
- first touch needed;
- payment pending.

Do not replace the existing observed attention cards.

Do not use:

- stale event predictions;
- unready predictive probabilities;
- generic raw system failures;
- autonomous customer/provider actions.

---

## 7. System-awareness caveat

The current raw system-awareness top issue is `system_failures` because the 24-hour failure is Google Ads.

That is the known external Google production-access blocker, not an internal runtime regression.

Therefore generic system-failure recommendations remain excluded until R10 awareness consumes provider-readiness classification.

---

## 8. Parked work

Do not resume automatically:

- commerce completion / Hostinger PHP verified completion emitter;
- PA-1 live identity decision;
- Google/Meta provider approval work;
- Search Indexing activation.

---

## 9. Safety rules

- one controlled checkpoint at a time;
- verify before modifying;
- PostgreSQL remains canonical truth;
- no fake recommendations, outcomes, revenue, conversions or training evidence;
- stale predictive evidence fails safe;
- high-impact actions remain human-governed.
