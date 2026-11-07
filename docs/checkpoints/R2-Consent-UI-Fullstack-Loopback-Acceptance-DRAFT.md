# R2 consent: isolated universal SDK + actual consent UI browser acceptance (DRAFT)

**Status:** Draft synthetic regression, not completion of Issue #588 / #531, and not a substitute for genuine consent/legal acceptance.

## Why this exists

The authorized Yogakulam website operator has supplied live DOM screenshots confirming a single canonical Salsys tracking installation with `data-consent-mode="required"`, a visible consent UI, and removal of the obsolete tracker script. Read-only production receipt aggregates verified Accept All, Reject All and mixed customized decisions. Short-window matched identifier aggregates were consistent with suppression after analytics denial.

Those are meaningful website integration findings, but **do not independently prove** no-choice tracking suppression, persistent withdrawal across reload, independent stage isolation, or complete third-party tag compliance.

## New browser-only regression

`tests/ui/r2-consent-ui-fullstack-loopback.spec.ts` serves **the actual repository files** `salsys-intelligence.js`, `salsys-intelligence-core-v1.6.0.js`, `salsys-tracker.js`, `salsys-intelligence-submit-fallback.js`, and `salsys-consent.js` on one disposable loopback page. Every browser request is intercepted; external requests and unexpected local requests are aborted. The consent and event endpoints are synthetic in-memory recorders. There is **no production website, endpoint, tenant ID, Supabase connection, CRM lead/form, or real tracking event emission**.

The three checks exercise the real SDK and real privacy UI together:

1. **No choice:** first visit, same-path SPA navigation and reload produce no optional event submissions or consent grants; first-visit consent UI remains available.
2. **Reject All:** five per-purpose decisions match the expected denied/opted-out semantics; analytics remain blocked on the current page and after reload, including same-path navigation; floating privacy settings are available.
3. **Accept → Customize Analytics off → reload:** grant produces one initial session start and page view; customization records `analytics=denied`; subsequent attempted page event is locally privacy-blocked; navigation and reload do not restart optional tracking. All observed SDK event metadata are marked `required`.

This verifies synthetic runtime behavior, **not production server receipt signature validation or real visitor compliance**.

Run in the checked-out application with existing test infrastructure:

```bash
npx playwright test tests/ui/r2-consent-ui-fullstack-loopback.spec.ts
```

## Remaining owner acceptance — stay open

- Real-site independent **no-choice** tests with authorized isolation and suppressed optional event verification; verify storage and receipt integrity without publishing personal identifiers.
- Real-session withdrawal and preference persistence across browsers/tabs; GPC & blocked-storage variants.
- Verify enrollment, original lead submission/booking/payment integrations remain unchanged.
- Third-party **Google Analytics, Meta Pixel, Microsoft Clarity and PostHog** are separately embedded on the academy site and not automatically gated by Salsys; review their consent handling as a distinct website operation.
- Stage isolation cannot be claimed from this loopback synthetic test; Issue #531 remains open.
- Retention history/owner-admin reconciliation (#527/#523) and the R2 optional behavioral collector pilot (#520) remain blocked pending their own criteria.

No changes to SDK runtime, website PHP, SQL, RLS, production tracking, cookies, customer data, marketing integrations, or previously working enrollment/payment code. Collector OFF. Do not merge or deploy until owner review and exact-head CI/CodeQL validation.
