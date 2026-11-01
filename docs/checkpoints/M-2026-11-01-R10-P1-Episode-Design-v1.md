# SalsysOS — R10-P1 Deterministic Recommended Actions — Episode Design V1

**Date:** 2026-11-01  
**Prerequisite:** R10-P0 complete  
**Production baseline SHA before P1:** `b2c6cf76a0e563be13b00866ae648e4b67d1fb72`

## Purpose

Lock the episode, evidence, target-selection and presentation semantics before implementing the first production recommendation surface.

P1 remains deterministic and evidence-first. It does not activate predictive conversion probabilities, AI-generated recommendation prose, autonomous external actions or recommendation feedback controls.

## Canonical recommendation signals

P1 mirrors the current Command Center facts rather than creating a second operating model.

### 1. Needs reply

Canonical condition:

`v_lead_inbox_attention.needs_reply = true`

Signal timestamp:

`last_inbound_at`, with `latest_message_at` only as a defensive fallback.

Home baseline value is the same count used by the dashboard snapshot.

### 2. Overdue follow-ups

Canonical source:

`v_followups_due`

Signal timestamp:

`due_at`

Home baseline value is the count of overdue follow-up task rows. Recommendation targets are deduplicated Lead IDs ordered by earliest overdue due time.

### 3. First touch needed

Canonical condition from the Home snapshot:

```text
current_stage = new
AND latest_message_at IS NULL
AND last_contacted_at IS NULL
```

Signal timestamp:

Lead `created_at`.

### 4. Payment pending

Canonical condition:

`current_stage = payment_pending`

Signal timestamp:

latest `lead_stage_history.changed_at` entering `payment_pending`, with Lead `created_at` only as a defensive fallback.

## Current observed Home baseline

At design time, the canonical Home snapshot reports:

```text
needs_reply          574
overdue_followups     22
first_touch_needed     0
payment_pending        9
```

These are operating facts, not permanent fixture values.

## Working target set

Recommendation targeting is bounded independently of the aggregate baseline.

P1 stores at most **50 target Lead IDs per signal episode**.

Selection rules:

- needs reply: oldest waiting inbound Leads first;
- overdue follow-ups: Leads with the earliest overdue task first, deduplicated;
- first touch: oldest untouched new Leads first;
- payment pending: oldest current payment-stage entry first.

The recommendation baseline value remains the full signal count even when only the oldest 50 Leads are stored as the working target set.

Target membership changes do **not** define a new recommendation episode.

## Why target hashing is rejected

Target membership can change while the same backlog remains continuously active.

A recommendation key based on the current target set would create false new episodes whenever one Lead is resolved or another Lead enters the backlog.

P1 therefore does not include target IDs in episode identity.

## Persistent signal episode state

P1 adds one tenant-scoped state row per supported signal.

Minimum fields:

```text
organization_id
tsignal_id
is_active
episode_sequence
episode_started_at
last_evaluated_at
last_cleared_at
last_signal_value
created_at
updated_at
```

(`signal_id` is the actual column name; `tsignal_id` above is not used in SQL.)

Allowed signals are exactly:

```text
reply_backlog
overdue_followups
first_touch_needed
payment_pending
```

Direct authenticated mutation is not allowed. State changes occur through a tenant-derived privileged RPC.

## Episode state machine

On every privileged recommendation presentation request, all four signals are evaluated.

### No prior state + signal inactive

- create/retain state with sequence `0`;
- mark inactive;
- no recommendation key.

### No prior state + signal active

- increment/start sequence `1`;
- mark active;
- set episode start to now;
- recommendation key becomes:

`home:<signal_id>:episode:1`

### Existing inactive state + signal active

- increment `episode_sequence` by 1;
- mark active;
- set new episode start;
- generate a new recommendation key.

### Existing active state + signal active

- keep the same sequence and episode start;
- refresh last evaluated/value only;
- reuse the current recommendation key.

### Existing active state + signal inactive

- mark inactive;
- set `last_cleared_at`;
- no recommendation is displayed.

