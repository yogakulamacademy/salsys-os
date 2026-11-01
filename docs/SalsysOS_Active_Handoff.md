# SalsysOS Active Handoff

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production head:** `1daf2c6d019a3cc8c899bc9d8d0c996ceee64e21`

Read first:

1. `docs/SalsysOS_Current_Checkpoint.md`
2. `docs/checkpoints/M-2026-11-01-R10-P0-Recommendation-Hardening-Closeout-v1.md`
3. `docs/checkpoints/M-2026-11-01-R10-Audit-Design-v1.md`

Historical checkpoint files are immutable evidence records.

---

## 1. Exact continuation point

**R10-P1 — Deterministic Recommended Actions on Command Center — Episode Design & Implementation**

P0 security/provenance hardening is complete and production-verified. Do not reopen P0 unless a regression is observed.

---

## 2. P0 release

```text
PR                         #410
main SHA                   1daf2c6d019a3cc8c899bc9d8d0c996ceee64e21
CI                         #1342 passed
CodeQL                     #627 passed
Production Smoke           #159 passed
Vercel production          READY on exact SHA
Supabase migration         20261101151403 / r10_recommendation_security_hardening_v1
```

Post-deploy:

```text
recommendations                    0
recommendation_events              0
orphan_or_tenant_mismatch_rows     0
authenticated table privileges     SELECT only
```

---

## 3. Hardened recommendation boundary

Live production now has:

- composite recommendation/event tenant FK;
- explicit event RLS tenant check;
- target Lead array <= 500;
- target count/cardinality equality;
- lifecycle idempotency unique index;
- owner/admin/manager-only v2 recommendation creation;
- owner/admin/manager-only feedback;
- service-role-only outcome observer;
- fail-closed lifecycle transitions;
- no app-role access to legacy v1 creator.

No recommendation rows were created during P0.

---

## 4. P1 allowed signals

Use only fresh observed CRM facts:

- reply backlog;
- overdue follow-ups;
- first touch needed;
- payment pending.

Keep the existing factual Attention cards unchanged and render recommendations in a separate Recommended actions layer.

Exclude stale predictions, unready predictive probabilities, generic raw system failures, browser-only commerce claims and autonomous actions.

---

## 5. Episode-key design is the next immediate task

The hardened v2 touch RPC upserts by `recommendation_key` and records `shown` on every call.

Before any P1 code, define a deterministic episode key for each signal that guarantees:

- repeated Home loads reuse the same unresolved episode;
- dismissed/completed records are never reopened by touching the same key;
- a new episode is created only after genuine clear/recur behavior or a deterministic new episode fingerprint;
- target Lead changes do not rewrite terminal history;
- `shown` means actually presented to a privileged user.

Preferred shape:

`signal + deterministic episode fingerprint`

Fingerprint inputs should come only from observed CRM facts and be hashed server-side.

Audit available timestamps/IDs for all four signals before locking the exact formula.

---

## 6. Authorization / generation flow

`/home` already requires `owner | admin | manager`.

P1 flow:

1. privileged user requests `/home`;
2. server derives tenant;
3. server evaluates four CRM signals;
4. server computes current episode keys;
5. only recommendations actually displayed call hardened v2 touch;
6. page renders current recommendation rows separately from factual Attention cards.

No background recommendation generator in P1.

---

## 7. Later checkpoints

- P2: Accept / Dismiss / Start / Complete UI through hardened feedback RPC.
- P3: service-role outcome observation + learning runner.
- Predictive model activation remains gated by real outcome history.

---

## 8. Parked work

Do not resume automatically:

- commerce completion / Hostinger PHP emitter;
- PA-1 live identity decision;
- Google/Meta provider approval;
- Search Indexing activation.

---

## 9. Safety rules

- verify before modifying;
- one checkpoint at a time;
- no fake recommendation/outcome evidence;
- no predictive probabilities while readiness is blocked;
- no autonomous high-impact action;
- PostgreSQL remains canonical truth.
