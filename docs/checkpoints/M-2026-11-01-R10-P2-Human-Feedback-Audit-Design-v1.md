# SalsysOS — R10-P2 Human Feedback Lifecycle UI — Audit & Design V1

**Date:** 2026-11-01  
**Status:** Design locked; implementation not yet started  
**Design baseline main:** `31894ef499d94ee06b0f706e34acb5ecef5452c5`  
**R10-P1 runtime release:** `d5bbe5841e6a4e0f0647b1e1823efc8522fa10da`

## Purpose

R10-P2 adds human-governed lifecycle controls to the deterministic Recommended actions surface introduced in P1.

P2 is intentionally narrow. It does **not** add predictive probabilities, AI-generated recommendation prose, autonomous customer/provider actions, causal outcome claims, a background outcome runner, or an undo/reopen workflow.

The design was derived from a read-only audit of the live production feedback RPC, recommendation/event schema, RLS/grants, P1 presentation route, Home authorization boundary, and existing outcome observer.

---

## 1. Existing production feedback boundary is already sufficient

Production function:

```text
record_system_intelligence_recommendation_feedback_v1(
  p_recommendation_id uuid,
  p_event_type text,
  p_note text default null
) returns boolean
```

Existing security properties:

- `SECURITY DEFINER`;
- authenticated tenant session required;
- tenant derived server-side through `current_tenant_organization_id()`;
- owner/admin/manager role required;
- recommendation must belong to the current tenant;
- row is locked `FOR UPDATE` before transition evaluation;
- event note is trimmed and bounded to 500 characters;
- direct authenticated table privileges on recommendation/event tables remain SELECT-only;
- feedback RPC is executable by authenticated users but still enforces tenant/role internally.

No new lifecycle mutation RPC or table is required for P2 V1.

---

## 2. Canonical lifecycle state machine

The database state constraint allows:

```text
active
accepted
dismissed
acted
expired
```

There is no separate `completed` state. Completion is represented by:

```text
state = acted
AND completed_at IS NOT NULL
```

### Active

Available actions:

```text
Accept
Dismiss
```

### Accepted

Available actions:

```text
Start action
Dismiss
```

Dismissal after acceptance is intentionally legal **only before action has started**. Both the prior accepted event and later dismissed event remain durable history.

### In progress

Canonical shape:

```text
state = acted
acted_at IS NOT NULL
completed_at IS NULL
```

Available action:

```text
Mark complete
```

### Completed

Canonical shape:

```text
state = acted
completed_at IS NOT NULL
```

Terminal in P2 V1. No actions.

### Dismissed

Terminal in P2 V1. No actions.

### Expired

Terminal for that untouched recommendation episode. No feedback actions.

### No undo/reopen

Production exposes no legal reverse transition. P2 V1 must not invent one in the client.

---

## 3. Exact transition behavior and retries

### Accept

Legal only from an untouched active recommendation.

On success:

- event: `accepted`;
- state -> `accepted`;
- `accepted_at = now()`;
- actor stored in event `actor_user_id`;
- `updated_by` records current user.

Retry after acceptance is idempotent and returns success without a duplicate lifecycle event.

### Dismiss

Legal from:

```text
active
accepted
```

Only while action has not started/completed.

On success:

- event: `dismissed`;
- state -> `dismissed`;
- `dismissed_at = now()`.

Retry after dismissal is idempotent.

### Start action

Legal only from accepted state with no dismissal.

On success:

- event: `action_started`;
- state -> `acted`;
- `acted_at = now()`.

Retry after action start is idempotent unless the recommendation has already been completed, in which case production raises `INTELLIGENCE_ACTION_ALREADY_COMPLETED`.

### Mark complete

Legal only from acted/in-progress state.

On success:

- event: `action_completed`;
- state remains `acted`;
- `completed_at = now()`.

Retry after completion is idempotent.

### Database uniqueness

Production has a partial unique lifecycle-event index on:

```text
(recommendation_id, event_type)
```

for:

```text
accepted
dismissed
action_started
action_completed
```

This provides a second database-level guard against duplicate lifecycle events.

---

## 4. Concurrency contract

The feedback RPC locks the recommendation row before evaluating a transition.

Therefore concurrent operator actions serialize against the same authoritative row.

Expected behavior:

- Accept + Accept -> both effectively succeed; one durable accepted event.
- Dismiss + Dismiss -> both effectively succeed; one durable dismissed event.
- Start + Start -> idempotent while incomplete; one durable start event.
- Complete + Complete -> idempotent; one durable completion event.
- Accept racing Dismiss -> order determines legal result; if Accept lands first, later Dismiss is legal because accepted -> dismissed is allowed. If Dismiss lands first, later Accept fails.
- Start racing Dismiss -> whichever legal transition acquires the lock first wins; the other fails closed.
- Complete racing Start -> completed state remains terminal; stale Start must not reopen it.