### Existing inactive state + signal inactive

- remain inactive;
- no new episode.

## Conservative recurrence rule

A new episode is created only after SalsysOS has **actually observed** the signal clear during a privileged presentation evaluation and later observes the signal active again.

If no Command Center presentation occurred during a temporary clear period, SalsysOS does not invent a recurrence later. The previous episode remains the last known episode.

This can under-count recurrences but cannot fabricate them. That is the intended V1 trade-off.

## Terminal recommendation rule

The episode state and recommendation lifecycle remain distinct.

For the current episode:

- active recommendation: may be refreshed/presented;
- accepted/acted recommendation: not part of P1 UI; future P2 handles these states;
- dismissed recommendation: never touched/reopened in the same episode;
- completed recommendation: never touched/reopened in the same episode.

If a terminal recommendation exists while the signal remains continuously active, P1 suppresses another recommendation until the signal is observed clear and later recurs as a new episode.

## Presentation boundary

P1 does not write recommendation evidence during the `/home` GET render.

A separate authenticated POST presentation endpoint is used by a client-side Recommended Actions component.

Flow:

1. user reaches `/home` through the existing owner/admin/manager route boundary;
2. Recommended Actions component POSTs to the presentation endpoint;
3. endpoint independently verifies authenticated user + active workspace + privileged role;
4. endpoint derives the tenant server-side;
5. server reads the canonical four CRM signals;
6. server resolves each signal episode through the privileged episode RPC;
7. server checks the current recommendation lifecycle state for the episode key;
8. only eligible recommendations that will be returned for display call hardened `touch_system_intelligence_recommendation_v2`;
9. `shown` therefore means the recommendation was created/refreshed for the presentation response;
10. response is private/no-store.

No background recommendation generator exists in P1.

## Separate UI layer

Existing factual Home Attention cards remain unchanged.

P1 adds a visually distinct section:

**Recommended actions**

The section must explicitly label its evidence as deterministic CRM evidence and must not present scores as probabilities/confidence.

## Deterministic priority order

P1 scores are ordering weights only:

```text
payment_pending       95
overdue_followups     90
reply_backlog         85
first_touch_needed    80
```

These values do not represent probability or confidence.

Recommended action copy remains deterministic and fixed by signal family; no generative model writes the recommendation text in P1.

## Navigation targets

```text
reply_backlog        -> /conversations
overdue_followups    -> /follow-ups
first_touch_needed   -> /leads?view=unassigned
payment_pending      -> /admissions?view=payments
```

P1 navigation does not execute external/customer actions.

## Failure behavior

- candidate read failure -> recommendation panel reports unavailable; no inferred fallback;
- episode RPC failure -> affected recommendation omitted / request fails closed;
- recommendation touch failure -> recommendation is not displayed as successfully persisted;
- unsupported signal -> reject;
- unauthorized role -> 403;
- missing workspace -> 401/403 as appropriate.

Existing Home factual evidence remains available even if P1 recommendation presentation fails.

## P1 acceptance contract

P1 is complete only when:

1. episode state is tenant-scoped and direct mutation is unavailable to authenticated clients;
2. episode resolver derives tenant from authenticated session and requires owner/admin/manager;
3. only the four approved CRM signals are supported;
4. clear/recur state machine is concurrency-safe;
5. target list is bounded at 50 while baseline retains full count;
6. recommendation key is stable through target churn;
7. dismissed/completed current episodes are never reopened/touched;
8. presentation happens through authenticated POST/private-no-store, not Home GET side effects;
9. hardened v2 touch is called only for recommendations returned for display;
10. existing Attention cards are unchanged;
11. new UI clearly labels recommendations as deterministic evidence-backed actions;
12. no predictive probability, AI prose or autonomous external action appears;
13. zero/unsupported signals do not create recommendations;
14. authorization/cross-tenant/episode regression tests pass;
15. production verification uses real operator presentation only; no synthetic recommendation rows are inserted merely to make P1 green.

## Decision

P1 episode design is locked. Implementation may begin against this contract.
