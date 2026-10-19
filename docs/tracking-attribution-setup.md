# SalsysOS universal first-party tracking + attribution setup

**Status:** Active implementation plan, updated 2026-10-19.

The old GTM-optional tracker milestone has evolved into **Salsys Universal Tracking Intelligence**. Core tracking must be directly installable in website/app source and must not depend on GTM, GA4, Meta, a particular backend language, framework, database, or any single downstream vendor.

## Architecture

```text
website / app / service
    ↓
Universal Tracking Intelligence SDK or canonical HTTPS client
    ↓
optional first-party transport / durable outbox
    ↓
canonical event contract
    ↓
SalsysOS /api/events/browser/v1 or /api/events/v1
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

## Platform and language independence

The Salsys Tracking Intelligence contract is protocol-first.

The canonical integration boundary is HTTPS + JSON, not a specific programming language or runtime. Any environment that can make HTTPS requests can emit trusted server events. Website, mobile, edge and backend implementations may use native SDKs or the raw protocol without changing the event vocabulary.

The browser SDK remains JavaScript because it executes in browsers, but it does not depend on the technology that generated the page. It can be installed in static HTML, WordPress, Laravel, Django, Rails, Java/Spring, .NET, Node/Next.js, React/Vue/Angular frontends, hosted storefronts and other web stacks without a backend-language-specific tracker.

Durability is also a contract rather than one storage implementation. A first-party deployment may use IndexedDB, SQLite, PostgreSQL, MySQL, Redis, a queue, KV storage or another durable mechanism as appropriate to the host platform.

## Current foundation

Available in the SalsysOS codebase:
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
- exact-session trusted identity handoff at `/api/events/identify/v1` on the universal branch;
- website raw-event normalization to `web_sessions` and `touchpoints`;
- identity linking and attribution foundations;
- Event Intelligence feature/prediction foundations;
- guarded derived OpenSearch projection support.

## Visitor/session continuity

Existing first-party identifiers `yk_vid` and `yk_sid` represent historical Yogakulam continuity. The Universal Tracking Intelligence entrypoint can read those values during the controlled Yogakulam migration so returning visitors are not silently reset.

The canonical vocabulary remains neutral:

```text
anonymous_visitor_id
session_key
```

Legacy aliases are migration inputs only; new tenants must not adopt Yogakulam-specific names.

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
- `identity.*`
- `lead.*`
- `conversation.*`
- `message.*`
- `booking.*`
- `payment.*`
- `enrollment.*`
- `automation.*`
- `privacy.*`
- `system.*`
- `custom.*`

Tenant/domain-specific semantics may be added through contracts/configuration without forking the SDK.

## Direct website installation

Install the Universal Tracking Intelligence SDK directly in the website source/common layout:

```html
<script
  src="https://salsysos.com/salsys-intelligence.js"
  data-consent-mode="required"
  defer>
