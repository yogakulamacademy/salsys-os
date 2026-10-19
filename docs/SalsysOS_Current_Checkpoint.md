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

### Universal Tracking Intelligence SDK V1 — branch implementation

The active refactor branch defines **Salsys Universal Tracking Intelligence SDK V1** as the developer-facing tracking layer.

Implemented/defined on the branch:

- product-facing browser entrypoint: `public/salsys-intelligence.js`;
- browser tracking core: `public/salsys-tracker.js`;
- canonical integration boundary: HTTPS + JSON;
- `docs/universal-event-protocol-v1.md` defines the protocol;
- `schemas/salsys-event-v1.schema.json` defines the machine-readable canonical envelope;
- `docs/universal-tracking-intelligence-sdk.md` defines SDK architecture and developer API;
- `docs/event-tracking-v1.md` defines event naming, authority boundaries and the V1 event model;
- `/api/events/identify/v1` provides tracking-source-authenticated exact-session anonymous -> CRM lead handoff;
- browser event ingestion restores trusted server-side geo context where available without persisting raw client IP;
- PHP-specific Event Intelligence relay/runtime has been removed from the refactor branch;
- runtime-specific SDKs are optional wrappers and must not introduce parallel event semantics.

### Pre-existing tracking compatibility audit — completed in code, live proof pending

The pre-existing Yogakulam tracking stack was reviewed before cutover. Canonical evidence record:

`docs/checkpoints/M-2026-10-19-Universal-Tracking-Compatibility-Audit-v1.md`

Compatibility work completed on the branch includes:

- legacy `yk_vid` visitor continuity migration;
- legacy `yk_sid` session continuity migration;
- legacy first-touch migration;
- migration of stored legacy analytics grant/denial through the new privacy endpoint before normal analytics collection;
- fail-closed behavior when a prior grant cannot be safely migrated;
- legacy `yk:consent` translation into neutral purpose-specific consent;
- legacy `adUserData -> advertising` and `adPersonalization -> personalization` translation without inventing sale/sharing consent;
- compatibility for established `data-yk-event` CTA markup;
- restored Instagram CTA classification;
- restored enrollment/booking CTA classification so existing funnel/affinity signals are not lost;
- temporary `YKTracking` diagnostics facade during cutover;
- temporary `yk_tracking_ready` dataLayer compatibility event while GTM remains non-authoritative;
- canonical `web.*` -> established touchpoint semantic projection remains intact;
- universal identity handoff preserves the old exact-session cross-tenant/shared-browser safety rule.

This is a branch/code compatibility checkpoint. It does **not** claim that the live Yogakulam production journey has been cut over or proven yet.

### Architecture decision — platform/language independence

The universal tracking layer is explicitly **protocol-first**.

- canonical integration boundary = HTTPS + JSON;
- browser SDK remains JavaScript because it executes in browsers, not because of the customer backend stack;
- trusted server events may be emitted from any runtime that can make authenticated HTTPS requests;
- first-party relay/outbox is a platform-neutral transport contract, not a backend-language-specific implementation;
- durable storage may use any suitable host-platform mechanism;
- runtime-specific SDKs are optional convenience adapters over the same event protocol;
- legacy Yogakulam website integration code is separate from the universal SDK decision and is not the canonical tracking model.

Canonical references:

```text
docs/universal-event-protocol-v1.md
docs/universal-tracking-intelligence-sdk.md
docs/event-tracking-v1.md
docs/checkpoints/M-2026-10-19-Universal-Tracking-Compatibility-Audit-v1.md
schemas/salsys-event-v1.schema.json
```

### OpenSearch rule

OpenSearch is a **secondary rebuildable retrieval/intelligence index**. It is not the authority for raw events, identity, consent, CRM state, payments, enrollments, revenue, feature state, predictions, or observed outcomes.

Current global indexing posture remains fail-closed. Do not treat queued/indexed search documents as source evidence.

## 4. End-to-end tracking target

The tracking milestone is **not yet complete**.

The user-approved architecture is:

`website/app/service -> Universal Tracking Intelligence SDK or canonical HTTPS client -> optional platform-neutral first-party transport/outbox -> canonical event contract -> PostgreSQL raw events -> normalization/identity/attribution -> feature store -> predictions -> optional OpenSearch projection -> recommendations/outcomes`

Core tracking must not depend on GTM, GA4, Meta, a backend programming language, framework, database, or any single downstream system. GTM may remain optional for marketing tags/experiments.

### Acceptance test required before tracking is called complete

A real production journey must prove:

`campaign/click id -> website visitor -> session -> page/CTA behavior -> consent -> enquiry/form -> CRM lead -> exact-session anonymous identity attached -> checkout -> payment -> enrollment -> revenue -> attribution -> features -> prediction/recommendation -> observed outcome`

The same journey must be reconcilable in PostgreSQL-backed Tracking, Person 360, Funnel, Attribution and Revenue views.

## 5. Direct website tracking direction

Do not reinstall the core SalsysOS tracker through GTM.

Target implementation:
- direct `salsys-intelligence.js` installation in Yogakulam website source/common layout;
- tenant-neutral SDK/event vocabulary;
- browser events delivered to the browser-safe Event API directly or through a first-party transport;
- no backend-language/file-extension requirement;
- stable `event_id` idempotency;
- preserve/reuse existing Yogakulam visitor/session continuity during migration;
- server-authoritative payment/enrollment/revenue events through the trusted Event API;
- server-to-server lead identification through `/api/events/identify/v1`;
- consent-aware analytics/advertising behavior;
- optional durable first-party outbox without coupling the SDK to one runtime/database.

## 6. Predictive intelligence direction

The Event Intelligence layer must support traffic, SEO, paid media, lead and revenue intelligence from the same event graph.

Maturity rule:
1. deterministic/explainable features and scores first;
2. statistical/ML prediction only after sufficient real outcomes;
3. adaptive/tenant-specific learning only after model evaluation and promotion controls pass.

Required prediction evidence fields include model key/version/mode, feature state, reason codes, confidence/evidence, generated/expiry times and eventual actual outcome.

Rules-generated scores must never be presented as calibrated probabilities.

## 7. Active next implementation order

1. validate the current Universal Tracking Intelligence branch with GitHub CI + deployment build;
2. direct-install `salsys-intelligence.js` in Yogakulam source with the old tracker removed so events are not double-counted;
3. verify returning legacy visitor/session/consent migration with controlled real browser tests;
4. verify consent denial/grant/withdrawal/GPC behavior on the real website;
5. verify one-and-only-one session/page/CTA/form event flow into canonical `raw_events`;
6. verify WhatsApp, phone, email, Instagram and enrollment CTA semantic projections;
7. verify `/api/events/identify/v1` on a real lead and adversarial mismatched tenant/session cases;
8. instrument reservation/checkout/payment/enrollment using trusted server events;
9. prove revenue attribution E2E;
10. refresh feature builders from live Yogakulam behavior;
11. run a controlled Event Intelligence OpenSearch pilot while PostgreSQL remains authoritative;
12. add tracking/data-quality anomaly detection;
13. move from deterministic intelligence toward evaluated predictive models only when enough outcome evidence exists.

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
