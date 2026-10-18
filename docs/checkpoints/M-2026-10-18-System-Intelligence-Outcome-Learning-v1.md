# SalsysOS — System Intelligence Outcome Learning v1

**Date:** 2026-10-18  
**Branch:** `feature/system-intelligence-outcome-learning-v1`  
**Base:** `959717a73a300aa3e5b7f0cd3f5ce5da420b68e3`

## Goal

Extend the shared System Intelligence recommendation ledger from simple shown/accepted/dismissed feedback into a conservative recommendation → action → observed-change loop.

The goal is not to claim causal attribution. The goal is to preserve a recommendation baseline, observe later tenant evidence after a user completes an action, classify material directional movement, and store that evidence for later bounded calibration.

## Implemented

### Server-derived observable baselines

`lib/intelligence/recommendation-outcomes.ts`

Safe observable metrics are currently defined for selected signals only:

- correlated conversation reply pressure
- first-touch backlog
- due follow-ups
- payment-pending leads
- unvalued open leads
- outstanding revenue by currency
- system-health pressure

Signals that do not have a safe comparable metric are intentionally not auto-evaluated.

### Recommendation ledger extension

Migration:

`supabase/migrations/20261018181500_system_intelligence_outcome_observation_v1.sql`

Adds:

- `baseline_metric`
- `baseline_value`
- `desired_direction`
- `last_outcome_at`
- `last_outcome_class`
- `last_outcome_value`

The existing recommendation-touch RPC now accepts server-derived baseline evidence while retaining current tenant/session checks.

### Outcome observation API

`GET /api/intelligence/v1/outcomes`

Returns the current tenant's recommendation-learning summary.

`POST /api/intelligence/v1/outcomes`

Evaluates completed recommendation actions after a minimum one-hour observation window.

Properties:

- tenant is derived from the authenticated workspace context
- no client organization ID is accepted
- only `acted` recommendations with a stored observable baseline are evaluated
- observations are deduplicated when class/value are unchanged
- maximum 100 recommendations per controlled run
- outcome classifications are `positive`, `neutral`, `negative`, or `inconclusive`
- observations explicitly state that metric movement is observational, not causal

### Learning workspace

`components/intelligence-learning-panel.tsx`

The `/intelligence` workspace now shows:

- tracked recommendations
- observable recommendations
- positive observations
- neutral observations
- negative observations
- a controlled `Evaluate completed actions` action

No autonomous customer, finance, website or workflow action is introduced.

## Production schema verification

Migration `system_intelligence_outcome_observation_v1` was applied successfully to Supabase project `doaozrkrtgeslddwhclj`.

Verified columns:

- `baseline_metric` — text
- `baseline_value` — numeric
- `desired_direction` — text
- `last_outcome_at` — timestamptz
- `last_outcome_class` — text
- `last_outcome_value` — numeric

Immediately after migration:

- recommendation rows: `0`
- recommendation event rows: `0`

No synthetic learning history was inserted.

## Build verification

Vercel Preview:

- deployment: `dpl_3qzidLEQa3uaQNzk7RyJGVJVc3Ns`
- branch: `feature/system-intelligence-outcome-learning-v1`
- commit: `63656e8d5f635702c85c18d9f8df9c5ffd868fab`
- Next.js: `15.5.26`
- compile: passed (`Compiled successfully in 18.3s`)
- deployment: `READY`

Unauthenticated access to `/api/intelligence/v1/outcomes` was verified to route through the normal SalsysOS sign-in boundary with `next=/api/intelligence/v1/outcomes` preserved.

## Safety posture

- no synthetic outcomes
- no causal attribution claim
- no client-supplied tenant authority
- no automatic customer message
- no automatic payment action
- no automatic website publish
- no autonomous workflow activation
- only safe, explicitly mapped metrics are auto-observable
- human action remains the trigger before outcome observation

## Next checkpoint

**Business outcome linkage + bounded calibration**

Next work should connect recommendation/action records to stronger real business outcomes where evidence exists, for example:

- lead stage progression
- enrollment/payment completion
- response backlog resolution
- follow-up completion
- collected/outstanding revenue movement

Then build a bounded per-tenant calibration profile that can adjust recommendation ranking only within controlled limits and only after sufficient observed history.
