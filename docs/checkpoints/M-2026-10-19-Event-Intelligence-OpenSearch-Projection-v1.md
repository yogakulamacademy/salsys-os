# M-2026-10-19 — Event Intelligence OpenSearch projection v1

## Status
FOUNDATION MERGED / guarded pilot ready / broad indexing still OFF.

## Scope

Adds a rebuildable OpenSearch projection for derived Event Intelligence records only.

## Indexed entities

- `event_feature` from `event_intelligence_feature_state`
- `event_prediction` from `event_intelligence_predictions`

Raw browser/server events are intentionally not projected to OpenSearch. PostgreSQL remains authoritative for raw events, identity, consent, CRM state, payments, enrollments, feature state, predictions and outcomes.

## Retrieval shape

The projection reuses the existing global index's mapped fields (`entity_type`, `entity_id`, `document_category`, `status`, `intent`, `summary`, `content`, timestamps). Structured feature/prediction payloads remain in `_source`, while flattened content is available for retrieval/search.

## Queueing and pilot controls

- feature revisions enqueue `event_feature` rebuilds;
- prediction lifecycle/outcome changes enqueue `event_prediction` rebuilds;
- existing `search_index_outbox` remains the durable rebuild queue;
- guarded pilot staging can queue a bounded Event Intelligence sample only while broad indexing is disabled and pilot mode is active;
- the outbox entity constraint has been extended to permit these derived Event Intelligence entity types.

Relevant production commits include:
- `e21a5f236ce1311b84acaa29fc06d4c084a3da0a` — derived Event Intelligence OpenSearch projection;
- `f991bf9a879051621ecb3b00f593a235059129d4` — guarded pilot staging compatibility;
- `3407d1347e9061d3093139419e61466f07e34027` — Event Intelligence outbox entity support.

## Safety

- broad OpenSearch indexing remains disabled;
- a pilot must be separately armed before the worker can claim staged documents;
- no raw-event truth is moved out of PostgreSQL;
- indexed documents remain disposable/rebuildable;
- no recommendation or prediction executes customer messaging, publishing, CRM-stage changes, payments or ad-budget changes.

## Remaining proof

Run a deliberately bounded Event Intelligence search pilot after real Yogakulam first-party events and feature/prediction records are available. Verify index document count, tenant isolation, query usefulness, replay/rebuild behavior and zero effect on PostgreSQL truth before expanding indexing.
