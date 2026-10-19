# M-2026-10-19 — Event Intelligence feature store v1

## Status
FOUNDATION MERGED; live Yogakulam population/calibration remains.

This checkpoint records the first production feature-store foundation for Salsys Event Intelligence.

The feature store is deliberately separated from immutable `raw_events`. Feature state is tenant-scoped, versioned, explainable and rebuildable. History retains revisions so later model evaluation can compare the exact feature evidence used at prediction time.

The first builders cover sessions, pages, paid campaigns and leads. They combine observed website sessions/touchpoints with Search Console, ad-platform aggregates, CRM lead state, payments and enrollments without rewriting source evidence.

Predictions retain model key/version/mode, reason codes, confidence information, evidence and eventual observed outcomes. Deterministic scores are not treated as calibrated probabilities.

## Current production integration

- feature/prediction records may enqueue derived search documents automatically;
- Event Intelligence OpenSearch projections are rebuildable from PostgreSQL state;
- search indexing remains separately gated and fail-closed;
- no feature-store output can directly authorize messaging, publishing, CRM-stage mutation, payment operations or ad-budget changes.

## Next completion gate

The feature-store milestone becomes operationally complete only after direct Yogakulam tracking is restored through the universal first-party architecture and real journeys populate/reconcile:

`visitor/session -> behavior -> lead -> payment/enrollment -> revenue -> feature snapshot -> prediction -> actual outcome`.
