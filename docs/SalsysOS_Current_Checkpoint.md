# SalsysOS Current Checkpoint

**Date:** 2026-10-19  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch at checkpoint start:** `main`  
**Production head before this documentation sync:** `3407d1347e9061d3093139419e61466f07e34027`

This file is the current operational checkpoint. Historical milestone files under `docs/checkpoints/` remain evidence records and should not be rewritten to pretend earlier work happened differently.

## 1. North-Star progress

Planning estimate for the complete R0–R14 North-Star: **~70% complete / ~30% remaining**.

Planning estimate for the core operating product through R10: **~92% complete / ~8% remaining**.

The remaining North-Star work is concentrated in:
- finishing Event Intelligence + predictive maturity;
- reusable Wellness/Education productization;
- commercial SaaS provisioning/billing/onboarding/support;
- Realty vertical productization;
- GTM and first-100-customer execution.

These percentages are planning estimates, not telemetry-derived completion metrics.

## 2. Smart Triggers + WhatsApp milestone

The controlled production WhatsApp E2E milestone is complete.

Verified chain:
- human-reviewed WhatsApp template send;
- provider acceptance;
- canonical CRM outbound message;
- sent -> delivered -> read lifecycle;
- real inbound reply webhook;
- `message.received` automation event;
- stop-on-reply resume;
- timeout cancellation;
- no-reply scheduler continuation;
- approval boundary;
- STOP/customer opt-out suppression;
- frequency-cap enforcement;
- duplicate/idempotency protection;
- provider retry/failure recovery;
- quiet-hours enforcement;
- canonical approval lineage;
- pilot auto-disarm.

Production customer-send posture remains deliberately fail-closed unless explicitly armed:
- messaging policy OFF;
- autonomous send OFF;
- provider send OFF;
- human approval required;
- global scheduler OFF.

## 3. Event Intelligence — current implementation state

Salsys Event Intelligence is now the active tracking/intelligence architecture.

### Completed foundations

- PostgreSQL `raw_events` remains immutable event evidence and the source of truth.
- Universal event source registry exists (`tracking_sources`).
- Event-family and event-contract registry exists (`tracking_event_families`, `tracking_event_contracts`).
- Source-scoped rate limiting exists.
- Origin-resolved browser tracking sources exist for Yogakulam and Yogakulam Academy domains.
- `/api/events/v1` server ingestion is merged.
- `/api/events/browser/v1` browser ingestion is merged.
- Browser ingestion is privacy-gated before raw-event persistence.
- Generic event sanitization/redaction exists.
- Idempotent event ingestion is routed through `ingest_tracking_event_v1`.
- Processing dispatch is routed through `process_tracking_raw_event_v1`.
- Existing website raw-event normalization continues to build tenant-scoped sessions/touchpoints.
- First derived feature-store foundation exists.
- Deterministic prediction ledger exists with evidence/reason codes and outcome fields.
- Derived Event Intelligence search projection exists for `event_feature` and `event_prediction`.
- Event Intelligence feature/prediction updates can enqueue rebuildable OpenSearch outbox documents.
- Guarded pilot staging support exists.
- Search outbox constraint now allows Event Intelligence derived entity types.

### OpenSearch rule

OpenSearch is a **secondary rebuildable retrieval/intelligence index**. It is not the authority for raw events, identity, consent, CRM state, payments, enrollments, revenue, feature state, predictions, or observed outcomes.

Current global indexing posture remains fail-closed. Do not treat queued/indexed search documents as source evidence.

## 4. End-to-end tracking target

The tracking milestone is **not yet complete**.

The user-approved architecture is:

`website/app -> universal first-party SDK -> first-party website relay/outbox -> canonical event contract -> PostgreSQL raw events -> normalization/identity/attribution -> feature store -> predictions -> optional OpenSearch projection -> recommendations/outcomes`

Core tracking must not depend on GTM, GA4, Meta, or any single downstream system. GTM may remain optional for marketing tags/experiments.

### Acceptance test required before tracking is called complete

A real production journey must prove:

`campaign/click id -> website visitor -> session -> page/CTA behavior -> consent -> enquiry/form -> CRM lead -> anonymous identity attached -> checkout -> payment -> enrollment -> revenue -> attribution -> features -> prediction/recommendation -> observed outcome`

The same journey must be reconcilable in PostgreSQL-backed Tracking, Person 360, Funnel, Attribution and Revenue views.

## 5. Direct website tracking direction

Do not reinstall the core SalsysOS tracker through GTM.

Target implementation:
- direct script in Yogakulam website source/common layout;
- tenant-neutral SDK naming (not Yogakulam-only);
- first-party browser endpoint on the website domain;
- durable local event/outbox behavior so downstream outages do not lose events;
- canonical `event_id` idempotency;
- preserve/reuse existing `yk_vid`/`yk_sid` continuity during migration;
- server-authoritative payment/enrollment/revenue events;
- server-to-server lead identification;
- consent-aware analytics/advertising behavior.

## 6. Predictive intelligence direction

The Event Intelligence layer must support traffic, SEO, paid media, lead and revenue intelligence from the same event graph.

Maturity rule:
1. deterministic/explainable features and scores first;
2. statistical/ML prediction only after sufficient real outcomes;
3. adaptive/tenant-specific learning only after model evaluation and promotion controls pass.

Required prediction evidence fields include model key/version/mode, feature state, reason codes, confidence/evidence, generated/expiry times and eventual actual outcome.

Rules-generated scores must never be presented as calibrated probabilities.

## 7. Active next implementation order

1. finish production-safe universal Event Intelligence ingestion validation;
2. build/direct-install universal first-party SDK on Yogakulam source;
3. build first-party relay/outbox so core tracking is independent from SalsysOS availability;
4. wire consent and GPC behavior;
5. wire forms and anonymous -> CRM identity;
6. instrument reservation/checkout/payment/enrollment with server-authoritative events;
7. prove revenue attribution E2E;
8. refresh feature builders from live Yogakulam behavior;
9. controlled Event Intelligence OpenSearch pilot while PostgreSQL remains authoritative;
10. add tracking/data-quality anomaly detection;
11. move from deterministic intelligence toward evaluated predictive models only when enough outcome evidence exists.

## 8. Safety defaults

Unless a separate approved checkpoint explicitly changes them:
- autonomous customer messaging OFF;
- auto website publishing OFF;
- auto ad-budget changes OFF;
- broad/global OpenSearch indexing OFF;
- PostgreSQL remains the source of truth;
- human approval remains required for sensitive/high-impact actions;
- no fake traffic, rankings, revenue, conversion outcomes or model-training evidence.

## 9. Checkpoint maintenance rule

After every meaningful production milestone:
- update this file;
- update `docs/SalsysOS_North_Star_Product_Context.md` if roadmap/progress changed;
- update the relevant active checkpoint file;
- add a new historical milestone record when production proof materially changes system state;
- do not rewrite historical evidence simply to match the latest plan.
