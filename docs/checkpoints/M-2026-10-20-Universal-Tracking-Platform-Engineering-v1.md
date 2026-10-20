# M-2026-10-20 — Universal Tracking Platform engineering V1

## Status

**ENGINEERING BASELINE MERGED AND DEPLOYED; LIVE TENANT VALIDATION STILL OPEN.**

This checkpoint records the current state after PRs #89–#93. It is deliberately explicit about what is built versus what is proven live.

## Production baseline

- repository: `yogakulamacademy/salsys-os`
- production branch: `main`
- production head at this checkpoint: `1a15f8fca89c7f76f7111eeb92b221e43cd82437`
- main CI run #266: **success**
- production Vercel deployment: `dpl_6HpMP49zHgzq8zhzUgkv7r41iRG5`
- production deployment state: **READY**

Production database migrations include:

- `20261020055254_tracking_live_closeout_health_v1`
- `20261020065814_universal_publishable_client_v1`
- `20261020071043_tracking_client_source_health_v1`

## What was added

### PR #89 — live tracking + consent closeout health

Added `v_tracking_live_closeout_health_v1` so Universal Tracking + Consent closeout is based on backend evidence rather than screenshots or assumptions.

The health contract covers:

- active origin-resolved website sources;
- strict privacy configuration;
- GPC support;
- required optional-consent posture;
- Universal `web.*` event activity;
- session/page/CTA/form coverage;
- contract rejections;
- dead letters/stuck processing;
- analytics grant/deny/withdraw receipts;
- GPC sale/sharing opt-out evidence;
- exact-session identity linkage;
- identified form submissions;
- explicit `misconfigured`, `not_live`, `collecting`, `degraded`, or `backend_closeout_candidate` state.

The two Yogakulam Academy website sources were also corrected to carry an explicit privacy-notice version. Current source configuration is 4/4 strict origin browser sources with GPC and required consent enabled.

### PR #90 — Universal Tracking Platform publishable client SDK V1

Added the cross-platform publishable-client architecture without weakening trusted business-event authority.

Implemented:

- publishable `client` tracking-source class;
- `/api/events/client/v1` for non-authoritative client telemetry;
- `/api/privacy/consent/client/v1` for publishable-client consent receipts;
- client-side event allowlist restricted to `app.*` / safe `web.*` telemetry;
- source-scoped rate limits;
- PII-key redaction at the publishable-client boundary;
- `app.*` event family and initial app event contracts;
- Android Kotlin SDK V1;
- iOS Swift Package SDK V1;
- consent-aware visitor/session handling;
- bounded offline retry queues for mobile;
- SDK provenance (`sdk.name`, `sdk.version`, integration/platform metadata);
- publishable-source provisioning support.

Security boundary remains locked:

- no server secret in browser/mobile/Shopify client code;
- client SDKs cannot become authority for payment, enrollment, booking, lead, message, conversation, refund, or revenue facts;
- authoritative commercial/business events remain secret-authenticated through `/api/events/v1`.

### PR #91 — Web Platform Adapters V1

Added reusable adapters/instructions over the same canonical protocol for:

- custom-coded websites;
- WordPress installation guidance;
- Webflow;
- Framer;
- Shopify Custom Pixel;
- Shopify Web Pixel Extension source.

Shopify client telemetry remains observational/non-authoritative. Confirmed order/payment/refund/revenue truth must come from trusted server/webhook paths.

Also added `v_tracking_client_source_health_v1` for publishable-source freshness, SDK provenance, privacy receipts, sessions/events and processing failures.

### PR #92 — installable WordPress Tracking Adapter V1

Added the installable `Salsys Tracking` WordPress plugin.

Capabilities include:

- canonical Salsys browser SDK injection;
- optional Salsys consent UI;
- required-consent mode;
- privacy/cookie-policy link configuration;
- controlled lead-form selectors;
- dynamic rendered-form support without reading arbitrary input values;
- duplicate bootstrap/script protection;
- origin-bound website source provisioning;
- strict `web.*` browser authority boundary;
- no trusted server secrets in the plugin/browser runtime.

### PR #93 — Universal Tracking source-management UI V1

