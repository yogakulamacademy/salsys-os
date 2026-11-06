# R2-P2 — Synthetic Behavior Explorer Browser Acceptance

This checkpoint strengthens the existing SalsysOS CI browser suite for **Marketing → Behavior** without using live CRM credentials, websites, provider messaging, or production database writes.

## New coverage
- `tests/ui/fixture-server.mjs`: localhost-only, synthetic `get_native_behavior_workspace_v1` response with a fixed tenant identity. Supports `ready`, `empty`, `denied`, and `error` scenarios with safe request metadata inspection.
- `tests/ui/behavior-explorer.spec.ts`: local synthetic authenticated cookie; checks that default funnel/paths render, public `.php` links are displayed, a deliberately unsafe querystring path is rejected, and queries carry the current synthetic organization ID.
- Interactive event selector and 30-day range submit, including correct ordered step names in the query request.
- Invalid duplicate steps / invalid range normalize to approved default steps and 14 days.
- Denied access does not show aggregate results; legitimate zero values show a distinct empty state.
- 390 px, 768 px and 1440 px page overflow checks; mobile screenshot archived under `test-results/`.

## Execution
Run `npm run test:ui` for all existing Playwright tests or `npx playwright test tests/ui/behavior-explorer.spec.ts` for this file. The Playwright config starts a loopback-only synthetic REST service and local Next development server.

## Important limitations
These are **synthetic browser tests**, not a live authorized CRM acceptance test. A fixed demo tenant and fake login cookie **do not** prove production RLS, role membership, organization-session binding, cross-tenant separation, real latency, or real browser consent.

Before closing issue #523, have an authorized owner/admin check the deployed SalsysOS Marketing → Behavior page on each relevant tenant, compare real totals with tenant-scoped database aggregates, inspect path safety, and verify desktop/mobile behavior. Do not use other customers' credentials or impersonate staff. R2-P1 Issue #520 (controlled website collection pilot) remains separate and OFF.

## Additional two-tenant synthetic isolation regression (2026-11-06)

- The loopback fixture now has two distinct, entirely synthetic CRM organizations, each with separate safe page-path, funnel, trend and Events-by-Page datasets. The default remains the original synthetic tenant; the optional `tenant=secondary` flag is only accepted by the loopback `/__behavior_scenario` endpoint.
- Browser QA loads Marketing → Behavior for the primary fixture tenant, changes the fixture's authenticated workspace context to the secondary tenant, reloads, and asserts that **all three reports** query the new organization and do not show the prior tenant's public paths.
- A denied simulated read after the switch must remove the secondary tenant paths rather than retain stale evidence.
- Separate synthetic REST-negative checks reject foreign organization IDs (HTTP 403) for the funnel, event trends and Events-by-Page RPCs.
- The fixture is reset to the original synthetic tenant after the test so other UI tests are unaffected.

**Proof boundary:** These checks verify the browser/server render and local fixture contracts only; they cannot prove production PostgreSQL RLS, user membership, real authenticated tenant switching, SQL aggregate equality or authority to view another customer's data. Issue #523 remains open for authorized owner/admin acceptance in the deployed CRM. No real user credentials, visitor IDs, customer data, website tracking, payments or provider messaging are accessed.
