# SalsysOS Active Handoff

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production head:** `d5bbe5841e6a4e0f0647b1e1823efc8522fa10da`

Read first:

1. `docs/SalsysOS_Current_Checkpoint.md`
2. `docs/checkpoints/M-2026-11-01-R10-P1-Closeout-v1.md`
3. `docs/checkpoints/M-2026-11-01-R10-P1-Episode-Design-v1.md`
4. `docs/checkpoints/M-2026-11-01-R10-P0-Recommendation-Hardening-Closeout-v1.md`

Historical checkpoint files are immutable evidence records.

---

## 1. Exact continuation point

**R10-P2 — Human Feedback Lifecycle UI — audit/design before implementation**

R10-P1 deterministic Command Center recommendations are complete, acceptance-hardened and production-verified. Do not reopen P1 unless a regression is observed.

---

## 2. P1 final release

```text
Implementation PR           #413
Acceptance-hardening PR     #414
main SHA                    d5bbe5841e6a4e0f0647b1e1823efc8522fa10da
CI                          #1354 passed
CodeQL                      #639 passed
Production Smoke            #163 passed
Vercel production           READY on exact SHA
```

Supabase production migrations:

```text
20261101153414  r10_command_center_recommendation_episodes_v1
20261101155326  r10_command_center_recommendation_acceptance_hardening_v1
```

Source files are aligned to those exact ledger versions and protected by normalized MD5 checks.

---

## 3. P1 live boundary

The `/home` Recommended actions layer now uses only observed deterministic CRM signals:

- reply backlog;
- overdue follow-ups;
- first touch needed;
- payment pending.

Important runtime properties:

- owner/admin/manager only;
- server-derived tenant;
- POST/private-no-store presentation;
- persistent clear/recur episode state;
- stable episode key during target churn;
- working target set <= 50 Leads;
- full signal baseline retained;
- canonical admissions `priority_score` reused for ordering;
- priority is not probability/confidence;
- terminal episode keys cannot be touched/shown again;
- partial signal failures preserve already-persisted successful presentations and are disclosed in UI;
- no AI-generated recommendation prose;
- no predictive conversion probability;
- no autonomous customer/provider action.

Existing factual Home Attention / Action Queue surfaces remain unchanged.

---

## 4. Evidence state at P1 closeout

No synthetic operator presentation was run.

```text
recommendations                    0
recommendation_events              0
signal_state_rows                  0
```

This is intentional. Real recommendation evidence begins only when a real privileged operator actually presents the production surface.

Authenticated direct table privileges on recommendation and recommendation-event tables remain SELECT-only.

---

## 5. Live parity snapshot at closeout

At the final read-only production check:

```text
Home needs reply / P1 reply backlog        575
Home follow-ups due / P1 overdue            22
Home first touch / P1 first touch            0
Home payment pending / P1 payment pending    9
```

These are live operational counts and will change with real activity.

---

## 6. P2 immediate task

Audit the existing hardened feedback RPC and lifecycle tables **read-only first**.

P2 intends to expose four human-governed controls:

- Accept;
- Dismiss;
- Start action;
- Mark complete.

Before code, lock:

1. valid transitions from each recommendation state;
2. terminal vs reversible actions;
3. idempotent retry semantics;
4. actor/timestamp/audit evidence;
5. optional reason/evidence fields without fabricating data;
6. stale-state and concurrent-operator behavior;
7. owner/admin/manager authorization and tenant binding;
8. UI states for success, conflict, terminal record and unavailable RPC;
9. separation between work-queue navigation and lifecycle feedback;
10. regression contracts preserving P1 episode/presentation semantics.

Do not add P2 buttons until this design is finalized.

---

## 7. Later checkpoint

P3 remains later:

- service-role observed outcome runner;
- downstream CRM/payment/enrollment evidence only;
- learning-profile recomputation;
- no causal-attribution claim from temporal observation alone.

Predictive model activation remains separately gated by sufficient real labeled outcomes.

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
- PostgreSQL remains canonical truth;
- deterministic evidence must remain distinct from inferred/modelled evidence.
