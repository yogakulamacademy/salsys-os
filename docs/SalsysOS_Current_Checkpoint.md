# SalsysOS Current Checkpoint

**Date:** 2026-10-20  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Production head at Customer 360 / Identity closeout:** `d6de657f468e8ba01c8f460bd0b09fd49aeb4497`

This file is the current operational checkpoint. Historical milestone files under `docs/checkpoints/` remain evidence records and should not be rewritten to pretend earlier work happened differently.

## 0. Ordered product closeout status

The current execution rule is to close one product area completely before moving to the next.

### Area 1 — Core CRM + lead/customer management: CLOSED at V1 production-integrity level

Canonical evidence:

`docs/checkpoints/M-2026-10-20-CRM-Core-Closeout-v1.md`

Production proof for Yogakulam Academy after the closeout migrations:

- lead count: `31`;
- `v_crm_core_integrity_health_v1.integrity_issue_count = 0`;
- `v_crm_core_integrity_health_v1.health_status = healthy`;
- no missing lead contacts, stage history, Person linkage or attribution;
- no stage/history or stage/status drift;
- no follow-up cache mismatch;
- no invalid active lead/task/conversation ownership;
- no contact/task/attribution/Person/conversation tenant mismatch;
- no message lineage mismatch;
- no duplicate primary contact type;
- canonical lead stage mutations remain routed through `set_lead_stage()`;
- future committed lead-stage/history drift is blocked by a deferred integrity constraint;
- active CRM assignments are cleared automatically if an organization member is deactivated/deleted.

Main CI run #238 passed and the production Vercel deployment for the closeout SHA is `READY`.

### Area 2 — Customer Journey / Person 360 / Identity: CLOSED at V1 production-integrity level

Canonical evidence:

`docs/checkpoints/M-2026-10-20-Customer360-Identity-Closeout-v1.md`

Production proof for Yogakulam Academy after the identity closeout migration:

- 31 leads and 31 Persons;
- 31 Person-to-lead links;
- 57 Person identifiers;
- 39 Person-to-session links;
- 22 current visitor routing records;
- every audited Customer 360 / identity integrity counter = `0`;
- `v_customer360_identity_integrity_health_v1.integrity_issue_count = 0`;
- `v_customer360_identity_integrity_health_v1.health_status = healthy`;
- 0 open identity conflicts;
- 0 tenant mismatches across Person/lead/identifier/session/current visitor routing;
- 0 duplicate identifiers owned by different Persons;
- complete Person 360, operational Person 360, Person journey and lead journey coverage;
- 0 duplicate canonical journey keys;
- exact-session identity handoff is now one atomic service-role-only database transaction;
- both identity HTTP routes use the same atomic boundary;
- visitor routing has composite organization+lead referential protection;
- identity policies are explicit for every organization and future organizations;
- default policy threshold is `0.9800`, preventing a lone weak unverified signal from auto-merging people;
- historical shared-browser visitor reuse remains allowed while the current exact-session route must stay consistent.

Main CI run #243 passed for SHA `d6de657f468e8ba01c8f460bd0b09fd49aeb4497`, and production Vercel deployment `dpl_GfDmtZ5Wi5aBHoZn5f3u1CjjaZib` is `READY`.

**Next ordered area:** Universal Tracking SDK + Consent — live production closeout.

These closeouts are deliberately scoped. They do not claim live tracking cutover, predictive accuracy, remaining channel live proof or R11–R14 autonomy are complete.

## 1. North-Star progress

Latest conversational planning estimate after the recent tracking, messaging and intelligence work: **~77% complete / ~23% remaining** for the complete R0–R14 North-Star.

Latest conversational planning estimate for the core operating product through R10: **~96% complete / ~4% remaining**.

These percentages are planning estimates, not telemetry-derived completion metrics, and should be rebaselined only when the roadmap is reviewed end-to-end.

The remaining North-Star work is concentrated in:
- finishing live production proof for tracking/channel integrations;
- finishing Event Intelligence + predictive maturity from real labeled outcomes;
- reusable Wellness/Education productization;
- commercial SaaS provisioning/billing/onboarding/support;
- Realty vertical productization;
- GTM and first-100-customer execution.

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

The later WhatsApp Operations/Growth layer adds inbox, quick replies, reusable audience segments, approved-template campaigns, guarded broadcast execution, personalization, A/B variants, routing and conversion/revenue attribution. Broader campaign execution remains governed by the same fail-closed safety posture.

## 3. Instagram Operations milestone

Instagram Operations V1 is merged and deployed. It follows Meta's user-initiated messaging model rather than cloning WhatsApp cold/bulk broadcast behavior.

Implemented:
- inbound Instagram DM -> canonical CRM ingestion;
- manual outbound replies through the connected Instagram provider;
- standard 24-hour DM reachability checks;
- quick replies in the shared conversation composer;
- keyword/event automation rules;
- comment webhook ingestion and guarded one-time comment -> private-DM automation;
- STOP/suppression and per-user frequency limits;
- human approvals, deterministic idempotency, fail-closed provider gates and pilot cap/allowlist;
- guarded scheduled runner;
- canonical outbound CRM lineage and reply reconciliation;
- tenant-bound Instagram Operations workspace and CI contracts.

Live comment-to-DM proof still requires the connected Instagram account to be reauthorized with `instagram_business_manage_comments` and the relevant Meta webhook/app permissions to be active. This is an external live-proof dependency, not a reason to invent a broad-DM primitive.

