# SalsysOS North Star Product Context

**Status:** Canonical product/context/progress source of truth  
**Last updated:** 2026-10-25  
**Repository:** `yogakulamacademy/salsys-os`

> Read this file first when SalsysOS context is incomplete. Use `docs/SalsysOS_Current_Checkpoint.md` for the latest operational state and `docs/checkpoints/` for milestone evidence.

---

## 1. North Star

SalsysOS = **Sales + Analysis Operating System**: an **AI-native Customer Journey Intelligence + Revenue Intelligence operating system**, not a generic CRM and not a vertical scheduling/POS clone.

Core question:

> **What is this person likely to do next, why, and what should we do right now to increase the probability of conversion and revenue?**

Primary vertical: Yoga / Education / Wellness, with Yogakulam Academy as the first production tenant. Planned second vertical: Real Estate.

Long-term positioning:

> **SalsysOS connects a business's website, advertising, conversations, CRM, payments and customer activity into one identity graph, then uses that data to capture, nurture, convert and retain customers.**

Salsys should sit above and connect the tools a business already uses. It should not require Salsys to replace WordPress, Shopify, WooCommerce, Stripe, Razorpay, Calendly, Momence, Mindbody, HubSpot or a custom website before it can deliver value.

Core loop:

`marketing spend -> traffic -> source/campaign/content -> anonymous behavior -> identity resolution -> lead -> conversation -> intent/objection/product affinity -> salesperson/AI agent -> follow-up/journey -> checkout/payment/enrollment -> revenue -> attribution -> feature state -> prediction/recommendation -> action -> observed outcome -> learning`

Principles:
- PostgreSQL is the source of truth;
- raw events remain separate from derived CRM/journey state;
- identity must be deterministic where possible and confidence-bearing when inferred;
- observed facts and predictions are never silently mixed;
- revenue-linked analytics matter more than vanity metrics;
- privacy/consent must be enforced before optional behavioral processing;
- OpenSearch is secondary/rebuildable, never the truth store;
- automation is fail-closed and high-impact actions require explicit policy/approval;
- browser lead capture may identify a person only through explicit configured/allowlisted lead fields;
- browser events are not authority for payments, enrollment, refunds or final revenue;
- connector-first productization is preferred over rebuilding every operational system;
- no fake traffic, rankings, revenue, conversions, outcomes or training evidence.

---

## 2. Current completion snapshot

Latest conversational planning estimates after the October tracking, messaging, intelligence, CRM and identity closeout work:

| Scope | Estimate |
|---|---:|
| Core SalsysOS operating product through R10 | ~96% |
| Complete North-Star R0-R14 | ~77% |
| Remaining full North-Star work | ~23% |

These are planning estimates, not telemetry-derived metrics. Rebaseline them only after reviewing the roadmap end-to-end.

The ordered closeout sequence is active. **Core CRM + lead/customer management** and **Customer Journey / Person 360 / Identity** are both closed at V1 production-integrity level. Production evidence is recorded in:

- `docs/checkpoints/M-2026-10-20-CRM-Core-Closeout-v1.md`;
- `docs/checkpoints/M-2026-10-20-Customer360-Identity-Closeout-v1.md`.

Universal Tracking has now progressed beyond basic browser ingestion: **Universal Lead Capture V1 has a production browser -> lead -> Person 360 -> exact session linkage proof without a tenant-specific PHP CRM helper.** Full Universal Tracking closeout still requires the trusted checkout/payment/enrollment/revenue side of the journey.

Most remaining full-scope work is concentrated in revenue reconciliation, the new reusable Growth Operating Layer, live production proof across messaging/connectors, predictive maturity from real outcomes, and R11-R14 commercial productization.

---

## 3. Commercial roadmap — fixed R0-R14

| Phase | Working state |
|---|---|
| R0 Platform Rebrand | ~95% |
| R1 Foundation / Tenancy / Security | ~99% |
| R2 Lead Capture / Identity / Raw Events / Data Quality | identity integrity V1 closed; Universal Lead Capture V1 production proof complete; broader revenue journey remains |
| R3 CRM Sales Execution | **V1 production-integrity closed** |
| R4 Customer Journey / 360 | **V1 production-integrity closed** |
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

