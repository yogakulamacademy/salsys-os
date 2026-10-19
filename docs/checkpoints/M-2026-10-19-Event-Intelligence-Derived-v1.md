# M-2026-10-19 — Event Intelligence Derived Layer v1

## Purpose

Promote the first deterministic derived-intelligence layer on top of the universal Event Intelligence contract.

## Architecture

PostgreSQL remains the source of truth. Raw events are immutable evidence; derived feature state is rebuildable and versioned. Predictions remain explainable and explicitly marked deterministic unless backed by an existing statistical model.

## Derived feature families

- `journey_behavior` for sessions
- `traffic_seo_conversion` for pages
- `paid_media_conversion` for paid campaigns
- `lead_conversion` bridge from the existing lead-scoring feature snapshots

## Prediction families

- session conversion intent score
- traffic decline risk
- SEO growth opportunity
- paid attribution-gap risk / lead-quality score
- bridge of existing statistical lead conversion predictions

## Guardrails

- deterministic scores are not presented as calibrated probabilities
- reason codes and evidence are retained with every prediction
- learned lead probabilities are only reused from the existing lead-scoring model registry
- no ad-budget, CRM-stage, messaging or publishing action is executed automatically
- OpenSearch remains a secondary rebuildable retrieval layer and is not the system of record

## Production posture

The feature tables and builders are designed for tenant-scoped service-role refresh jobs. OpenSearch global indexing remains fail-closed until derived document builders and a controlled pilot are verified.