## 4. Event Intelligence — current implementation state

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
- Search outbox constraint allows Event Intelligence derived entity types.
- privacy-aware signal-quality and Safe-V2 feature snapshots exist;
- prediction freshness guards exist;
- realized probability-outcome observation, calibration metrics and drift instrumentation exist;
- scheduled outcome observation exists.

### Universal Tracking Intelligence SDK V1

The developer-facing tracking layer is **Salsys Universal Tracking Intelligence SDK V1**.

Implemented:

- product-facing browser entrypoint: `public/salsys-intelligence.js`;
- browser tracking core: `public/salsys-tracker.js`;
- canonical integration boundary: HTTPS + JSON;
- `docs/universal-event-protocol-v1.md` defines the protocol;
- `schemas/salsys-event-v1.schema.json` defines the machine-readable canonical envelope;
- `docs/universal-tracking-intelligence-sdk.md` defines SDK architecture and developer API;
- `docs/event-tracking-v1.md` defines event naming, authority boundaries and the V1 event model;
- `/api/events/identify/v1` provides tracking-source-authenticated exact-session anonymous -> CRM lead handoff;
- browser event ingestion restores trusted server-side geo context where available without persisting raw client IP;
- PHP-specific Event Intelligence relay/runtime has been removed from the universal architecture;
- runtime-specific SDKs are optional wrappers and must not introduce parallel event semantics.

The identity closeout hardened `/api/events/identify/v1` and `/api/tracking/identify` so both use `attach_exact_session_identity_v1(...)`, a single tenant-bound atomic database boundary for exact-session handoff and Person reconciliation.

### Pre-existing tracking compatibility audit — completed in code, live proof pending

Canonical evidence record:

`docs/checkpoints/M-2026-10-19-Universal-Tracking-Compatibility-Audit-v1.md`

Compatibility work includes:

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

This compatibility work does **not** claim that the live Yogakulam production website journey has been cut over or proven yet.

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

## 5. End-to-end tracking target

The live tracking milestone is **not yet complete**.

The user-approved architecture is:

`website/app/service -> Universal Tracking Intelligence SDK or canonical HTTPS client -> optional platform-neutral first-party transport/outbox -> canonical event contract -> PostgreSQL raw events -> normalization/identity/attribution -> feature store -> predictions -> optional OpenSearch projection -> recommendations/outcomes`

Core tracking must not depend on GTM, GA4, Meta, a backend programming language, framework, database, or any single downstream system. GTM may remain optional for marketing tags/experiments.

### Acceptance test required before tracking is called complete

A real production journey must prove:

`campaign/click id -> website visitor -> session -> page/CTA behavior -> consent -> enquiry/form -> CRM lead -> exact-session anonymous identity attached -> checkout -> payment -> enrollment -> revenue -> attribution -> features -> prediction/recommendation -> observed outcome`

The same journey must be reconcilable in PostgreSQL-backed Tracking, Person 360, Funnel, Attribution and Revenue views.

## 6. Direct website tracking direction

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

## 7. Predictive intelligence direction

The Event Intelligence layer must support traffic, SEO, paid media, lead and revenue intelligence from the same event graph.

Maturity rule:
1. deterministic/explainable features and scores first;
2. statistical/ML prediction only after sufficient real outcomes;
3. adaptive/tenant-specific learning only after model evaluation and promotion controls pass.

Required prediction evidence fields include model key/version/mode, feature state, reason codes, confidence/evidence, generated/expiry times and eventual actual outcome.

Rules-generated scores must never be presented as calibrated probabilities.

Current production evidence is still insufficient to claim calibrated lead-conversion accuracy. The system must continue to treat unavailable behavioral evidence as unknown, not as negative intent, and must not manufacture probability outputs or model-training evidence.

## 8. Active ordered implementation sequence

The product areas are now being closed one by one:

1. **Core CRM + lead/customer management — CLOSED V1**
2. **Customer Journey / Person 360 / Identity — CLOSED V1**
3. **Universal Tracking SDK + consent — ACTIVE NEXT; close live production proof**
4. Funnel + attribution + revenue foundation — close E2E revenue reconciliation
5. WhatsApp automation — close remaining Operations/Growth production proof
6. Instagram automation — close provider permission + live E2E proof
7. Smart Triggers / workflow engine — final closeout audit
8. SEO / AEO / search intelligence — final closeout audit
9. Event Intelligence / feature store — final closeout audit
10. Predictive-model infrastructure — final readiness/promotion closeout
11. Proven predictive accuracy from real outcomes — data-dependent calibration proof
12. Full advanced R11–R14 intelligence/autonomy — later North-Star work

Do not skip forward while the active area has an unresolved production-integrity blocker.

## 9. Safety defaults

Unless a separate approved checkpoint explicitly changes them:
- autonomous customer messaging OFF;
- auto website publishing OFF;
- auto ad-budget changes OFF;
- broad/global OpenSearch indexing OFF;
- PostgreSQL remains the source of truth;
- human approval remains required for sensitive/high-impact actions;
- no fake traffic, rankings, revenue, conversion outcomes or model-training evidence.

## 10. Checkpoint maintenance rule

After every meaningful production milestone:
- update this file;
- update `docs/SalsysOS_North_Star_Product_Context.md` if roadmap/progress changed;
- update the relevant active checkpoint file;
- add a new historical milestone record when production proof materially changes system state;
- do not rewrite historical evidence simply to match the latest plan.