The **Growth Operating Layer** defined below spans primarily R2, R5, R7, R10, R11 and R13. It does not create a separate roadmap numbering system.

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
Browser SDK                 direct web instrumentation + configured lead capture
HTTPS Event API             canonical trusted-server integration
First-party transport       optional runtime-neutral relay/proxy/outbox
Runtime SDKs                optional convenience wrappers
Connectors/webhooks         platform/provider event ingestion
```

The current browser implementation is `public/salsys-tracker.js`, entered through `public/salsys-intelligence.js`. It is website-platform independent and supports anonymous/session identity, acquisition capture, page/session/CTA/form events, consent/GPC handling, SPA tracking, form decoration and retry queuing.

Universal Lead Capture extends this with a browser-safe Site-ID/origin-bound path for configured lead identity capture. Basic lead capture must not require Salsys staff to install a tenant-specific backend helper on every customer's website.

### Event tracking authority

Browser events describe observed behavior and intent. Trusted server/provider events establish business truth.

Browser examples:

```text
web.session_started
web.page_viewed
web.cta_clicked
web.form_started
web.form_submitted
lead.captured
```

Trusted-source examples:

```text
lead.created
booking.started
booking.completed
payment.started
payment.completed
payment.failed
payment.refunded
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
- `/api/leads/browser/v1` public-Site-ID/origin-bound lead capture;
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
- scheduled outcome observation;
- atomic exact-session anonymous-to-lead/Person identity handoff via `attach_exact_session_identity_v1`;
- tenant-bound current visitor routing and conservative explicit identity policy provisioning;
- Universal Lead Capture production proof creating a real CRM lead, Person, visitor link and exact web-session link from the Yogakulam browser without `yogakulam-crm.php`.

### Architecture cleanup

The previous backend-language-specific Event Intelligence relay package is not part of the North-Star architecture. The active tracking model is platform/language independent. Legacy tenant-specific website integration code may remain where it supports an existing production workflow, but it is not the universal tracking contract.

### Not yet complete

Universal Tracking closeout still requires the authoritative business-event side of the journey.

Tracking is only fully complete when a real journey proves:

`campaign/click id -> visitor -> session -> behavior -> consent -> enquiry -> CRM lead -> Person/session identity linkage -> checkout -> payment -> enrollment -> revenue -> attribution -> feature state -> prediction/recommendation -> observed outcome`

---

## 5. Tracking deployment rule

Core tracking must not depend on GTM, GA4, Meta, a backend programming language or any single downstream vendor.

Preferred deployment:
- direct universal browser SDK in website source/common layout;
- public Site ID + registered origin for browser-safe tenant resolution;
- tenant-neutral SDK/event vocabulary;
- browser-safe configured lead capture;
- optional first-party transport endpoint with no runtime/file-extension requirement;
- durable local outbox/retry behavior implemented by the host platform where required;
- stable event IDs and idempotency;
- preserve existing first-party visitor/session continuity during migration;
- connector/webhook/server-to-server identity and business-event linking;
- server/provider-authoritative payment/enrollment/revenue events.

The browser SDK must work independently of the server technology that renders or hosts the site. Trusted server integrations use the same HTTPS/JSON event contract from any runtime.

A new customer must be able to connect through one or more supported onboarding methods without giving Salsys staff FTP/cPanel access: script install, native plugin, form integration, webhook, connector, automation platform or trusted API.

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

Universal Lead Capture must never silently scrape arbitrary form values. Passwords, payment-card data, authentication tokens, secrets and sensitive fields are excluded. Lead identity capture uses explicit safe-field policies and configurable lawful-purpose/consent controls.

Event Intelligence is the technical foundation for this layer.

---

## 11. Multi-tenant contract

- one organization = one tenant = isolated data boundary;
- session resolves one trusted tenant;
- normal client payloads cannot authorize an organization merely by sending an ID;
- browser tracking/lead capture tenant resolution comes from trusted configured Site ID + origin/source;
- server tracking uses registered authenticated sources;
- service paths are explicitly tenant scoped;
- exact-session identity handoff validates organization + lead + session + anonymous visitor inside one service-role-only transaction;
- connectors must bind their provider account/resource to exactly one authorized organization context;
- OpenSearch documents remain organization-scoped and rebuildable.

---

## 12. Growth Operating Layer — North-Star feature set

This layer converts the tracking/identity/CRM foundation into a reusable SaaS product that can acquire, understand, nurture and convert customers across businesses without requiring Salsys to replace their operational stack.

### 12.1 Universal Forms + Form Discovery

Two supported product modes:

