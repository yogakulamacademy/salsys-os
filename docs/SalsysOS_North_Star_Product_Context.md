# SalsysOS North Star Product Context

**Status:** Canonical product/context/progress source of truth  
**Last updated:** 2026-10-20  
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

Latest conversational planning estimates after the October 20 tracking, messaging, intelligence and CRM closeout work:

| Scope | Estimate |
|---|---:|
| Core SalsysOS operating product through R10 | ~96% |
| Complete North-Star R0-R14 | ~77% |
| Remaining full North-Star work | ~23% |

These are planning estimates, not telemetry-derived metrics. Rebaseline them only after reviewing the roadmap end-to-end.

The ordered closeout sequence is now active. **Core CRM + lead/customer management is closed at V1 production-integrity level**; production evidence is recorded in `docs/checkpoints/M-2026-10-20-CRM-Core-Closeout-v1.md`. The next ordered area is **Customer Journey / Person 360 / Identity**.

Most remaining full-scope work is concentrated in live production proof, predictive maturity from real outcomes, and R11-R14: reusable Wellness/Education productization, Realty, commercial SaaS readiness, and go-to-market/first 100 customers.

---

## 3. Commercial roadmap — fixed R0-R14

| Phase | Working state |
|---|---|
| R0 Platform Rebrand | ~95% |
| R1 Foundation / Tenancy / Security | ~99% |
| R2 Lead Capture / Identity / Raw Events / Data Quality | ~99% |
| R3 CRM Sales Execution | **V1 production-integrity closed** |
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

Use these as planning ranges, not audit percentages. A closed V1 phase means its explicitly audited production invariants passed; it does not prohibit later enhancements.

---

## 4. Universal Tracking Intelligence SDK + Event Intelligence

The active tracking architecture is **Salsys Event Intelligence**. The developer-facing collection layer is the **Salsys Universal Tracking Intelligence SDK**.

Target chain:

`website/apps/connectors -> Universal Tracking Intelligence SDK or canonical HTTPS client -> optional platform-neutral first-party transport/outbox -> canonical event contract -> PostgreSQL raw_events -> normalization/identity/attribution -> feature store -> prediction ledger -> optional OpenSearch projection -> decisions/recommendations -> observed outcomes`

The canonical transport contract is HTTPS + JSON. No backend programming language, framework, database, CMS or hosting provider is part of the Salsys tracking specification. Runtime-specific SDKs are convenience clients over the same protocol, not separate tracking architectures.

Canonical references:

```text
docs/universal-event-protocol-v1.md
docs/universal-tracking-intelligence-sdk.md
docs/event-tracking-v1.md
schemas/salsys-event-v1.schema.json
```

### V1 SDK model

```text
Browser SDK                 direct web instrumentation
HTTPS Event API             canonical trusted-server integration
First-party transport       optional runtime-neutral relay/proxy/outbox
Runtime SDKs                optional convenience wrappers
```

The current browser implementation is `public/salsys-tracker.js`. It is website-platform independent and already supports anonymous/session identity, acquisition capture, page/session/CTA/form events, consent/GPC handling, SPA tracking, form decoration and retry queuing.

### Event tracking authority

Browser events describe observed behavior and intent. Trusted server/provider events establish business truth.

Browser examples:

```text
web.session_started
web.page_viewed
web.cta_clicked
web.form_started
web.form_submitted
```

Trusted-source examples:

```text
lead.created
booking.started
booking.completed
payment.started
payment.completed
payment.failed
enrollment.completed
```

The browser must never become authority for confirmed payment, enrollment, refund or final revenue.

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
- search outbox support for derived Event Intelligence entity types;
- privacy-aware signal-quality and Safe-V2 feature snapshots;
- prediction freshness guards;
- realized probability-outcome observation, calibration metrics and drift instrumentation;
- scheduled outcome observation.

### Architecture cleanup

The previous backend-language-specific Event Intelligence relay package is not part of the North-Star architecture. The active tracking model is platform/language independent. Legacy tenant-specific website integration code may remain where it supports an existing production workflow, but it is not the universal tracking contract.

