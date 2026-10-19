# M-2026-10-19 — Event Intelligence feature store v1

This checkpoint records the first production feature-store foundation for Salsys Event Intelligence.

The feature store is deliberately separated from immutable `raw_events`. Feature state is tenant-scoped, versioned, explainable and rebuildable. History retains revisions so later model evaluation can compare the exact feature evidence used at prediction time.

The first builders cover sessions, pages, paid campaigns and leads. They combine observed website sessions/touchpoints with Search Console, ad-platform aggregates, CRM lead state, payments and enrollments without rewriting source evidence.

Predictions retain model key/version/mode, reason codes, confidence information, evidence and eventual observed outcomes. Deterministic scores are not treated as calibrated probabilities.

OpenSearch remains secondary. Derived intelligence documents may be projected to OpenSearch after PostgreSQL truth is validated, but raw event truth, identity, consent, payments and revenue remain in PostgreSQL.