**Existing website forms**
- SDK discovers eligible forms;
- customer sees detected forms inside SalsysOS;
- field mapping for name/email/phone/country/product/course/message/custom safe fields;
- explicit enable/disable per form;
- configured default source/stage/owner/journey;
- allowlisted lead-field capture only;
- same anonymous visitor/session attached to the CRM lead and Person 360;
- no tenant-specific PHP helper required for normal browser lead capture.

**Salsys Hosted/Embedded Forms**
- dashboard form builder;
- embeddable form snippet and hosted form URL;
- source/product/stage/owner mapping;
- custom fields and consent controls;
- automatic lead + identity + journey creation.

Target customer experience:

`install SDK -> detected forms -> map fields -> enable capture -> leads automatically appear with journey context`

### 12.2 Universal Lead Sources

Lead source is a first-class revenue object, not a free-text CRM field.

A lead/source record should be able to retain:
- source and medium;
- campaign/ad set/ad/content/keyword where available;
- first-touch and latest/last-touch context;
- click IDs such as gclid/fbclid and supported provider IDs;
- landing page and conversion page;
- form/source asset;
- referring channel/provider;
- product/course/location interest;
- anonymous visitor/session chain;
- eventual qualified lead, booking, payment, enrollment and revenue outcomes.

Source analytics must answer not only **where leads came from**, but **which sources generated qualified pipeline and realized revenue**.

### 12.3 Salsys Journeys / Sequences

Smart Triggers evolve into a visual/event-driven Journey engine using:

`trigger -> filters -> actions -> waits -> conditions -> branches -> counter-conditions/stop rules -> observed outcome`

Journey triggers may include lead creation, source/campaign, page/form behavior, intent threshold, conversation state, no-response timer, booking/payment/enrollment state and trusted provider events.

Actions may include:
- WhatsApp/email/SMS/Instagram/webchat messaging where permitted;
- human task/follow-up creation;
- owner assignment/routing;
- CRM stage or tag updates;
- webhook/API/connector actions;
- AI-generated draft/recommendation;
- approval request;
- audience/segment membership update.

Counter-conditions are first-class. Example: stop an enrollment nurture journey when `payment.completed`, `enrollment.completed`, human reply, opt-out or lead loss occurs.

### 12.4 Universal Funnel + Revenue Intelligence

Funnel Builder should allow tenant-defined funnels over canonical events, including examples such as:

`ad/campaign -> visit -> product page -> CTA -> form start -> lead -> qualified -> checkout -> deposit -> payment -> enrollment`

Required capabilities:
- stage conversion and drop-off;
- time-to-next-stage;
- source/campaign/content breakdown;
- device/location/audience breakdown where lawful;
- product/course affinity;
- pipeline value and realized revenue;
- first/last/multi-touch attribution views;
- bottleneck detection;
- explainable AI summaries of likely drop-off drivers;
- potential-revenue impact estimates clearly labeled as estimates, not observed revenue.

### 12.5 Person 360 as the operating center

Person 360 is the canonical operational surface combining:
- identities and identifiers;
- anonymous visitor/session history;
- website behavior;
- lead/source/campaign history;
- product/course interest and affinity;
- WhatsApp/Instagram/email/webchat conversations;
- owner/tasks/follow-ups;
- booking/payment/enrollment/refund history;
- attribution and revenue;
- intent/objections/next-best action;
- prediction/recommendation evidence;
- observed outcomes.

The product should minimize the need for staff to manually answer “who is this person and what happened before?”

### 12.6 Unified Inbox + Webchat

Target shared conversation layer:

`WhatsApp + Instagram + Email + Website Chat + supported SMS/social channels -> one Person 360 conversation timeline`

Webchat target:
- install through Salsys SDK/widget;
- anonymous visitor/session already known where tracking is allowed;
- lead creation/update when identity is supplied;
- AI or human reply inside the same inbox;
- routing/assignment and business-hours handling;
- conversation events feed intent, journey and attribution systems.

### 12.7 Policy-driven AI Agent layer

AI agents must operate inside explicit business policy, permissions and approval boundaries.

Pattern:

`business policy -> AI evaluates request/state -> permitted action OR human approval/escalation -> auditable execution -> observed outcome`

Example policies:
- discounts and price overrides;
- refunds/cancellations;
- payment-plan exceptions;
- visa/admission-letter policy;
- recording/access extension;
- late arrival/rescheduling;
- accommodation upgrades;
- messaging permissions and frequency.

High-impact actions remain fail-closed. AI should be able to draft/recommend broadly while execution authority stays policy-bound.

### 12.8 Payment, Booking and Operational Connectors

