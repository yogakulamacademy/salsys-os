# R2-P1 — Native Behavioral Event Collection V1

This is the first controlled checkpoint of SalsysOS native product analytics. It extends the existing Universal Event Protocol, not a third-party analytics platform.

**Default: OFF.** Existing sites continue unchanged. No production site is automatically opted in.

## Implementation
- Optional browser collector: public/salsys-behavior-v1.js
- Explicit loading gate: public/salsys-intelligence-core-v1.6.0.js
- Registered events: supabase/migrations/20261105140000_r2_behavioral_event_contracts_v1.sql
- Regression tests: tests/readiness/r2-behavioral-event-collection-v1.test.cjs

The collector is loaded only after the Universal SDK is ready and only if the existing installation explicitly includes:

    <script src="https://salsysos.com/salsys-intelligence.js"
      data-consent-mode="required"
      data-form-mode="lead-only"
      data-salsys-behavior-tracking="true" defer></script>

Do not enable the site opt-in until the SQL migration has been reviewed and deployed. The existing privacy UI and source authorization remain the same. The collector checks the SDK analytics permission before every event; the server independently enforces its privacy and tenant/source gates.

## Explicit markup

Use constant, non-personal identifiers controlled by the integrator. Never put an email, phone number, customer name, field value or raw error message into an event ID.

    <a data-salsys-cta-id="enroll_now"
       data-salsys-track="enroll_now" href="/enroll">Enroll</a>

    <section data-salsys-pricing-id="course_pricing">...</section>

    <details data-salsys-faq-id="certification">
      <summary>Certification</summary>...</details>

    <a href="/brochure.pdf" data-salsys-brochure-id="course_guide">
      Course brochure</a>

CTA and pricing impressions require IntersectionObserver and at least 50% intersection. They are deduplicated by marked ID and page and withheld when the tab is hidden. Existing data-salsys-track owns CTA clicks; the extension does not duplicate click telemetry. If IntersectionObserver is unavailable, the collector does not invent visibility evidence.

A brochure click is not proof the PDF was successfully downloaded; the event is deliberately named web.brochure_clicked. FAQ expansions support native details and explicit aria-expanded controls.

Scroll thresholds are 25%, 50%, 75% and 90%, emitted once upon crossing after consent. No pre-consent scroll events are backfilled.

## Form outcomes — application-emitted only

Browser submit does not prove a Lead was created. After a genuine application response, the website can dispatch:

    document.dispatchEvent(new CustomEvent('salsys:form-validation-failed', {
      detail: { form_id: 'apply', category: 'required' }
    }));

    document.dispatchEvent(new CustomEvent('salsys:form-acknowledged', {
      detail: { form_id: 'apply' }
    }));

Only these generic error categories are accepted: required, format, network, server, other. No input value, field name, raw error text, response body or stack trace is read. One event is emitted per form/category/page. Form acknowledgement is browser-observed success, never an authoritative lead/payment/enrollment fact.

## Canonical event contracts

| Event | Safe properties | Meaning |
| --- | --- | --- |
| web.scroll_depth_reached | threshold_percent | Observed scroll crossing |
| web.cta_viewed | cta_id | CTA >=50% visible |
| web.pricing_viewed | pricing_id | Pricing >=50% visible |
| web.faq_expanded | faq_id | FAQ opened |
| web.brochure_clicked | brochure_id | Brochure control clicked |
| web.form_validation_failed | form_id, error_category | Application reported generic error |
| web.form_acknowledged | form_id | Application reported success acknowledgement |

Raw events remain the source of truth. The existing website processor currently also creates event-backed touchpoints for normal web events: review volume before increasing collection. Do not automatically treat these behavioral events as lead intent, conversion, payment or revenue outcomes.

## Release acceptance gates

1. Migration installed exactly once; seven active browser-compatible contracts, no additional permissions or exposed tables.
2. Reject/withdraw consent blocks optional events; granting consent never backfills prior scroll events.
3. Impression accepted only at >=50% intersection in a visible tab; repeated callbacks do not duplicate it.
4. FAQ, brochure, form error and acknowledgement events carry only safe, allowlisted identifiers/categories.
5. Existing event idempotency and tenant/privacy gate tests continue passing.
6. Small controlled pilot: compare raw receipts, processing states, touchpoints and page activity before broad rollout.
7. After acceptance, design R2-P2 configurable funnels and paths over the same canonical events.

## Explicitly out of scope

No session replay, screenshot/DOM capture, arbitrary automatic click capture, experiment assignment, surveys, frontend stack trace collection, autonomous decisions, feature-flag activation, historical backfill, or production site opt-in.
