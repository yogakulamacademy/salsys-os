# SalsysOS Active Handoff

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**R10-P1 verified runtime release:** `d5bbe5841e6a4e0f0647b1e1823efc8522fa10da`  
**Latest docs merge before P2 design:** `31894ef499d94ee06b0f706e34acb5ecef5452c5`

Read first:

1. `docs/SalsysOS_Current_Checkpoint.md`
2. `docs/checkpoints/M-2026-11-01-R10-P2-Human-Feedback-Audit-Design-v1.md`
3. `docs/checkpoints/M-2026-11-01-R10-P1-Closeout-v1.md`
4. `docs/checkpoints/M-2026-11-01-R10-P1-Episode-Design-v1.md`

Historical checkpoint files are immutable evidence records.

---

## 1. Exact continuation point

**R10-P2 — Human Feedback Lifecycle UI — implementation against locked design**

P2 audit/design is complete. Do not redesign the state machine during implementation unless a new verified invariant gap is found.

---

## 2. Existing lifecycle to reuse

Production already provides the hardened RPC:

```text
record_system_intelligence_recommendation_feedback_v1(id,event,note)
```

Security/consistency:

- authenticated tenant required;
- tenant derived server-side;
- owner/admin/manager required;
- row locked before transition;
- recommendation must belong to tenant;
- lifecycle retries are idempotent;
- unique lifecycle event per recommendation/event type;
- actor/timestamp stored in event ledger;
- optional note <= 500 chars.

No new lifecycle schema is required for P2 V1.

---

## 3. Locked lifecycle UI states

```text
active                    -> Accept | Dismiss
accepted                  -> Start action | Dismiss
acted + completed_at null -> Mark complete
acted + completed_at set  -> Completed / no actions
dismissed                 -> no actions
expired                   -> no actions
```

There is no `completed` database state. Completion is derived from `completed_at`.

No undo/reopen in P2 V1.

---

## 4. Critical P1/P2 integration rule

Current P1 presentation returns/touches active recommendations only.

P2 must additionally return committed unfinished work:

```text
accepted + not dismissed/acted/completed
acted + not dismissed/completed
```

Committed work:

- is read from persisted recommendation rows;
- is not touched again;
- does not create another `shown` event;
- persists across Home reloads;
- persists if the original aggregate signal clears;
- keeps the evidence snapshot from the recommendation that the human accepted.

A later genuine clear -> recur episode may coexist as a separate new active recommendation. Do not merge history.

If active touch hits `INTELLIGENCE_EPISODE_TERMINAL` due a concurrent feedback transition, re-read lifecycle state instead of reporting generic unavailable evidence.

---

## 5. Feedback endpoint to build

```text
POST /api/intelligence/recommendations/feedback
```

Body:

```text
recommendationId
accepted | dismissed | action_started | action_completed
optional note <= 500
```

Required server behavior:

- same-origin guard;
- authenticated user;
- current workspace resolution;
- owner/admin/manager check;
- event/note validation;
- call existing feedback RPC;
- re-read authoritative recommendation state;
- return normalized lifecycle + timestamps + legal next actions;
- private/no-store response.

Expected error semantics:

```text
400 invalid input
401 auth/workspace missing
403 origin/role denied
404 recommendation not found
409 stale/invalid transition
503 unexpected data-layer failure
```

---

## 6. Card UX

Active:

```text
Accept
Dismiss
Open work queue
```

Accepted:

```text
Start action
Dismiss
Open work queue
```

In progress:

```text
Mark complete
Open work queue
```

Dismiss and Mark complete may collect an optional workflow note.

Completion message must state that marking workflow complete does not claim the business/customer outcome succeeded.

`Open work queue` is navigation. Feedback buttons do not execute external/customer/provider actions.

---

## 7. P3 remains out of scope

Existing outcome observation begins from `acted_at`.

Do not modify or run the P3 observer/learning runner during P2.

No causal-attribution claim is added by P2.

---

## 8. Implementation order

1. shared lifecycle helpers/types;
2. committed-work support in presentation response;
3. terminal-touch race reconciliation;
4. feedback POST endpoint;
5. lifecycle controls + note confirmation UI;
6. authoritative conflict/error handling;
7. P2 verifier and CI contract;
8. release gates;
9. production acceptance without synthetic feedback events;
10. P2 closeout docs.

---

## 9. Safety rules

- no new schema unless a verified invariant gap appears;
- no fake recommendation/feedback/outcome evidence;
- no predictive probabilities;
- no autonomous external action;
- tenant authority remains server-derived;
- PostgreSQL remains canonical truth;
- preserve P1 `shown` semantics exactly.
