# M-2026-10-19 — Universal Tracking Compatibility Audit v1

## Goal

Replace the tenant/backend-specific tracking implementation with the Salsys Universal Tracking Intelligence SDK without silently losing proven behavior from the pre-existing Yogakulam tracking system.

This audit compares the previous production tracking stack with the universal architecture and records what is preserved, translated, superseded, intentionally retired, or still requires live proof.

## Pre-existing system reviewed

The compatibility review covered:

- `public/yogakulam-tracker.js`;
- `/api/tracking/collect`;
- `/api/tracking/consent`;
- `/api/tracking/identify`;
- `lib/tracking/server.ts` sanitization/CORS contract;
- immutable PostgreSQL `raw_events` flow;
- website session/touchpoint normalization;
- canonical visitor -> lead identity attachment;
- semantic touchpoint compatibility mapping;
- downstream funnel/contact metrics;
- course/product affinity signals;
- tracking installation/diagnostic UI.

## Compatibility results

| Existing behavior | Universal status | Notes |
|---|---|---|
| Anonymous visitor continuity | PRESERVED | Universal IDs are neutral; legacy `yk_vid` may be migrated during Yogakulam cutover. |
| Session continuity | PRESERVED | Legacy `yk_sid` may be migrated into the neutral session key. |
| First-touch continuity | PRESERVED | Legacy first-touch state is read only during migration. |
| Analytics consent gate | PRESERVED / HARDENED | Universal privacy purposes are explicit and fail closed. |
| Legacy analytics-consent cookie | MIGRATION BRIDGE ADDED | Existing grant/denial is translated; a prior grant is recorded through the new privacy endpoint before analytics collection is allowed. |
| Legacy `adUserData` | TRANSLATED | Maps to universal `advertising`; does not imply sale/sharing consent. |
| Legacy `adPersonalization` | TRANSLATED | Maps to universal `personalization`. |
| GPC | PRESERVED / HARDENED | Universal privacy endpoint applies tracking-source policy. |
| UTM/click IDs | PRESERVED | Universal browser SDK keeps UTM + Google/Meta click identifiers. |
| `_fbc` / `_fbp` | PRESERVED UNDER CONSENT | Only browser-observed values are read; identifiers are not manufactured. |
| Page views | PRESERVED | Canonical `web.page_viewed` projects into the established touchpoint vocabulary. |
| Session start | PRESERVED | Canonical `web.session_started`. |
| Form start | PRESERVED | Canonical `web.form_started`; arbitrary form values are not captured. |
| Form submit | PRESERVED | Canonical `web.form_submitted`; browser submit is not treated as backend conversion proof. |
| WhatsApp CTA | PRESERVED | Canonical `web.cta_clicked` with `whatsapp_click` action. |
| Phone CTA | PRESERVED | Canonical `web.cta_clicked` with `phone_click` action. |
| Email CTA | PRESERVED | Canonical `web.cta_clicked` with `email_click` action. |
| Instagram CTA | COMPATIBILITY RESTORED | Universal entrypoint adds established auto-classification. |
| Enrollment/booking CTA | COMPATIBILITY RESTORED | Established enrollment intent signal is retained for funnel/affinity logic. |
| Existing `data-yk-event` markup | MIGRATION BRIDGE ADDED | Translated into canonical `web.cta_clicked` events. |
| Existing `yk:consent` dispatch | MIGRATION BRIDGE ADDED | Translated to the neutral privacy-purpose vocabulary. |
| Existing `YKTracking` diagnostics | MIGRATION FACADE ADDED | `status`, `context`, consent and supported legacy send operations remain available during cutover. |
| `yk_tracking_ready` dataLayer event | MIGRATION BRIDGE ADDED | Kept for existing GTM diagnostics during cutover; GTM is not a core tracking dependency. |
| Server-side geo context | RESTORED | Browser ingest derives country/region/city/timezone from trusted proxy/hosting headers where available; raw client IP is not persisted. |
| Tenant resolution from browser | PRESERVED / HARDENED | Browser tenant comes from registered trusted origin/source, never client-supplied organization ID. |
| Source-scoped rate limiting | PRESERVED / HARDENED | New browser/server routes use tracking-source controls. |
| Payload sanitization/redaction | PRESERVED / HARDENED | Generic event ingestion sanitizes nested payload/context/metadata. |
| Exact-session visitor -> lead link | PRESERVED / UNIVERSALIZED | New `/api/events/identify/v1` requires authenticated source tenant + lead + visitor + exact existing session. |
| Historical touchpoint attachment | PRESERVED | Uses existing canonical attach RPC. |
| Person graph refresh | PRESERVED | Identity handoff continues to resolve Person state after lead/session attachment. |
| Immutable raw evidence | PRESERVED | PostgreSQL `raw_events` remains source of truth. |
| Semantic touchpoint names used by reports/models | PRESERVED | Canonical `web.*` events continue projecting to the established semantic touchpoint vocabulary. |
| High-intent enrollment signal | PRESERVED | `enrollment_cta_click` remains available to existing affinity/high-intent builders. |
| Backend language dependency | REMOVED | Canonical server boundary is HTTPS + JSON. |
| PHP Event Intelligence relay | REMOVED | No longer part of the universal architecture. |

## Authority rules retained

Browser events remain observed behavior only.

The browser is not authoritative for:

- successful payment;
- final enrollment;
- refunds;
- final revenue;
- privileged CRM state;
- provider delivery/read state.

Those facts must come from trusted server/provider/backend evidence.

## Current universal endpoints

```text
Browser events:       POST /api/events/browser/v1
Trusted server event: POST /api/events/v1
Privacy preferences:  POST /api/privacy/consent/v1
Identity handoff:     POST /api/events/identify/v1
```

Trusted server/identity requests use:

```text
X-Salsys-Source-Key: <source-key>
Authorization: Bearer <tracking-source-secret>
```

## Intentionally not treated as the universal contract

- `yogakulam-tracker.js`;
- `data-yk-*` naming;
- `YKTracking` naming;
- the old global `TRACKING_INGEST_SECRET` identity model;
- GTM as the owner of identity/attribution;
- any backend-language-specific relay implementation.

Those may remain temporarily for migration/legacy production compatibility, but new tenants should not depend on them.

## Still requiring production proof

Code compatibility is not the same as production completion.

The following still require controlled live verification after CI/build passes and the SDK is installed directly in Yogakulam source:

1. returning visitor with legacy consent + `yk_vid` preserves continuity;
2. new consent grant/denial/GPC receipts behave correctly;
3. page/session events persist and normalize once;
4. WhatsApp/phone/email/Instagram/enrollment CTA classifications produce the expected semantic touchpoints;
5. forms retain visitor/session continuity without capturing form values;
6. `/api/events/identify/v1` successfully links the exact session to a real CRM lead and rejects a mismatched tenant/session;
7. trusted booking/payment/enrollment events reach `raw_events` and downstream revenue/attribution;
8. the complete real journey reconciles across Tracking, Person 360, Funnel, Attribution and Revenue;
9. derived features/predictions consume the same journey without fabricating outcomes.

## Acceptance target

```text
campaign/click
-> visitor
-> session
-> page/CTA/form behavior
-> consent
-> enquiry/lead
-> exact-session identity handoff
-> checkout
-> payment
-> enrollment
-> revenue
-> attribution
-> feature state
-> prediction/recommendation
-> observed outcome
```

Until this controlled production journey is proven, the Universal Tracking Intelligence architecture is implementation-complete enough for review but not production-cutover complete.