</script>
```

The website hostname is inferred by default. A configured `data-site` may be supplied when needed.

During Yogakulam cutover, remove the old `yogakulam-tracker.js` installation when enabling the new SDK so the same browser action is not counted twice.

## First-party transport / durable outbox

A deployment may optionally route browser events through a customer-domain first-party endpoint, for example:

```text
https://customer.example/events
```

The first-party transport should:
1. preserve the canonical event contract;
2. store a durable outbox record or equivalent retry-safe event record when durability is enabled;
3. acknowledge the client quickly;
4. forward/retry delivery to SalsysOS;
5. preserve the same canonical `event_id` across retries;
6. remain implementation-neutral so the same protocol can be hosted in any supported runtime.

A reverse proxy, edge worker, serverless function, application route, message queue worker or conventional backend service may satisfy this contract. No backend language is part of the Salsys Tracking Intelligence specification.

## Trusted server event transport

Trusted lifecycle events use:

```text
POST /api/events/v1
X-Salsys-Source-Key: <source-key>
Authorization: Bearer <tracking-source-secret>
Content-Type: application/json
```

This is the universal server integration boundary. Language-specific helper libraries may be added later for developer convenience, but they remain thin clients over the same canonical protocol.

## Trusted identity handoff

On a successful enquiry/lead creation, the website/backend links the anonymous journey to the CRM lead through:

```text
POST /api/events/identify/v1
X-Salsys-Source-Key: <source-key>
Authorization: Bearer <tracking-source-secret>
Content-Type: application/json
```

Example:

```json
{
  "event_id": "identify_01...",
  "lead_id": "<crm-lead-id>",
  "anonymous_visitor_id": "v_01...",
  "session_key": "s_01..."
}
```

The identity handoff is exact-session scoped. The lead must belong to the authenticated tracking-source tenant, and the exact session must already exist in that tenant for the supplied anonymous visitor. A visitor/browser ID alone is not enough to attach history.

Never expose tracking-source secrets to browser JavaScript.

## Consent

Optional analytics/advertising events must respect purpose-specific consent/GPC policy before persistence/processing where required.

The SDK supports grant, deny, withdrawal and preference changes. Analytics consent does not imply marketing, advertising, personalization or sale/sharing consent.

During the Yogakulam migration, the compatibility layer translates established consent state into the neutral purposes without inventing missing permissions. A stored prior analytics grant is recorded through the new privacy endpoint before normal analytics collection is allowed; if that grant cannot be safely migrated, collection remains fail-closed.

## Acquisition capture

Capture first-touch and current-session values where observed:
- UTM source/medium/campaign/content/term/id;
- `gclid`, `gbraid`, `wbraid`, `fbclid`;
- Google campaign/ad group/creative identifiers when supplied;
- Meta campaign/adset/ad identifiers when supplied;
- landing URL/path/title;
- referrer;
- source/medium normalization.

During Yogakulam migration, established URL aliases such as `campaignid`, `adgroupid` and `creative` are translated into the canonical acquisition state. New integrations should use the canonical names.

Do not manufacture missing ad identifiers.

## Behavioral events

Initial website events cover:
- session start;
- page/content view;
- CTA click;
- WhatsApp/call/email/Instagram contact clicks;
- enrollment/booking intent clicks;
- form start;
- form submit;
- explicit custom `web.*` contracts where registered.

Browser events may describe intent/action, but the browser is **not** authoritative for payment success, enrollment completion, refunds or revenue.

## Server-side context enrichment

The browser-safe event route may add country, region, city and timezone from trusted hosting/proxy headers where available. The browser does not choose this trusted context, and the route does not persist the raw client IP address.

## Payments, enrollment and revenue

The authoritative events must come from trusted server/payment/backend evidence:
- `booking.started`
- `booking.completed`
- `payment.started`
- `payment.completed`
- `payment.failed`
- `enrollment.completed`
- refund/cancellation events when implemented.

Revenue attribution must be based on real transaction/enrollment state rather than browser conversion events or ad-platform self-reported conversions.

## Pre-existing tracking compatibility

The Yogakulam compatibility audit is recorded at:

```text
docs/checkpoints/M-2026-10-19-Universal-Tracking-Compatibility-Audit-v1.md
```

The branch preserves or translates the proven legacy behaviors needed by existing funnel/attribution/intelligence logic, including visitor/session/first-touch continuity, purpose-specific consent migration, CTA classifications, exact-session lead identity attachment, semantic touchpoint projection and trusted geo context.

Temporary migration shims such as `data-yk-event`, `yk:consent`, `YKTracking` and `yk_tracking_ready` are not the universal contract for new tenants.

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

Tracking is not production-complete until one controlled real production journey proves:

```text
campaign/click id
→ Yogakulam visitor
→ session
→ page/CTA behavior
→ consent
→ form/enquiry
→ CRM lead
→ exact-session identity linked
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

1. pass GitHub CI and deployment build for the universal branch;
2. direct-install `salsys-intelligence.js` in Yogakulam source and remove the old tracker to prevent duplicate events;
3. run controlled compatibility and privacy tests;
4. verify exact-session identity handoff;
5. instrument trusted booking/payment/enrollment events;
6. prove revenue attribution and the full Event Intelligence journey.
