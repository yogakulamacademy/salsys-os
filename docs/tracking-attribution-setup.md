# SalsysOS universal first-party tracking + attribution setup

**Status:** Active implementation plan, updated 2026-10-19.

The old GTM-optional tracker milestone has evolved into **Salsys Event Intelligence**. Core tracking must be directly installable in website/app source and must not depend on GTM, GA4, Meta, or any single downstream vendor.

## Architecture

```text
website / app
    ↓
universal first-party SDK
    ↓
first-party website relay / durable outbox
    ↓
canonical event contract
    ↓
SalsysOS /api/events/v1 or /api/events/browser/v1
    ↓
PostgreSQL raw_events (source of truth)
    ↓
sessions / touchpoints / identity / attribution
    ↓
feature store / predictions / observed outcomes
    ↓
optional OpenSearch derived projection
```

GTM may remain for marketing tags, debugging and experiments, but it is not allowed to own visitor identity, CRM attribution, payment truth, revenue truth or the canonical customer journey.

## Current production foundation

Already available:
- registered tracking sources for Yogakulam/Yogakulam Academy domains;
- event family + event contract registry;
- source rate limits;
- origin-resolved browser source authorization;
- server source-secret authentication;
- generic payload sanitization/redaction;
- privacy gate and GPC-aware controls;
- canonical idempotent raw-event ingestion;
- browser `/api/events/browser/v1` ingestion;
- server `/api/events/v1` ingestion;
- website raw-event normalization to `web_sessions` and `touchpoints`;
- identity linking and attribution foundations;
- Event Intelligence feature/prediction foundations;
- guarded derived OpenSearch projection support.

## Visitor/session continuity

Existing first-party identifiers `yk_vid` and `yk_sid` represent historical Yogakulam continuity. The new universal tracker should preserve/reuse them during migration rather than silently resetting all returning visitors.

Future implementation may expose neutral internal names (`visitor_id`, `session_id`) while retaining backward compatibility with existing cookies/fields.

## Canonical event requirements

Every event needs:
- stable `event_id` for idempotency;
- `event_name` using a registered family/contract;
- `occurred_at`;
- site/source context;
- anonymous visitor/session identity where relevant;
- acquisition context where relevant;
- sanitized event properties/context;
- consent/privacy context where applicable;
- schema version.

Recommended universal event families include:
- `web.*`
- `lead.*`
- `conversation.*`
- `message.*`
- `booking.*`
- `payment.*`
- `enrollment.*`

Tenant/domain-specific semantics may be added through contracts/configuration without forking the SDK.

## Direct website installation target

Install the universal SDK directly from the website source/common layout, for example:

```html
<script
  src="/assets/js/site-tracker.js"
  data-site="yogakulam.com"
  data-consent-mode="required"
  defer>
</script>
```

The final SDK filename/config may change during implementation; do not copy this placeholder into production until the direct-source cutover checkpoint is approved.

## First-party relay/outbox

Browser events should first reach the website's own endpoint, for example:

```text
https://www.yogakulam.com/api/tracking/event.php
```

The website backend should:
1. validate/sanitize the event;
2. store a durable local outbox record or equivalent retry-safe event record;
3. acknowledge the browser quickly;
4. forward/retry delivery to SalsysOS;
5. preserve the same canonical `event_id` across retries.

This avoids losing journeys when SalsysOS or another downstream adapter is temporarily unavailable.

## Consent

Optional analytics/advertising events must respect purpose-specific consent/GPC policy before persistence/processing where required.

The tracker must support grant, deny, revoke/withdraw and preference changes. Analytics consent must not silently imply marketing, ad-user-data or personalization consent.

## Acquisition capture

Capture first-touch and current-session values where present:
- UTM source/medium/campaign/content/term/id;
- `gclid`, `gbraid`, `wbraid`, `fbclid`;
- Google campaign/ad group/creative identifiers when supplied;
- Meta campaign/adset/ad identifiers when supplied;
- landing URL/path/title;
- referrer;
- source/medium normalization.

Do not manufacture missing ad identifiers.

## Behavioral events

Initial website events should cover at minimum:
- page/content view;
- CTA click;
- WhatsApp/call/social click;
- form start;
- form submit;
- enroll/reservation open/start;
- course/batch/room selection;
- checkout start;
- payment start.

Browser events may describe intent/action, but the browser is **not** authoritative for payment success, enrollment completion, refunds or revenue.

## Lead identity

On enquiry/form completion:
- preserve visitor/session IDs in the website backend;
- create/upsert the CRM lead through the normal trusted server flow;
- identify/link the anonymous visitor/session to the known lead server-to-server;
- refresh attribution from the canonical journey.

Never expose service-role or tracking source secrets to browser JavaScript.

## Payments, enrollment and revenue

The authoritative events must come from server/payment/backend evidence:
- `booking.started`
- `booking.completed`
- `payment.started`
- `payment.completed`
- `payment.failed`
- `enrollment.completed`
- refund/cancellation events when implemented.

Revenue attribution must be based on real transaction/enrollment state rather than browser conversion events or ad-platform self-reported conversions.

## OpenSearch

Do not copy raw events into OpenSearch.

OpenSearch may contain rebuildable derived documents such as:
- event features;
- event predictions;
- session/journey summaries;
- content/SEO intelligence;
- lead intelligence/evidence.

PostgreSQL remains authoritative.

## Final E2E acceptance test

Tracking is not complete until one controlled real production journey proves:

```text
campaign/click id
→ Yogakulam visitor
→ session
→ page/CTA behavior
→ consent
→ form/enquiry
→ CRM lead
→ anonymous identity linked
→ checkout
→ payment
→ enrollment
→ revenue
→ attribution
→ feature snapshot
→ prediction/recommendation
→ actual outcome
```

Then verify the same journey in PostgreSQL-backed Tracking, Person 360, Funnel, Attribution and Revenue views, plus any guarded derived OpenSearch projection.

## Current next step

Build the direct universal SDK + Yogakulam first-party relay/outbox, then install it in the website source. Do not reintroduce GTM as a dependency for core SalsysOS tracking.