### Not yet complete

The direct Yogakulam source installation and full live E2E proof are still required.

Tracking is only complete when a real journey proves:

`campaign/click id -> visitor -> session -> behavior -> consent -> enquiry -> CRM lead -> identity linkage -> checkout -> payment -> enrollment -> revenue -> attribution -> feature state -> prediction/recommendation -> observed outcome`

---

## 5. Tracking deployment rule

Core tracking must not depend on GTM, GA4, Meta, a backend programming language or any single downstream vendor.

Preferred deployment:
- direct universal browser SDK in website source/common layout;
- tenant-neutral SDK/event vocabulary;
- browser-safe origin-resolved collection;
- optional first-party transport endpoint with no runtime/file-extension requirement;
- durable local outbox/retry behavior implemented by the host platform where required;
- stable event IDs and idempotency;
- preserve existing first-party visitor/session continuity during migration;
- server-to-server identity linking through trusted flows;
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

The later WhatsApp Operations/Growth layer adds shared inbox/quick replies, reusable audience segments, guarded campaign execution, personalization, A/B variants, routing and conversion/revenue attribution.

Default production posture remains fail-closed:
- messaging policy OFF;
- autonomous send OFF;
- provider send OFF;
- human approval required;
- global scheduler OFF.

---

## 9. Instagram Operations milestone

Instagram Operations V1 is implemented using Meta's user-initiated messaging model rather than a cold/bulk DM model.

The product layer includes inbound CRM ingestion, human replies, 24-hour standard DM reachability, quick replies, keyword/event rules, guarded comment-to-private-reply automation, approvals, suppression, frequency limits, idempotency, provider gates, pilot controls and an operations workspace.

Live comment-to-DM proof requires reauthorization of the connected account with `instagram_business_manage_comments` plus the required Meta app/webhook permissions. Do not treat that provider dependency as permission to introduce cold Instagram broadcasts.

---

## 10. Privacy + Behavioral Intelligence

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

## 11. Multi-tenant contract

- one organization = one tenant = isolated data boundary;
- session resolves one trusted tenant;
- normal client payloads cannot authorize an organization merely by sending an ID;
- browser tracking tenant resolution comes from trusted configured origin/source;
- server tracking uses registered authenticated sources;
- service paths are explicitly tenant scoped;
- OpenSearch documents remain organization-scoped and rebuildable.

---

## 12. Active ordered implementation priority

Close one product area completely before moving to the next. Do not skip an unresolved production-integrity blocker.

Current order:

1. **Core CRM + lead/customer management — CLOSED V1**
2. **Customer Journey / Person 360 / Identity — ACTIVE NEXT**
3. Universal Tracking SDK + consent — close live production proof
4. Funnel + attribution + revenue foundation — close end-to-end revenue reconciliation
5. WhatsApp automation — close remaining Operations/Growth live production proof
6. Instagram automation — close provider permission + live E2E proof
7. Smart Triggers / workflow engine — final closeout audit
8. SEO / AEO / search intelligence — final closeout audit
9. Event Intelligence / feature store — final closeout audit
10. Predictive-model infrastructure — final readiness/promotion closeout
11. Proven predictive accuracy from real outcomes — data-dependent calibration proof
12. Full advanced R11–R14 intelligence/autonomy — later North-Star work

The live tracking target still requires:
- direct-install the universal browser SDK on Yogakulam;
- verify consent/GPC and browser event collection;
- verify session/page/CTA/form events in canonical `raw_events`;
- connect form success to exact-session anonymous-to-lead identity;
- instrument reservation/checkout/payment/enrollment with trusted server events;
- prove revenue attribution end-to-end;
- refresh feature-store state from live behavior;
- evaluate/calibrate predictive models only from sufficient real outcomes.

---

## 13. Checkpoint rule

`docs/SalsysOS_Current_Checkpoint.md` is the latest operational checkpoint.

Historical milestone files under `docs/checkpoints/` are evidence records. Preserve them; update active milestone documents when their status progresses, and create a new checkpoint for materially new production proof.
