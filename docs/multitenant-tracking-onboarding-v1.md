# SalsysOS Multi-Tenant Tracking Onboarding V1

## Purpose

This document defines the tenant boundary for SalsysOS tracking. A tracking event must never be accepted merely because a hostname appears in a global environment allowlist. Browser tracking is resolved from the registered organization site and its active tracking source.

## Tenant model

Each tracked website belongs to exactly one active SalsysOS organization through `organization_sites`.

A browser website source is bound to that site through:

- `tracking_sources.organization_id`
- `tracking_sources.organization_site_id`
- `tracking_sources.hostname`

The database enforces that the source and site belong to the same organization.

The same hostname cannot be claimed by another organization.

## Browser onboarding

An organization owner/admin creates a website source from Tracking Sources.

SalsysOS atomically provisions:

1. the registered `organization_site`;
2. its environment (`production`, `staging`, or `development`);
3. the origin-bound website `tracking_source`;
4. strict privacy defaults;
5. source-scoped payload and rate limits.

No server secret or tenant secret is embedded in website HTML.

Install the canonical browser SDK:

```html
<script
  src="https://salsysos.com/salsys-intelligence.js"
  data-consent-mode="required"
  data-form-mode="lead-only"
  defer>
</script>
```

Optional Salsys consent UI:

```html
<script
  src="https://salsysos.com/salsys-consent.js"
  data-consent-banner="auto"
  data-consent-settings="floating"
  defer>
</script>
```

The browser endpoint resolves the tenant from the request Origin only when all of the following are active and consistent:

- organization;
- registered organization site;
- origin-bound tracking source;
- registered hostname.

## Environment separation

Each registered site carries an explicit environment:

- `production`
- `staging`
- `development`

The resolved `organization_site_id` and `site_environment` are written into browser-event provenance so evidence can be traced to the exact tenant site/environment.

## Other client classes

### Android / iOS / publishable clients

Use a tenant-scoped publishable `source_key` and `/api/events/client/v1`.

The source key is an identifier, not a secret. Client event families remain restricted to configured non-authoritative telemetry prefixes.

### Trusted server integrations

Use tenant-scoped source key + server secret with `/api/events/v1`.

Server secrets must never be shipped to browsers, mobile apps, WordPress public code, Shopify storefront code, Webflow, Framer, or other public clients.

## Isolation guarantees

V1 acceptance requires:

- source/site composite foreign-key tenant binding;
- one origin-bound browser source per registered site;
- hostname ownership collision rejection across organizations;
- service-role-only browser origin resolver;
- service-role-only website provisioning RPC;
- organization-scoped privacy gate;
- organization/source-scoped rate limiting;
- organization-scoped event ingestion and processing;
- exact tenant site provenance on browser events.

## New tenant onboarding checklist

1. Create/activate the organization and workspace.
2. Add the website in Tracking Sources.
3. Select the site environment.
4. Confirm the hostname is owned by that organization and not already registered elsewhere.
5. Install `salsys-intelligence.js` globally.
6. Configure analytics/privacy consent.
7. Mark lead forms with `data-salsys-lead-form` where applicable.
8. Verify browser preflight/event ingestion from the registered origin.
9. Confirm the event appears under the correct organization/site/source.
10. Verify CRM/attribution stitching with a controlled test lead before enabling campaign optimization.

## Important boundary

Browser SDK telemetry is evidence of client behavior, not authoritative proof of payment, enrollment, refund, booking completion, or other server-side business outcomes. Those facts must enter through trusted server sources.
