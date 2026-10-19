# M-2026-10-19 — Universal Consent UI V1

## Goal

Complete the browser-facing consent experience for Salsys Universal Tracking Intelligence without introducing a separate privacy authority or a third-party CMP dependency.

## Added

- `public/salsys-consent.js` first-party consent UI module;
- first-run banner with Accept All, Reject All and Customize;
- preference center for Analytics, Marketing, Advertising, Personalization and Sale / Sharing;
- Essential purpose displayed as always-on UI context, not submitted as an optional privacy purpose;
- Global Privacy Control enforcement for Sale / Sharing;
- floating Privacy Settings launcher;
- manual `data-salsys-privacy-settings` opener;
- tenant-configurable brand/title/description/accent/privacy-policy/cookie-policy values;
- Shadow DOM style isolation;
- responsive/mobile layout and keyboard/Escape handling;
- `window.SalsysConsent` browser API;
- `salsys:consent-changed` browser event;
- public middleware exposure for `/salsys-consent.js`;
- Tracking installation snippet updated to include the consent module;
- SDK CI verifier extended to protect consent UI/privacy surfaces;
- canonical consent UI documentation.

## Authority boundary

The consent UI does not own privacy state independently.

```text
Visitor choice
  -> SalsysConsent UI
  -> SalsysIntelligence.consent(...)
  -> /api/privacy/consent/v1
  -> record_privacy_preference_v1
  -> effective purpose decisions
  -> browser privacy state
  -> tracking permission / denial
```

The server-side privacy engine remains authoritative for source policy, notice version, consent receipts and GPC enforcement.

## Supported optional purposes

```text
analytics
marketing
advertising
personalization
sale_sharing
```

Supported decisions remain:

```text
granted
denied
withdrawn
opted_out
limited
```

## GPC behavior

When Global Privacy Control is active, the UI disables Sale / Sharing and submits it as `opted_out`. The privacy endpoint can independently enforce the same browser signal.

## External CMP compatibility

The built-in UI is optional. A tenant may omit `salsys-consent.js` and use another CMP as long as it submits the same purpose decisions through `SalsysIntelligence.consent(...)` or the neutral `salsys:consent` event.

Do not run two visual consent systems that can issue conflicting choices for the same Salsys purposes.

## Production acceptance remaining

Code completion is not production proof. Before Yogakulam cutover is complete, verify on the live website:

1. first visit shows the banner only when no prior analytics choice exists;
2. Reject All keeps optional analytics events blocked;
3. Accept All records server-side receipts and starts permitted browser tracking;
4. Customize persists exact purpose choices;
5. GPC keeps sale/sharing opted out;
6. Privacy Settings can reopen after a decision;
7. changing Analytics from granted to denied/withdrawn stops future optional behavior tracking;
8. the UI works on mobile and desktop without hiding important website controls;
9. configured privacy/cookie links are correct;
10. only one consent/CMP authority is active on Yogakulam.

## Completion status

Universal Consent UI V1 is implementation-complete on the feature branch once CI/typecheck/build and preview validation pass. Yogakulam production consent cutover remains a separate live verification checkpoint.
