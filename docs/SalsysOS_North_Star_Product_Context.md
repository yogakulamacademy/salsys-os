# SalsysOS North Star Product Context

**Status:** Canonical product/context/progress source of truth  
**Last updated:** 2026-10-19  
**Repository:** `yogakulamacademy/salsys-os`

> Read this file first when SalsysOS context is incomplete. Use `docs/SalsysOS_Current_Checkpoint.md` for the latest operational state and `docs/checkpoints/` for milestone evidence.

---

## 1. North Star

SalsysOS = **Sales + Analysis Operating System**: a **Customer Journey Intelligence + Revenue Intelligence operating system**, not a generic CRM.

Core question:

> **What is this person likely to do next, why, and what should we do right now to increase the probability of conversion?**

Primary vertical: Yoga / Education / Wellness, with Yogakulam Academy as the first production tenant. Planned second vertical: Real Estate.

Core loop:

`marketing spend -> traffic -> source/campaign/content -> anonymous behavior -> identity resolution -> lead -> conversation -> intent/objection/product affinity -> salesperson -> follow-up -> payment/enrollment -> revenue -> attribution -> feature state -> prediction/recommendation -> action -> observed outcome -> learning`

Principles:
- PostgreSQL is the source of truth;
- raw events remain separate from derived CRM/journey state;
- identity must be deterministic where possible and confidence-bearing when inferred;
- observed facts and predictions are never silently mixed;
- revenue-linked analytics matter more than vanity metrics;
- privacy/consent must be enforced before optional behavioral processing;
- OpenSearch is secondary/rebuildable, never the truth store;
- automation is fail-closed and high-impact actions require explicit policy/approval;
- no fake traffic, rankings, revenue, conversions, outcomes or training evidence.

---

## 2. Current completion snapshot

Planning estimates as of 2026-10-19:

| Scope | Estimate |
|---|---:|
| Core SalsysOS operating product through R10 | ~92% |
| Complete North-Star R0-R14 | ~70% |
| Remaining full North-Star work | ~30% |

These are planning estimates, not telemetry-derived metrics.

Most remaining full-scope work is concentrated in R11-R14: reusable Wellness/Education productization, Realty, commercial SaaS readiness, and go-to-market/first 100 customers.

---

## 3. Commercial roadmap — fixed R0-R14

| Phase | Working state |
|---|---|
| R0 Platform Rebrand | ~95% |
| R1 Foundation / Tenancy / Security | ~99% |
| R2 Lead Capture / Identity / Raw Events / Data Quality | ~99% |
| R3 CRM Sales Execution | ~99% |
| R4 Customer Journey / 360 | ~96% |
| R5 Attribution / Funnel / Revenue | ~93% |
| R6 Intent / Product Affinity / Sales Intelligence | ~94% |
| R7 Integrations / Conversion Feedback | ~92% |
| R8 Content + SEO Intelligence | ~96% |
| R9 AEO / GEO / AI Visibility | ~65% |
| R10 Predictive Intelligence + Owner Command Center | ~82% |
| R11 Wellness / Education Productization | ~48% |
| R12 Realty | ~15% |
| R13 Commercial SaaS Readiness | ~32% |
| R14 Marketing + First 100 Customers | ~10% |

Use these as planning ranges, not audit percentages.

---

## 4. Event Intelligence is now the tracking foundation

The active architecture is **Salsys Event Intelligence**, not a GTM-dependent tracker.

Target chain:

`website/apps/connectors -> universal SDK or canonical HTTPS client -> platform-neutral first-party transport/outbox -> canonical event contract -> PostgreSQL raw_events -> normalization/identity/attribution -> feature store -> prediction ledger -> optional OpenSearch projection -> decisions/recommendations -> observed outcomes`

The canonical transport contract is HTTPS + JSON. No backend programming language, framework, database or hosting provider is part of the Salsys tracking specification. Runtime-specific SDKs are convenience clients over the same protocol, not separate tracking architectures.

Canonical protocol: `docs/universal-event-protocol-v1.md`.

### Already present in production

- `raw_events` immutable event evidence;
- tracking source registry;
- event-family and event-contract registry;
- source-scoped rate limiting;
- browser origin resolution;
- privacy gate + GPC-aware controls;
- generic sanitization/redaction;
- `/api/events/v1` server ingestion;
- `/api/events/browser/v1` browser ingestion;
- `ingest_tracking_event_v1` canonical ingestion;
- `process_tracking_raw_event_v1` processing dispatch;
- website raw-event processor for sessions/touchpoints;
- feature-store foundation;
- deterministic prediction ledger;
- derived OpenSearch projection for `event_feature` and `event_prediction`;
- guarded Event Intelligence OpenSearch staging support;
- search outbox support for derived Event Intelligence entity types.

### Architecture cleanup

The previous backend-language-specific Event Intelligence relay package is not part of the North-Star architecture. The active tracking model is platform/language independent. Legacy tenant-specific website integration code may remain where it supports an existing production workflow, but it is not the universal tracking contract.

