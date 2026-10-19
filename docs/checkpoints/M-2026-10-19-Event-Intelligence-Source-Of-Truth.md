# M-2026-10-19 — Event Intelligence source-of-truth rule

## Status
ACTIVE / CANONICAL

PostgreSQL is the system of record for:
- immutable raw events;
- event-source and contract configuration;
- identity and consent;
- CRM state;
- sessions and touchpoints;
- payments, enrollments and revenue;
- feature state/history;
- predictions and model metadata;
- observed outcomes and learning evidence.

OpenSearch is a secondary, rebuildable retrieval/intelligence index only.

## Non-negotiable rule

No OpenSearch document, search hit, embedding, summary or ranking is allowed to become source evidence merely because it exists in the index. Every indexed Event Intelligence record must be reproducible from PostgreSQL-backed canonical/derived state.

Raw browser/server events are intentionally kept out of OpenSearch. Only safe derived/rebuildable documents such as feature and prediction projections may be indexed.

## Current implementation

Production now has universal tracking sources/event contracts, canonical ingestion through `ingest_tracking_event_v1`, dispatch through `process_tracking_raw_event_v1`, derived feature/prediction state, and guarded OpenSearch projection support for `event_feature` and `event_prediction`.

Global OpenSearch indexing remains fail-closed until an explicitly controlled pilot is armed and verified.