Salsys should initially integrate with operational/payment systems rather than attempting to replace all of them.

Priority connector/event targets include:
- Stripe;
- Razorpay;
- PayPal;
- Cashfree/other supported regional gateways;
- WooCommerce;
- Shopify;
- Calendly/scheduling platforms;
- Momence/Mindbody or comparable experience-business platforms where APIs/webhooks permit;
- custom checkout/backends through trusted API/webhooks;
- Zapier/Make/n8n style automation paths.

Canonical business events include:

```text
booking.started
booking.completed
booking.cancelled
checkout.started
payment.started
payment.deposit_paid
payment.completed
payment.failed
payment.refunded
payment.installment_due
payment.installment_failed
enrollment.completed
enrollment.cancelled
```

These authoritative events feed Person 360, Journeys, funnel/revenue attribution, feature state and predictive outcomes.

### 12.9 Integration marketplace / Salsys Connect

Commercial productization should expose modular integrations rather than tenant-specific hidden wiring.

Target categories:
- websites/CMS;
- forms;
- messaging/social;
- ads/analytics;
- payments/ecommerce;
- scheduling/booking;
- email/SMS;
- data warehouse/BI;
- automation platforms;
- developer APIs/webhooks.

Each integration must declare authentication mode, scopes, supported events/actions, tenant binding, sync direction, replay/idempotency behavior and health state.

### 12.10 Product boundary — what not to build early

Do not dilute SalsysOS by prematurely rebuilding every vertical operations product.

Native class scheduling, membership billing, spot selection, POS, inventory, staff clock-in, kiosk check-in, door access, workout programming and similar operational features are **not core near-term North-Star requirements** unless validated customer demand changes the strategy.

Preferred strategy:

`connect operational system -> unify identity/events -> attribute revenue -> automate customer journey -> improve conversion/retention`

SalsysOS should understand and grow the business even when another platform runs the studio/store/calendar.

---

## 13. Active ordered implementation priority

Close one product area completely before moving to the next. Do not skip an unresolved production-integrity blocker.

Current order:

1. **Core CRM + lead/customer management — CLOSED V1**
2. **Customer Journey / Person 360 / Identity — CLOSED V1**
3. **Universal Tracking + Universal Lead Capture — browser/lead/identity proof complete; close trusted business-event/revenue journey**
4. **Detected Forms + Field Mapping UI — productize Universal Lead Capture for self-service SaaS onboarding**
5. **Universal Lead Sources + Funnel/Revenue Attribution — source-to-revenue model and end-to-end reconciliation**
6. **Salsys Journeys / Sequences — evolve Smart Triggers into event-driven journeys with stop/counter-conditions**
7. **Unified Inbox + Webchat — converge website, WhatsApp, Instagram and email conversations around Person 360**
8. **Payment/Booking connectors — trusted provider events for checkout, deposit, payment, refund and enrollment**
9. WhatsApp Operations/Growth — close remaining live production proof and integrate into Journeys/Inbox
10. Instagram Operations — close provider permission + live E2E proof and integrate into Journeys/Inbox
11. SEO / AEO / search intelligence — final closeout audit
12. Event Intelligence / feature store — final closeout audit with Growth Operating Layer signals
13. Predictive-model infrastructure — final readiness/promotion closeout
14. Proven predictive accuracy from real outcomes — data-dependent calibration proof
15. Policy-driven AI Sales/Service Agent — guarded actions using Journey, Person 360 and business-policy context
16. Integration marketplace / commercial connector packaging
17. Full advanced R11-R14 intelligence/autonomy, verticalization and go-to-market — later North-Star work

Immediate near-term build order after Universal Lead Capture production proof:

`Detected Forms + Field Mapping -> Universal Lead Sources -> Funnel/Revenue Attribution -> Journeys -> Unified Inbox/Webchat -> Payment/Booking Connectors -> AI Agent layer`

The remaining full live journey target requires:
- test automatic lead capture from a real detected website form, not only a manual browser API call;
- instrument reservation/checkout/payment/enrollment with trusted server/provider events;
- prove revenue attribution end-to-end;
- refresh feature-store state from live behavior and business outcomes;
- evaluate/calibrate predictive models only from sufficient real outcomes.

---

## 14. Checkpoint rule

`docs/SalsysOS_Current_Checkpoint.md` is the latest operational checkpoint.

Historical milestone files under `docs/checkpoints/` are evidence records. Preserve them; update active milestone documents when their status progresses, and create a new checkpoint for materially new production proof.