### Not yet complete

The direct Yogakulam first-party source installation and full live E2E proof are still required.

Tracking is only complete when a real journey proves:

`campaign/click id -> visitor -> session -> behavior -> consent -> enquiry -> CRM lead -> identity linkage -> checkout -> payment -> enrollment -> revenue -> attribution -> feature state -> prediction/recommendation -> observed outcome`

---

## 5. Tracking deployment rule

Core tracking must not depend on GTM, GA4, Meta, a backend programming language or any single downstream vendor.

Preferred deployment:
- direct first-party browser SDK in website source/common layout;
- tenant-neutral SDK/event vocabulary;
- first-party transport endpoint with no file-extension/runtime requirement;
- durable local outbox/retry behavior implemented by the host platform where required;
- stable event IDs and idempotency;
- preserve existing first-party visitor/session continuity during migration;
- server-to-server identity linking through the canonical Event API;
- server-authoritative payment/enrollment/revenue events.

The browser SDK must work independently of the server technology that renders or hosts the site. Trusted server integrations use the same HTTPS/JSON event contract from any runtime.

GTM remains optional for marketing tags, debugging and experiments only.

---

## 6. OpenSearch contract

PostgreSQL is authoritative for raw events, identity, consent, CRM state, payments, enrollments, revenue, feature state, predictions and outcomes.

OpenSearch is for:
- fast retrieval;
- cross-entity search;
- semantic/hybrid search;
- similarity discovery;
- RAG/evidence retrieval;
- derived intelligence exploration.

Raw events are intentionally not copied to OpenSearch. Only safe rebuildable projections are indexed.

Broad/global indexing remains fail-closed unless a separate controlled checkpoint explicitly arms it.

---

## 7. Predictive intelligence contract

Maturity sequence:

1. **Deterministic intelligence** — rules, thresholds, explainable feature scores.
2. **Statistical/ML intelligence** — only after enough real labeled outcomes exist.
3. **Adaptive tenant-specific intelligence** — only after evaluation, comparison and promotion controls pass.

Prediction records must retain:
- prediction type;
- subject/entity;
- feature-state reference;
- model key/version/mode;
- score/probability where valid;
- reason codes/explanation/evidence;
- confidence information;
- generated/expiry times;
- actual observed outcome and outcome time.

Rules-generated scores must never be presented as calibrated probabilities.

---

## 8. Smart Triggers + WhatsApp milestone

Controlled production E2E is complete for:
- human-reviewed template send;
- provider acceptance;
- CRM message lineage;
- sent/delivered/read status;
- real inbound reply;
- stop-on-reply;
- no-reply scheduler continuation;
- approval boundary;
- STOP suppression;
- frequency caps;
- duplicate/idempotency protection;
- provider retry/failure recovery;
- quiet hours;
- canonical approval reconciliation;
- one-message pilot auto-disarm.

Default production posture remains fail-closed:
- messaging policy OFF;
- autonomous send OFF;
- provider send OFF;
- human approval required;
- global scheduler OFF.

---

## 9. Privacy + Behavioral Intelligence

Privacy posture: privacy-by-design technical controls supporting configurable legal/compliance requirements; do not claim universal legal compliance.

Consent is purpose-specific, not one boolean. Optional analytics/advertising behavior must respect effective consent and GPC policy before persistence/processing where required.

Behavioral intelligence target spans:
- pre-lead journey;
- post-lead journey;
- frequency/recency/depth/commercial intent;
- lead reactivation;
- behavioral segments;
- content influence;
- product affinity;
- sales influence;
- predictive conversion;
- next-best action.

Event Intelligence is the technical foundation for this layer.

---

## 10. Multi-tenant contract

- one organization = one tenant = isolated data boundary;
- session resolves one trusted tenant;
- normal client payloads cannot authorize an organization merely by sending an ID;
- browser tracking tenant resolution comes from trusted configured origin/source;
- server tracking uses registered authenticated sources;
- service paths are explicitly tenant scoped;
- OpenSearch documents remain organization-scoped and rebuildable.

---

## 11. Active implementation priority

Do not add unrelated North-Star features until the tracking/Event Intelligence E2E foundation is complete.

Current order:

1. finalize Universal Event Protocol v1;
2. align/direct-install universal browser SDK on Yogakulam;
3. implement platform-neutral first-party transport/outbox;
4. consent/GPC integration;
5. form tracking + anonymous-to-lead identity;
6. reservation/checkout/payment/enrollment server events;
7. revenue attribution proof;
8. feature-store refresh using live data;
9. tracking-health/anomaly detection;
10. controlled Event Intelligence OpenSearch pilot;
11. model evaluation/calibration from real outcomes;
12. resume wider R9/R10/R11 product work.

---

## 12. Checkpoint rule

`docs/SalsysOS_Current_Checkpoint.md` is the latest operational checkpoint.

Historical milestone files under `docs/checkpoints/` are evidence records. Preserve them; update active milestone documents when their status progresses, and create a new checkpoint for materially new production proof.
