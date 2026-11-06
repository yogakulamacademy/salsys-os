# R2-P2 — Same-path SPA page-view reproduction (synthetic test only)

**Status:** investigation checkpoint, not a tracking defect fix or R2 acceptance.  
**Context:** GitHub Issue #559; real owner/admin acceptance remains Issue #523.

## Why this test exists

A read-only SalsysOS Production aggregate for the public `/our-courses.php` path on Oct 22–28, 2026 reported **305** `web.page_viewed` source events. Of these, **194** were labeled `navigation_type='spa'`; all 194 followed an earlier observed page view of the **same normalized public path** in the same source-scoped anonymous session, and **109** followed within five seconds.

These aggregates do not prove a duplicate instrumentation bug, bot traffic, distinct people, distinct full browser loads, or a specific customer action. The source website's historic PHP/JavaScript and server request logs were **not** available to verify the cause. The operator's explanation for repeated `/courses/kerala/test.php` QA views does **not** establish what happened on `/our-courses.php`.

## Reproduction contract

`tests/ui/r2-p2-same-path-spa-pageview-repro.spec.ts` loads the **existing, unmodified** `public/salsys-tracker.js` in a disposable Chromium page via Playwright. All network requests are intercepted: the document is synthetic, the event receiver is a local fake, and all other requests are aborted.

The tests characterize current behavior:

1. With **synthetic pre-granted** local analytics state, the original page view is sent once. Changes to *only* the query string or hash through `history.pushState` / `replaceState` can each send a **new SPA-labeled `web.page_viewed` for the same `pagePath`**; a different pathname also sends an SPA-labeled page view.
2. `data-auto-spa="false"` disables those history-triggered events, while leaving initial page tracking intact. This is a test of the existing configuration switch, **not** an instruction to change any production website.
3. Without analytics permission, neither initial nor history-triggered page-view events should be sent.

Local command, from the checked-out repository with test dependencies available:

```sh
npx playwright test tests/ui/r2-p2-same-path-spa-pageview-repro.spec.ts
```

A passing test confirms **SDK behavior in the fixture**, not the causes or consent compliance of historical live events. Simulated local consent is not a verified server-side consent receipt.

## Website operator acceptance required before any runtime change

Use only an authorized local or isolated page and no customer event delivery.

1. Inspect the **actual** `/our-courses.php` page scripts active around Oct 22–28 (where available), including filters, tabs, anchor navigation, third-party scripts and `history.pushState/replaceState` use.
2. Confirm whether URL-only changes represent real intentional page navigation or merely interface state changes.
3. Verify whether the website embeds the tracker multiple times, invokes `Salsys.page()` manually, or reloads its scripts. Note that the SDK presently has an initialization guard, but that does not prove the website has only one instrumentation path.
4. Compare **aggregate server HTTP requests** to **aggregate browser page-view events** over the same UTC days and page path, without exposing IP addresses, cookies, full URLs, visitor IDs or session IDs.
5. Reproduce an intentional same-path query/hash transition on the authorized isolated page. Decide whether analytics should measure it as a page view, as a distinct navigation event, or not at all, **before** designing a separate reviewed SDK change.
6. Re-run consent/GPC, privacy, tenant isolation and no-duplicate tests for any proposed change.

## Non-actions and proof boundary

No changes to the website, tracker, backend, ingestion, consent, database, retention, event definitions, tenant authorization, production analytics or historical event counts. No inferred bot filtering, silent QA exclusion, production deployment or new infrastructure expense. This test-only PR can be reviewed independently but **must not** be called evidence of real owner/admin acceptance (#523), collector pilot (#520), consent (#530) or D30 cohort readiness (#527/#535).