The client must never override a transition conflict locally. It must re-read and render authoritative state returned by the server.

---

## 5. P1/P2 compatibility issue found in audit

The current P1 presentation route intentionally returns/touches only active recommendations.

Current behavior includes suppression equivalent to:

```text
existing state != active -> do not return recommendation
```

That is correct for P1 but insufficient for P2:

- after Accept, the recommendation becomes `accepted` and would disappear on reload;
- after Start action, it becomes `acted` and would disappear before Mark complete;
- accepted/acted work can remain valid even if the original aggregate CRM signal later clears.

P2 therefore must extend presentation semantics without weakening P1 exposure rules.

---

## 6. Locked presentation model for P2

The Home response contains two recommendation classes.

### A. Fresh active recommendations

These keep the existing P1 flow:

1. evaluate the four observed CRM signals;
2. resolve the current signal episode;
3. touch/persist only eligible active recommendation episodes;
4. record `shown` only for recommendations actually returned for display.

### B. Committed recommendations

Committed work is read from persisted recommendation rows and **must not call touch v2 or create another `shown` event**.

Included shapes:

```text
state = accepted
accepted_at IS NOT NULL
acted_at IS NULL
completed_at IS NULL
dismissed_at IS NULL
```

or:

```text
state = acted
acted_at IS NOT NULL
completed_at IS NULL
dismissed_at IS NULL
```

Committed rows are restricted to the P1 Home recommendation family:

```text
surface = home
source_version = r10-p1
category = crm_operations
role_scope = owner_admin_manager
signal_id in the four approved P1 signals
```

Their persisted action/reason/baseline/target/score evidence is displayed as the historical context that was accepted. The row is not silently rewritten after human commitment.

### Signal clear behavior

When the current aggregate signal clears:

- untouched active recommendation may expire through the existing episode resolver;
- accepted or acted work remains committed until dismissed/completed.

### Later genuine recurrence

A later clear -> recur cycle may create a new active recommendation episode even if an older committed episode remains unfinished.

P2 must not silently merge or rewrite separate historical episodes. If both exist, both may be shown with distinct lifecycle badges/episode numbers.

---

## 7. Presentation race handling

A lifecycle transition may occur between the present route's state read and its active touch RPC.

The P1 hardening RPC can then raise:

```text
INTELLIGENCE_EPISODE_TERMINAL
```

In P2 this is **not** treated as generic signal unavailability.

Required behavior:

1. do not create another `shown` event;
2. re-read current lifecycle state;
3. if it is now accepted or acted/incomplete, return it through the committed-work path;
4. if dismissed/completed/expired, omit it;
5. reserve partial-unavailable UI for genuine candidate/episode/database failures.

---

## 8. New server feedback endpoint

P2 adds a dedicated authenticated endpoint:

```text
POST /api/intelligence/recommendations/feedback
```

Request shape:

```json
{
  "recommendationId": "uuid",
  "eventType": "accepted | dismissed | action_started | action_completed",
  "note": "optional text <= 500 chars"
}
```

Server responsibilities:

1. same-origin request guard;
2. authenticated user required;
3. derive active workspace server-side;
4. require owner/admin/manager;
5. validate recommendation id / event allowlist / note length;
6. call `record_system_intelligence_recommendation_feedback_v1`;
7. re-read the authoritative recommendation row;
8. return normalized lifecycle state + timestamps + legal next actions;
9. use `Cache-Control: private, no-store`.

The client does not mutate recommendation tables directly.

### Error mapping

Expected HTTP semantics:

```text
400  malformed id / unsupported event / note too long
401  unauthenticated / missing workspace
403  invalid origin or non-privileged role
404  recommendation not found in active tenant
409  legal-state conflict / stale transition / action already completed
503  unexpected database/RPC availability failure
```

For a 409, the endpoint should attempt to return the latest authoritative lifecycle snapshot so the client can reconcile without guessing.

---

## 9. Normalized UI lifecycle model

The UI should derive one of:

```text
active
accepted
in_progress
completed
dismissed
expired
```

from canonical database columns.

Precedence:

1. dismissed if `dismissed_at` / state dismissed;
2. completed if `completed_at` non-null;
3. in_progress if `acted_at` non-null;
4. accepted if `accepted_at` non-null;
5. expired if state expired;
6. otherwise active.

This avoids incorrectly treating all `state=acted` rows as unfinished.

---

## 10. Card UX contract

### Active card

Badge:

```text
Recommended
```

Controls:

```text
Accept
Dismiss
Open work queue
```

### Accepted card

Badge:

```text
Accepted
```

