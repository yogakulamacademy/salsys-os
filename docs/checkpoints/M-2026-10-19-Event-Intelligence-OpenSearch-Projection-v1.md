# M-2026-10-19 — Event Intelligence OpenSearch projection v1

## Scope

Adds a rebuildable OpenSearch projection for derived Event Intelligence records only.

## Indexed entities

- `event_feature` from `event_intelligence_feature_state`
- `event_prediction` from `event_intelligence_predictions`

Raw browser/server events are intentionally not projected to OpenSearch. PostgreSQL remains authoritative for raw events, identity, consent, CRM state, payments, enrollments, feature state, predictions and outcomes.

## Retrieval shape

The projection reuses the existing global index's already mapped fields (`entity_type`, `entity_id`, `document_category`, `status`, `intent`, `summary`, `content`, timestamps) so it can be introduced without mutating the live index mapping. Structured feature/prediction payloads are retained in `_source`, while the flattened `content` field is searchable.

## Queueing

Feature revisions and prediction lifecycle changes enqueue rebuildable documents through the existing `search_index_outbox`. A bounded service-role staging helper can queue a small Event Intelligence sample while indexing is disabled.

## Safety

- The migration does not enable OpenSearch indexing.
- Existing `search_index_settings.indexing_enabled=false` remains unchanged.
- A pilot must be separately armed before the worker can claim staged documents.
- No raw-event truth is moved out of PostgreSQL.
- No recommendation or prediction executes customer messaging, publishing, CRM-stage changes, payments or ad-budget changes.
