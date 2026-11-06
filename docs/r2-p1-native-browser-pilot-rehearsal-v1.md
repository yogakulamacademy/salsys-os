# R2-P1 — Native browser pilot rehearsal (no production collection)

**Date:** 2026-11-06. **Issue:** #520. **Status:** engineering/test preparation only. This checkpoint cannot close R2-P1's required authorized real-site pilot.

## Scope

The standalone Chromium suite `tests/ui/r2-behavior-collector-pilot.spec.ts` loads the **actual published optional collector file** `/salsys-behavior-v1.js` on a disposable browser document served from the Playwright loopback web server. Its SDK stub records event names and allowlisted properties in local page memory only. No real visitor, CRM lead, Supabase, external website or collector activation is involved.

The four browser tests check:

1. **Denied by default:** a visible CTA emits nothing before analytics permission, emits once when locally allowed, and stops brochure/scroll telemetry after an opt-out.
2. **Safe event boundaries:** brochure clicks, native FAQ expansion, generic form failure and form acknowledgment emit only defined IDs/categories; an email-shaped invalid marker, form values, raw error text and response-body text do not reach event properties.
3. **No retroactive engagement:** scrolling while denied does not backfill 25/50% threshold events when permission later changes; observed 75/90% crossings are each emitted once.
4. **SPA route reset:** an explicitly declared page change permits a new page-scoped CTA impression but deduplicates repeat callbacks on the same route.

These tests complement the existing VM readiness checks for 50%-visibility, 200-node observation bound, sanitized identifiers, canonical seven event contracts and explicit opt-in loading gate.

## 200-node cap on dynamic SPA views (2026-11-06)

A long-lived SPA may remove its initial 200 CTA/pricing elements and insert a fresh view without a hard reload. The original observer kept *all previously observed nodes* in an array, even after removal. After reaching the 200-node safety limit, future elements stopped being watched.

The optional collector now releases disconnected nodes from its observation set on the next bounded scan or re-observation, allowing fresh live controls to use the existing **200 live-element cap**. It also refuses to record a visibility callback against a disconnected element. The change does not alter event names, any analytics consent checks, SDK loading opt-in, form submission, production registration or the 200-live-element bound.

A Node VM regression reaches the full 200-element cap, disconnects all old nodes, inserts one fresh CTA, and verifies observation and exactly one new event. A separate negative test rejects a delayed detached-node impression. The native Chromium regression exercises a large marker-grid replacement on a real disposable DOM with the actual collector file; no real SDK HTTP traffic is sent.

**No live pilot authorization is implied:** Actual site consent/CMP, origin-bound source, analytics acceptance, raw-event processing and customer-site opt-in still require Issue #520's approved staging/live pilot evidence. This collector-only compatibility improvement must not be mistaken for the pilot's completion.

## Non-claims and acceptance still required

- The fixture uses a stub SDK to deliberately avoid network emission; it is not proof that a real consent manager, origin-bound API/source, browser privacy policy, or raw-event processor accepts the events.
- It does not exercise a customer website, real lead data, real analytics consent receipts, or a second tenant's authenticated session.
- Full acceptance still requires **Issue #520**'s owner-approved isolated website/origin and permitted form/CTA, with actual consent/GPC testing, idempotency, processed event reconciliation and no personal information in properties.
- **Issue #523** still requires authenticated owner/admin tenant-isolation browser checks; these tests cannot close it.
- **PRs #530 and #535** remain draft pending independent privacy and retention evidence. Issue #531 still needs an approved isolated environment, and no new billable staging project has been authorized.

Do not add `data-salsys-behavior-tracking="true"` to a live website or enable any source based on these browser tests. Keep optional collection **OFF** until the explicit real-site pilot gate is passed and recorded. Never use a production or recovery Supabase tenant to generate synthetic test events.
