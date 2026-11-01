# SalsysOS Current Checkpoint

**Checkpoint date:** 2026-11-01  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production head:** `1daf2c6d019a3cc8c899bc9d8d0c996ceee64e21`  
**Fast resume file:** `docs/SalsysOS_Active_Handoff.md`

> Historical checkpoint files under `docs/checkpoints/` are immutable evidence records.

---

## 1. Current position

SalsysOS is a **Sales + Analysis Operating System**.

Current state:

- broad 14-surface engineering closeout: complete;
- R9 AEO / GEO / AI Visibility V1: formally closed;
- R10 audit/design: complete;
- **R10-P0 Recommendation Security & Reproducibility Hardening: complete and production-verified**;
- current exact checkpoint: **R10-P1 — Deterministic Recommended Actions on Command Center — Episode Design & Implementation**.

Read first:

- `docs/checkpoints/M-2026-11-01-R10-P0-Recommendation-Hardening-Closeout-v1.md`
- `docs/checkpoints/M-2026-11-01-R10-Audit-Design-v1.md`

---

## 2. R10-P0 verified release

Engineering PR #410:

```text
main SHA                   1daf2c6d019a3cc8c899bc9d8d0c996ceee64e21
CI                         #1342 passed
CodeQL                     #627 passed
Production Smoke           #159 passed
Vercel production          READY on exact SHA
```

Production migration:

```text
version                    20261101151403
name                       r10_recommendation_security_hardening_v1
repository file            20261101154500_r10_recommendation_security_hardening_v1.sql
```

Eight historical recommendation-lifecycle migrations are also restored in source control and protected by production-ledger MD5 verification.

---

## 3. P0 production acceptance

Current recommendation evidence remains intentionally empty:

```text
recommendations                    0
recommendation_events              0
orphan_or_tenant_mismatch_rows     0
```

Production now enforces:

- composite recommendation/event tenant FK;
- explicit event RLS tenant comparison;
- target Lead array <= 500;
- target count equals stored target array cardinality;
- single accepted/dismissed/action_started/action_completed lifecycle event per recommendation;
- authenticated table access = SELECT only;
- legacy v1 creator inaccessible to app roles;
- v2 creator = SECURITY DEFINER + owner/admin/manager + session-derived tenant + target Lead tenant validation;
- feedback RPC = SECURITY DEFINER + owner/admin/manager + fail-closed transitions + idempotent retry behavior;
- outcome observer = service-role-only machine boundary.

No recommendation UI or recommendation data was activated during P0.

---

## 4. Predictive safety boundary remains locked

Production still does not have enough outcome history for a defensible trained lead-conversion model:

```text
total_leads                         603
labeled_outcomes                      1
positive_outcomes                     1
negative_outcomes                     0
prediction_generation_allowed         false
predictive_readiness_status           insufficient_positive_outcomes
```

Do not publish conversion probabilities or treat the deterministic event-intelligence rows as trained predictions.

---

## 5. Exact next checkpoint — R10-P1

Build a separate **Recommended actions** layer on `/home` using only fresh, directly observed CRM operating facts:

1. reply backlog;
2. overdue follow-ups;
3. first touch needed;
4. payment pending.

Existing factual Attention cards remain unchanged.

Exclude from P1:

- stale event-intelligence predictions;
- unready predictive probabilities;
- generic raw system-failure counts;
- browser-only payment/enrollment/revenue claims;
- AI-generated recommendation prose;
- autonomous external/customer/provider actions.

Recommendation scores are deterministic priority scores, not probabilities or confidence values.

---

## 6. P1 episode-key contract must be finalized before code

`touch_system_intelligence_recommendation_v2` upserts by `(organization_id, recommendation_key)` and records `shown` on every call.

Therefore P1 must guarantee:

- a terminal dismissed/completed recommendation is never touched back into the same episode;
- repeated Home loads show/refresh the same unresolved episode rather than create duplicates;
- a new recommendation episode is created only when the underlying CRM condition genuinely clears and later recurs, or when a deterministic episode fingerprint changes;
- `shown` is recorded only for recommendations actually rendered on the privileged Command Center request;
- target Lead membership/fingerprint changes do not silently rewrite historical terminal episodes.

Preferred design direction: derive a deterministic episode fingerprint from the live signal + bounded target Lead set + signal-specific boundary timestamp/state, hash it server-side, and use that fingerprint in the recommendation key. The exact signal-specific boundary rules must be verified against available CRM timestamps before implementation.

---

## 7. P1 authorization/product boundary

`/home` already requires:

`owner | admin | manager`

P1 should preserve that boundary.

Generation/presentation flow:

1. privileged user requests `/home`;
2. server derives active tenant;
3. server evaluates the four deterministic CRM signals;
4. server resolves the current episode key;
5. only recommendations actually rendered call hardened v2 touch;
6. page reads/render current recommendation rows in a clearly labeled Recommended actions panel.

No background generator is needed for P1.

---

## 8. Later R10 checkpoints

After P1:

- **R10-P2 — Human Feedback Lifecycle UI**: Accept / Dismiss / Start action / Mark complete through the hardened RPC;
- **R10-P3 — Observed Outcome & Learning Runner**: service-role scheduled observation of downstream CRM/payment/enrollment evidence and learning-profile recomputation.

Predictive model promotion remains separately gated by real outcome evidence.

---

## 9. Parked boundaries

Do not resume automatically:

- commerce completion / Hostinger PHP verified completion emitter;
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
2. read the P0 closeout and R10 audit/design checkpoints;
3. verify current `main`, Supabase and Vercel provenance;
4. audit the timestamps/IDs needed for the four P1 episode fingerprints;
5. finalize the P1 episode-key contract;
6. only then implement P1;
7. do not add feedback buttons or outcome runners until their own checkpoints.
