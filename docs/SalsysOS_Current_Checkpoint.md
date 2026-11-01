# SalsysOS Current Checkpoint

**Checkpoint date:** 2026-11-01  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production head:** `5162d40f324ec79157c0db24ff2c303ef325ea62`  
**Fast resume file:** `docs/SalsysOS_Active_Handoff.md`

> Historical checkpoint files under `docs/checkpoints/` are immutable evidence records.

---

## 1. Current position

SalsysOS is a **Sales + Analysis Operating System**.

Current state:

- broad 14-surface engineering closeout: complete;
- R9 AEO / GEO / AI Visibility V1: formally closed;
- R10 audit/design: complete;
- R10-P0 Recommendation Security & Reproducibility Hardening: complete and production-verified;
- R10-P1 Deterministic Recommended Actions on Command Center: complete and production-verified;
- **R10-P2 Human Feedback Lifecycle UI: complete, merged, deployed and production-verified**;
- current exact checkpoint: **R10-P3 — Observed Outcome & Learning Runner — audit/design before implementation**.

Read first:

- `docs/checkpoints/M-2026-11-01-R10-P2-Human-Feedback-Closeout-v1.md`
- `docs/checkpoints/M-2026-11-01-R10-P2-Human-Feedback-Audit-Design-v1.md`
- `docs/checkpoints/M-2026-11-01-R10-P1-Closeout-v1.md`
- `docs/checkpoints/M-2026-11-01-R10-P0-Recommendation-Hardening-Closeout-v1.md`

---

## 2. R10-P2 verified release

```text
Design PR                  #416
Implementation PR          #417
main SHA                   5162d40f324ec79157c0db24ff2c303ef325ea62
pre-merge CI               #1359 passed
pre-merge CodeQL           #644 passed
post-merge CI              #1360 passed
post-merge CodeQL          #645 passed
Production Smoke           #166 passed
Vercel production          READY on exact main SHA
```

No P2 schema migration was required.

---

## 3. P2 runtime boundary

The Home Recommended actions layer now supports:

```text
active                    -> Accept | Dismiss
accepted                  -> Start action | Dismiss
acted + completed_at null -> Mark complete
acted + completed_at set  -> terminal
```

Dismissed and expired records are terminal. No undo/reopen was introduced.

P2 uses the existing hardened `record_system_intelligence_recommendation_feedback_v1` RPC as canonical lifecycle authority.

The new feedback API:

```text
POST /api/intelligence/recommendations/feedback
```

preserves:

- same-origin mutation boundary;
- authenticated owner/admin/manager access;
- server-derived tenant/workspace authority;
- event allowlist and <=500-character optional note;
- database row locking/idempotent transition semantics;
- authoritative lifecycle re-read after mutation;
- private/no-store responses;
- no browser-direct recommendation/event table mutation.

---

## 4. P1 exposure semantics remain locked

Fresh active recommendations still create `shown` evidence only when actually presented.

Accepted and acted-but-incomplete recommendations are read back as committed work without another touch/shown event.

Committed work remains visible across reloads and if the original aggregate signal clears.

A genuine later clear -> recur episode may coexist separately. Historical committed episodes are never silently merged or rewritten.

Terminal-touch races are reconciled by authoritative lifecycle re-read rather than reported as generic signal failure.

---

## 5. Production acceptance remained evidence-neutral

Final read-only verification after P2 merge:

```text
recommendations                    0
recommendation_events              0
lifecycle feedback events          0
signal_state_rows                  0
feedback RPC                       present
authenticated recommendation privileges  SELECT only
authenticated event privileges           SELECT only
```

No synthetic operator presentation or feedback event was executed.

---

## 6. P3 boundary

Existing outcome observation begins from `acted_at` / Start action, not from workflow completion.

That distinction remains locked:

- Start action = operational intervention timestamp;
- Mark complete = workflow closure;
- later downstream CRM/payment/enrollment facts = temporal association only;
- no causal attribution claim;
- no trained conversion probability activation.

P2 did not run or schedule the observer.

---

## 7. Exact next checkpoint — R10-P3 audit/design

Audit the existing outcome/learning stack **read-only first** before adding any runner or cron.

The audit must verify:

1. `observe_system_intelligence_recommendation_outcomes_v1(...)` exact behavior;
2. learning-profile recomputation functions and grants;
3. service-role and tenant execution model;
4. recommendation/event evidence volume and readiness;
5. idempotency / duplicate-observation behavior;
6. organization fan-out and scheduling design;
7. failure logging, health visibility and recovery semantics;
8. non-causal evidence wording and evidence-class separation;
9. minimum real evidence needed before effectiveness/learning UI can be promoted;
10. regressions preventing fake outcome evidence or predictive promotion.

Do **not** activate a scheduler or execute the observer until this design is locked.

---

## 8. Parked boundaries

Do not resume automatically:

- predictive model promotion;
- commerce completion / Hostinger PHP emitter;
- PA-1 live identity decision;
- Google/Meta provider approval;
- Search Indexing activation.

---

## 9. Locked engineering rules

- one controlled checkpoint at a time;
- verify before modifying;
- tenant authority is server-derived;
- PostgreSQL remains canonical truth;
- OpenSearch remains derived/rebuildable;
- observed/deterministic/inferred/modelled evidence remains distinct;
- no fake recommendations, feedback, outcomes, conversions, revenue or training evidence;
- high-impact actions remain human-governed;
- temporal observation must not be presented as causal attribution.

---

## 10. Resume instruction

1. read `docs/SalsysOS_Active_Handoff.md`;
2. read the P2 closeout checkpoint;
3. verify current `main`, Supabase and Vercel provenance;
4. audit the existing P3 observer/learning functions and current evidence counts read-only;
5. finalize the P3 runner/scheduling/evidence contract;
6. only then implement P3;
7. do not activate predictive promotion during P3 unless separately justified by real evidence.
