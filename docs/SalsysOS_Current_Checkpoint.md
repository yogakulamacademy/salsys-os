# SalsysOS Current Checkpoint

**Checkpoint date:** 2026-11-01  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production head:** `d5bbe5841e6a4e0f0647b1e1823efc8522fa10da`  
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
- **R10-P1 Deterministic Recommended Actions on Command Center: complete, acceptance-hardened and production-verified**;
- current exact checkpoint: **R10-P2 — Human Feedback Lifecycle UI — audit/design before implementation**.

Read first:

- `docs/checkpoints/M-2026-11-01-R10-P1-Closeout-v1.md`
- `docs/checkpoints/M-2026-11-01-R10-P1-Episode-Design-v1.md`
- `docs/checkpoints/M-2026-11-01-R10-P0-Recommendation-Hardening-Closeout-v1.md`
- `docs/checkpoints/M-2026-11-01-R10-Audit-Design-v1.md`

---

## 2. R10-P1 verified release

Implementation PR #413 introduced the deterministic Command Center recommendation surface. Acceptance-hardening PR #414 closed the remaining scoring, presentation-consistency and provenance gaps.

Final production release:

```text
PR                         #414
main SHA                   d5bbe5841e6a4e0f0647b1e1823efc8522fa10da
CI                         #1354 passed
CodeQL                     #639 passed
Production Smoke           #163 passed
Vercel production          READY on exact SHA
```

Production migrations:

```text
20261101153414  r10_command_center_recommendation_episodes_v1
20261101155326  r10_command_center_recommendation_acceptance_hardening_v1
```

Both migration source files are aligned to their production ledger versions and protected by normalized MD5 verification.

P0 source provenance is also aligned to the actual production version:

```text
20261101151403  r10_recommendation_security_hardening_v1
```

---

## 3. P1 production acceptance

The live `/home` Command Center now has a separate **Recommended actions** layer using only four approved deterministic CRM signals:

1. reply backlog;
2. overdue follow-ups;
3. first touch needed;
4. payment pending.

The existing factual Attention / Action Queue surfaces remain unchanged.

P1 behavior now enforces:

- owner/admin/manager presentation boundary;
- tenant authority derived server-side;
- authenticated POST presentation boundary with private/no-store response;
- persistent per-signal episode state;
- stable episode keys across target membership churn;
- a new episode only after an observed clear -> recur transition;
- target working set capped at 50 Leads while the baseline retains the full signal count;
- canonical deterministic admissions `priority_score` reused for ordering;
- no invented 95/90/85/80 recommendation scoring scale;
- priority explicitly presented as ordering evidence, not probability/confidence;
- terminal recommendation keys cannot be touched/shown again;
- partial per-signal failures do not discard already-persisted successful presentations;
- partial availability is disclosed in the UI;
- no predictive probabilities, stale prediction sources, AI-generated recommendation prose or autonomous external actions.

Post-deploy database acceptance remained intentionally evidence-neutral:

```text
recommendations                    0
recommendation_events              0
signal_state_rows                  0
```

These zeroes are valid because no synthetic operator presentation was executed. Real evidence should be created only when a real privileged operator actually presents the production surface.

Authenticated direct table access remains SELECT-only for recommendation and recommendation-event tables.

---

## 4. Live candidate parity at closeout

A read-only production parity check after hardening showed the P1 deterministic candidate baselines matched the canonical Home metrics at the time of verification:

```text
reply backlog / needs reply         575
follow-ups due                       22
first touch needed                    0
payment pending                       9
```

Observed max canonical priority scores for active candidate families at that moment:

```text
reply backlog                        47
overdue follow-ups                   68
payment pending                      40
```

These are live operating facts, not fixtures. Counts may change with real CRM activity.

---

## 5. Predictive safety boundary remains locked

R10-P1 is deterministic operational guidance. It does **not** activate a trained conversion model.

Do not publish conversion probabilities or reinterpret deterministic priority scores as probability/confidence while predictive readiness remains blocked by insufficient real labeled outcomes.

No fake outcomes, conversions, revenue or training evidence may be created to satisfy readiness gates.

---

## 6. Exact next checkpoint — R10-P2 audit/design

Before adding feedback controls, audit the existing recommendation lifecycle and hardened feedback RPC against the desired human workflow:

- Accept;
- Dismiss;
- Start action;
- Mark complete.

The P2 audit must verify, read-only first:

1. exact legal lifecycle transitions and terminal states;
2. retry/idempotency behavior for every action;
3. owner/admin/manager authorization and server-derived tenant binding;
4. how accepted/started/completed timestamps and actors are recorded;
5. how dismissal reasons or completion evidence should be represented without inventing evidence;
6. how the UI handles stale recommendation state / concurrent operator actions;
7. which actions are reversible, if any, and which remain terminal;
8. how navigation/work-queue actions remain separate from recommendation lifecycle feedback;
9. what P2 must expose to P3 without claiming causal outcome attribution;
10. regression tests needed to preserve the P1 episode/presentation contract.

Do **not** implement P2 controls until this audit/design is locked.

---

## 7. Later R10 checkpoint

After P2:

- **R10-P3 — Observed Outcome & Learning Runner**: service-role scheduled observation of downstream CRM/payment/enrollment evidence and learning-profile recomputation.

Predictive model promotion remains separately gated by sufficient real outcome evidence.

---

## 8. Parked boundaries

Do not resume automatically:

- commerce completion / Hostinger PHP verified completion emitter;
- PA-1 live identity decision;
- Google/Meta provider approval work;
- Search Indexing activation.

Do not create fake data to make any parked boundary green.

---

## 9. Locked engineering rules

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

## 10. Resume instruction

1. read `docs/SalsysOS_Active_Handoff.md`;
2. read the R10-P1 closeout and episode-design checkpoints;
3. verify current `main`, Supabase and Vercel provenance;
4. audit the current feedback RPC/lifecycle schema and existing recommendation UI read-only;
5. finalize the R10-P2 human-feedback state/UX contract;
6. only then implement P2;
7. do not start P3 outcome observation or predictive promotion during P2.
