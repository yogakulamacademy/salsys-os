# SalsysOS — R10-P0 Recommendation Security & Reproducibility Hardening Closeout V1

**Date:** 2026-11-01  
**Production organization:** Yogakulam Academy  
**Engineering PR:** #410  
**Production merge SHA:** `1daf2c6d019a3cc8c899bc9d8d0c996ceee64e21`

## Purpose

Close R10-P0 before any production recommendation UI or recommendation lifecycle activity is activated.

P0 was a safety/provenance checkpoint only. It created no recommendation, recommendation-event, business-outcome, payment, enrollment, provider or customer-action evidence.

## Historical migration provenance restored

Eight production-ledger recommendation-lifecycle migrations missing from source control were restored exactly from `supabase_migrations.schema_migrations.statements`:

```text
20261018111825 system_intelligence_recommendation_learning_v1
20261018114501 system_intelligence_outcome_observation_v1
20261018115609 system_intelligence_business_learning_v1
20261018153024 system_intelligence_outcome_observer_v1
20261018153555 system_intelligence_effectiveness_v1
20261018154443 system_intelligence_calibration_readiness_v1
20261018155528 system_intelligence_action_completion_v1
20261018155811 system_intelligence_action_completion_effectiveness_v1
```

The restored files are pinned to the production-ledger MD5 values by:

`verify:r10-recommendation-migration-reproducibility-v1`

The historical migrations were not re-applied to production.

## New production migration

Repository migration:

`supabase/migrations/20261101154500_r10_recommendation_security_hardening_v1.sql`

Production migration ledger:

```text
version   20261101151403
name      r10_recommendation_security_hardening_v1
```

## Tenant relationship hardening

Production now enforces:

```text
UNIQUE (recommendation.id, recommendation.organization_id)
FOREIGN KEY (event.recommendation_id, event.organization_id)
  -> recommendation(id, organization_id)
```

The recommendation-event INSERT policy now explicitly checks both the referenced recommendation ID and the outer event organization.

Post-deploy integrity:

```text
recommendation_rows                  0
recommendation_event_rows            0
orphan_or_tenant_mismatch_rows       0
```

## Direct table permissions

`authenticated` now has only:

```text
system_intelligence_recommendations          SELECT
system_intelligence_recommendation_events    SELECT
```

Direct browser INSERT/UPDATE/DELETE/TRUNCATE privileges were removed.

Trusted `service_role` retains the machine-level table privileges needed for later controlled runtime work.

## Recommendation creator boundary

Legacy `touch_system_intelligence_recommendation_v1` is no longer executable by app roles.

`touch_system_intelligence_recommendation_v2` is now SECURITY DEFINER and:

- derives organization from the authenticated tenant session;
- requires `owner | admin | manager` through `has_organization_role()`;
- rejects more than 500 requested target Leads;
- verifies every target Lead belongs to the active tenant;
- stores a target count matching the actual target array;
- records `shown` only when the RPC is invoked.

Because the RPC records a `shown` event, P1 must invoke it only for recommendations actually presented to the user.

## Human feedback boundary

`record_system_intelligence_recommendation_feedback_v1` is SECURITY DEFINER and requires:

- authenticated tenant session;
- `owner | admin | manager`;
- recommendation belonging to the active tenant.

Allowed transitions are fail-closed:

```text
active   -> accepted
active   -> dismissed
accepted -> dismissed        before action starts
accepted -> acted            via action_started
acted    -> completed        via action_completed
```

Lifecycle retries are idempotent. A partial unique index prevents duplicate accepted/dismissed/action_started/action_completed event rows for the same recommendation.

## Target integrity

Production now enforces:

```text
cardinality(target_lead_ids) <= 500
target_lead_count = cardinality(target_lead_ids)
```

The creator also fails if any requested target Lead belongs to another organization or does not resolve inside the active tenant.

## Outcome observation boundary

`observe_system_intelligence_recommendation_outcomes_v1(integer)` is no longer executable by arbitrary authenticated users.

Current execution grants:

```text
service_role
postgres
```

A machine-authenticated organization runner remains a later R10 checkpoint.

## Regression contracts

Added:

```text
scripts/verify-r10-recommendation-migration-reproducibility-v1.mjs
scripts/verify-r10-recommendation-security-v1.mjs
```

Both run in the production build.

## Release validation

PR #410 pre-merge:

```text
CI                         #1341 passed
CodeQL                     #626 passed
Vercel preview             READY on exact PR head
```

Merged production SHA:

`1daf2c6d019a3cc8c899bc9d8d0c996ceee64e21`

Post-merge:

```text
CI                         #1342 passed
CodeQL                     #627 passed
Production Smoke           #159 passed
Vercel production          READY on exact merge SHA
```

## Acceptance decision

R10-P0 is complete.

No recommendation UI has been activated, no recommendation row has been generated, and no synthetic outcome evidence was created.

The next exact checkpoint is:

# R10-P1 — Deterministic Recommended Actions on Command Center

Before implementation, finalize the episode-key / recurrence contract so terminal recommendations are never silently reopened or resurfaced as the same episode.