Controls:

```text
Start action
Dismiss
Open work queue
```

### In-progress card

Badge:

```text
In progress
```

Controls:

```text
Mark complete
Open work queue
```

### Completed / Dismissed local success state

After a successful terminal action, the current client may show the terminal badge/confirmation until the next presentation refresh/page load.

On a fresh presentation request, completed/dismissed/expired cards are not returned.

### Navigation is separate from lifecycle mutation

`Open work queue` remains a normal navigation link.

Accept / Start / Complete do **not** automatically send messages, change Lead stage, move money, enroll a student, call a provider API, or navigate the user.

`Start action` means only: **the human operator records that work on this recommendation has begun**.

---

## 11. Note policy

The existing lifecycle event supports one optional `note` <= 500 chars.

P2 V1 uses it conservatively:

- Accept: no note prompt.
- Start action: no note prompt.
- Dismiss: optional human rationale.
- Mark complete: optional workflow completion note.

Notes are immutable lifecycle annotations in V1; there is no edit workflow.

Completion copy must explicitly state:

> Marking this recommendation complete closes the workflow. It does not claim that the customer or business outcome was successful.

No note is interpreted as structured outcome evidence, model training truth, or causal attribution.

---

## 12. Actor/timestamp audit evidence

Production already records:

- lifecycle event `actor_user_id`;
- lifecycle event `created_at`;
- recommendation `accepted_at`;
- recommendation `dismissed_at`;
- recommendation `acted_at`;
- recommendation `completed_at`;
- recommendation `updated_by`.

P2 V1 does not need an additional audit table.

The UI may display lifecycle timestamps. Actor display by human-readable name is not required for P2 V1; durable actor identity remains in the event ledger.

---

## 13. P3 boundary remains unchanged

The existing outcome observer begins temporal observation from:

```text
acted_at
```

not from `completed_at`.

That means:

- **Start action** establishes the operational intervention timestamp used by later P3 observation;
- **Mark complete** closes the human recommendation workflow;
- completion does not itself claim a positive result;
- observed downstream changes remain temporal evidence, not causal attribution.

P2 must not modify the outcome observer or run it.

---

## 14. No production schema migration required for P2 V1

The audited production schema already has:

- required lifecycle timestamps;
- actor lineage;
- event notes;
- unique lifecycle-event guards;
- tenant linkage;
- role-guarded feedback RPC;
- RLS read boundaries.

P2 implementation should therefore be application/API + regression-contract work only unless implementation uncovers a new verified invariant gap.

Do not add a migration merely to rename `acted` to `completed` or create reversible states.

---

## 15. Regression / acceptance contract

P2 is complete only when all of the following hold:

1. no new direct client table mutation path is introduced;
2. feedback endpoint independently verifies auth, workspace, role and same-origin;
3. endpoint event allowlist is exactly the four audited lifecycle events;
4. optional note is bounded to 500 characters;
5. active card exposes only Accept/Dismiss;
6. accepted card exposes only Start action/Dismiss;
7. in-progress card exposes only Mark complete;
8. completed/dismissed/expired cards expose no lifecycle mutation;
9. idempotent retries are treated as successful authoritative state refreshes;
10. stale/concurrent transition conflicts fail closed and re-read authoritative state;
11. accepted/acted incomplete work remains visible across Home reloads;
12. committed work is read without another `shown` event;
13. P1 active recommendations still record `shown` only when actually returned;
14. terminal-touch race is reconciled as lifecycle state, not generic unavailable evidence;
15. signal clear expires only untouched active recommendations; committed work persists;
16. separate genuine episodes are never silently merged;
17. work-queue navigation remains separate from feedback mutation;
18. completion copy does not claim outcome success;
19. P3 observer / learning runner remain untouched;
20. no fake recommendation rows, events, outcomes or user actions are inserted to make acceptance green;
21. existing factual Home Attention / Action Queue remain unchanged;
22. CI, CodeQL, Production Smoke and exact production deployment provenance pass.

---

## 16. Implementation sequence

1. add shared lifecycle normalization/types/config used by presentation + feedback UI;
2. extend presentation response to include lifecycle/timestamps and committed accepted/acted-incomplete rows without touching them;
3. handle `INTELLIGENCE_EPISODE_TERMINAL` race by authoritative re-read;
4. add authenticated feedback POST endpoint wrapping the existing RPC;
5. add card controls + pending/error/terminal UI states;
6. add optional Dismiss / Mark complete note confirmation UI;
7. add/extend static regression verifier and CI contract;
8. run full build/security gates;
9. deploy and verify without fabricating production lifecycle events;
10. update closeout docs only after release acceptance.

## Decision

**R10-P2 audit/design is locked. Implementation may begin against this contract.**