Added the tenant-bound Tracking Sources workspace.

Supported platform cards/install paths now include:

- Custom website / framework site;
- WordPress;
- Webflow;
- Framer;
- Shopify;
- Android;
- iOS.

The workspace provides:

- tenant-derived source provisioning;
- origin-bound website source creation;
- publishable client source creation;
- platform-specific install instructions/snippets;
- source health;
- SDK name/version/integration provenance;
- event volume/session visibility;
- privacy notice state;
- last-seen visibility;
- rejected-event visibility.

## Canonical architecture

Salsys tracking is now explicitly one platform-independent event system:

`platform adapter / SDK -> canonical event contract -> privacy/authority gate -> raw_events -> normalization -> identity/journey -> attribution/revenue -> feature state -> prediction/recommendation -> outcome learning`

Adapters do not create separate databases or separate event semantics.

### Browser/web

- `public/salsys-intelligence.js`
- `public/salsys-tracker.js`
- `public/salsys-consent.js`
- `/api/events/browser/v1`
- `/api/events/identify/v1`

### Publishable mobile/storefront clients

- `/api/events/client/v1`
- `/api/privacy/consent/client/v1`
- Android Kotlin SDK under `sdk/android/`
- iOS Swift Package under `sdk/ios/`
- Shopify adapters under `integrations/shopify/`

### Trusted server events

- `/api/events/v1`
- authenticated tracking source;
- authoritative payment/enrollment/refund/revenue/business facts only from trusted server/provider sources.

## Current production evidence

For Yogakulam Academy at this checkpoint:

- active browser sources: `4`;
- strict origin browser sources: `4`;
- sources missing privacy-notice version: `0`;
- sources without GPC: `0`;
- sources without required consent: `0`;
- browser sources ever seen by the new Universal path: `0`;
- Universal events in previous 7 days: `0`;
- browser privacy receipts in previous 7 days: `0`;
- exact-session identity links in previous 7 days: `0`;
- identified form submissions in previous 7 days: `0`;
- `backend_closeout_candidate = false`;
- `backend_status = not_live`.

Publishable client sources for the Yogakulam tenant currently: `0`.

This is expected because Android/iOS/Shopify sources have not been connected for the tenant and the live Yogakulam website has not yet been cut over to the new Universal browser path.

## What is NOT complete yet

Do not call Area 3 fully closed yet.

Remaining live-proof work:

1. install the canonical Universal browser SDK + consent UI once on the live Yogakulam shared layout;
2. verify there is no duplicate legacy/new tracker;
3. verify Reject All blocks optional analytics persistence;
4. verify Accept All produces canonical session/page activity;
5. verify Customize and consent withdrawal produce correct purpose receipts;
6. verify GPC forces sale/sharing opt-out where applicable;
7. mark real lead forms and prove `web.form_started` / `web.form_submitted`;
8. pass visitor/session IDs through the lead-capture flow;
9. prove server-side `/api/events/identify/v1` exact-session handoff to the correct CRM lead/Person;
10. connect trusted booking/payment/enrollment/revenue events;
11. reconcile one controlled journey across Tracking, Person 360, Funnel, Attribution and Revenue;
12. only then mark Universal Tracking + Consent V1 production-closed.

## Platform-support status

| Platform | Engineering state | Live proof |
|---|---|---|
| Custom-coded / framework web | V1 built | Yogakulam cutover pending |
| WordPress | installable adapter V1 built | tenant install pending |
| Webflow | canonical install path built | live tenant proof pending |
| Framer | canonical install path built | live tenant proof pending |
| Shopify | Custom Pixel + Web Pixel adapter V1 built | store connection/live order proof pending |
| Android | Kotlin SDK V1 built | app integration/distribution proof pending |
| iOS | Swift Package SDK V1 built | app integration/distribution proof pending |
| Trusted server API | V1 production foundation built | full booking/payment/enrollment journey proof pending |

## Next ordered checkpoint

Continue Area 3 with **live Yogakulam Universal Tracking + Consent cutover and E2E validation**. Do not skip to the next product area until the live browser/identity/business-event proof closes.
