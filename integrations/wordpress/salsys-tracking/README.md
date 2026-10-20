# Salsys Tracking for WordPress V1

This WordPress plugin is an installation adapter for the canonical Salsys browser SDK. It does **not** create a WordPress-specific tracking engine or database.

## What it does

- installs `salsys-intelligence.js` once on public WordPress pages;
- optionally installs the Salsys consent UI;
- defaults to required analytics consent;
- lets administrators configure privacy/cookie policy links and brand text;
- optionally marks only configured enquiry-form selectors with `data-salsys-lead-form`;
- never reads or forwards arbitrary form values;
- avoids loading duplicate Salsys script URLs when another global installation already exists;
- exposes no trusted Salsys server secret, Supabase service key, CRM credential, or organization ID in public HTML.

## Before installation

In Salsys, create an origin-bound **Website** tracking source for the exact WordPress hostname. `www.example.com` and `example.com` are separate origins when both are served publicly, so register each live hostname that can receive traffic.

The Website source must have:

- source type `website`;
- auth mode `origin`;
- allowed prefix `web.`;
- strict privacy mode;
- GPC honored;
- consent required for optional processing;
- the site's current privacy notice version.

No browser source secret is required.

## Install

1. Copy the `salsys-tracking` directory into `wp-content/plugins/`.
2. Activate **Salsys Tracking** from WordPress Plugins.
3. Open **Settings -> Salsys Tracking**.
4. Keep Salsys base URL set to `https://salsysos.com` unless the tenant uses an approved Salsys deployment.
5. Keep analytics consent on **Required** unless another consent system has already made the decision before Salsys loads.
6. If another CMP is the visual consent authority, disable the Salsys consent UI and forward real CMP decisions to `window.SalsysIntelligence.consent(...)`.
7. Add optional CSS selectors only for actual lead/enquiry forms that should receive `data-salsys-lead-form`.

## Form-builder compatibility

The adapter works with rendered HTML from Elementor Forms, Contact Form 7, WPForms, Gravity Forms, Fluent Forms and other builders without reading their field values. When needed, provide a stable CSS selector for the rendered `<form>` element in plugin settings.

Example selectors:

```text
form.wpcf7-form
form#course-enquiry
.elementor-form[data-form-name="Course Enquiry"]
```

Use selectors narrowly. Do not mark search, login, checkout or newsletter forms unless they intentionally belong to the lead workflow.

## Privacy boundary

The plugin only installs browser telemetry. Authoritative facts such as payment success, enrollment, refunds or revenue must come from trusted server integrations through the Salsys Events API.

The plugin does not make unrelated third-party tags consent-aware automatically. GA4, Google Ads, Meta Pixel, Hotjar and other scripts must subscribe to the same consent authority separately.

## Acceptance test

Do not consider a WordPress installation complete until all of these pass:

1. exactly one Salsys browser installation is present;
2. analytics events are blocked before consent;
3. analytics grant produces a server privacy receipt and enables allowed `web.*` events;
4. deny/withdraw stops optional events;
5. GPC is honored;
6. page/session/CTA/form events share stable visitor/session IDs;
7. no arbitrary form PII appears in `raw_events`;
8. lead identity handoff uses the server-side exact-session identify path;
9. source health has no recent contract/dead-letter failures.
