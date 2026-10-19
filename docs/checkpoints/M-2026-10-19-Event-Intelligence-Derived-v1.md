# M-2026-10-19 — Event Intelligence Derived Layer v1

## Status
FOUNDATION MERGED; production live-data refresh/cutover still pending.

## Purpose

Promote the first deterministic derived-intelligence layer on top of the universal Event Intelligence contract.

## Architecture

PostgreSQL remains the source of truth. Raw events are immutable evidence; derived feature state is rebuildable and versioned. Predictions remain explainable and explicitly marked deterministic unless backed by an evaluated statistical model.

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
- bridge of existing statistical lead-conversion predictions

## Production changes completed

- feature/prediction foundations are present in production migrations;
- PostgreSQL state is versioned/rebuildable rather than replacing raw evidence;
- derived Event Intelligence documents can now be queued into the guarded search outbox;
- OpenSearch entity support includes `event_feature` and `event_prediction`;
- bounded Event Intelligence search pilot staging exists without enabling indexing.

## Guardrails

- deterministic scores are not presented as calibrated probabilities;
- reason codes and evidence are retained with every prediction;
- learned lead probabilities are only reused from evaluated model-registry output;
- no ad-budget, CRM-stage, messaging, payment or publishing action is executed automatically;
- OpenSearch remains a secondary rebuildable retrieval layer and is not the system of record.

## Remaining proof

This checkpoint is not the final Event Intelligence E2E sign-off. It still requires live Yogakulam direct first-party tracking, identity linkage, checkout/payment/enrollment/revenue events, feature refresh from that real journey, and outcome reconciliation.
