# Salsys Universal Consent UI V1

Status: implementation-ready consent experience for the Universal Tracking Intelligence SDK.

## Purpose

Salsys already has a purpose-specific privacy engine and consent receipt API. Universal Consent UI adds the browser-facing experience that lets a visitor make, review, and change those choices without requiring a third-party CMP for the basic Salsys tracking flow.

This module is a privacy-control interface, not a legal certification. Each tenant remains responsible for the wording, policy links, jurisdictions, and legal basis appropriate to its website.

## Runtime surfaces

```text
/salsys-intelligence.js
/salsys-consent.js
/api/privacy/consent/v1
```

The tracking SDK remains fail-closed when `data-consent-mode="required"`. The consent UI never bypasses the privacy engine; it sends decisions through `SalsysIntelligence.consent(...)`, which records them through `/api/privacy/consent/v1`.

## Production installation

```html
<script
  src="https://salsysos.com/salsys-intelligence.js"
  data-consent-mode="required"
  data-form-mode="lead-only"
  defer>
</script>
<script
  src="https://salsysos.com/salsys-consent.js"
  data-consent-banner="auto"
  data-consent-settings="floating"
  data-consent-brand="Example Brand"
  data-privacy-policy-url="https://example.com/privacy"
  data-cookie-policy-url="https://example.com/cookies"
  defer>
</script>
```

No tenant secret, organization ID, Supabase key, or tracking-source credential belongs in browser HTML.

## Visitor controls

The first-run banner provides:

- Accept all
- Reject all
- Customize
- privacy/cookie policy links when configured

The preference center provides purpose-level controls for:

- Essential — always on in the UI, not submitted as an optional purpose
- Analytics
- Marketing
- Advertising
- Personalization
- Sale / sharing

After a choice is saved, the optional floating `Privacy settings` control lets the visitor reopen the preference center. Sites that prefer their own footer/menu link can set `data-consent-settings="manual"` and use:

```html
<a href="#privacy" data-salsys-privacy-settings>Privacy settings</a>
```

## Privacy semantics

Accepted decisions are the same decisions supported by the canonical privacy endpoint:

```text
granted
denied
withdrawn
opted_out
limited
```

Current optional purposes are:

```text
analytics
marketing
advertising
personalization
sale_sharing
```

Reject All records analytics/marketing/advertising/personalization as `denied` and sale/sharing as `opted_out`.

Accept All records optional purposes as `granted`, except that Global Privacy Control remains authoritative for sale/sharing.

## Global Privacy Control

If `navigator.globalPrivacyControl === true`:

- the sale/sharing control is disabled in the preference center;
- sale/sharing is submitted as `opted_out`;
- the server-side privacy endpoint can also enforce the GPC signal through `Sec-GPC` / source policy.

The UI therefore does not present an apparent override that contradicts the browser's GPC signal.

## Isolation and accessibility

The consent UI renders inside a Shadow DOM so host-site CSS cannot normally break the banner or preference center and the consent UI does not leak styling into the host page.

The implementation uses native buttons and checkboxes, dialog semantics, visible keyboard focus, Escape behavior, reduced-motion handling, responsive mobile layout, and text insertion through `textContent` rather than HTML injection.

## Configuration

Supported script attributes include:

```text
data-consent-banner="auto|off"
data-consent-settings="floating|manual|off"
data-consent-brand="Brand name"
data-consent-title="Banner title"
data-consent-description="Banner description"
data-consent-accent="#0f172a"
data-privacy-policy-url="https://..."
data-cookie-policy-url="https://..."
```

Only HTTP(S) policy URLs are rendered. Accent configuration is restricted to a hex color value.

## Browser API

The module exposes:

```js
window.SalsysConsent.open();
window.SalsysConsent.close();
window.SalsysConsent.showBanner();
window.SalsysConsent.hideBanner();
window.SalsysConsent.acceptAll();
window.SalsysConsent.rejectAll();
window.SalsysConsent.save({
  analytics: 'granted',
  marketing: 'denied',
  advertising: 'denied',
  personalization: 'denied',
  sale_sharing: 'opted_out'
});
window.SalsysConsent.state();
window.SalsysConsent.gpc();
window.SalsysConsent.config();
```

After a successful change the module emits:

```text
salsys:consent-changed
```

The event detail contains the requested decisions, effective decisions returned by the privacy API, GPC state, source, and notice version when available.

## External CMP compatibility

Using Salsys Universal Consent UI is optional. A tenant can keep CookieYes, OneTrust, Cookiebot, a custom CMP, or another consent experience and send decisions to the same tracking privacy engine through `SalsysIntelligence.consent(...)` or the existing `salsys:consent` integration event.

Do not run two visual consent systems that make conflicting decisions for the same purposes.

## Persistence and receipts

The browser SDK stores the effective privacy state in first-party local storage under `salsys_privacy_v1`. The authoritative consent receipt is recorded server-side by `/api/privacy/consent/v1`, including tenant/source resolution, purpose, decision, event time, anonymous visitor, GPC evidence, and configured notice version.

The consent banner itself does not write marketing cookies or manufacture ad identifiers.

## Fail-closed behavior

If a visitor has not granted analytics while the SDK uses `data-consent-mode="required"`, optional web behavior events remain blocked locally and are privacy-gated again server-side.

If a consent choice cannot be recorded because the SDK/API is unavailable, the UI reports the error and does not pretend that an optional grant succeeded.

## Production acceptance

Before calling a tenant cutover complete, verify:

1. first visit shows the consent banner when no decision exists;
2. Reject All leaves optional browser tracking blocked;
3. Accept All records receipts and starts analytics/session/page tracking;
4. Customize persists the exact purpose choices;
5. GPC forces sale/sharing opt-out;
6. Privacy settings can be reopened and changed later;
7. a withdrawal stops future optional analytics behavior;
8. policy links and tenant copy are correct;
9. the banner works on mobile and desktop without blocking core site actions;
10. only one CMP/consent authority is active for Salsys purposes.
