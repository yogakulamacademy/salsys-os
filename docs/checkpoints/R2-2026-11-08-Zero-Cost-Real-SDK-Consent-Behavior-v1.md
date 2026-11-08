# R2 zero-additional-cost combined SDK/CMP/behavior browser rehearsal

**Date:** 2026-11-08  
**Status:** test engineering only; no production/live R2 release acceptance is claimed.

## Why this exists

R2-P1's existing `r2-behavior-collector-pilot.spec.ts` loads the real optional collector but mocks the SDK's consent/privacy and transport. R2's existing consent UI browser tests load the real SDK/CMP but do not opt in the optional collector. This separate test connects the actual deployed SDK loader, SDK core, tracker, consent UI, and behavioral collector in one disposable Chromium session.

`tests/ui/r2-real-sdk-consent-behavior-loopback.spec.ts` uses **only local Playwright-intercepted URLs**; it denies all unspecified requests and aborts every nonlocal request. It makes NO database/CRM/website/provider/customer requests and uses fabricated marker IDs and form content.

## Acceptance covered by this disposable browser rehearsal

- Default **required** mode, before any choice: no optional event is emitted.
- **Reject All** plus a page reload: no analytics/behavior events.
- **Accept All**: real SDK and collector emit CTA/pricing visibility (>= 50% intersection), brochure/FAQ interactions, and generic form acknowledgment; event IDs are unique, visitor/session keys present, and data-consent-mode stays `required`.
- No email-shaped field value or test-only secret is transported in allowed event properties.
- **Withdraw Analytics** using the real settings UI and consent endpoint response: subsequent optional interactions and form acknowledgments remain blocked.
- **GPC** simulated at browser navigator API: original consent request reaches the local sink with `gpc=true` and `sale_sharing=opted_out`.
- Real script request order and consent receipt response shape are included, but **the server responses themselves are disposable stubs**.

## Scope boundaries

This does **not** establish a live site's consent lawfulness, third-party tag behavior, genuine server-side receipt validation, source-origin authorization, real PostgREST delivery, tenant isolation, exact-session website form submission, or production retention history. It does not complete #520, #523, #527, #528, #531 or #588 and does not authorize enabling `data-salsys-behavior-tracking=true` on any customer website.

The user expressly requested **no new spending**. Accordingly, this patch adds only a CI browser test and documentation on a draft branch. Neither the separate Supabase Recovery Rehearsal project nor Vercel preview cloud credentials are used. If the user later wants real-site staging, it will require separate verified isolation, cost assessment and owner authorization.
