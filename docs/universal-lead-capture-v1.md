# Universal Lead Capture V1

Status: feature branch implementation, not enabled in production by default.

## Goal

Allow a SalsysOS customer to capture website leads without adding a customer-specific PHP helper to every form handler.

The customer still needs to install the Salsys Universal Tracking snippet (directly, through GTM, a CMS plugin, or another supported installer). Basic browser lead capture then uses the public Site ID plus the registered browser origin. No server secret is exposed to the browser.

## Architecture

```text
Website form
  -> salsys-intelligence.js
  -> strict lead-field allowlist
  -> POST /api/leads/browser/v1?site_id=SAL-...
  -> Site ID + Origin resolution
  -> tracking-source rate limit
  -> privacy policy gate
  -> ingest_website_lead_for_organization(...)
  -> CRM lead + identity resolution
  -> visitor/session/touchpoint linkage
```

Authoritative business events remain server-side:

```text
booking.*
payment.*
enrollment.*
refund/revenue evidence
```

Those should continue through Server Events API, webhooks, first-party integrations, or platform connectors.

## Browser endpoint

`POST /api/leads/browser/v1?site_id=<PUBLIC_SITE_ID>`

The endpoint:

- resolves the public Site ID against the request Origin
- rejects unknown or mismatched origins
- applies the tracking-source payload limit and rate limit
- sanitizes the lead payload with the existing website-lead contract
- passes `lead.submitted` through the privacy policy gate
- calls the tenant-explicit `ingest_website_lead_for_organization` RPC
- does not require or expose a server secret
- does not echo submitted PII back to the browser

The public Site ID is an identifier, not an authentication secret. Origin binding, rate limiting, privacy controls, strict sanitization and tenant-scoped ingestion are the V1 abuse boundaries. Stronger bot/abuse controls can be layered on later.

## SDK opt-in

Universal Lead Capture is OFF by default.

Enable it in the generated snippet with:

```html
data-salsys-lead-capture="auto"
```

When enabled, the SDK considers a form a lead candidate when:

- the form is explicitly marked `data-salsys-lead-form`, or
- auto mode is enabled, the form uses POST, contains email or phone input, and contains no password input.

Password/login/signup credential forms are ignored by the auto detector.

## Field allowlist

The SDK never serializes the whole form. It reads only approved lead fields:

- first name / full name
- last name
- email
- phone / mobile / WhatsApp
- country
- course / course code
- message / enquiry / inquiry / query

It also sends Salsys-owned journey context:

- anonymous visitor ID
- session ID
- first touch
- session touch
- page path/title
- form ID/action
- timezone

File uploads, password fields and arbitrary form values are not sent.

## Explicit field mapping

For unusual forms, a field can be marked explicitly:

```html
<input data-salsys-field="name" ...>
<input data-salsys-field="email" ...>
<input data-salsys-field="phone" ...>
<select data-salsys-field="country" ...></select>
<input data-salsys-field="course" ...>
<textarea data-salsys-field="message" ...></textarea>
```

This keeps the browser payload deterministic without requiring a custom PHP integration.

## Customer onboarding model

V1:

1. Register website in SalsysOS.
2. Copy the generated Site-ID snippet.
3. Optionally enable Universal Lead Capture.
4. Install snippet directly, with GTM, or through a future CMS/plugin installer.
5. Submit a controlled test lead.
6. Confirm lead + visitor/session linkage in SalsysOS.

Future productization:

- visual detected-form list
- server-stored field mappings
- per-form enable/disable controls
- WordPress plugin adapters
- Webflow/Framer/Shopify integrations
- webhook/Zapier/Make/n8n connectors
- bot/abuse scoring and challenge controls

## Yogakulam compatibility

The existing Yogakulam PHP helper remains valid for trusted server-side continuity and production proof. Universal Lead Capture V1 is the scalable SaaS path for basic lead capture and should not require every future customer to install a Yogakulam-specific helper.
